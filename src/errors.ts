import type { ErrorResponseBody } from "./types.js";

export class ScrapeReviewsError extends Error {
  /** HTTP status, or undefined for errors raised before any request. */
  readonly statusCode: number | undefined;
  /** Machine-readable API error code, e.g. `company_not_found`. */
  readonly code: string | undefined;
  /** Seconds to wait before retrying, when the API says so. */
  readonly retryAfter: number | undefined;

  constructor(
    message: string,
    statusCode?: number,
    code?: string,
    retryAfter?: number
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/** A parameter was rejected (bad domain, stars, language, date...). HTTP 400. */
export class InvalidParameterError extends ScrapeReviewsError {}

/** Missing or invalid API key. HTTP 401. */
export class AuthenticationError extends ScrapeReviewsError {}

/** The credit balance is empty. HTTP 402, or 429 while the key is in cooldown. */
export class InsufficientCreditsError extends ScrapeReviewsError {}

/** Company or category not found (`code` tells which). HTTP 404. */
export class NotFoundError extends ScrapeReviewsError {}

/** The cursor is malformed, tampered with, or was made for other filters. HTTP 422. */
export class InvalidCursorError extends ScrapeReviewsError {}

/** Too many requests; `retryAfter` holds the wait in seconds. HTTP 429. */
export class RateLimitError extends ScrapeReviewsError {}

/** Trustpilot is unreachable, blocking, slow, or changed its pages. HTTP 502/503/504. */
export class UpstreamError extends ScrapeReviewsError {}

const ERROR_MAP: Record<string, typeof ScrapeReviewsError> = {
  invalid_parameter: InvalidParameterError,
  missing_api_key: AuthenticationError,
  invalid_api_key: AuthenticationError,
  insufficient_credits: InsufficientCreditsError,
  insufficient_credits_retry_later: InsufficientCreditsError,
  company_not_found: NotFoundError,
  category_not_found: NotFoundError,
  invalid_cursor: InvalidCursorError,
  rate_limit_exceeded: RateLimitError,
  upstream_changed: UpstreamError,
  upstream_blocked: UpstreamError,
  upstream_error: UpstreamError,
  upstream_timeout: UpstreamError,
};

const STATUS_MAP: Record<number, typeof ScrapeReviewsError> = {
  400: InvalidParameterError,
  401: AuthenticationError,
  402: InsufficientCreditsError,
  404: NotFoundError,
  422: InvalidCursorError,
  429: RateLimitError,
  502: UpstreamError,
  503: UpstreamError,
  504: UpstreamError,
};

function toSeconds(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Build the error matching an error response. */
export async function errorFromResponse(
  response: Response
): Promise<ScrapeReviewsError> {
  let message = `HTTP ${response.status}`;
  let code: string | undefined;
  let retryAfter: number | undefined;

  const text = await response.text().catch(() => "");
  try {
    const body = JSON.parse(text) as ErrorResponseBody;
    if (typeof body.detail === "string") {
      message = body.detail;
    } else if (body.detail) {
      code = body.detail.error;
      message = body.detail.message ?? message;
      retryAfter = toSeconds(body.detail.retry_after);
    }
  } catch {
    if (text) message = text;
  }
  retryAfter = toSeconds(response.headers.get("retry-after")) ?? retryAfter;

  const ErrorClass =
    (code && ERROR_MAP[code]) || STATUS_MAP[response.status] || ScrapeReviewsError;
  return new ErrorClass(message, response.status, code, retryAfter);
}
