/**
 * Storefront crawler (spec 3.1): server-side fetch, no JavaScript, robots.txt
 * honoured, per-page timeout, page cap, deterministic output.
 *
 * Flow: normalise the start URL -> robots.txt for its origin -> homepage ->
 * candidate links from the homepage, then (for slots still empty) from the
 * pages fetched in round one. Slots, in fetch and output order: one legal page
 * per category (LEGAL_CATEGORIES order), the account link, up to 4 products,
 * cart, checkout. Each slot takes the first qualifying link in document order.
 *
 * Decisions:
 * - "Same registrable host" is approximated without a public-suffix list:
 *   hostnames must be equal once a leading "www." is removed.
 * - The homepage may redirect to another host; the crawl then continues on
 *   that host. Other pages may not redirect off-site.
 * - robots.txt is fetched per origin (lazily, cached). 4xx means no
 *   restrictions; 5xx, timeouts and network errors also mean no restrictions
 *   but are recorded as errors. Every redirect hop is checked.
 * - maxPages counts page fetch attempts (homepage included, robots.txt not).
 *   Robots-blocked candidates are recorded and never fetched or counted.
 * - Non-2xx pages are kept in `pages` with their status (and listed in
 *   `errors`); non-HTML responses, timeouts and network errors are not.
 */
import robotsParser from "robots-parser";
import { classifyLink, type LinkTarget } from "./classify";
import { analyzeDocument } from "./extract";
import type { CrawlError, CrawledPage, CrawlResult, PageKind } from "./types";
import { normalizeUrl, sameSite } from "./url";
import { LEGAL_CATEGORIES, NON_HTML_EXTENSIONS, type LegalCategory } from "./vocabulary";

export { normalizeUrl, sameSite } from "./url";

export interface FetchResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface FetchInitLike {
  method: "GET";
  headers: Record<string, string>;
  redirect: "manual";
  signal: AbortSignal;
}

/** The subset of `fetch` the crawler needs; the platform `fetch` satisfies it. */
export type FetchLike = (url: string, init: FetchInitLike) => Promise<FetchResponseLike>;

export interface CrawlOptions {
  fetchImpl: FetchLike;
  maxPages?: number;
  perPageTimeoutMs?: number;
  userAgent?: string;
  /** Clock in milliseconds, used only for `durationMs`. */
  now?: () => number;
  /** Parallel page fetches; output order does not depend on it. */
  concurrency?: number;
}

export const DEFAULT_USER_AGENT = "ConformlyBot/1.0 (+https://github.com/saad-official/vibe-build-series)";
export const DEFAULT_MAX_PAGES = 12;
export const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 3;
export const MAX_PRODUCTS = 4;
const DEFAULT_CONCURRENCY = 4;
const MAX_BODY_CHARS = 3_000_000;
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const NON_HTML: ReadonlySet<string> = new Set(NON_HTML_EXTENSIONS);

export class InvalidStartUrlError extends Error {
  constructor(input: string) {
    super(`Not a valid storefront URL: ${JSON.stringify(input)}`);
    this.name = "InvalidStartUrlError";
  }
}

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`);
    this.name = "TimeoutError";
  }
}

/* ------------------------------------------------------------------ */
/* URLs                                                                */
/* ------------------------------------------------------------------ */

/** Trims, defaults to https, requires an http(s) URL with a dotted host. */
export function normalizeStartUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidStartUrlError(input);
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const normalized = normalizeUrl(withScheme);
  if (!normalized || !new URL(normalized).hostname.includes(".")) throw new InvalidStartUrlError(input);
  return normalized;
}

function hasNonHtmlExtension(url: string): boolean {
  const match = /\.([a-z0-9]{2,5})$/i.exec(new URL(url).pathname);
  return match !== null && NON_HTML.has(match[1].toLowerCase());
}

/* ------------------------------------------------------------------ */
/* Fetching                                                            */
/* ------------------------------------------------------------------ */

interface Session {
  fetchImpl: FetchLike;
  userAgent: string;
  timeoutMs: number;
  robots: Map<string, Promise<RobotsRules>>;
  errors: CrawlError[];
}

interface RobotsRules {
  isAllowed(url: string): boolean;
}

const ALLOW_ALL: RobotsRules = { isAllowed: () => true };

type HopResult =
  | { type: "response"; status: number; finalUrl: string; contentType: string; body: string }
  | { type: "blocked"; url: string }
  | { type: "error"; message: string };

interface HopOptions {
  /** Check robots.txt for each hop (false for robots.txt itself). */
  robots: boolean;
  /** Allow redirects to another site (the homepage only). */
  allowOffSite: boolean;
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(ms));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Network error";
}

/** GET with manual redirects (max MAX_REDIRECTS), one timeout for the whole chain including the body. */
async function fetchFollowing(session: Session, startUrl: string, options: HopOptions): Promise<HopResult> {
  try {
    return await withTimeout(session.timeoutMs, async (signal) => {
      let url = startUrl;
      for (let redirects = 0; ; redirects++) {
        if (options.robots && !(await robotsFor(session, url)).isAllowed(url)) {
          return { type: "blocked", url: normalizeUrl(url) ?? url };
        }
        const response = await session.fetchImpl(url, {
          method: "GET",
          headers: {
            "user-agent": session.userAgent,
            accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          },
          redirect: "manual",
          signal,
        });
        const location = response.headers.get("location");
        if (REDIRECT_STATUSES.has(response.status) && location) {
          if (redirects >= MAX_REDIRECTS) return { type: "error", message: `Too many redirects (more than ${MAX_REDIRECTS})` };
          const next = new URL(location, url);
          next.hash = "";
          if (next.protocol !== "http:" && next.protocol !== "https:") {
            return { type: "error", message: `Redirected to unsupported URL ${next.href}` };
          }
          if (!options.allowOffSite && !sameSite(next.href, startUrl)) {
            return { type: "error", message: `Redirected off-site to ${next.href}` };
          }
          url = next.href;
          continue;
        }
        const body = (await response.text()).slice(0, MAX_BODY_CHARS);
        return {
          type: "response",
          status: response.status,
          finalUrl: url,
          contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
          body,
        };
      }
    });
  } catch (error) {
    return { type: "error", message: errorMessage(error) };
  }
}

function robotsFor(session: Session, url: string): Promise<RobotsRules> {
  const origin = new URL(url).origin;
  let rules = session.robots.get(origin);
  if (!rules) {
    rules = loadRobots(session, origin);
    session.robots.set(origin, rules);
  }
  return rules;
}

async function loadRobots(session: Session, origin: string): Promise<RobotsRules> {
  const robotsUrl = `${origin}/robots.txt`;
  // Own timeout: robots.txt must not eat the budget of the page that triggered it.
  const result = await fetchFollowing(session, robotsUrl, { robots: false, allowOffSite: true });
  const unavailable = (reason: string): RobotsRules => {
    session.errors.push({ url: robotsUrl, message: `robots.txt unavailable (${reason}); crawled without restrictions` });
    return ALLOW_ALL;
  };
  if (result.type === "error") return unavailable(result.message);
  if (result.type === "blocked") return ALLOW_ALL;
  if (result.status >= 500) return unavailable(`HTTP ${result.status}`);
  if (result.status < 200 || result.status >= 300) return ALLOW_ALL;
  const parsed = robotsParser(robotsUrl, result.body);
  return { isAllowed: (target) => parsed.isAllowed(target, session.userAgent) !== false };
}

function isHtml(contentType: string): boolean {
  return contentType === "" || contentType.includes("text/html") || contentType.includes("application/xhtml");
}

interface PageOutcome {
  page: CrawledPage | null;
  jsRenderedSuspected: boolean;
  blocked: string | null;
  error: CrawlError | null;
}

async function fetchPage(session: Session, url: string, slotKind: PageKind, allowOffSite: boolean): Promise<PageOutcome> {
  const empty: PageOutcome = { page: null, jsRenderedSuspected: false, blocked: null, error: null };
  const result = await fetchFollowing(session, url, { robots: true, allowOffSite });
  if (result.type === "blocked") return { ...empty, blocked: result.url };
  if (result.type === "error") return { ...empty, error: { url, message: result.message } };
  if (!isHtml(result.contentType)) {
    return { ...empty, error: { url, message: `Not an HTML page (${result.contentType.split(";")[0].trim()})` } };
  }
  const analyzed = analyzeDocument(result.body, result.finalUrl);
  const extractedKind = analyzed.page.kind;
  const kind: PageKind = slotKind === "home" ? "home" : extractedKind === "other" ? slotKind : extractedKind;
  const page: CrawledPage = { ...analyzed.page, url, finalUrl: result.finalUrl, statusCode: result.status, kind };
  const ok = result.status >= 200 && result.status < 300;
  return {
    page,
    jsRenderedSuspected: analyzed.jsRenderedSuspected,
    blocked: null,
    error: ok ? null : { url, message: `HTTP ${result.status}` },
  };
}

async function mapInOrder<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/* ------------------------------------------------------------------ */
/* Candidate selection                                                 */
/* ------------------------------------------------------------------ */

interface Candidate {
  url: string;
  kind: PageKind;
}

class SlotBook {
  private readonly legal = new Map<LegalCategory, string>();
  private account: string | null = null;
  private readonly products: string[] = [];
  private cart: string | null = null;
  private checkout: string | null = null;
  private readonly drained = new Set<string>();

  constructor(private readonly seen: Set<string>) {}

  offer(url: string, target: LinkTarget): void {
    if (this.seen.has(url)) return;
    if (target.kind === "legal") {
      if (this.legal.has(target.category)) return;
      this.legal.set(target.category, url);
    } else if (target.kind === "account") {
      if (this.account) return;
      this.account = url;
    } else if (target.kind === "product") {
      if (this.products.length >= MAX_PRODUCTS) return;
      this.products.push(url);
    } else if (target.kind === "cart") {
      if (this.cart) return;
      this.cart = url;
    } else {
      if (this.checkout) return;
      this.checkout = url;
    }
    this.seen.add(url);
  }

  /** Slots filled since the last drain, in priority order. */
  drain(): Candidate[] {
    const out: Candidate[] = [];
    for (const category of LEGAL_CATEGORIES) {
      const url = this.legal.get(category);
      if (url) out.push({ url, kind: "legal" });
    }
    if (this.account) out.push({ url: this.account, kind: "account" });
    for (const url of this.products) out.push({ url, kind: "product" });
    if (this.cart) out.push({ url: this.cart, kind: "cart" });
    if (this.checkout) out.push({ url: this.checkout, kind: "checkout" });
    const fresh = out.filter((c) => !this.drained.has(c.url));
    for (const c of fresh) this.drained.add(c.url);
    return fresh;
  }
}

function offerLinks(book: SlotBook, page: CrawledPage, siteUrl: string): void {
  for (const link of page.links) {
    const url = normalizeUrl(link.abs);
    if (!url || !sameSite(url, siteUrl) || hasNonHtmlExtension(url)) continue;
    const target = classifyLink(link.text, url);
    if (target) book.offer(url, target);
  }
}

/* ------------------------------------------------------------------ */
/* Crawl                                                               */
/* ------------------------------------------------------------------ */

export async function crawlSite(startUrl: string, options: CrawlOptions): Promise<CrawlResult> {
  const now = options.now ?? Date.now;
  const started = now();
  const start = normalizeStartUrl(startUrl);
  const maxPages = Math.max(1, Math.floor(options.maxPages ?? DEFAULT_MAX_PAGES));
  const session: Session = {
    fetchImpl: options.fetchImpl,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    timeoutMs: options.perPageTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    robots: new Map(),
    errors: [],
  };
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const pages: CrawledPage[] = [];
  const robotsBlocked: string[] = [];
  const pageErrors: CrawlError[] = [];

  const record = (outcome: PageOutcome) => {
    if (outcome.page) pages.push(outcome.page);
    if (outcome.blocked) robotsBlocked.push(outcome.blocked);
    if (outcome.error) pageErrors.push(outcome.error);
  };

  const home = await fetchPage(session, start, "home", true);
  record(home);
  const homePage = home.page;
  const siteUrl = homePage?.finalUrl ?? start;
  let budget = maxPages - 1;

  if (homePage && budget > 0) {
    const seen = new Set<string>([start, normalizeUrl(homePage.finalUrl) ?? start]);
    const book = new SlotBook(seen);

    const runRound = async (sources: readonly CrawledPage[]): Promise<CrawledPage[]> => {
      for (const source of sources) offerLinks(book, source, siteUrl);
      const allowed: Candidate[] = [];
      for (const candidate of book.drain()) {
        if ((await robotsFor(session, candidate.url)).isAllowed(candidate.url)) allowed.push(candidate);
        else robotsBlocked.push(candidate.url);
      }
      const batch = allowed.slice(0, Math.max(0, budget));
      budget -= batch.length;
      const outcomes = await mapInOrder(batch, concurrency, (c) => fetchPage(session, c.url, c.kind, false));
      outcomes.forEach(record);
      return outcomes
        .map((o) => o.page)
        .filter((p): p is CrawledPage => p !== null && p.statusCode >= 200 && p.statusCode < 300);
    };

    const firstRound = await runRound([homePage]);
    if (budget > 0) await runRound(firstRound);
  }

  return {
    startUrl: start,
    hostname: new URL(siteUrl).hostname,
    pages,
    robotsBlocked,
    errors: [...session.errors, ...pageErrors],
    jsRenderedSuspected: home.jsRenderedSuspected,
    durationMs: now() - started,
  };
}
