import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NikeScraper, AdidasScraper } from '../../src/scraping/stores.mts';

const fixture = name => readFile(new URL(`../fixtures/scraper/${name}.html`, import.meta.url), 'utf8');
function context(html, status = 200) {
  return { now: () => new Date('2026-10-25T12:00:00Z'), deadline: new Date('2026-10-25T12:01:00Z'), signal: new AbortController().signal,
    transport: { get: async url => ({ html, status, effectiveUrl: url, headers: {} }) } };
}
const request = { requestId: 'one', url: 'https://www.nike.com/t/example/NK0001', marketId: 'www.nike.com/default', color: 'Negro', sizeCm: '27' };

test('RF-2: Nike extracts only exact colour/cm variant and its discount', async () => {
  const [r] = await new NikeScraper().fetchProducts([request], context(await fixture('nike')));
  assert.equal(r.status, 'success');
  assert.equal(r.data.price.minorUnits, 8500n);
  assert.equal(r.data.originalPrice.minorUnits, 12000n);
  assert.equal(r.data.stock, 'available');
  assert.equal(r.data.variantId, 'NK0001-001-27');
});

test('RF-2: Adidas supports no discount and independent batch results', async () => {
  const requests = [{ ...request, requestId: 'missing', color: 'Rojo' }, { ...request, requestId: 'found', color: 'Blanco' }];
  const results = await new AdidasScraper().fetchProducts(requests, context(await fixture('adidas')));
  assert.equal(results[0].error.code, 'variant_absent');
  assert.equal(results[1].data.price.minorUnits, 7950n);
  assert.equal(results[1].data.originalPrice, undefined);
});

test('RF-2: out of stock is not replaced by a cheaper available colour', async () => {
  const [r] = await new NikeScraper().fetchProducts([{ ...request, color: 'Rojo' }], context(await fixture('nike')));
  assert.equal(r.data.stock, 'out_of_stock');
  assert.equal(r.data.price.minorUnits, 9500n);
});

test('RF-2: generic buttons, US size and ambiguous stock never confirm a cm variant', async () => {
  const html = '<html><button>Add to cart</button><script type="application/ld+json">{"@type":"Product","name":"Shoe","sku":"a","color":"Negro","size":"US 9","offers":{"price":"80","priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script></html>';
  const [r] = await new NikeScraper().fetchProducts([request], context(html));
  assert.notEqual(r.status, 'success');
});

test('RF-4: changed HTML, captcha 200, 404 and 429 are classified without prices', async () => {
  const scraper = new NikeScraper();
  for (const [html, status, code] of [[await fixture('changed'), 200, 'incompatible_page'], ['<html>Please verify you are human captcha</html>', 200, 'blocked'], ['Not found', 404, 'product_not_found'], ['Slow down', 429, 'rate_limited']]) {
    const [r] = await scraper.fetchProducts([request], context(html, status));
    assert.equal(r.error.code, code);
    assert.equal(r.data, undefined);
  }
});

test('RF-4: cancelled and expired contexts do not request a page', async () => {
  const c = context(''); let calls = 0;
  c.transport.get = async () => { calls++; throw new Error('unexpected request'); };
  c.signal = AbortSignal.abort();
  assert.equal((await new NikeScraper().fetchProducts([request], c))[0].error.code, 'cancelled');
  assert.equal(calls, 0);
});

test('RF-2/RF-7: Nike maps local sizes using the linked official CM row, not foot length', async () => {
  const c = context(await fixture('nike-local-sizes'));
  const chart = await fixture('nike-chart'); const product = await fixture('nike-local-sizes');
  c.transport.get = async url => ({ html: url.includes('/size-fit/') ? chart : product, status: 200, effectiveUrl: url });
  const [r] = await new NikeScraper().fetchProducts([{ ...request, color: 'Black/Black' }], c);
  assert.equal(r.status, 'success');
  assert.equal(r.data.variantId, '000000000027');
  assert.equal(r.data.sizeCm, '27');
  assert.equal(r.data.originalPrice.minorUnits, 12500n);
  assert.match(r.data.evidence.excerpt, /size-fit/);
});
