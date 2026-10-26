import { load } from 'cheerio';
import { BaseScraper, type ProductRequest, type ProductObservation, type ResolvedProduct, type ScraperContext, type ScraperDescription, type ScraperResult, type ScraperErrorCode } from './base-scraper.mts';
import { amountToMinor, explicitCm, normalizeText, storeForUrl } from '../domain/normalization.mts';

type Node = Record<string, any>;
class StoreReadError extends Error {
  readonly code: ScraperErrorCode;
  readonly response: { status: number; headers?: Readonly<Record<string, string>> };
  constructor(code: ScraperErrorCode, response: { status: number; headers?: Readonly<Record<string, string>> }) { super(code); this.code = code; this.response = response; }
}
function flatten(value: unknown, parent: Node = {}, output: Node[] = []): Node[] {
  if (Array.isArray(value)) { for (const child of value) flatten(child, parent, output); return output; }
  if (!value || typeof value !== 'object') return output;
  const item = value as Node;
  const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
  if (types.includes('Product')) output.push({ ...parent, ...item, groupId: parent.productGroupID ?? item.productGroupID });
  if (item.hasVariant) flatten(item.hasVariant, item, output);
  if (item['@graph']) flatten(item['@graph'], {}, output);
  if (item.mainEntity) flatten(item.mainEntity, {}, output);
  return output;
}

abstract class StructuredStoreScraper extends BaseScraper {
  abstract readonly storeId: string;
  abstract readonly domains: readonly string[];
  protected async enrich(products: Node[], _html: string, _request: ProductRequest, _context: ScraperContext): Promise<Node[]> { return products; }
  describe(_context: ScraperContext): ScraperDescription {
    return { storeId: this.storeId, version: '1.0.0', markets: this.domains.map(domain => ({ id: domain, domains: [domain, `www.${domain}`] })) };
  }
  private failure(request: ProductRequest, code: ScraperErrorCode, status?: number, retryAfter?: string): ScraperResult<ProductObservation> {
    return { status: 'failure', requestId: request.requestId, error: { code, httpStatus: status, retryAfter } };
  }
  private async extract(request: ProductRequest, context: ScraperContext): Promise<ScraperResult<ProductObservation>> {
    if (context.signal.aborted) return this.failure(request, 'cancelled');
    if (context.now().getTime() >= context.deadline.getTime()) return this.failure(request, 'timeout');
    try {
      const page = await context.transport.get(request.url, { signal: context.signal, deadline: context.deadline });
      if (page.status === 429) return this.failure(request, 'rate_limited', 429, page.headers?.['retry-after']);
      if ([401, 403].includes(page.status)) return this.failure(request, 'blocked', page.status);
      if ([404, 410].includes(page.status)) return this.failure(request, 'product_not_found', page.status);
      if (page.status >= 500) return this.failure(request, 'network_error', page.status);
      if (page.status >= 400) return this.failure(request, 'invalid_product', page.status);
      const $ = load(page.html);
      const text = `${$('title').text()} ${$('body').text().slice(0, 5000)}`;
      if (/verify you are human|access denied|automated access|captcha|unusual traffic/i.test(text)) return this.failure(request, 'blocked', page.status);
      let products: Node[] = [];
      $('script[type="application/ld+json"]').each((_i, el) => {
        try { flatten(JSON.parse($(el).text()), {}, products); } catch { /* Other unrelated or malformed structured blocks are not evidence. */ }
      });
      if (!products.length) return this.failure(request, 'incompatible_page');
      products = await this.enrich(products, page.html, request, context);
      const product = products.find(p => normalizeText(String(p.color ?? '')) === normalizeText(request.color) && explicitCm(p.size) === request.sizeCm);
      if (!product) return this.failure(request, products.some(p => normalizeText(String(p.color ?? '')) === normalizeText(request.color) && explicitCm(p.size) === null) ? 'verification_pending' : 'variant_absent');
      const offers: Node[] = Array.isArray(product.offers) ? product.offers : product.offers ? [product.offers] : [];
      if (offers.length !== 1 || offers[0]['@type'] === 'AggregateOffer') return this.failure(request, 'invalid_data');
      const offer = offers[0];
      const currency = String(offer.priceCurrency ?? '').toUpperCase();
      const price = { minorUnits: amountToMinor(offer.price, currency), currency, scale: currency === 'CLP' ? 0 : 2 };
      const specs: Node[] = Array.isArray(offer.priceSpecification) ? offer.priceSpecification : offer.priceSpecification ? [offer.priceSpecification] : [];
      const original = specs.find(p => String(p.priceType).endsWith('StrikethroughPrice') && (!p.priceCurrency || p.priceCurrency === currency));
      let originalPrice;
      if (original) {
        try { const minorUnits = amountToMinor(original.price, currency); if (minorUnits > price.minorUnits) originalPrice = { ...price, minorUnits }; } catch { /* An invalid optional original price does not invent a discount. */ }
      }
      const available = String(offer.availability ?? '');
      const stock = /(?:\/|^)InStock$/.test(available) ? 'available' : /(?:\/|^)(OutOfStock|SoldOut|Discontinued)$/.test(available) ? 'out_of_stock' : 'unknown';
      const variantId = String(product.sku ?? product.gtin ?? product.productID ?? '');
      if (!variantId || !product.name) return this.failure(request, 'invalid_data');
      return { status: 'success', requestId: request.requestId, data: {
        storeId: this.storeId, marketId: request.marketId, productId: String(product.groupId ?? product.productID ?? variantId), variantId,
        canonicalUrl: request.url, effectiveUrl: page.effectiveUrl, color: String(product.color), sizeCm: request.sizeCm,
        name: String(product.name), observedAt: context.now().toISOString(), price, originalPrice, stock,
        evidence: { variantId, source: 'schema.org/Product', excerpt: `${product.color}; ${request.sizeCm} cm; ${available}${product.sizeEvidence ? `; ${product.sizeEvidence}` : ''}` },
      } };
    } catch (error) {
      if (error instanceof StoreReadError) return this.failure(request, error.code, error.response.status, error.response.headers?.['retry-after']);
      return this.failure(request, context.signal.aborted ? 'cancelled' : error instanceof Error && /timeout/i.test(error.name + error.message) ? 'timeout' : error instanceof Error && /invalid_(price|currency)/.test(error.message) ? 'invalid_data' : 'network_error');
    }
  }
  async resolveProduct(request: ProductRequest, context: ScraperContext): Promise<ScraperResult<ResolvedProduct>> {
    return this.extract(request, context);
  }
  async fetchProducts(requests: readonly ProductRequest[], context: ScraperContext): Promise<readonly ScraperResult<ProductObservation>[]> {
    const results: ScraperResult<ProductObservation>[] = [];
    for (const request of requests) results.push(await this.extract(request, context));
    return results;
  }
}

export class NikeScraper extends StructuredStoreScraper {
  readonly storeId = 'nike';
  readonly domains = ['nike.com'];
  protected async enrich(products: Node[], html: string, request: ProductRequest, context: ScraperContext): Promise<Node[]> {
    if (products.some(p => explicitCm(p.size) === request.sizeCm && normalizeText(String(p.color ?? '')) === normalizeText(request.color))) return products;
    const $ = load(html);
    let selected: Node;
    try { selected = JSON.parse($('#__NEXT_DATA__').text()).props.pageProps.selectedProduct; } catch { return products; }
    if (!selected || selected.isMemberProduct || selected.isRestrictedAccess) return [];
    const chartUrl = selected.sizeChartUrl;
    if (typeof chartUrl !== 'string' || storeForUrl(chartUrl) !== 'nike' || !new URL(chartUrl).pathname.includes('/size-fit/')) return products;
    // Only use the explicitly linked chart's CM shoe size, never measured foot length.
    const baseRow = chartUrl.includes('mens-based') || /\/mens-footwear\/?$/.test(chartUrl) ? 'US - Men' : chartUrl.includes('womens-based') || /\/womens-footwear\/?$/.test(chartUrl) ? 'US - Women' : null;
    if (!baseRow) return products;
    const chart = await context.transport.get(chartUrl, { signal: context.signal, deadline: context.deadline });
    if (chart.status === 429) throw new StoreReadError('rate_limited', chart);
    if ([401, 403].includes(chart.status)) throw new StoreReadError('blocked', chart);
    if (chart.status >= 400) throw new StoreReadError('incompatible_page', chart);
    const chartDocument = load(chart.html);
    const rows: string[][] = [];
    chartDocument('table tr').each((_i, row) => {
      rows.push(chartDocument(row).find('th,td').map((_j, cell) => chartDocument(cell).text().trim()).get());
    });
    const local = rows.find(row => normalizeText(row[0]) === normalizeText(baseRow));
    const centimetres = rows.find(row => /^CM\s*\/\s*JP$/i.test(row[0]));
    if (!local || !centimetres || local.length !== centimetres.length) return products;
    const matches = centimetres.map((cm, index) => explicitCm(`${cm} cm`) === request.sizeCm ? index : -1).filter(index => index > 0);
    if (matches.length !== 1) return products;
    const localSize = local[matches[0]];
    return products.map(product => {
      if (String(product.size) !== localSize) return product;
      const sku = Array.isArray(selected.sizes) ? selected.sizes.find((size: Node) => String(size.label) === localSize && size.gtins?.some((gtin: Node) => gtin.gtin === product.gtin)) : null;
      if (!sku) return product;
      const enriched: Node = { ...product, size: `${request.sizeCm} cm`, sizeEvidence: chartUrl, groupId: selected.styleColor ?? product.groupId };
      if (selected.prices?.currency === product.offers?.priceCurrency && Number(selected.prices.currentPrice) === Number(product.offers.price) && Number(selected.prices.initialPrice) > Number(selected.prices.currentPrice)) {
        enriched.offers = { ...product.offers, priceSpecification: { priceType: 'https://schema.org/StrikethroughPrice', price: selected.prices.initialPrice, priceCurrency: selected.prices.currency } };
      }
      return enriched;
    });
  }
}
export class AdidasScraper extends StructuredStoreScraper {
  readonly storeId = 'adidas';
  readonly domains = ['adidas.com', 'adidas.es', 'adidas.co.uk', 'adidas.de', 'adidas.fr', 'adidas.it', 'adidas.ca', 'adidas.mx', 'adidas.com.ar', 'adidas.cl', 'adidas.co', 'adidas.com.br', 'adidas.pe'];
}
export const scraperRegistry = new Map<string, BaseScraper>([['nike', new NikeScraper()], ['adidas', new AdidasScraper()]]);
