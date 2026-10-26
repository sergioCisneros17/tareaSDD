import type { Money, ProductObservation, ProductRequest } from '../scraping/base-scraper.mts';

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}

export const normalizeText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

const adidasDomains = new Set(['adidas.com', 'adidas.es', 'adidas.co.uk', 'adidas.de', 'adidas.fr', 'adidas.it', 'adidas.ca', 'adidas.mx', 'adidas.com.ar', 'adidas.cl', 'adidas.co', 'adidas.com.br', 'adidas.pe']);
export function storeForUrl(value: string): 'nike' | 'adidas' {
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError('invalid_url'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new AppError('invalid_url');
  const domain = url.hostname.replace(/^www\./, '');
  if (domain === 'nike.com') return 'nike';
  if (adidasDomains.has(domain)) return 'adidas';
  throw new AppError('unsupported_store');
}

export function validateInput(input: unknown) {
  if (!input || typeof input !== 'object') throw new AppError('invalid_input');
  const { url: rawUrl, color: rawColor, sizeCm: rawSize } = input as Record<string, unknown>;
  if (typeof rawUrl !== 'string' || typeof rawColor !== 'string' || typeof rawSize !== 'string') throw new AppError('missing_selection');
  const storeId = storeForUrl(rawUrl);
  const url = new URL(rawUrl);
  if (storeId === 'nike' ? !/\/t\/[^/]+/.test(url.pathname) : !/\/[^/]+\.html$/i.test(url.pathname)) throw new AppError('invalid_product');
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|gclid|fbclid)/i.test(key)) url.searchParams.delete(key);
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  const color = rawColor.trim();
  const sizeCm = rawSize.trim().replace(',', '.');
  if (!color || color.length > 100 || !/^\d{1,2}(?:\.\d{1,2})?$/.test(sizeCm) || Number(sizeCm) < 10 || Number(sizeCm) > 40) throw new AppError('missing_selection');
  const first = url.pathname.split('/').filter(Boolean)[0];
  const region = /^[a-z]{2}(?:-[a-z]{2})?$/i.test(first || '') ? first.toLowerCase() : 'default';
  return { url: url.toString(), storeId, marketId: `${url.hostname}/${region}`, color, sizeCm: String(Number(sizeCm)) };
}

export function amountToMinor(value: unknown, currency: string): bigint {
  if (!/^[A-Z]{3}$/.test(currency) || !['USD', 'BOB', 'EUR', 'GBP', 'CAD', 'MXN', 'BRL', 'PEN', 'ARS', 'CLP', 'COP'].includes(currency)) throw new AppError('invalid_currency');
  let text = String(value).trim();
  const scale = currency === 'CLP' ? 0 : 2;
  if (text.includes(',') && text.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(text)) text = text.replaceAll('.', '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(text)) text = text.replaceAll(',', '');
    else throw new AppError('invalid_price');
  } else if (text.includes(',')) {
    if (!/^\d+,\d{1,2}$/.test(text)) throw new AppError('invalid_price');
    text = text.replace(',', '.');
  }
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${Math.max(scale, 1)}})?$`).test(text) || (scale === 0 && text.includes('.'))) throw new AppError('invalid_price');
  const [whole, fraction = ''] = text.split('.');
  const minor = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0') || '0');
  if (minor <= 0n || minor > 9000000000000n) throw new AppError('invalid_price');
  return minor;
}

export function toBob(money: Money): bigint | null {
  if (money.currency === 'BOB' && money.scale === 2) return money.minorUnits;
  if (money.currency === 'USD' && money.scale === 2) return money.minorUnits * 10n;
  return null;
}

export function parseRetryAfter(value: string | undefined, now: number): number {
  if (value && /^\d+$/.test(value.trim())) return now + Number(value) * 1000;
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.max(now, date) : now + 900000;
}

export function explicitCm(size: unknown): string | null {
  if (size && typeof size === 'object') {
    const object = size as Record<string, unknown>;
    if (['CMT', 'CM', 'cm'].includes(String(object.unitCode ?? object.unitText))) return explicitCm(`${object.value} cm`);
  }
  const match = String(size ?? '').match(/^(\d{1,2}(?:[.,]\d{1,2})?)\s*cm$/i);
  return match ? String(Number(match[1].replace(',', '.'))) : null;
}

export const json = (value: unknown) => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v);

export function validateObservation(data: ProductObservation, request: ProductRequest, storeId: string): void {
  const validMoney = (money: Money) => typeof money.minorUnits === 'bigint' && money.minorUnits > 0n && money.minorUnits <= 9000000000000n && /^[A-Z]{3}$/.test(money.currency) && money.scale === (money.currency === 'CLP' ? 0 : 2);
  if (!data || data.storeId !== storeId || data.marketId !== request.marketId || !data.productId || !data.variantId || !data.name ||
    normalizeText(data.color) !== normalizeText(request.color) || data.sizeCm !== request.sizeCm ||
    storeForUrl(data.canonicalUrl) !== storeId || storeForUrl(data.effectiveUrl) !== storeId ||
    !data.price || !validMoney(data.price) || !['available', 'out_of_stock', 'unknown', 'variant_absent'].includes(data.stock) ||
    data.evidence?.variantId !== data.variantId || !data.evidence.source || !data.evidence.excerpt ||
    !/Z$/.test(data.observedAt) || !Number.isFinite(Date.parse(data.observedAt)) ||
    (data.originalPrice && (!validMoney(data.originalPrice) || data.originalPrice.currency !== data.price.currency || data.originalPrice.minorUnits <= data.price.minorUnits))) {
    throw new AppError('invalid_data');
  }
}
