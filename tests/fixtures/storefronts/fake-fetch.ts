/**
 * Offline stand-in for `fetch`: serves fixture HTML by exact URL. Unknown URLs
 * get a 404 page. Routes can redirect, hang until aborted, throw, or delay.
 */
import type { FetchInitLike, FetchLike, FetchResponseLike } from "@/lib/crawl/fetcher";

export interface FakeRoute {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  /** Never settles until the request is aborted. */
  hang?: boolean;
  /** Rejects with this message (a network error). */
  networkError?: string;
  /** Resolves after this many milliseconds. */
  delayMs?: number;
}

/** A string is a 200 text/html page. */
export type FakeRoutes = Readonly<Record<string, string | FakeRoute>>;

export interface FakeRequest {
  url: string;
  userAgent: string | undefined;
}

export interface FakeFetch {
  fetch: FetchLike;
  requests: FakeRequest[];
  /** Requested URLs, excluding robots.txt. */
  pageRequests(): string[];
}

export function redirect(location: string, status = 301): FakeRoute {
  return { status, headers: { location } };
}

function response(route: FakeRoute): FetchResponseLike {
  const headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" };
  for (const [key, value] of Object.entries(route.headers ?? {})) headers[key.toLowerCase()] = value;
  return {
    status: route.status ?? 200,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => route.body ?? "",
  };
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

export function createFakeFetch(routes: FakeRoutes): FakeFetch {
  const requests: FakeRequest[] = [];
  const fetch: FetchLike = (url: string, init: FetchInitLike) => {
    requests.push({ url, userAgent: init.headers["user-agent"] });
    const raw = routes[url];
    const route: FakeRoute =
      raw === undefined ? { status: 404, body: "<html><body><h1>Not found</h1></body></html>" } : typeof raw === "string" ? { body: raw } : raw;

    return new Promise<FetchResponseLike>((resolve, reject) => {
      if (init.signal.aborted) {
        reject(abortError());
        return;
      }
      init.signal.addEventListener("abort", () => reject(abortError()), { once: true });
      if (route.hang) return;
      if (route.networkError) {
        reject(new TypeError(route.networkError));
        return;
      }
      if (route.delayMs) {
        setTimeout(() => resolve(response(route)), route.delayMs);
        return;
      }
      resolve(response(route));
    });
  };
  return {
    fetch,
    requests,
    pageRequests: () => requests.map((r) => r.url).filter((u) => !u.endsWith("/robots.txt")),
  };
}
