import type {
  CompanyResponse,
  GetCompanyOptions,
  IterReviewsOptions,
  Review,
  ReviewFilters,
  ReviewsOptions,
  ReviewsResponse,
  SearchOptions,
  SearchResponse,
} from "../types.js";
import { domainPath, type QueryValue, type RequestFn } from "./shared.js";

export class CompaniesAPI {
  constructor(private readonly request: RequestFn) {}

  /**
   * Search Trustpilot companies by name or domain. An exact domain returns that company.
   * Cost: 1 credit per 10 results (min 1).
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    return this.request("/v1/companies/search", {
      query,
      limit: options.limit ?? 10,
      cursor: options.cursor,
    }) as Promise<SearchResponse>;
  }

  /**
   * Full company profile. `domain` accepts `example.com`, a website URL or a Trustpilot URL.
   * Cost: 2 credits.
   */
  async get(domain: string, options: GetCompanyOptions = {}): Promise<CompanyResponse> {
    return this.request(`/v1/companies/${domainPath(domain)}`, {
      include_similar: options.includeSimilar,
    }) as Promise<CompanyResponse>;
  }

  /**
   * One page of reviews. Cost: 1 credit per 5 reviews returned (min 1).
   * `limit` is lowered by the API if the balance cannot pay for it.
   */
  async reviews(domain: string, options: ReviewsOptions = {}): Promise<ReviewsResponse> {
    return this.request(`/v1/companies/${domainPath(domain)}/reviews`, {
      ...filterParams(options),
      limit: options.limit ?? 20,
      cursor: options.cursor,
    }) as Promise<ReviewsResponse>;
  }

  /**
   * Iterate over reviews, following `meta.next_cursor` page by page.
   * Every page is billed as it is fetched; `break` or `maxReviews` to spend less.
   */
  async *iterReviews(
    domain: string,
    options: IterReviewsOptions = {}
  ): AsyncGenerator<Review, void, undefined> {
    const { pageSize = 100, maxReviews, ...filters } = options;
    let cursor: string | undefined;
    let yielded = 0;
    for (;;) {
      const limit =
        maxReviews === undefined ? pageSize : Math.min(pageSize, maxReviews - yielded);
      if (limit <= 0) return;
      const page = await this.reviews(domain, { ...filters, limit, cursor });
      yield* page.data;
      yielded += page.data.length;
      if (!page.meta.next_cursor) return;
      cursor = page.meta.next_cursor;
    }
  }
}

function filterParams(f: ReviewFilters): Record<string, QueryValue> {
  return {
    stars: f.stars,
    language: f.language === "all" ? undefined : f.language,
    since: f.since,
    until: f.until,
    verified: f.verified,
    with_reply: f.withReply,
    search: f.search,
    sort: f.sort ?? "recent",
  };
}
