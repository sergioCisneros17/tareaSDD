import { readFile } from 'node:fs/promises';
import { AppError, parseRetryAfter, validateInput, validateObservation } from '../domain/normalization.mts';
import { scanPolicy, policyFor } from '../config.mts';
import { setTimeout as delay } from 'node:timers/promises';
import { Store, type Job, type Snapshot } from '../storage/store.mts';
import { scraperRegistry } from '../scraping/stores.mts';
import { HttpTransport, DynamicTransport } from '../scraping/transport.mts';
import type { BaseScraper, PageResponse, ProductObservation, ScraperContext, ScraperResult, ScraperTransport, TransportOptions } from '../scraping/base-scraper.mts';

type Options = { database: string; demo?: boolean; now?: () => number; transport?: ScraperTransport; registry?: Map<string, BaseScraper> };
export const demoProducts = [
  { url: 'https://www.nike.com/t/demo-pegasus/NK0001', color: 'Negro', sizeCm: '27' },
  { url: 'https://www.adidas.com/us/demo-ultraboost/AD0001.html', color: 'Blanco', sizeCm: '27' },
  { url: 'https://www.nike.com/t/demo-pegasus/NK0001', color: 'Rojo', sizeCm: '27' },
];
const scenarios = new Set(['normal', 'sale', 'blocked', 'rate_limited', 'changed', 'out_of_stock']);

export class TrackerService {
  readonly store: Store;
  readonly demo: boolean;
  private readonly clock: () => number;
  private readonly transport: ScraperTransport;
  private readonly registry: Map<string, BaseScraper>;
  private readonly controllers = new Set<AbortController>();
  private active: Promise<void> | null = null;
  private closed = false;
  constructor(options: Options) {
    this.store = new Store(options.database);
    this.demo = options.demo ?? false;
    this.clock = options.now ?? Date.now;
    this.transport = options.transport ?? new HttpTransport((url, context) => this.beforeRequest(url, context));
    this.registry = options.registry ?? scraperRegistry;
  }
  register(value: unknown) { return this.store.register(validateInput(value), this.clock()); }
  refresh(id: number) { this.store.enqueue(id, 'manual', this.clock()); }
  list() { return this.store.list(); }
  history(id: number) { return this.store.history(id); }
  minimum(id: number) {
    return this.history(id).filter(row => row.stock === 'available' && row.bobMinor !== null).reduce<Snapshot | null>((best, row) => !best || BigInt(row.bobMinor!) < BigInt(best.bobMinor!) ? row : best, null);
  }
  offers() {
    return this.list().filter(row => row.latest?.stock === 'available' && row.latest.bobMinor !== null && row.lastAttempt?.status !== 'failure').map(row => ({ ...row, minimum: this.minimum(row.id) })).sort((a, b) => {
      const difference = BigInt(a.latest!.bobMinor!) - BigInt(b.latest!.bobMinor!);
      return difference < 0n ? -1 : difference > 0n ? 1 : b.latest!.observedAt.localeCompare(a.latest!.observedAt) || a.storeId.localeCompare(b.storeId) || a.latest!.name.localeCompare(b.latest!.name) || a.id - b.id;
    });
  }
  setDemoScenario(id: number, scenario: string) {
    if (!this.demo || !scenarios.has(scenario)) throw new AppError('invalid_scenario');
    if (!this.list().some(row => row.id === id)) throw new AppError('not_found', 404);
    this.store.db.prepare('UPDATE tracking SET scenario=? WHERE id=?').run(scenario, id);
  }
  seedDemo() {
    if (!this.demo) throw new AppError('demo_only');
    return demoProducts.map(product => this.register(product));
  }
  private async beforeRequest(url: string, options: TransportOptions) {
    const domain = new URL(url).hostname;
    // Reserve the domain slot before waiting so concurrent dynamic resources remain paced.
    const available = Math.max(this.clock(), this.store.domainNext(domain));
    if (available >= options.deadline.getTime()) throw new DOMException('Deadline exceeded', 'TimeoutError');
    this.store.deferDomain(domain, available + policyFor(domain).pauseMs);
    if (available > this.clock()) await delay(available - this.clock(), undefined, { signal: options.signal });
    options.signal.throwIfAborted();
  }
  private async demoPage(job: Job, url: string): Promise<PageResponse> {
    if (!demoProducts.some(product => product.url === job.url)) return { status: 404, html: 'Not found in demo', effectiveUrl: url };
    if (job.scenario === 'blocked') return { status: 200, html: '<html><title>Verify you are human captcha</title></html>', effectiveUrl: url };
    if (job.scenario === 'rate_limited') return { status: 429, html: 'Slow down', effectiveUrl: url, headers: { 'retry-after': '120' } };
    const filename = job.scenario === 'changed' ? 'changed' : job.store_id;
    let html = await readFile(new URL(`../../tests/fixtures/scraper/${filename}.html`, import.meta.url), 'utf8');
    if (job.scenario === 'sale') html = html.replace('85.00', '65.00').replace('79.50', '69.50');
    if (job.scenario === 'out_of_stock') html = html.replaceAll('https://schema.org/InStock', 'https://schema.org/OutOfStock');
    return { status: 200, html, effectiveUrl: url };
  }
  private async execute(job: Job) {
    const controller = new AbortController(); this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(new DOMException('Attempt timeout', 'TimeoutError')), scanPolicy.attemptTimeoutMs);
    const context: ScraperContext = {
      signal: controller.signal, deadline: new Date(this.clock() + scanPolicy.attemptTimeoutMs), now: () => new Date(this.clock()),
      transport: this.demo ? { get: url => this.demoPage(job, url) } : this.transport,
    };
    let result: ScraperResult<ProductObservation>;
    try {
      const scraper = this.registry.get(job.store_id);
      if (!scraper) throw new AppError('unsupported_store');
      const request = { requestId: String(job.id), url: job.url, marketId: job.market_id, color: job.color, sizeCm: job.size_cm };
      const fetchResult = scraper.fetchProducts([request], context);
      const aborted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
      });
      result = (await Promise.race([fetchResult, aborted]))[0];
      // Dynamic rendering is optional and only attempted for incompatible, unblocked pages.
      if (!this.demo && process.env.DYNAMIC_SCRAPING === '1' && result?.status === 'failure' && result.error.code === 'incompatible_page' && !controller.signal.aborted) {
        result = (await Promise.race([scraper.fetchProducts([request], { ...context, transport: new DynamicTransport((url, options) => this.beforeRequest(url, options)) }), aborted]))[0];
      }
      if (!result || result.requestId !== String(job.id)) throw new AppError('invalid_data');
      if (result.status === 'success') validateObservation(result.data, request, job.store_id);
    } catch (error) {
      result = { status: 'failure', requestId: String(job.id), error: { code: controller.signal.aborted ? 'timeout' : error instanceof AppError ? 'invalid_data' : 'network_error' } };
    } finally { clearTimeout(timer); this.controllers.delete(controller); }
    if (this.closed) return;
    const now = this.clock();
    this.store.deferDomain(job.domain, now + (this.demo ? 0 : policyFor(job.domain).pauseMs));
    let retryAt: number | undefined;
    if (result.status === 'failure') {
      if (result.error.code === 'rate_limited') {
        const next = parseRetryAfter(result.error.retryAfter, now);
        this.store.deferDomain(job.domain, next);
        if (job.retries < policyFor(job.domain).maxRetries) retryAt = next;
      } else if (['network_error', 'timeout'].includes(result.error.code) && job.retries < policyFor(job.domain).maxRetries) {
        retryAt = now + scanPolicy.retryBaseMs[job.retries] + (this.demo ? 0 : Math.floor(Math.random() * 1000));
      }
      console.info(jsonEvent('scan_failed', { trackingId: job.tracking_id, code: result.error.code }));
    }
    this.store.finish(job, result, now, retryAt);
  }
  async drain(): Promise<void> {
    if (this.closed) return;
    if (this.active) return this.active;
    this.active = (async () => {
      this.store.schedule(this.clock());
      while (!this.closed) {
        const jobs: Job[] = [];
        for (let index = 0; index < scanPolicy.parallelDomains; index++) { const job = this.store.claim(this.clock()); if (!job) break; jobs.push(job); }
        if (!jobs.length) break;
        await Promise.all(jobs.map(job => this.execute(job)));
      }
    })();
    try { await this.active; } finally { this.active = null; }
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const controller of this.controllers) controller.abort();
    await this.active;
    this.store.close();
  }
}
function jsonEvent(event: string, fields: Record<string, unknown>) { return JSON.stringify({ event, ...fields }); }
