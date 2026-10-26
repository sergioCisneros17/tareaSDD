import { BaseScraper, type ProductRequest, type ScraperContext } from '../../src/scraping/base-scraper.mts';
import { FixtureScraper } from '../helpers/fixture-scraper.mts';

const scraper: BaseScraper = new FixtureScraper();
declare const context: ScraperContext;
declare const request: ProductRequest;

scraper.describe(context);
scraper.resolveProduct(request, context);
scraper.fetchProducts([request], context);

// @ts-expect-error Abstract adapters cannot be instantiated.
new BaseScraper();
// @ts-expect-error Every adapter must implement all three methods.
class MissingMethods extends BaseScraper {}
// @ts-expect-error Requests must retain their exact selection.
scraper.resolveProduct({ requestId: 'missing-selection', url: request.url }, context);
// @ts-expect-error Every operational method requires the controlled context.
scraper.fetchProducts([request]);
