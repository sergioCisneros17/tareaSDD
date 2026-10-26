import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { FixtureScraper } from '../helpers/fixture-scraper.mts';

const productHtml = await readFile(new URL('../fixtures/scraper/product.html', import.meta.url), 'utf8');
const changedHtml = await readFile(new URL('../fixtures/scraper/changed.html', import.meta.url), 'utf8');
const request = {
  requestId: 'request-1', url: 'https://shop.example.test/product-1',
  marketId: 'fixture-market', color: 'black', sizeCm: '27',
};

// A local stub for this task only; no network, scheduler or generic mock framework.
function setup(html = productHtml) {
  const calls = [];
  const controller = new AbortController();
  const context = {
    now: () => new Date('2026-10-25T12:00:00Z'),
    deadline: new Date('2026-10-25T12:01:00Z'),
    signal: controller.signal,
    transport: {
      async get(url, options) {
        calls.push({ url, options });
        return { html, effectiveUrl: url, status: 200 };
      },
    },
  };
  return { scraper: new FixtureScraper(), context, controller, calls };
}

test('describes a store and explicit markets without requesting HTML', () => {
  const { scraper, context, calls } = setup();
  assert.deepEqual(scraper.describe(context), {
    storeId: 'fixture-store', version: 'test-1',
    markets: [{ id: 'fixture-market', domains: ['shop.example.test'] }],
  });
  assert.equal(calls.length, 0);
});

test('resolves the exact product and variant through the supplied transport', async () => {
  const { scraper, context, calls } = setup();
  assert.deepEqual(await scraper.resolveProduct(request, context), {
    status: 'success', requestId: 'request-1', data: {
      storeId: 'fixture-store', marketId: 'fixture-market',
      productId: 'fixture-product-1', variantId: 'fixture-black-27',
      canonicalUrl: request.url, color: 'black', sizeCm: '27',
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.signal, context.signal);
  assert.equal(calls[0].options.deadline, context.deadline);
});

test('returns the common observation shape with exact money and supplied time', async () => {
  const { scraper, context } = setup();
  const [result] = await scraper.fetchProducts([request], context);
  assert.equal(result.status, 'success');
  assert.deepEqual(result.data.price, { minorUnits: 62000n, currency: 'BOB', scale: 2 });
  assert.deepEqual(result.data.originalPrice, { minorUnits: 80000n, currency: 'BOB', scale: 2 });
  assert.equal(result.data.stock, 'available');
  assert.equal(result.data.observedAt, '2026-10-25T12:00:00.000Z');
  assert.equal(result.data.evidence.variantId, result.data.variantId);
});

test('preserves one associated result per request without replacing an absent variant', async () => {
  const { scraper, context } = setup();
  const results = await scraper.fetchProducts([
    { ...request, requestId: 'absent', sizeCm: '28' }, request,
  ], context);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], { status: 'failure', requestId: 'absent', error: { code: 'variant_absent' } });
  assert.equal(results[1].requestId, 'request-1');
  assert.equal(results[1].status, 'success');
});

test('reports changed HTML without fabricated prices', async () => {
  const { scraper, context } = setup(changedHtml);
  assert.deepEqual(await scraper.fetchProducts([request], context), [
    { status: 'failure', requestId: 'request-1', error: { code: 'incompatible_page' } },
  ]);
});

test('accepts cancellation through the shared context without requesting HTML', async () => {
  const { scraper, context, controller, calls } = setup();
  controller.abort();
  assert.deepEqual(await scraper.resolveProduct(request, context), {
    status: 'failure', requestId: 'request-1', error: { code: 'cancelled' },
  });
  assert.equal(calls.length, 0);
});

test('accepts an empty request collection without side effects', async () => {
  const { scraper, context, calls } = setup();
  assert.deepEqual(await scraper.fetchProducts([], context), []);
  assert.equal(calls.length, 0);
});
