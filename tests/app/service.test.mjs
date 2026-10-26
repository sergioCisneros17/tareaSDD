import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TrackerService } from '../../src/app/service.mts';

const nike = { url: 'https://www.nike.com/t/demo-pegasus/NK0001', color: 'Negro', sizeCm: '27' };
const adidas = { url: 'https://www.adidas.com/us/demo-ultraboost/AD0001.html', color: 'Blanco', sizeCm: '27' };
async function app(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'tracker-test-'));
  let now = Date.parse('2026-10-25T12:00:00Z');
  const service = new TrackerService({ database: join(dir, 'test.sqlite'), demo: true, now: () => now, ...options });
  t.after(async () => { await service.close(); await rm(dir, { recursive: true, force: true }); });
  return { service, advance: ms => { now += ms; }, path: join(dir, 'test.sqlite') };
}

test('RF-1/RF-2: registration validates, deduplicates and starts an initial scan', async t => {
  const { service } = await app(t);
  assert.throws(() => service.register({ ...nike, color: '' }));
  const first = service.register(nike);
  assert.equal(service.register({ ...nike, url: nike.url + '?utm_campaign=test' }).id, first.id);
  assert.equal(service.list().length, 1);
  await service.drain();
  const row = service.list()[0];
  assert.equal(row.latest.price.minorUnits, '8500');
  assert.equal(row.latest.stock, 'available');
  assert.equal(row.latest.bobMinor, '85000');
});

test('RF-3: manual scans do not shift the daily anchor and do not duplicate active work', async t => {
  const { service, advance } = await app(t);
  const { id } = service.register(nike);
  service.refresh(id); service.refresh(id);
  await service.drain();
  assert.equal(service.history(id).length, 1);
  advance(3600000); service.refresh(id); await service.drain();
  assert.equal(service.history(id).length, 2);
  advance(23 * 3600000); await service.drain();
  assert.equal(service.history(id).length, 3);
  await service.drain();
  assert.equal(service.history(id).length, 3);
});

test('RF-4/RF-5: a blocked update preserves history and excludes the stale offer until recovery', async t => {
  const { service, advance } = await app(t);
  const { id } = service.register(nike); await service.drain();
  service.setDemoScenario(id, 'blocked'); advance(10000); service.refresh(id); await service.drain();
  assert.equal(service.history(id).length, 1);
  assert.equal(service.list()[0].lastAttempt.error, 'blocked');
  assert.equal(service.offers().length, 0);
  service.setDemoScenario(id, 'normal'); advance(10000); service.refresh(id); await service.drain();
  assert.equal(service.offers().length, 1);
  assert.equal(service.history(id).length, 2);
});

test('RF-5: SQLite reopening and repeat migrations preserve immutable observations', async t => {
  const { service, path } = await app(t);
  const { id } = service.register(nike); await service.drain(); await service.close();
  const reopened = new TrackerService({ database: path, demo: true });
  t.after(() => reopened.close());
  assert.equal(reopened.list().length, 1);
  assert.equal(reopened.history(id).length, 1);
  assert.throws(() => reopened.store.db.exec('UPDATE price_observations SET snapshot = snapshot'));
  assert.throws(() => reopened.store.db.exec('DELETE FROM price_observations'));
});

test('RF-6: offers sort by BOB price, expose minimum/date, and exclude out-of-stock variants', async t => {
  const { service } = await app(t);
  service.register(nike); service.register(adidas); service.register({ ...nike, color: 'Rojo' });
  await service.drain();
  const offers = service.offers();
  assert.equal(offers.length, 2);
  assert.equal(offers[0].storeId, 'adidas');
  assert.equal(offers[0].minimum.bobMinor, '79500');
  assert.ok(offers[0].minimum.observedAt);
  const empty = new TrackerService({ database: ':memory:', demo: true });
  assert.deepEqual(empty.offers(), []); await empty.close();
});

test('RF-4: rate limits defer manual scans and independent domains still complete', async t => {
  const { service, advance } = await app(t);
  const { id } = service.register(nike); service.setDemoScenario(id, 'rate_limited');
  service.register(adidas); await service.drain();
  assert.equal(service.history(id).length, 0);
  assert.equal(service.offers()[0].storeId, 'adidas');
  service.setDemoScenario(id, 'normal'); service.refresh(id); await service.drain();
  assert.equal(service.history(id).length, 0);
  advance(121000); await service.drain();
  assert.equal(service.history(id).length, 1);
});
