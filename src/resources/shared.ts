export type QueryValue = string | number | boolean | Date | number[] | undefined | null;

export type RequestFn = (
  path: string,
  params?: Record<string, QueryValue>
) => Promise<unknown>;

/**
 * Path segment for a company domain. URLs (`https://www.example.com/page`,
 * `https://www.trustpilot.com/review/example.com`) are reduced to the domain here,
 * because a slash cannot travel inside a path segment.
 */
export function domainPath(domain: string): string {
  let value = domain.trim();
  if (value.includes("://")) {
    const url = new URL(value);
    value =
      url.hostname.endsWith("trustpilot.com") && url.pathname.startsWith("/review/")
        ? url.pathname.slice("/review/".length)
        : url.hostname;
  }
  value = value.split("/")[0].split("?")[0].split("#")[0];
  if (!value) throw new TypeError(`'${domain}' is not a valid domain`);
  return encodeURIComponent(value);
}

/** Percent-encode a single path segment (category ids). */
export function segment(value: string): string {
  return encodeURIComponent(value.trim());
}
