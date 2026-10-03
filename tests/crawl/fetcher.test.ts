import { describe, expect, it } from "vitest";
import {
  crawlSite,
  DEFAULT_USER_AGENT,
  InvalidStartUrlError,
  normalizeStartUrl,
  normalizeUrl,
  sameSite,
  type FetchLike,
} from "@/lib/crawl/fetcher";
import { createFakeFetch, redirect, type FakeRoutes } from "../fixtures/storefronts/fake-fetch";

// Compile-time check: the platform fetch satisfies the injectable signature.
const platformFetch: FetchLike = fetch;
void platformFetch;

const H = "https://shop.example";

const html = (title: string, body: string, lang = "en") =>
  `<!doctype html><html lang="${lang}"><head><title>${title}</title></head><body>${body}</body></html>`;

const HOME_LINKS = `
  <a href="/products/a">A</a><a href="/products/b">B</a><a href="/products/c">C</a>
  <a href="/products/d">D</a><a href="/products/e">E</a>
  <a href="/products/a#reviews">A again</a>
  <a href="/cart">Cart</a><a href="/checkout">Checkout</a>
  <a href="/account">My account</a>
  <a href="/pages/cookies">Cookie policy</a>
  <a href="/pages/accessibility">Accessibility statement</a>
  <a href="/policies/privacy-policy">Privacy policy</a>
  <a href="/policies/terms-of-service">Terms of service</a>
  <a href="/policies/withdrawal">Right of withdrawal</a>
  <a href="/pages/legal-notice">Legal notice</a>
  <a href="/pages/legal-notice-old">Imprint</a>
  <a href="/media/withdrawal-form.pdf">Withdrawal form (PDF)</a>
  <a href="https://social.example/shop">Instagram</a>
  <a href="https://other-shop.example/products/x">Partner product</a>
  <a href="mailto:hi@shop.example">Email</a><a href="tel:+491234">Call</a>
  <a href="#top">Top</a>`;

function siteRoutes(overrides: FakeRoutes = {}): FakeRoutes {
  return {
    [`${H}/robots.txt`]: "User-agent: *\nDisallow: /checkout\n",
    [`${H}/`]: html("Shop", HOME_LINKS),
    [`${H}/products/a`]: html("A", "<h1>A</h1><button>Add to cart</button>"),
    [`${H}/products/b`]: html("B", "<h1>B</h1>"),
    [`${H}/products/c`]: html("C", "<h1>C</h1>"),
    [`${H}/products/d`]: html("D", "<h1>D</h1>"),
    [`${H}/products/e`]: html("E", "<h1>E</h1>"),
    [`${H}/cart`]: html("Cart", "<h1>Your cart</h1>"),
    [`${H}/checkout`]: html("Checkout", "<h1>Checkout</h1>"),
    [`${H}/account`]: html("Account", "<h1>Account</h1>"),
    [`${H}/pages/cookies`]: html("Cookies", "<h1>Cookie policy</h1>"),
    [`${H}/pages/accessibility`]: html("Accessibility", "<h1>Accessibility statement</h1>"),
    [`${H}/policies/privacy-policy`]: html("Privacy", "<h1>Privacy policy</h1>"),
    [`${H}/policies/terms-of-service`]: html("Terms", "<h1>Terms</h1>"),
    [`${H}/policies/withdrawal`]: html("Withdrawal", "<h1>Right of withdrawal</h1>"),
    [`${H}/pages/legal-notice`]: html("Legal notice", "<h1>Legal notice</h1>"),
    ...overrides,
  };
}

let clock = 0;
const now = () => (clock += 5);

function crawl(routes: FakeRoutes, options: Partial<Parameters<typeof crawlSite>[1]> = {}) {
  const fake = createFakeFetch(routes);
  const result = crawlSite("shop.example", { fetchImpl: fake.fetch, now, perPageTimeoutMs: 200, ...options });
  return { fake, result };
}

describe("normalizeStartUrl / normalizeUrl / sameSite", () => {
  it("defaults to https, lower-cases the host and drops the fragment", () => {
    expect(normalizeStartUrl("  Shop.Example ")).toBe("https://shop.example/");
    expect(normalizeStartUrl("http://shop.example/de/?x=1#top")).toBe("http://shop.example/de?x=1");
  });

  it.each(["", "ftp://shop.example", "https://not a host", "javascript:alert(1)", "localhost-without-dot"])(
    "rejects %j",
    (input) => {
      expect(() => normalizeStartUrl(input)).toThrow(InvalidStartUrlError);
    },
  );

  it("normalises candidate URLs and rejects non-web schemes", () => {
    expect(normalizeUrl("HTTPS://Shop.Example:443/Pages/Imprint/?#x")).toBe("https://shop.example/Pages/Imprint");
    expect(normalizeUrl("/a/", `${H}/x`)).toBe(`${H}/a`);
    expect(normalizeUrl("mailto:a@b.c")).toBeNull();
    expect(normalizeUrl("::")).toBeNull();
  });

  it("treats www and the bare host as the same site, nothing else", () => {
    expect(sameSite("https://www.shop.example/a", "http://shop.example/")).toBe(true);
    expect(sameSite("https://checkout.shop.example/", "https://shop.example/")).toBe(false);
    expect(sameSite("https://other.example/", "https://shop.example/")).toBe(false);
  });
});

describe("crawlSite: selection", () => {
  it("fetches robots first, then home, legal pages by category, account, 4 products, cart; skips blocked checkout", async () => {
    const { fake, result } = crawl(siteRoutes());
    const r = await result;
    expect(fake.requests[0].url).toBe(`${H}/robots.txt`);
    expect(r.startUrl).toBe(`${H}/`);
    expect(r.hostname).toBe("shop.example");
    expect(r.pages.map((p) => [p.url.replace(H, ""), p.kind])).toEqual([
      ["/", "home"],
      ["/pages/legal-notice", "legal"],
      ["/policies/withdrawal", "legal"],
      ["/policies/terms-of-service", "legal"],
      ["/policies/privacy-policy", "legal"],
      ["/pages/accessibility", "legal"],
      ["/pages/cookies", "legal"],
      ["/account", "account"],
      ["/products/a", "product"],
      ["/products/b", "product"],
      ["/products/c", "product"],
      ["/products/d", "product"],
    ]);
    expect(r.robotsBlocked).toEqual([`${H}/checkout`]);
    expect(r.errors).toEqual([]);
  });

  it("never requests off-site links, mailto/tel, PDFs, fragments or duplicates", async () => {
    const { fake, result } = crawl(siteRoutes(), { maxPages: 20 });
    await result;
    const requested = fake.pageRequests();
    expect(requested.every((u) => u.startsWith(`${H}/`))).toBe(true);
    expect(requested.some((u) => u.endsWith(".pdf"))).toBe(false);
    expect(new Set(requested).size).toBe(requested.length);
    expect(requested).not.toContain(`${H}/pages/legal-notice-old`);
    expect(requested).not.toContain(`${H}/products/e`);
    expect(requested).toContain(`${H}/cart`);
  });

  it("sends the user agent on every request", async () => {
    const { fake, result } = crawl(siteRoutes(), { userAgent: "TestBot/2.0" });
    await result;
    expect(new Set(fake.requests.map((r) => r.userAgent))).toEqual(new Set(["TestBot/2.0"]));
    expect(DEFAULT_USER_AGENT).toMatch(/^ConformlyBot\//);
  });

  it("never exceeds maxPages", async () => {
    const { fake, result } = crawl(siteRoutes(), { maxPages: 3 });
    const r = await result;
    expect(r.pages).toHaveLength(3);
    expect(fake.pageRequests()).toHaveLength(3);
    expect(r.pages.map((p) => p.url)).toEqual([`${H}/`, `${H}/pages/legal-notice`, `${H}/policies/withdrawal`]);
  });

  it("keeps selection order regardless of response timing", async () => {
    const routes = siteRoutes({
      [`${H}/pages/legal-notice`]: { body: html("Legal notice", "<h1>Legal notice</h1>"), delayMs: 40 },
      [`${H}/products/d`]: { body: html("D", "<h1>D</h1>"), delayMs: 1 },
    });
    const first = await crawl(routes).result;
    const second = await crawl(routes, { concurrency: 1 }).result;
    expect(first.pages.map((p) => p.url)).toEqual(second.pages.map((p) => p.url));
    expect(first.pages[1].url).toBe(`${H}/pages/legal-notice`);
  });

  it("discovers missing slots from links on the pages fetched in the first round", async () => {
    const routes: FakeRoutes = {
      [`${H}/`]: html("Shop", `<a href="/pages/legal-notice">Legal notice</a>`),
      [`${H}/pages/legal-notice`]: html("Legal", `<h1>Legal notice</h1><a href="/mein-konto">Mein Konto</a><a href="/">Home</a>`),
      [`${H}/mein-konto`]: html("Konto", "<h1>Konto</h1>"),
    };
    const r = await crawl(routes).result;
    expect(r.pages.map((p) => p.url)).toEqual([`${H}/`, `${H}/pages/legal-notice`, `${H}/mein-konto`]);
    expect(r.pages[2].kind).toBe("account");
  });

  it("uses the slot kind for pages whose own content is unrecognisable", async () => {
    const routes: FakeRoutes = {
      [`${H}/`]: html("Shop", `<a href="/pages/info-3">Widerrufsbelehrung</a>`, "de"),
      [`${H}/pages/info-3`]: html("Info", "<h1>Info</h1>", "de"),
    };
    const r = await crawl(routes).result;
    expect(r.pages[1].kind).toBe("legal");
  });
});

describe("crawlSite: robots.txt", () => {
  it("records a disallowed homepage and fetches nothing else", async () => {
    const { fake, result } = crawl({ [`${H}/robots.txt`]: "User-agent: *\nDisallow: /\n", [`${H}/`]: html("Shop", "") });
    const r = await result;
    expect(r.pages).toEqual([]);
    expect(r.robotsBlocked).toEqual([`${H}/`]);
    expect(fake.pageRequests()).toEqual([]);
  });

  it("honours a group addressed to ConformlyBot", async () => {
    const routes = siteRoutes({
      [`${H}/robots.txt`]: "User-agent: ConformlyBot\nDisallow: /account\n\nUser-agent: *\nDisallow: /\n",
    });
    const r = await crawl(routes, { maxPages: 20 }).result;
    expect(r.robotsBlocked).toEqual([`${H}/account`]);
    expect(r.pages.map((p) => p.url)).toContain(`${H}/checkout`);
  });

  it("allows everything when robots.txt is missing", async () => {
    const routes = siteRoutes();
    const { [`${H}/robots.txt`]: _omitted, ...withoutRobots } = routes;
    void _omitted;
    const r = await crawl(withoutRobots, { maxPages: 20 }).result;
    expect(r.robotsBlocked).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.pages.map((p) => p.url)).toContain(`${H}/checkout`);
  });

  it("allows everything but records an error when robots.txt is unreachable", async () => {
    const r = await crawl(siteRoutes({ [`${H}/robots.txt`]: { status: 503 } })).result;
    expect(r.errors).toEqual([{ url: `${H}/robots.txt`, message: "robots.txt unavailable (HTTP 503); crawled without restrictions" }]);
    expect(r.robotsBlocked).toEqual([]);
  });
});

describe("crawlSite: failures", () => {
  it("keeps a 404 page with its status and records an error", async () => {
    const routes = siteRoutes();
    delete (routes as Record<string, unknown>)[`${H}/policies/withdrawal`];
    const r = await crawl(routes).result;
    const page = r.pages.find((p) => p.url === `${H}/policies/withdrawal`);
    expect(page?.statusCode).toBe(404);
    expect(r.errors).toEqual([{ url: `${H}/policies/withdrawal`, message: "HTTP 404" }]);
  });

  it("times out a hanging page without blocking the rest", async () => {
    const r = await crawl(siteRoutes({ [`${H}/account`]: { hang: true } }), { perPageTimeoutMs: 30 }).result;
    expect(r.errors).toEqual([{ url: `${H}/account`, message: "Timed out after 30 ms" }]);
    expect(r.pages.map((p) => p.url)).not.toContain(`${H}/account`);
    expect(r.pages).toHaveLength(11);
  });

  it("records network errors", async () => {
    const r = await crawl(siteRoutes({ [`${H}/account`]: { networkError: "getaddrinfo ENOTFOUND" } })).result;
    expect(r.errors).toEqual([{ url: `${H}/account`, message: "getaddrinfo ENOTFOUND" }]);
  });

  it("skips responses that are not HTML", async () => {
    const r = await crawl(
      siteRoutes({ [`${H}/pages/cookies`]: { body: "%PDF-1.7", headers: { "content-type": "application/pdf" } } }),
    ).result;
    expect(r.errors).toEqual([{ url: `${H}/pages/cookies`, message: "Not an HTML page (application/pdf)" }]);
    expect(r.pages.map((p) => p.url)).not.toContain(`${H}/pages/cookies`);
  });

  it("returns no pages and the error when the homepage fails", async () => {
    const r = await crawl({ [`${H}/`]: { networkError: "connect ECONNREFUSED" } }).result;
    expect(r.pages).toEqual([]);
    expect(r.errors).toEqual([{ url: `${H}/`, message: "connect ECONNREFUSED" }]);
    expect(r.hostname).toBe("shop.example");
  });
});

describe("crawlSite: redirects", () => {
  it("follows a chain of up to three redirects and records the final URL", async () => {
    const routes = siteRoutes({
      [`${H}/policies/terms-of-service`]: redirect("/policies/terms-of-service/"),
      [`${H}/policies/terms-of-service/`]: redirect(`${H}/rechtliches/agb`, 302),
      [`${H}/rechtliches/agb`]: redirect("https://www.shop.example/rechtliches/agb", 308),
      ["https://www.shop.example/rechtliches/agb"]: html("AGB", "<h1>Allgemeine Geschäftsbedingungen</h1>", "de"),
    });
    const r = await crawl(routes).result;
    const page = r.pages.find((p) => p.url === `${H}/policies/terms-of-service`);
    expect(page).toMatchObject({ finalUrl: "https://www.shop.example/rechtliches/agb", statusCode: 200, kind: "legal" });
    expect(r.errors).toEqual([]);
  });

  it("gives up after more than three redirects", async () => {
    const routes = siteRoutes({
      [`${H}/account`]: redirect("/r1"),
      [`${H}/r1`]: redirect("/r2"),
      [`${H}/r2`]: redirect("/r3"),
      [`${H}/r3`]: redirect("/r4"),
      [`${H}/r4`]: html("Account", "<h1>Account</h1>"),
    });
    const r = await crawl(routes).result;
    expect(r.errors).toEqual([{ url: `${H}/account`, message: "Too many redirects (more than 3)" }]);
  });

  it("refuses to follow a non-home page off-site", async () => {
    const r = await crawl(siteRoutes({ [`${H}/account`]: redirect("https://accounts.other.example/login") })).result;
    expect(r.errors).toEqual([{ url: `${H}/account`, message: "Redirected off-site to https://accounts.other.example/login" }]);
  });

  it("follows the homepage to a new host and crawls that host", async () => {
    const W = "https://www.shop.example";
    const routes: FakeRoutes = {
      [`${H}/`]: redirect(`${W}/`),
      [`${W}/robots.txt`]: "User-agent: *\nDisallow: /account\n",
      [`${W}/`]: html("Shop", `<a href="/account">My account</a><a href="${H}/impressum">Impressum</a>`),
      [`${W}/impressum`]: html("Impressum", "<h1>Impressum</h1>"),
      [`${H}/impressum`]: redirect(`${W}/impressum`),
    };
    const r = await crawl(routes).result;
    expect(r.hostname).toBe("www.shop.example");
    expect(r.pages.map((p) => [p.url, p.finalUrl])).toEqual([
      [`${H}/`, `${W}/`],
      [`${H}/impressum`, `${W}/impressum`],
    ]);
    expect(r.robotsBlocked).toEqual([`${W}/account`]);
  });

  it("checks robots.txt on every redirect hop", async () => {
    const routes = siteRoutes({ [`${H}/account`]: redirect("/checkout/login") });
    const r = await crawl(routes).result;
    expect(r.robotsBlocked).toEqual([`${H}/checkout`, `${H}/checkout/login`]);
    expect(r.pages.map((p) => p.url)).not.toContain(`${H}/account`);
  });
});

describe("crawlSite: shell detection and timing", () => {
  it("reports a client-rendered homepage", async () => {
    const shell = `<html lang="en"><body><div id="root"></div>${'<script src="/c.js"></script>'.repeat(7)}</body></html>`;
    const r = await crawl({ [`${H}/`]: shell }).result;
    expect(r.jsRenderedSuspected).toBe(true);
  });

  it("measures duration with the injected clock", async () => {
    let t = 1000;
    const r = await crawl({ [`${H}/`]: html("Shop", "") }, { now: () => (t += 250) }).result;
    expect(r.durationMs).toBe(250);
    expect(r.jsRenderedSuspected).toBe(false);
  });

  it("rejects an invalid start URL", async () => {
    const fake = createFakeFetch({});
    await expect(crawlSite("ftp://shop.example", { fetchImpl: fake.fetch })).rejects.toThrow(InvalidStartUrlError);
    expect(fake.requests).toEqual([]);
  });
});
