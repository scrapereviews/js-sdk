import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ScrapeReviews,
  ScrapeReviewsError,
  AuthenticationError,
  InsufficientCreditsError,
  InvalidCursorError,
  InvalidParameterError,
  NotFoundError,
  RateLimitError,
  UpstreamError,
  DEFAULT_BASE_URL,
} from "../src/index.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const BASE = "https://api.test.scrapereviews.com";

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function errorResponse(status: number, error: string, message = "boom", headers = {}) {
  return jsonResponse({ detail: { error, message } }, status, headers);
}

function calledUrl(i = 0): URL {
  return new URL(mockFetch.mock.calls[i][0] as string);
}

const companySummary = (domain = "zalando.it") => ({
  id: "4e80",
  domain,
  name: "Zalando",
  trust_score: 1.9,
  stars: 2,
  review_count: 13683,
  logo_url: null,
  categories: [{ id: "shoe_store", name: "Shoe Store", is_primary: false }],
  contact: { website: "https://zalando.it", email: null, phone: null, address: null, city: "Berlin", zip_code: null, country: "Germany" },
  trustpilot_url: `https://www.trustpilot.com/review/${domain}`,
});

const review = (id: string) => ({
  id,
  rating: 1,
  title: "Bad",
  text: "Never arrived",
  language: "it",
  experienced_at: null,
  published_at: "2026-11-20T01:05:15.000Z",
  updated_at: null,
  is_verified: false,
  verification_source: null,
  source: "Organic",
  likes: 0,
  author: { id: "u_1", country: "IT", review_count: 2, is_verified: false },
  reply: null,
  url: `https://www.trustpilot.com/reviews/${id}`,
});

const reviewsPage = (ids: string[], nextCursor: string | null = null) => ({
  company: { id: "4e80", domain: "zalando.it", name: "Zalando", trust_score: 1.9, review_count: 13683, trustpilot_url: "https://www.trustpilot.com/review/zalando.it" },
  data: ids.map(review),
  meta: { credits_used: 1, cache_hit: false, count: ids.length, total: 100, has_more: nextCursor !== null, next_cursor: nextCursor, complete: true },
});

const listMeta = (count: number, nextCursor: string | null = null) => ({
  credits_used: 1, cache_hit: false, count, total: count, has_more: nextCursor !== null, next_cursor: nextCursor,
});

describe("ScrapeReviews", () => {
  let client: ScrapeReviews;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new ScrapeReviews({ apiKey: "test_key", baseUrl: BASE, maxRetries: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe("initialization", () => {
    it("uses defaults", () => {
      const c = new ScrapeReviews({ apiKey: "k" });
      expect(c.baseUrl).toBe(DEFAULT_BASE_URL);
      expect(c.creditsUsed).toBeNull();
    });

    it("strips trailing slash from base URL", () => {
      expect(new ScrapeReviews({ apiKey: "k", baseUrl: "https://x.com/" }).baseUrl).toBe("https://x.com");
    });

    it("reads environment variables", async () => {
      vi.stubEnv("SCRAPEREVIEWS_API_KEY", "env_key");
      vi.stubEnv("SCRAPEREVIEWS_BASE_URL", "http://localhost:8000");
      const c = new ScrapeReviews();
      expect(c.baseUrl).toBe("http://localhost:8000");
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], meta: { credits_used: 1, cache_hit: false } }));
      await c.categories.list();
      expect(mockFetch.mock.calls[0][1].headers["X-API-Key"]).toBe("env_key");
    });

    it("throws without an API key", () => {
      vi.stubEnv("SCRAPEREVIEWS_API_KEY", "");
      expect(() => new ScrapeReviews()).toThrow(AuthenticationError);
    });
  });

  describe("companies", () => {
    it("searches", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [companySummary()], meta: listMeta(1, "c2") }));
      const result = await client.companies.search("zalando", { limit: 5, cursor: "c1" });
      expect(result.data[0].domain).toBe("zalando.it");
      expect(result.meta.next_cursor).toBe("c2");
      const url = calledUrl();
      expect(url.pathname).toBe("/v1/companies/search");
      expect(Object.fromEntries(url.searchParams)).toEqual({ query: "zalando", limit: "5", cursor: "c1" });
    });

    it("gets a company profile", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: { ...companySummary("www.monzo.com"), similar: [] }, meta: { credits_used: 2, cache_hit: true } })
      );
      const result = await client.companies.get("www.monzo.com", { includeSimilar: true });
      expect(result.meta.credits_used).toBe(2);
      expect(calledUrl().pathname).toBe("/v1/companies/www.monzo.com");
      expect(calledUrl().searchParams.get("include_similar")).toBe("true");
    });

    it.each([
      "https://www.monzo.com/about?x=1",
      "https://www.trustpilot.com/review/www.monzo.com",
      "www.monzo.com/",
    ])("reduces %s to the domain", async (given) => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: companySummary("www.monzo.com"), meta: { credits_used: 2 } }));
      await client.companies.get(given);
      expect(calledUrl().pathname).toBe("/v1/companies/www.monzo.com");
      expect(calledUrl().search).toBe("");
    });

    it("gets reviews with filters", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(reviewsPage(["r1"])));
      const result = await client.companies.reviews("zalando.it", {
        stars: [2, 1],
        language: "it",
        since: "2026-01-01",
        until: new Date("2026-06-30T00:00:00Z"),
        verified: true,
        withReply: true,
        search: "refund",
        sort: "relevant",
        limit: 50,
        cursor: "abc",
      });
      expect(result.data[0].author.id).toBe("u_1");
      expect(result.meta.complete).toBe(true);
      expect(calledUrl().pathname).toBe("/v1/companies/zalando.it/reviews");
      expect(Object.fromEntries(calledUrl().searchParams)).toEqual({
        stars: "1,2",
        language: "it",
        since: "2026-01-01",
        until: "2026-06-30T00:00:00.000Z",
        verified: "true",
        with_reply: "true",
        search: "refund",
        sort: "relevant",
        limit: "50",
        cursor: "abc",
      });
    });

    it("sends only set review params", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(reviewsPage([])));
      await client.companies.reviews("zalando.it", { stars: "4,5", language: "all", verified: false });
      expect(Object.fromEntries(calledUrl().searchParams)).toEqual({ stars: "4,5", sort: "recent", limit: "20" });
    });

    it("iterates over reviews following the cursor", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(reviewsPage(["a", "b"], "c1")))
        .mockResolvedValueOnce(jsonResponse(reviewsPage(["c"])));
      const ids: string[] = [];
      for await (const r of client.companies.iterReviews("zalando.it", { stars: [1] })) ids.push(r.id);
      expect(ids).toEqual(["a", "b", "c"]);
      expect(calledUrl(0).searchParams.get("limit")).toBe("100");
      expect(calledUrl(0).searchParams.has("cursor")).toBe(false);
      expect(calledUrl(1).searchParams.get("cursor")).toBe("c1");
      expect(calledUrl(1).searchParams.get("stars")).toBe("1");
    });

    it("stops iterating at maxReviews", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(reviewsPage(["a", "b"], "c1")))
        .mockResolvedValueOnce(jsonResponse(reviewsPage(["c"], "c2")));
      const ids: string[] = [];
      for await (const r of client.companies.iterReviews("zalando.it", { pageSize: 2, maxReviews: 3 })) ids.push(r.id);
      expect(ids).toEqual(["a", "b", "c"]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(calledUrl(1).searchParams.get("limit")).toBe("1");
    });
  });

  describe("categories", () => {
    it("lists categories", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [{ id: "animals_pets", name: "Animals & Pets", subcategories: [] }], meta: { credits_used: 1, cache_hit: false } })
      );
      const result = await client.categories.list();
      expect(result.data[0].id).toBe("animals_pets");
      expect(calledUrl().pathname).toBe("/v1/categories");
    });

    it("lists companies in a category", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ category: { id: "bank", name: "Bank", country: "IT" }, data: [companySummary()], meta: listMeta(1) })
      );
      const result = await client.categories.companies("bank", "IT", {
        sort: "reviews_count",
        minTrustScore: "4.0",
        location: "Milano",
        limit: 10,
      });
      expect(result.category.country).toBe("IT");
      expect(calledUrl().pathname).toBe("/v1/categories/bank/companies");
      expect(Object.fromEntries(calledUrl().searchParams)).toEqual({
        country: "IT",
        sort: "reviews_count",
        min_trust_score: "4.0",
        location: "Milano",
        limit: "10",
      });
    });
  });

  describe("response headers", () => {
    it("tracks credits used", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], meta: { credits_used: 1, cache_hit: false } }, 200, { "x-credits-used": "1" })
      );
      await client.categories.list();
      expect(client.creditsUsed).toBe(1);
    });
  });

  describe("error handling", () => {
    it.each([
      [400, "invalid_parameter", InvalidParameterError],
      [401, "invalid_api_key", AuthenticationError],
      [402, "insufficient_credits", InsufficientCreditsError],
      [404, "company_not_found", NotFoundError],
      [404, "category_not_found", NotFoundError],
      [422, "invalid_cursor", InvalidCursorError],
      [429, "rate_limit_exceeded", RateLimitError],
      [502, "upstream_changed", UpstreamError],
      [503, "upstream_blocked", UpstreamError],
      [504, "upstream_timeout", UpstreamError],
    ] as const)("maps %i %s", async (status, code, ErrorClass) => {
      mockFetch.mockResolvedValueOnce(errorResponse(status, code, "Nope"));
      const err = await client.companies.get("x.com").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ErrorClass);
      expect(err).toBeInstanceOf(ScrapeReviewsError);
      expect(err).toMatchObject({ statusCode: status, code, message: "Nope", name: ErrorClass.name });
    });

    it("falls back to the status code without a JSON body", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
      const err = await client.companies.get("x.com").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundError);
      expect(err).toMatchObject({ message: "Not Found", code: undefined });
    });

    it("exposes retryAfter", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(429, "rate_limit_exceeded", "slow", { "retry-after": "7" }));
      const err = await client.categories.list().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfter).toBe(7);
    });
  });

  describe("retries", () => {
    let retrying: ScrapeReviews;

    beforeEach(() => {
      vi.useFakeTimers();
      retrying = new ScrapeReviews({ apiKey: "k", baseUrl: BASE });
    });

    it("retries transient errors then succeeds", async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(503, "upstream_blocked"))
        .mockResolvedValueOnce(errorResponse(429, "rate_limit_exceeded", "slow", { "retry-after": "2" }))
        .mockResolvedValueOnce(jsonResponse({ data: [], meta: { credits_used: 1, cache_hit: false } }, 200, { "x-credits-used": "1" }));
      const promise = retrying.categories.list();
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toMatchObject({ data: [] });
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(retrying.creditsUsed).toBe(1);
    });

    it("gives up after maxRetries", async () => {
      mockFetch.mockImplementation(async () => errorResponse(504, "upstream_timeout"));
      const promise = retrying.categories.list().catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      expect(await promise).toBeInstanceOf(UpstreamError);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it.each([
      ["upstream_changed", 502, {}],
      ["insufficient_credits_retry_later", 429, { "retry-after": "5" }],
      ["rate_limit_exceeded", 429, { "retry-after": "600" }],
      ["invalid_parameter", 400, {}],
    ])("does not retry %s", async (code, status, headers) => {
      mockFetch.mockImplementation(async () => errorResponse(status, code, "x", headers));
      await expect(retrying.categories.list()).rejects.toBeInstanceOf(ScrapeReviewsError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
