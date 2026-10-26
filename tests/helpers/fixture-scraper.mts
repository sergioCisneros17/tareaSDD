import {
  BaseScraper,
  type ProductObservation,
  type ProductRequest,
  type ResolvedProduct,
  type ScraperContext,
  type ScraperDescription,
  type ScraperResult,
} from '../../src/scraping/base-scraper.mts';

type FixtureProduct = {
  productId: string;
  variantId: string;
  name: string;
  color: string;
  sizeCm: string;
  priceMinor: string;
  originalPriceMinor: string;
  currency: string;
  scale: number;
  stock: 'available';
};

// This test double reads a controlled fixture marker, not arbitrary store HTML.
export class FixtureScraper extends BaseScraper {
  describe(_context: ScraperContext): ScraperDescription {
    return {
      storeId: 'fixture-store',
      version: 'test-1',
      markets: [{ id: 'fixture-market', domains: ['shop.example.test'] }],
    };
  }

  private async read(
    request: ProductRequest,
    context: ScraperContext,
  ): Promise<Exclude<ScraperResult<FixtureProduct>, { status: 'partial' }>> {
    if (context.signal.aborted) {
      return { status: 'failure', requestId: request.requestId, error: { code: 'cancelled' } };
    }
    const page = await context.transport.get(request.url, {
      signal: context.signal,
      deadline: context.deadline,
    });
    const marker = '<script id="fixture-product" type="application/json">';
    const start = page.html.indexOf(marker);
    const end = page.html.indexOf('</script>', start);
    if (start < 0 || end < 0) {
      return { status: 'failure', requestId: request.requestId, error: { code: 'incompatible_page' } };
    }
    const product: FixtureProduct = JSON.parse(page.html.slice(start + marker.length, end));
    if (product.color !== request.color || product.sizeCm !== request.sizeCm) {
      return { status: 'failure', requestId: request.requestId, error: { code: 'variant_absent' } };
    }
    return { status: 'success', requestId: request.requestId, data: product };
  }

  async resolveProduct(
    request: ProductRequest,
    context: ScraperContext,
  ): Promise<ScraperResult<ResolvedProduct>> {
    const result = await this.read(request, context);
    if (result.status !== 'success') return result;
    return {
      status: 'success',
      requestId: request.requestId,
      data: {
        storeId: 'fixture-store',
        marketId: request.marketId,
        productId: result.data.productId,
        variantId: result.data.variantId,
        canonicalUrl: request.url,
        color: result.data.color,
        sizeCm: result.data.sizeCm,
      },
    };
  }

  async fetchProducts(
    requests: readonly ProductRequest[],
    context: ScraperContext,
  ): Promise<readonly ScraperResult<ProductObservation>[]> {
    const results: ScraperResult<ProductObservation>[] = [];
    for (const request of requests) {
      const result = await this.read(request, context);
      if (result.status !== 'success') {
        results.push(result);
        continue;
      }
      const product = result.data;
      results.push({
        status: 'success',
        requestId: request.requestId,
        data: {
          storeId: 'fixture-store',
          marketId: request.marketId,
          productId: product.productId,
          variantId: product.variantId,
          canonicalUrl: request.url,
          color: product.color,
          sizeCm: product.sizeCm,
          name: product.name,
          effectiveUrl: request.url,
          observedAt: context.now().toISOString(),
          price: { minorUnits: BigInt(product.priceMinor), currency: product.currency, scale: product.scale },
          originalPrice: { minorUnits: BigInt(product.originalPriceMinor), currency: product.currency, scale: product.scale },
          stock: product.stock,
          evidence: { variantId: product.variantId, source: 'fixture-product', excerpt: product.variantId },
        },
      });
    }
    return results;
  }
}
