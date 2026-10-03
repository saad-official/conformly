import { describe, expect, it } from "vitest";
import { buildCheckContext, guessLocales } from "@/lib/checks/context";
import { pagesInCategory } from "@/lib/checks/shared";
import { extractDocument } from "@/lib/crawl/extract";
import type { CrawlResult } from "@/lib/crawl/types";
import { ctxFrom, doc, NOW } from "./helpers";

const H = "https://laden.example";

describe("buildCheckContext", () => {
  const ok = extractDocument(doc("<h1>Home</h1>", { lang: "de-DE" }), `${H}/`);
  const missing = { ...extractDocument(doc("<h1>Not found</h1>"), `${H}/x`), statusCode: 404 };
  const crawl: CrawlResult = {
    startUrl: `${H}/`,
    hostname: "laden.example",
    pages: [ok, missing],
    robotsBlocked: [],
    errors: [],
    jsRenderedSuspected: true,
    durationMs: 12,
  };

  it("keeps only 2xx pages and passes host, clock and the shell flag through", () => {
    const ctx = buildCheckContext(crawl, NOW);
    expect(ctx.pages.map((p) => p.url)).toEqual([`${H}/`]);
    expect(ctx.hostname).toBe("laden.example");
    expect(ctx.now).toBe(NOW);
    expect(ctx.jsRenderedSuspected).toBe(true);
    expect(ctx.locales).toEqual(["de"]);
  });
});

describe("guessLocales", () => {
  it("orders primary subtags by frequency, then first appearance", () => {
    expect(guessLocales(["fr-FR", "en", "EN-gb", "fr", "de", null], "x.example")).toEqual(["fr", "en", "de"]);
  });

  it("falls back to the country-code TLD", () => {
    expect(guessLocales([null], "shop.at")).toEqual(["de"]);
    expect(guessLocales([], "boutique.fr")).toEqual(["fr"]);
    expect(guessLocales([], "shop.example")).toEqual([]);
  });
});

describe("pagesInCategory", () => {
  it("finds pages by their own URL/title/h1 or by the text of links pointing at them", () => {
    const ctx = ctxFrom({
      [`${H}/`]: doc(`<a href="/pages/info-3/">Widerrufsbelehrung</a><a href="/impressum">Kontakt</a>`, { lang: "de" }),
      [`${H}/pages/info-3`]: doc("<h1>Info</h1>", { lang: "de" }),
      [`${H}/impressum`]: doc("<h1>Kontakt</h1>", { lang: "de" }),
      [`${H}/pages/about`]: doc("<h1>Über uns</h1>", { lang: "de" }),
    });
    expect(pagesInCategory(ctx, "withdrawal").map((p) => p.url)).toEqual([`${H}/pages/info-3`]);
    expect(pagesInCategory(ctx, "imprint").map((p) => p.url)).toEqual([`${H}/impressum`]);
    expect(pagesInCategory(ctx, "accessibility")).toEqual([]);
  });
});
