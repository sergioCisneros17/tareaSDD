import test from 'node:test';
import assert from 'node:assert/strict';
import { amountToMinor, toBob, validateInput, parseRetryAfter } from '../../src/domain/normalization.mts';

test('RF-1: validates regional product URLs and exact centimetre selection', () => {
  const input = validateInput({ url: 'https://www.nike.com/es/t/shoe/AB1234-001?utm_source=x', color: ' Negro ', sizeCm: '27,5' });
  assert.equal(input.storeId, 'nike');
  assert.equal(input.marketId, 'www.nike.com/es');
  assert.equal(input.sizeCm, '27.5');
  assert.equal(input.color, 'Negro');
  assert.equal(new URL(input.url).search, '');
  for (const url of ['http://www.nike.com/t/shoe', 'https://nike.com.evil.test/t/shoe', 'https://localhost/t/shoe', 'https://www.adidas.com/us/shoes', 'https://user:pass@www.nike.com/t/shoe']) {
    assert.throws(() => validateInput({ url, color: 'Negro', sizeCm: '27' }));
  }
  assert.throws(() => validateInput({ url: input.url, color: '', sizeCm: '27' }));
});

test('RF-2: parses explicit money exactly and rejects invalid or ambiguous values', () => {
  assert.equal(amountToMinor('79.50', 'USD'), 7950n);
  assert.equal(amountToMinor('1.234,50', 'EUR'), 123450n);
  for (const input of ['0', '-2', 'NaN', 'desde 20', '10.9999', '1,234']) assert.throws(() => amountToMinor(input, 'USD'));
  assert.throws(() => amountToMinor('20', ''));
});

test('RF-5/RF-6: uses the user USD rate without relabelling foreign money', () => {
  assert.equal(toBob({ minorUnits: 7950n, currency: 'USD', scale: 2 }), 79500n);
  assert.equal(toBob({ minorUnits: 7950n, currency: 'BOB', scale: 2 }), 7950n);
  assert.equal(toBob({ minorUnits: 7950n, currency: 'EUR', scale: 2 }), null);
});

test('RF-4: interprets Retry-After seconds and dates without shortening waits', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  assert.equal(parseRetryAfter('120', now), now + 120000);
  assert.equal(parseRetryAfter('Sun, 25 Oct 2026 12:05:00 GMT', now), now + 300000);
  assert.equal(parseRetryAfter('invalid', now), now + 900000);
});
