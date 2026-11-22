// Response shapes mirror the API's JSON (snake_case fields).

// ============================================================
// Meta
// ============================================================

export interface Meta {
  /** Credits charged for this call. */
  credits_used: number;
  /** Served entirely from cache. */
  cache_hit: boolean;
}

export interface ListMeta extends Meta {
  count: number;
  total: number | null;
  has_more: boolean;
  /** Pass as `cursor` to get the next page. */
  next_cursor: string | null;
}

export interface ReviewsMeta extends ListMeta {
  /** False when Trustpilot's per-filter cap hid some matching reviews. */
  complete: boolean;
}

// ============================================================
// Companies
// ============================================================

export interface CategoryRef {
  id: string;
  name: string;
  is_primary: boolean;
}

export interface ContactInfo {
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  zip_code: string | null;
  country: string | null;
}

export interface StarDistribution {
  one: number;
  two: number;
  three: number;
  four: number;
  five: number;
}

export interface LanguageCount {
  language: string;
  count: number;
}

export interface ReplyBehavior {
  reply_rate: number | null;
  average_days_to_reply: number | null;
  negative_reviews_count: number | null;
  negative_reviews_with_reply_count: number | null;
  last_reply_to_negative_review_at: string | null;
}

/** A company as it appears in search results and category rankings. */
export interface CompanySummary {
  id: string;
  domain: string;
  name: string;
  trust_score: number | null;
  stars: number | null;
  review_count: number;
  logo_url: string | null;
  categories: CategoryRef[];
  contact: ContactInfo;
  trustpilot_url: string;
}

/** Full company profile. */
export interface Company {
  id: string;
  domain: string;
  name: string;
  website: string | null;
  trust_score: number | null;
  stars: number | null;
  review_count: number;
  review_count_last_12_months: number | null;
  star_distribution: StarDistribution;
  languages: LanguageCount[];
  categories: CategoryRef[];
  description: string | null;
  country: string | null;
  contact: ContactInfo;
  is_claimed: boolean;
  claimed_at: string | null;
  is_closed: boolean;
  is_temporarily_closed: boolean;
  is_using_paid_features: boolean | null;
  reply_behavior: ReplyBehavior;
  verified: boolean;
  consumer_alert: string | null;
  logo_url: string | null;
  /** Only filled with `includeSimilar: true`. */
  similar: CompanySummary[];
  trustpilot_url: string;
}

/** The company a page of reviews belongs to. */
export interface CompanyRef {
  id: string;
  domain: string;
  name: string;
  trust_score: number | null;
  review_count: number;
  trustpilot_url: string;
}

// ============================================================
// Reviews
// ============================================================

/** Pseudonymised author: `id` is stable across reviews; no name or avatar. */
export interface ReviewAuthor {
  id: string;
  country: string | null;
  review_count: number | null;
  is_verified: boolean | null;
}

export interface ReviewReply {
  text: string;
  published_at: string | null;
  updated_at: string | null;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  text: string | null;
  language: string | null;
  experienced_at: string | null;
  published_at: string;
  updated_at: string | null;
  is_verified: boolean;
  verification_source: string | null;
  source: string | null;
  likes: number;
  author: ReviewAuthor;
  reply: ReviewReply | null;
  url: string;
}

// ============================================================
// Categories
// ============================================================

export interface Category {
  id: string;
  name: string;
  subcategories: Category[];
}

/** The category and country a company ranking refers to. */
export interface CategoryInfo {
  id: string;
  name: string | null;
  country: string;
}

// ============================================================
// Responses
// ============================================================

export interface SearchResponse {
  data: CompanySummary[];
  meta: ListMeta;
}

export interface CompanyResponse {
  data: Company;
  meta: Meta;
}

export interface ReviewsResponse {
  company: CompanyRef;
  data: Review[];
  meta: ReviewsMeta;
}

export interface CategoriesResponse {
  data: Category[];
  meta: Meta;
}

export interface CategoryCompaniesResponse {
  category: CategoryInfo;
  data: CompanySummary[];
  meta: ListMeta;
}

export interface HealthResponse {
  status: string;
  [key: string]: unknown;
}

// ============================================================
// Request options
// ============================================================

export interface SearchOptions {
  /** Results per page, 1-50 (default 10). */
  limit?: number;
  cursor?: string;
}

export interface GetCompanyOptions {
  includeSimilar?: boolean;
}

export type ReviewSort = "recent" | "relevant";

export interface ReviewFilters {
  /** Ratings to keep, e.g. `[1, 2]` or `"1,2"`. */
  stars?: number[] | string;
  /** `"all"` (default) or an ISO 639-1 code. */
  language?: string;
  /** Published on/after: `Date`, `YYYY-MM-DD` or ISO 8601. */
  since?: Date | string;
  /** Published on/before. */
  until?: Date | string;
  verified?: boolean;
  withReply?: boolean;
  /** Full-text filter (max 100 chars). */
  search?: string;
  sort?: ReviewSort;
}

export interface ReviewsOptions extends ReviewFilters {
  /** Reviews per page, 1-100 (default 20). */
  limit?: number;
  cursor?: string;
}

export interface IterReviewsOptions extends ReviewFilters {
  /** Reviews per request, 1-100 (default 100). */
  pageSize?: number;
  /** Stop after this many reviews. */
  maxReviews?: number;
}

export interface CategoryCompaniesOptions {
  sort?: "relevant" | "reviews_count";
  minTrustScore?: "3.0" | "4.0" | "4.5";
  /** City, e.g. `"Milano"`. */
  location?: string;
  /** Companies per page, 1-100 (default 20). */
  limit?: number;
  cursor?: string;
}

// ============================================================
// Client
// ============================================================

export interface ClientOptions {
  /** Defaults to the `SCRAPEREVIEWS_API_KEY` environment variable (Node). */
  apiKey?: string;
  /** Defaults to `SCRAPEREVIEWS_BASE_URL` or the public API. */
  baseUrl?: string;
  /** Request timeout in ms (default 60000). */
  timeout?: number;
  /** Retries on rate limits and transient errors (default 2). */
  maxRetries?: number;
}

export interface ErrorResponseBody {
  detail?: { error?: string; message?: string; retry_after?: number } | string;
}
