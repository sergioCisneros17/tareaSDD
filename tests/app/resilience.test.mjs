import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../src/storage/store.mts';
import { TrackerService } from '../../src/app/service.mts';
import { validateInput, validateObservation } from '../../src/domain/normalization.mts';
import { NikeScraper, AdidasScraper } from '../../src/scraping/stores.mts';
import { readFile } from 'node:fs/promises';

const input = { url: 'https://www.nike.com/t/demo-pegasus/NK0001', color: 'Negro', sizeCm: '27' };

test('RF-3/RF-4: job claiming is exclusive, expired reservations recover, late writers are rejected', () => {
  const store = new Store(':memory:');
  try {
    const now = Date.parse('2026-10-25T12:00:00Z'); const { id } = store.register(validateInput(input), now);
    const first = store.claim(now);
    assert.ok(first); assert.equal(store.claim(now), null);
    store.schedule(now + 66000);
    const second = store.claim(now + 66000);
    assert.notEqual(first.token, second.token);
    const failed = { status: 'failure', requestId: String(first.id), error: { code: 'blocked' } };
    assert.equal(store.finish(first, failed, now + 66001), false);
    assert.equal(store.finish(second, failed, now + 66002), true);
    assert.equal(store.list()[0].lastAttempt.error, 'blocked');
    assert.equal(store.history(id).length, 0);
  } finally { store.close(); }
});

test('RF-4: timeout retries have backoff and a finite maximum', async t => {
  let now = Date.parse('2026-10-25T12:00:00Z'); let calls = 0;
  const scraper = { fetchProducts: async requests => { calls++; return requests.map(r => ({ status: 'failure', requestId: r.requestId, error: { code: 'timeout' } })); } };
  const service = new TrackerService({ database: ':memory:', demo: true, now: () => now, registry: new Map([['nike', scraper]]) });
  t.after(() => service.close());
  service.register(input); await service.drain(); assert.equal(calls, 1);
  await service.drain(); assert.equal(calls, 1);
  now += 5000; await service.drain(); assert.equal(calls, 2);
  now += 15000; await service.drain(); assert.equal(calls, 3);
  now += 60000; await service.drain(); assert.equal(calls, 3);
  assert.equal(service.list()[0].work, null);
  assert.equal(service.list()[0].lastAttempt.error, 'timeout');
});

test('RF-3: missed daily periods coalesce instead of inventing past observations', async t => {
  let now = Date.parse('2026-10-25T12:00:00Z');
  const service = new TrackerService({ database: ':memory:', demo: true, now: () => now }); t.after(() => service.close());
  const { id } = service.register(input); await service.drain(); now += 5 * 86400000 + 1000;
  await service.drain(); assert.equal(service.history(id).length, 2);
  assert.ok(Date.parse(service.list()[0].nextDailyAt) > now);
});

test('RF-2: validation rejects wrong identity, false evidence and invalid money at the engine boundary', async () => {
  const html = await readFile(new URL('../fixtures/scraper/nike.html', import.meta.url), 'utf8');
  const request = { ...validateInput(input), requestId: '1' };
  const context = { signal: new AbortController().signal, now: () => new Date(), deadline: new Date(Date.now() + 60000), transport: { get: async url => ({ html, effectiveUrl: url, status: 200 }) } };
  const [result] = await new NikeScraper().fetchProducts([request], context);
  assert.doesNotThrow(() => validateObservation(result.data, request, 'nike'));
  for (const data of [
    { ...result.data, storeId: 'adidas' }, { ...result.data, sizeCm: '28' },
    { ...result.data, evidence: { ...result.data.evidence, variantId: 'other' } },
    { ...result.data, price: { ...result.data.price, minorUnits: 0n } },
    { ...result.data, originalPrice: { ...result.data.price, minorUnits: 1n } },
  ]) assert.throws(() => validateObservation(data, request, 'nike'));
});

test('RF-4: both store adapters classify altered pages and already-expired attempts', async () => {
  const context = { signal: new AbortController().signal, now: () => new Date('2026-10-25T12:00:00Z'), deadline: new Date('2026-10-25T12:01:00Z'), transport: { get: async url => ({ html: '<html>Changed</html>', effectiveUrl: url, status: 200 }) } };
  const request = { ...validateInput(input), requestId: '1' };
  for (const scraper of [new NikeScraper(), new AdidasScraper()]) {
    assert.equal((await scraper.fetchProducts([request], context))[0].error.code, 'incompatible_page');
    assert.equal((await scraper.fetchProducts([request], { ...context, deadline: new Date('2026-10-25T11:00:00Z') }))[0].error.code, 'timeout');
  }
});

test('RF-6: equal-price offers use recency, store and name as stable tie breakers', async t => {
  let now = Date.parse('2026-10-25T12:00:00Z');
  const html = await readFile(new URL('../fixtures/scraper/nike.html', import.meta.url), 'utf8');
  const real = new NikeScraper();
  const registry = new Map(['nike', 'adidas'].map(storeId => [storeId, { fetchProducts: async (requests, context) => {
    const results = await real.fetchProducts(requests, { ...context, transport: { get: async url => ({ html, effectiveUrl: url, status: 200 }) } });
    return results.map(r => r.status === 'success' ? { ...r, data: { ...r.data, storeId } } : r);
  } }]));
  const service = new TrackerService({ database: ':memory:', demo: true, now: () => now, registry }); t.after(() => service.close());
  const nike = service.register(input); service.register({ ...input, url: 'https://www.adidas.com/us/example/ABC123.html' });
  await service.drain(); assert.equal(service.offers()[0].storeId, 'adidas');
  now += 10000; service.refresh(nike.id); await service.drain(); assert.equal(service.offers()[0].storeId, 'nike');
});
