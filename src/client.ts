import { AuthenticationError, errorFromResponse, type ScrapeReviewsError } from "./errors.js";
import { CategoriesAPI } from "./resources/categories.js";
import { CompaniesAPI } from "./resources/companies.js";
import type { QueryValue } from "./resources/shared.js";
import type { ClientOptions, HealthResponse } from "./types.js";

export const DEFAULT_BASE_URL = "https://api.scrapereviews.com";
const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_DELAY_S = 30;
const VERSION = "0.1.0";

// 502 (upstream_changed) is not retried: Trustpilot changed its pages and an immediate
// retry gets the same answer.
const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);

function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  return proc?.env?.[name] || undefined;
}

function toQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === false) continue;
    if (value instanceof Date) search.set(key, value.toISOString());
    else if (Array.isArray(value))
      search.set(key, [...value].sort((a, b) => a - b).join(","));
    else search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Seconds to wait before retrying `error`, or null if it must be thrown.
 * A 429 caused by an empty balance is not retried: waiting does not add credits.
 */
function retryDelay(error: ScrapeReviewsError, attempt: number, maxRetries: number): number | null {
  if (attempt >= maxRetries || !RETRYABLE_STATUS.has(error.statusCode ?? 0)) return null;
  if (error.code === "insufficient_credits_retry_later") return null;
  if (error.retryAfter !== undefined)
    return error.retryAfter <= MAX_RETRY_DELAY_S ? error.retryAfter : null;
  return Math.min(0.5 * 2 ** attempt, MAX_RETRY_DELAY_S);
}

const sleep = (seconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));

export class ScrapeReviews {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private lastCreditsUsed: number | null = null;

  readonly companies: CompaniesAPI;
  readonly categories: CategoriesAPI;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? env("SCRAPEREVIEWS_API_KEY");
    if (!apiKey) {
      throw new AuthenticationError(
        "No API key: pass { apiKey } or set the SCRAPEREVIEWS_API_KEY environment variable."
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? env("SCRAPEREVIEWS_BASE_URL") ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      ""
    );
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    const requestFn = this.request.bind(this);
    this.companies = new CompaniesAPI(requestFn);
    this.categories = new CategoriesAPI(requestFn);
  }

  private async request(path: string, params: Record<string, QueryValue> = {}): Promise<unknown> {
    const url = `${this.baseUrl}${path}${toQuery(params)}`;
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchOnce(url);
      const credits = response.headers.get("x-credits-used");
      this.lastCreditsUsed = credits ? parseInt(credits, 10) : null;
      if (response.ok) return await response.json();

      const error = await errorFromResponse(response);
      const delay = retryDelay(error, attempt, this.maxRetries);
      if (delay === null) throw error;
      await sleep(delay);
    }
  }

  private async fetchOnce(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await fetch(url, {
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          Accept: "application/json",
          "User-Agent": `ScrapeReviews-JS/${VERSION}`,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Check API health status (no authentication, no credits). */
  async healthCheck(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`);
    return (await response.json()) as HealthResponse;
  }

  /** Credits charged by the last request (`X-Credits-Used` header). */
  get creditsUsed(): number | null {
    return this.lastCreditsUsed;
  }
}
