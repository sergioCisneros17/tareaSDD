import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, json, normalizeText, toBob, type validateInput } from '../domain/normalization.mts';
import type { ProductObservation, ScraperResult } from '../scraping/base-scraper.mts';
import { scanPolicy } from '../config.mts';

export type TrackingInput = ReturnType<typeof validateInput>;
export type Job = { id: number; tracking_id: number; token: string; attemptId: number; retries: number; url: string; domain: string; store_id: string; market_id: string; color: string; size_cm: string; scenario: string };
export type Snapshot = Omit<ProductObservation, 'price' | 'originalPrice'> & {
  price: { minorUnits: string; currency: string; scale: number };
  originalPrice?: { minorUnits: string; currency: string; scale: number };
  bobMinor: string | null;
  originalBobMinor: string | null;
  conversion: { source: string; rate: string; recordedAt: string } | null;
};
export type TrackingRow = {
  id: number; url: string; storeId: string; marketId: string; color: string; sizeCm: string; createdAt: string; nextDailyAt: string;
  latest: Snapshot | null; lastAttempt: { status: string; error: string | null; finishedAt: string | null } | null;
  work: { state: string; availableAt: string } | null; scenario: string;
};

export class Store {
  readonly db: DatabaseSync;
  private closed = false;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`);
    if (!this.db.prepare('SELECT version FROM migrations WHERE version=1').get()) {
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE stores (id TEXT PRIMARY KEY, name TEXT NOT NULL);
          INSERT INTO stores VALUES ('nike','Nike'),('adidas','Adidas');
          CREATE TABLE markets (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), domain TEXT NOT NULL);
          CREATE TABLE products (id INTEGER PRIMARY KEY, market_id TEXT NOT NULL REFERENCES markets(id), external_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, UNIQUE(market_id,external_id));
          CREATE TABLE variants (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), external_id TEXT NOT NULL, color TEXT NOT NULL, size_cm TEXT NOT NULL, UNIQUE(product_id,external_id));
          CREATE TABLE tracking (id INTEGER PRIMARY KEY, market_id TEXT NOT NULL REFERENCES markets(id), url TEXT NOT NULL, color TEXT NOT NULL, color_key TEXT NOT NULL, size_cm TEXT NOT NULL, created_at INTEGER NOT NULL, next_daily INTEGER NOT NULL, variant_id INTEGER REFERENCES variants(id), alias_of INTEGER REFERENCES tracking(id), scenario TEXT NOT NULL DEFAULT 'normal', UNIQUE(market_id,url,color_key,size_cm));
          CREATE UNIQUE INDEX tracking_variant ON tracking(variant_id) WHERE variant_id IS NOT NULL AND alias_of IS NULL;
          CREATE TABLE scan_jobs (id INTEGER PRIMARY KEY, tracking_id INTEGER NOT NULL REFERENCES tracking(id), origin TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','running','done')), available_at INTEGER NOT NULL, lease_until INTEGER, token TEXT, retries INTEGER NOT NULL DEFAULT 0);
          CREATE UNIQUE INDEX one_active_job ON scan_jobs(tracking_id) WHERE state IN ('pending','running');
          CREATE INDEX due_jobs ON scan_jobs(state,available_at);
          CREATE TABLE scan_attempts (id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES scan_jobs(id), tracking_id INTEGER NOT NULL REFERENCES tracking(id), started_at INTEGER NOT NULL, finished_at INTEGER, status TEXT NOT NULL, error TEXT);
          CREATE INDEX recent_attempt ON scan_attempts(tracking_id,id DESC);
          CREATE TABLE price_observations (id INTEGER PRIMARY KEY, attempt_id INTEGER NOT NULL UNIQUE REFERENCES scan_attempts(id), tracking_id INTEGER NOT NULL REFERENCES tracking(id), variant_id INTEGER NOT NULL REFERENCES variants(id), observed_at TEXT NOT NULL, snapshot TEXT NOT NULL CHECK(json_valid(snapshot)));
          CREATE INDEX variant_history ON price_observations(variant_id,observed_at);
          CREATE TRIGGER immutable_price_update BEFORE UPDATE ON price_observations BEGIN SELECT RAISE(ABORT,'Observations are immutable'); END;
          CREATE TRIGGER immutable_price_delete BEFORE DELETE ON price_observations BEGIN SELECT RAISE(ABORT,'Observations are immutable'); END;
          CREATE TABLE domain_schedule (domain TEXT PRIMARY KEY, next_allowed INTEGER NOT NULL);
          CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        `);
        this.db.prepare('INSERT INTO migrations VALUES(1,?)').run(new Date().toISOString());
        this.db.prepare('INSERT INTO settings VALUES(?,?)').run('usd_rate', json({ rate: '10', source: 'user_manual', recordedAt: new Date().toISOString() }));
      });
    }
  }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  register(input: TrackingInput, now: number) {
    return this.transaction(() => {
      this.db.prepare('INSERT OR IGNORE INTO markets VALUES(?,?,?)').run(input.marketId, input.storeId, new URL(input.url).hostname);
      const existing = this.db.prepare('SELECT id,alias_of FROM tracking WHERE market_id=? AND url=? AND color_key=? AND size_cm=?').get(input.marketId, input.url, normalizeText(input.color), input.sizeCm);
      if (existing) return { id: Number(existing.alias_of ?? existing.id), duplicate: true };
      const result = this.db.prepare('INSERT INTO tracking(market_id,url,color,color_key,size_cm,created_at,next_daily) VALUES(?,?,?,?,?,?,?)').run(input.marketId, input.url, input.color, normalizeText(input.color), input.sizeCm, now, now + scanPolicy.intervalMs);
      const id = Number(result.lastInsertRowid);
      this.enqueue(id, 'initial', now);
      return { id, duplicate: false };
    });
  }
  enqueue(id: number, origin: string, now: number) {
    const row = this.db.prepare('SELECT id,alias_of FROM tracking WHERE id=?').get(id);
    if (!row) throw new AppError('not_found', 404);
    const target = Number(row.alias_of ?? id);
    this.db.prepare("INSERT OR IGNORE INTO scan_jobs(tracking_id,origin,state,available_at) VALUES(?,?,'pending',?)").run(target, origin, now);
  }
  schedule(now: number) {
    this.transaction(() => {
      const rows = this.db.prepare('SELECT id,next_daily FROM tracking WHERE alias_of IS NULL AND next_daily<=?').all(now);
      for (const row of rows) {
        this.enqueue(Number(row.id), 'daily', now);
        const due = Number(row.next_daily);
        this.db.prepare('UPDATE tracking SET next_daily=? WHERE id=?').run(due + (Math.floor((now - due) / scanPolicy.intervalMs) + 1) * scanPolicy.intervalMs, Number(row.id));
      }
      const interrupted = this.db.prepare("SELECT id FROM scan_jobs WHERE state='running' AND lease_until<=?").all(now);
      for (const row of interrupted) {
        this.db.prepare("UPDATE scan_attempts SET status='failure',error='interrupted',finished_at=? WHERE job_id=? AND status='running'").run(now, Number(row.id));
        this.db.prepare("UPDATE scan_jobs SET state='pending',token=NULL,lease_until=NULL,available_at=? WHERE id=?").run(now, Number(row.id));
      }
    });
  }
  claim(now: number): Job | null {
    return this.transaction(() => {
      const row = this.db.prepare(`SELECT j.id,j.tracking_id,j.retries,t.url,t.color,t.size_cm,t.market_id,t.scenario,m.store_id,m.domain
        FROM scan_jobs j JOIN tracking t ON t.id=j.tracking_id JOIN markets m ON m.id=t.market_id
        LEFT JOIN domain_schedule d ON d.domain=m.domain
        WHERE j.state='pending' AND j.available_at<=? AND COALESCE(d.next_allowed,0)<=? AND t.alias_of IS NULL
        AND NOT EXISTS(SELECT 1 FROM scan_jobs active JOIN tracking at ON at.id=active.tracking_id JOIN markets am ON am.id=at.market_id WHERE active.state='running' AND am.domain=m.domain)
        ORDER BY j.id LIMIT 1`).get(now, now);
      if (!row) return null;
      const token = randomUUID();
      this.db.prepare("UPDATE scan_jobs SET state='running',token=?,lease_until=? WHERE id=?").run(token, now + scanPolicy.leaseMs, Number(row.id));
      const attempt = this.db.prepare("INSERT INTO scan_attempts(job_id,tracking_id,started_at,status) VALUES(?,?,?,'running')").run(Number(row.id), Number(row.tracking_id), now);
      return { ...row, token, attemptId: Number(attempt.lastInsertRowid) } as unknown as Job;
    });
  }
  deferDomain(domain: string, next: number) {
    this.db.prepare('INSERT INTO domain_schedule VALUES(?,?) ON CONFLICT(domain) DO UPDATE SET next_allowed=MAX(next_allowed,excluded.next_allowed)').run(domain, next);
  }
  domainNext(domain: string) { return Number(this.db.prepare('SELECT next_allowed FROM domain_schedule WHERE domain=?').get(domain)?.next_allowed ?? 0); }

  finish(job: Job, result: ScraperResult<ProductObservation>, now: number, retryAt?: number) {
    return this.transaction(() => {
      if (!this.db.prepare("SELECT id FROM scan_jobs WHERE id=? AND token=? AND state='running' AND lease_until>?").get(job.id, job.token, now)) return false;
      const error = result.status === 'failure' ? result.error.code : result.status === 'partial' ? 'invalid_data' : null;
      this.db.prepare('UPDATE scan_attempts SET status=?,error=?,finished_at=? WHERE id=?').run(error ? 'failure' : 'success', error, now, job.attemptId);
      if (result.status === 'success') {
        const data = result.data;
        this.db.prepare('INSERT OR IGNORE INTO products(market_id,external_id,name,url) VALUES(?,?,?,?)').run(job.market_id, data.productId, data.name, data.canonicalUrl);
        const product = this.db.prepare('SELECT id FROM products WHERE market_id=? AND external_id=?').get(job.market_id, data.productId)!;
        this.db.prepare('INSERT OR IGNORE INTO variants(product_id,external_id,color,size_cm) VALUES(?,?,?,?)').run(Number(product.id), data.variantId, data.color, data.sizeCm);
        const variant = this.db.prepare('SELECT id FROM variants WHERE product_id=? AND external_id=?').get(Number(product.id), data.variantId)!;
        const other = this.db.prepare('SELECT id FROM tracking WHERE variant_id=? AND alias_of IS NULL AND id<>?').get(Number(variant.id), job.tracking_id);
        if (other) this.db.prepare('UPDATE tracking SET alias_of=? WHERE id=?').run(Number(other.id), job.tracking_id);
        else this.db.prepare('UPDATE tracking SET variant_id=? WHERE id=?').run(Number(variant.id), job.tracking_id);
        const bob = toBob(data.price);
        const originalBob = data.originalPrice ? toBob(data.originalPrice) : null;
        const reference = JSON.parse(String(this.db.prepare("SELECT value FROM settings WHERE key='usd_rate'").get()!.value));
        const snapshot = { ...data, bobMinor: bob, originalBobMinor: originalBob, conversion: data.price.currency === 'USD' ? reference : null };
        this.db.prepare('INSERT INTO price_observations(attempt_id,tracking_id,variant_id,observed_at,snapshot) VALUES(?,?,?,?,?)').run(job.attemptId, job.tracking_id, Number(variant.id), data.observedAt, json(snapshot));
      }
      this.db.prepare('UPDATE scan_jobs SET state=?,available_at=?,lease_until=NULL,token=NULL,retries=retries+? WHERE id=?').run(retryAt ? 'pending' : 'done', retryAt ?? now, retryAt ? 1 : 0, job.id);
      return true;
    });
  }
  list(): TrackingRow[] {
    const rows = this.db.prepare('SELECT t.*,m.store_id FROM tracking t JOIN markets m ON m.id=t.market_id WHERE t.alias_of IS NULL ORDER BY t.id DESC').all();
    return rows.map(row => {
      const id = Number(row.id);
      const latest = this.history(id)[0] ?? null;
      const attempt = this.db.prepare('SELECT status,error,finished_at FROM scan_attempts WHERE tracking_id IN(SELECT id FROM tracking WHERE id=? OR alias_of=?) ORDER BY id DESC LIMIT 1').get(id, id);
      const work = this.db.prepare("SELECT state,MAX(available_at,COALESCE((SELECT next_allowed FROM domain_schedule WHERE domain=(SELECT domain FROM markets WHERE id=?)),0)) AS available_at FROM scan_jobs WHERE tracking_id=? AND state IN('pending','running')").get(String(row.market_id), id);
      return { id, url: String(row.url), storeId: String(row.store_id), marketId: String(row.market_id), color: String(row.color), sizeCm: String(row.size_cm), createdAt: new Date(Number(row.created_at)).toISOString(), nextDailyAt: new Date(Number(row.next_daily)).toISOString(), latest,
        lastAttempt: attempt ? { status: String(attempt.status), error: attempt.error ? String(attempt.error) : null, finishedAt: attempt.finished_at ? new Date(Number(attempt.finished_at)).toISOString() : null } : null,
        work: work ? { state: String(work.state), availableAt: new Date(Number(work.available_at)).toISOString() } : null, scenario: String(row.scenario) };
    });
  }
  history(id: number): Snapshot[] {
    const tracking = this.db.prepare('SELECT id,alias_of FROM tracking WHERE id=?').get(id);
    if (!tracking) throw new AppError('not_found', 404);
    const target = Number(tracking.alias_of ?? id);
    return this.db.prepare('SELECT snapshot FROM price_observations WHERE tracking_id IN(SELECT id FROM tracking WHERE id=? OR alias_of=?) ORDER BY observed_at DESC,id DESC').all(target, target).map(row => JSON.parse(String(row.snapshot)) as Snapshot);
  }
  close() { if (!this.closed) { this.db.close(); this.closed = true; } }
}
