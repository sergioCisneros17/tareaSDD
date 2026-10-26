import { storeForUrl, AppError } from '../domain/normalization.mts';
import type { PageResponse, ScraperTransport, TransportOptions } from './base-scraper.mts';
import { scanPolicy } from '../config.mts';

export class HttpTransport implements ScraperTransport {
  private readonly beforeRequest?: (url: string, options: TransportOptions) => Promise<void>;
  constructor(beforeRequest?: (url: string, options: TransportOptions) => Promise<void>) { this.beforeRequest = beforeRequest; }
  async get(value: string, options: TransportOptions): Promise<PageResponse> {
    const timeout = Math.min(scanPolicy.requestTimeoutMs, options.deadline.getTime() - Date.now());
    if (timeout <= 0) throw new DOMException('Deadline exceeded', 'TimeoutError');
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]);
    let url = value;
    const initialStore = storeForUrl(url);
    for (let redirects = 0; redirects < 5; redirects++) {
      if (storeForUrl(url) !== initialStore) throw new AppError('invalid_product');
      await this.beforeRequest?.(url, options);
      const response = await fetch(url, { signal, redirect: 'manual', headers: { 'user-agent': 'SportsPriceTracker/0.1 (personal price monitoring)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.8,es;q=0.7' } });
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        await response.body?.cancel();
        url = new URL(response.headers.get('location')!, url).toString();
        continue;
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = []; let bytes = 0;
      if (reader) {
        try {
          while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 5_000_000) { await reader.cancel(); throw new AppError('page_too_large'); }
            chunks.push(chunk.value);
          }
        } finally { reader.releaseLock(); }
      }
      return { html: Buffer.concat(chunks).toString('utf8'), effectiveUrl: url, status: response.status, headers: Object.fromEntries(response.headers) };
    }
    throw new AppError('redirect_limit');
  }
}

/** Only explicitly enabled for dynamic pages; never used to retry blocked HTTP. */
export class DynamicTransport implements ScraperTransport {
  private readonly beforeRequest?: (url: string, options: TransportOptions) => Promise<void>;
  constructor(beforeRequest?: (url: string, options: TransportOptions) => Promise<void>) { this.beforeRequest = beforeRequest; }
  async get(url: string, options: TransportOptions): Promise<PageResponse> {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
    const close = () => { void browser.close(); };
    options.signal.addEventListener('abort', close, { once: true });
    try {
      if (options.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const origin = new URL(url);
      // Dynamic mode admits only the selected store's own origins and skips heavy assets.
      await context.route('**/*', async route => {
        const target = new URL(route.request().url());
        const base = origin.hostname.replace(/^www\./, '');
        if (target.protocol !== 'https:' || !(target.hostname === base || target.hostname.endsWith(`.${base}`)) || ['image', 'media', 'font'].includes(route.request().resourceType())) return route.abort();
        try { await this.beforeRequest?.(target.toString(), options); } catch { return route.abort(); }
        await route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(Math.max(1, Math.min(15000, options.deadline.getTime() - Date.now())));
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (!response) throw new Error('No navigation response');
      if (response.status() < 400) {
        await page.waitForFunction(() => document.querySelector('script[type="application/ld+json"]') !== null, undefined, { timeout: 5000 }).catch(() => undefined);
      }
      return { html: await page.content(), effectiveUrl: page.url(), status: response.status(), headers: await response.allHeaders() };
    } finally { options.signal.removeEventListener('abort', close); await browser.close(); }
  }
}
