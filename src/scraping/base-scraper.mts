/** Store-independent contracts. Execution policies belong to the scraping engine. */
export interface ScraperDescription {
  readonly storeId: string;
  readonly version: string;
  readonly markets: readonly {
    readonly id: string;
    readonly domains: readonly string[];
  }[];
}

export interface ProductRequest {
  readonly requestId: string;
  readonly url: string;
  readonly marketId: string;
  readonly color: string;
  /** Explicit centimetres; adapters must not infer unverified conversions. */
  readonly sizeCm: string;
}

export interface TransportOptions {
  readonly signal: AbortSignal;
  readonly deadline: Date;
}

export interface PageResponse {
  readonly html: string;
  readonly effectiveUrl: string;
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface ScraperTransport {
  /** All network access must use the engine-controlled transport. */
  get(url: string, options: TransportOptions): Promise<PageResponse>;
}

export interface ScraperContext {
  readonly transport: ScraperTransport;
  readonly now: () => Date;
  readonly deadline: Date;
  readonly signal: AbortSignal;
}

export interface ResolvedProduct {
  readonly storeId: string;
  readonly marketId: string;
  readonly productId: string;
  readonly variantId: string;
  readonly canonicalUrl: string;
  readonly color: string;
  readonly sizeCm: string;
}

export interface Money {
  readonly minorUnits: bigint;
  readonly currency: string;
  readonly scale: number;
}

export interface ProductObservation extends ResolvedProduct {
  readonly name: string;
  readonly effectiveUrl: string;
  /** ISO 8601 UTC timestamp supplied by the execution context. */
  readonly observedAt: string;
  readonly price: Money;
  readonly originalPrice?: Money;
  readonly stock: 'available' | 'out_of_stock' | 'unknown' | 'variant_absent';
  readonly evidence: {
    readonly variantId: string;
    readonly source: string;
    readonly excerpt: string;
  };
}

export type ScraperErrorCode =
  | 'timeout'
  | 'network_error'
  | 'blocked'
  | 'rate_limited'
  | 'product_not_found'
  | 'invalid_product'
  | 'variant_absent'
  | 'incompatible_page'
  | 'invalid_data'
  | 'verification_pending'
  | 'cancelled';

export interface ScraperFailure {
  readonly status: 'failure';
  readonly requestId: string;
  readonly error: {
    readonly code: ScraperErrorCode;
    readonly httpStatus?: number;
    /** Raw header for interpretation by the engine, not by an adapter retry loop. */
    readonly retryAfter?: string;
  };
}

export type ScraperResult<T> =
  | { readonly status: 'success'; readonly requestId: string; readonly data: T }
  | {
      readonly status: 'partial';
      readonly requestId: string;
      readonly data: Partial<T>;
      readonly reasons: readonly string[];
    }
  | ScraperFailure;

/** Implementations extract data; they do not persist, schedule, retry or present it. */
export abstract class BaseScraper {
  abstract describe(context: ScraperContext): ScraperDescription;

  abstract resolveProduct(
    request: ProductRequest,
    context: ScraperContext,
  ): Promise<ScraperResult<ResolvedProduct>>;

  /** Preserve request identity and return one independently classified result per request. */
  abstract fetchProducts(
    requests: readonly ProductRequest[],
    context: ScraperContext,
  ): Promise<readonly ScraperResult<ProductObservation>[]>;
}
