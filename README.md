# ScrapeReviews JavaScript/TypeScript SDK

Official TypeScript/JavaScript SDK for the [ScrapeReviews](https://scrapereviews.com) API — Trustpilot company profiles, reviews and category rankings as clean JSON.

## Installation

```bash
npm install scrapereviews
```

## Quick Start

```typescript
import { ScrapeReviews } from 'scrapereviews';

const client = new ScrapeReviews({ apiKey: 'YOUR_API_KEY' }); // or set SCRAPEREVIEWS_API_KEY

// Company profile
const { data: company } = await client.companies.get('zalando.it');
console.log(company.name, company.trust_score, company.review_count);

// Latest negative reviews
const page = await client.companies.reviews('zalando.it', { stars: [1, 2], limit: 20 });
for (const review of page.data) {
  console.log(review.rating, review.title, review.published_at);
}
```

## Configuration

| Option | Environment variable (Node) | Default |
|--------|-----------------------------|---------|
| `apiKey` | `SCRAPEREVIEWS_API_KEY` | required |
| `baseUrl` | `SCRAPEREVIEWS_BASE_URL` | `https://api.scrapereviews.com` |
| `timeout` | — | `60000` ms |
| `maxRetries` | — | `2` (rate limits and transient errors) |

## API Reference

Options are camelCase; response objects keep the API's snake_case fields. Lists come with a
`meta` (`credits_used`, `cache_hit`, `count`, `total`, `has_more`, `next_cursor`): pass
`meta.next_cursor` as `cursor` to get the next page.

### Companies

```typescript
// Search by name or domain (1 credit per 10 results)
const results = await client.companies.search('zalando', { limit: 10 });
const next = await client.companies.search('zalando', { cursor: results.meta.next_cursor ?? undefined });

// Full profile (2 credits). Accepts a domain, a website URL or a Trustpilot URL.
const profile = await client.companies.get('https://www.trustpilot.com/review/zalando.it', {
  includeSimilar: true,
});

// One page of reviews (1 credit per 5 reviews)
const reviews = await client.companies.reviews('zalando.it', {
  stars: [1, 2],          // or '1,2'
  language: 'it',         // 'all' or ISO 639-1
  since: '2026-01-01',    // Date, YYYY-MM-DD or ISO 8601
  withReply: false,
  verified: false,
  search: 'refund',
  sort: 'recent',         // or 'relevant'
  limit: 100,             // 1-100
});

// Every matching review, page by page (each page is billed as it is fetched)
for await (const review of client.companies.iterReviews('zalando.it', { stars: [1], maxReviews: 500 })) {
  // ...
}
```

Trustpilot shows at most 200 reviews per filter combination; the API splits the query by
star rating and language to go further. `meta.complete` is `false` when a single
(star, language) slice still held more than 200 reviews.

### Categories

```typescript
// Category tree (1 credit)
const tree = await client.categories.list();

// Company ranking of a category in a country (1 credit per 10 companies)
const ranking = await client.categories.companies('bank', 'IT', {
  sort: 'reviews_count',
  minTrustScore: '4.0',
  location: 'Milano',
  limit: 20,
});
```

## Error Handling

```typescript
import { NotFoundError, InsufficientCreditsError, RateLimitError } from 'scrapereviews';

try {
  await client.companies.get('does-not-exist.invalid');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log(error.code, error.message); // company_not_found, ...
  } else if (error instanceof InsufficientCreditsError) {
    console.log('Top up your credits');
  } else if (error instanceof RateLimitError) {
    console.log(`Retry in ${error.retryAfter}s`);
  }
}
```

### Exception Hierarchy

| Exception | HTTP Status | Description |
|-----------|-------------|-------------|
| `ScrapeReviewsError` | — | Base error (`message`, `statusCode`, `code`, `retryAfter`) |
| `InvalidParameterError` | 400 | Bad domain, stars, language, date... |
| `AuthenticationError` | 401 | Missing or invalid API key |
| `InsufficientCreditsError` | 402 / 429 | Credit balance is empty |
| `NotFoundError` | 404 | Company or category not found (`code` tells which) |
| `InvalidCursorError` | 422 | Cursor malformed or made for other filters |
| `RateLimitError` | 429 | Too many requests (`retryAfter` seconds) |
| `UpstreamError` | 502 / 503 / 504 | Trustpilot unreachable, slow or changed |

Rate limits (429) and transient errors (500, 503, 504) are retried up to `maxRetries` times,
honouring `Retry-After`. Failed calls cost no credits.

## Credits

Every response carries what it cost in `meta.credits_used`; the client also exposes the
`X-Credits-Used` header of the last request:

```typescript
await client.companies.get('zalando.it');
console.log(client.creditsUsed); // 2
```

## Requirements

- Node.js 18+ (uses native `fetch`)
- Zero runtime dependencies

## License

MIT
