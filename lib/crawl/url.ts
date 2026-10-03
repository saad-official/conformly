/**
 * URL normalisation and same-site test shared by the crawler and the checks.
 * "Same site" approximates the registrable domain without a public-suffix
 * list: hostnames must be equal once a leading "www." is removed.
 */

/** Absolute http(s) URL without fragment, empty query or trailing slash (root excepted); null otherwise. */
export function normalizeUrl(raw: string, base?: string): string | null {
  let url: URL;
  try {
    url = base === undefined ? new URL(raw) : new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  // Assigning "" drops a dangling "?" (an empty query still serialises as "?").
  if (url.search === "") url.search = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href;
}

function siteKey(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Same site: equal hostnames once a leading "www." is removed. */
export function sameSite(a: string, b: string): boolean {
  const left = siteKey(a);
  return left !== null && left === siteKey(b);
}

