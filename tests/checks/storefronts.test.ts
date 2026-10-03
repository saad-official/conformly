/**
 * End to end over the synthetic storefronts: fake fetch -> crawlSite ->
 * buildCheckContext -> runChecks (with a fake claim classifier) -> summarize.
 */
import { describe, expect, it } from "vitest";
import { buildCheckContext, runChecks, type ClaimClassifier } from "@/lib/checks";
import type { CheckCode, Finding, FindingStatus } from "@/lib/checks/types";
import { crawlSite } from "@/lib/crawl/fetcher";
import { summarize } from "@/lib/report/summary";
import {
  boutiqueVerte,
  compliantShop,
  createFakeFetch,
  gruenerLaden,
  spaStore,
  type StorefrontFixture,
} from "../fixtures/storefronts";
import { fakeClassifier } from "./fake-classifier";
import { expectNoPlaceholders, NOW } from "./helpers";

const TIMEOUT_MS = 50;

async function scan(fixture: StorefrontFixture, classifier?: ClaimClassifier) {
  const fake = createFakeFetch(fixture.routes);
  let clock = 0;
  const crawl = await crawlSite(fixture.startUrl, { fetchImpl: fake.fetch, perPageTimeoutMs: TIMEOUT_MS, now: () => (clock += 100) });
  const ctx = buildCheckContext(crawl, NOW);
  const findings = await runChecks(ctx, classifier ? { claimClassifier: classifier } : {});
  const byCode = Object.fromEntries(findings.map((f) => [f.code, f])) as Record<CheckCode, Finding>;
  return { crawl, ctx, fake, findings, byCode };
}

const statuses = (findings: readonly Finding[]) =>
  Object.fromEntries(findings.map((f) => [f.code, f.status])) as Record<CheckCode, FindingStatus>;

function htmlPageCount(fixture: StorefrontFixture): number {
  return Object.entries(fixture.routes).filter(([url, route]) => {
    if (url.endsWith("/robots.txt")) return false;
    const body = typeof route === "string" ? route : route.body;
    return typeof body === "string" && body.includes("<html");
  }).length;
}

describe.each([
  ["compliant-shop", compliantShop],
  ["gruener-laden", gruenerLaden],
  ["boutique-verte", boutiqueVerte],
  ["spa-store", spaStore],
])("fixture %s", (_name, fixture) => {
  it("has 4 to 8 HTML pages", () => {
    const count = htmlPageCount(fixture);
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(8);
  });

  it("produces fix snippets without placeholders", async () => {
    const { findings } = await scan(fixture, fakeClassifier([]));
    for (const finding of findings) expectNoPlaceholders(finding);
  });
});

describe("(a) compliant-shop.example", () => {
  it("crawls the legal pages, account and products; robots blocks cart and checkout; off-site links are ignored", async () => {
    const { crawl, fake } = await scan(compliantShop);
    const A = "https://compliant-shop.example";
    expect(crawl.startUrl).toBe(`${A}/`);
    expect(crawl.pages.map((p) => [p.url.replace(A, ""), p.kind, p.statusCode])).toEqual([
      ["/", "home", 200],
      ["/pages/legal-notice", "legal", 200],
      ["/policies/withdrawal", "legal", 200],
      ["/policies/privacy-policy", "legal", 200],
      ["/pages/accessibility", "legal", 200],
      ["/account", "account", 200],
      ["/products/linen-shirt", "product", 200],
      ["/products/wool-scarf", "product", 200],
    ]);
    expect(crawl.robotsBlocked).toEqual([`${A}/cart`, `${A}/checkout`]);
    expect(crawl.errors).toEqual([]);
    expect(crawl.jsRenderedSuspected).toBe(false);
    expect(crawl.durationMs).toBe(100);
    expect(fake.requests.some((r) => r.url.includes("instagram"))).toBe(false);
  });

  it("raises no issue, even without a classifier", async () => {
    const { findings, byCode } = await scan(compliantShop);
    expect(statuses(findings)).toEqual({
      withdrawal_function: "pass",
      withdrawal_policy: "pass",
      green_claims: "pass",
      accessibility_statement: "pass",
      a11y_sample: "pass",
      ai_disclosure: "pass",
      cookie_parity: "pass",
      legal_notice: "pass",
      eu_targeting: "pass",
    });
    expect(summarize(findings)).toMatchObject({ issues: 0, warnings: 0, unknowns: 0, passes: 9, weightedScore: 0 });
    expect(byCode.green_claims.meta).toMatchObject({ classifier: "missing", candidates: 0 });
  });

  it("quotes the evidence it relied on", async () => {
    const { byCode } = await scan(compliantShop);
    const A = "https://compliant-shop.example";
    expect(byCode.withdrawal_function.evidence).toEqual([{ url: `${A}/account`, quote: "Withdraw from contract here" }]);
    expect(byCode.withdrawal_policy.evidence).toEqual([
      {
        url: `${A}/policies/withdrawal`,
        quote: "You have the right to withdraw from this contract within 14 days without giving any reason.",
      },
    ]);
    expect(byCode.accessibility_statement.evidence).toEqual([
      { url: `${A}/pages/accessibility`, quote: "Compliant Shop aims to conform to WCAG 2.1 level AA (EN 301 549)." },
      { url: `${A}/pages/accessibility`, quote: "accessibility@compliant-shop.example" },
    ]);
    expect(byCode.cookie_parity.evidence).toEqual([
      { url: `${A}/`, quote: "Accept all" },
      { url: `${A}/`, quote: "Reject all" },
    ]);
    expect(byCode.cookie_parity.meta).toEqual({ cmp: "Cookiebot" });
    expect(byCode.legal_notice.evidence).toEqual([
      { url: `${A}/pages/legal-notice`, quote: "Keizersgracht 123 1015 CJ Amsterdam, Netherlands" },
      { url: `${A}/pages/legal-notice`, quote: "info@compliant-shop.example" },
      { url: `${A}/pages/legal-notice`, quote: "Chamber of Commerce (KvK): 12345678" },
    ]);
    expect(byCode.eu_targeting.meta).toEqual({ signals: ["eur_prices", "eu_shipping"] });
    expect(byCode.eu_targeting.evidence).toEqual([
      { url: `${A}/`, quote: "Linen shirt €49.00." },
      { url: `${A}/`, quote: "We ship to all EU countries within 3 working days." },
    ]);
  });
});

describe("(b) gruener-laden.example", () => {
  const B = "https://gruener-laden.example";
  const classifier = () =>
    fakeClassifier([
      { includes: "umweltfreundlich", verdict: "generic_unsubstantiated", rewording: "Zahnbürste mit Griff aus Bambus aus FSC-zertifiziertem Anbau." },
      { includes: "recyceltem", verdict: "specific_substantiated" },
    ]);

  it("records the 404, the redirect chain and the robots block", async () => {
    const { crawl } = await scan(gruenerLaden);
    expect(crawl.pages.map((p) => [p.url.replace(B, ""), p.finalUrl.replace(B, ""), p.kind, p.statusCode])).toEqual([
      ["/", "/", "home", 200],
      ["/impressum", "/impressum", "legal", 200],
      ["/agb", "/rechtliches/agb", "legal", 200],
      ["/datenschutz", "/datenschutz", "legal", 200],
      ["/mein-konto", "/mein-konto", "account", 200],
      ["/produkte/bambus-zahnbuerste", "/produkte/bambus-zahnbuerste", "product", 200],
      ["/produkte/seife-lavendel", "/produkte/seife-lavendel", "product", 200],
      ["/produkte/sonnencreme-bio", "/produkte/sonnencreme-bio", "product", 404],
      ["/warenkorb", "/warenkorb", "cart", 200],
    ]);
    expect(crawl.robotsBlocked).toEqual([`${B}/kasse`]);
    expect(crawl.errors).toEqual([{ url: `${B}/produkte/sonnencreme-bio`, message: "HTTP 404" }]);
  });

  it("matches the expected status matrix", async () => {
    const { findings } = await scan(gruenerLaden, classifier());
    expect(statuses(findings)).toEqual({
      withdrawal_function: "warn",
      withdrawal_policy: "warn",
      green_claims: "fail",
      accessibility_statement: "fail",
      a11y_sample: "fail",
      ai_disclosure: "warn",
      cookie_parity: "warn",
      legal_notice: "pass",
      eu_targeting: "pass",
    });
    expect(summarize(findings)).toEqual({
      issues: 3,
      warnings: 4,
      unknowns: 0,
      passes: 2,
      byStatus: { pass: 2, fail: 3, warn: 4, unknown: 0 },
      weightedScore: 6,
    });
  });

  it("quotes the PDF-only withdrawal links, the claims, the widget and the banner", async () => {
    const { byCode } = await scan(gruenerLaden, classifier());
    const pdfs = [
      { url: `${B}/`, quote: "Widerrufsbelehrung (PDF)" },
      { url: `${B}/`, quote: "Widerrufsformular (PDF)" },
    ];
    expect(byCode.withdrawal_function.evidence).toEqual(pdfs);
    expect(byCode.withdrawal_policy.evidence).toEqual(pdfs);
    expect(byCode.green_claims.evidence).toEqual([
      { url: `${B}/`, quote: "Alle unsere Produkte sind klimaneutral durch Kompensation über zertifizierte Klimaschutzprojekte." },
      { url: `${B}/produkte/bambus-zahnbuerste`, quote: "Ausgezeichnet mit unserem Öko-Siegel „Grüne Wahl“." },
      { url: `${B}/produkte/bambus-zahnbuerste`, quote: "Unsere Zahnbürste ist umweltfreundlich und nachhaltig." },
    ]);
    expect(byCode.green_claims.fix.html).toContain("Zahnbürste mit Griff aus Bambus aus FSC-zertifiziertem Anbau.");
    expect(byCode.ai_disclosure.evidence).toEqual([{ url: `${B}/`, quote: "Tidio chat widget: https://code.tidio.co/gruenerladen123.js" }]);
    expect(byCode.cookie_parity.evidence).toEqual([{ url: `${B}/`, quote: "Alle akzeptieren" }]);
    expect(byCode.cookie_parity.meta).toEqual({ cmp: "Usercentrics" });
    expect(byCode.legal_notice.evidence).toEqual([
      { url: `${B}/impressum`, quote: "Lindenstraße 12 10115 Berlin" },
      { url: `${B}/impressum`, quote: "E-Mail: kontakt@gruener-laden.example" },
      { url: `${B}/impressum`, quote: "Registergericht: Amtsgericht Berlin-Charlottenburg, HRB 123456" },
    ]);
    expect(byCode.a11y_sample.meta).toMatchObject({ missingAlt: 1, unlabelledInputs: 3, missingLang: 0 });
    expect(byCode.withdrawal_function.fix.html).toContain("Vertrag hier widerrufen");
    expect(byCode.legal_notice.fix.html).toContain('href="/impressum"');
  });

  it("still fails green claims on the rules alone without a classifier", async () => {
    const { byCode } = await scan(gruenerLaden);
    expect(byCode.green_claims.status).toBe("fail");
    expect(byCode.green_claims.evidence).toHaveLength(2);
    expect(byCode.green_claims.meta).toMatchObject({ classifier: "missing", candidates: 3, sent: 0 });
  });
});

describe("(c) boutique-verte.example", () => {
  const C = "https://boutique-verte.example";
  const classifier = () =>
    fakeClassifier([
      { includes: "100 % écologiques", verdict: "generic_unsubstantiated", rewording: "Bougies en cire de soja et mèche en coton." },
      { includes: "écoresponsable", verdict: "generic_unsubstantiated" },
    ]);

  it("records the account page timeout and keeps going", async () => {
    const { crawl } = await scan(boutiqueVerte);
    expect(crawl.startUrl).toBe(`${C}/`);
    expect(crawl.pages.map((p) => p.url.replace(C, ""))).toEqual([
      "/",
      "/mentions-legales",
      "/cgv",
      "/confidentialite",
      "/produits/bougie-soja",
      "/produits/savon-lavande",
      "/panier",
    ]);
    expect(crawl.errors).toEqual([{ url: `${C}/mon-compte`, message: `Timed out after ${TIMEOUT_MS} ms` }]);
    expect(crawl.robotsBlocked).toEqual([]);
  });

  it("matches the expected status matrix", async () => {
    const { findings } = await scan(boutiqueVerte, classifier());
    expect(statuses(findings)).toEqual({
      withdrawal_function: "fail",
      withdrawal_policy: "fail",
      green_claims: "fail",
      accessibility_statement: "fail",
      a11y_sample: "fail",
      ai_disclosure: "pass",
      cookie_parity: "pass",
      legal_notice: "warn",
      eu_targeting: "pass",
    });
    expect(summarize(findings)).toMatchObject({ issues: 5, warnings: 1, unknowns: 0, passes: 3, weightedScore: 11 });
  });

  it("quotes the claims, the disclosure, the banner and the EU signals", async () => {
    const { byCode } = await scan(boutiqueVerte, classifier());
    expect(byCode.withdrawal_function.evidence).toEqual([]);
    expect(byCode.green_claims.evidence).toEqual([
      { url: `${C}/`, quote: "Une boutique écoresponsable et durable." },
      { url: `${C}/`, quote: "Nos bougies sont 100 % écologiques." },
    ]);
    expect(byCode.green_claims.fix.html).toContain("<p>Bougies en cire de soja et mèche en coton.</p>");
    expect(byCode.ai_disclosure.evidence).toEqual([
      { url: `${C}/`, quote: "Crisp chat widget: https://client.crisp.chat/l.js" },
      { url: `${C}/`, quote: "Notre assistant virtuel répond à vos questions 24 h/24." },
    ]);
    expect(byCode.cookie_parity.evidence).toEqual([
      { url: `${C}/`, quote: "Tout accepter" },
      { url: `${C}/`, quote: "Continuer sans accepter" },
    ]);
    expect(byCode.cookie_parity.meta).toEqual({ cmp: null });
    expect(byCode.legal_notice.evidence).toEqual([
      { url: `${C}/mentions-legales`, quote: "12 rue des Lilas, 69003 Lyon" },
      { url: `${C}/mentions-legales`, quote: "Contact : bonjour@boutique-verte.example" },
    ]);
    expect(byCode.legal_notice.detail).toMatch(/registration or VAT number/);
    expect(byCode.a11y_sample.evidence).toEqual([{ url: `${C}/panier`, quote: "<html> has no lang attribute" }]);
    expect(byCode.eu_targeting.evidence).toEqual([
      { url: `${C}/`, quote: "Bougie au soja 18,00 €" },
      { url: `${C}/`, quote: "Livraison en Europe sous 5 jours." },
      { url: `${C}/`, quote: 'lang="fr"' },
    ]);
    expect(byCode.withdrawal_function.fix.html).toContain("Se rétracter du contrat ici");
    expect(byCode.legal_notice.fix.html).toContain('<a href="/mentions-legales">Mentions légales</a>');
  });

  it("leaves green claims unknown without a classifier", async () => {
    const { byCode } = await scan(boutiqueVerte);
    expect(byCode.green_claims.status).toBe("unknown");
    expect(byCode.green_claims.meta).toMatchObject({ classifier: "missing", candidates: 4 });
  });
});

describe("(d) spa-store.example", () => {
  it("flags the JavaScript shell and answers unknown everywhere", async () => {
    const { crawl, findings } = await scan(spaStore, fakeClassifier([]));
    expect(crawl.jsRenderedSuspected).toBe(true);
    expect(crawl.pages).toHaveLength(5);
    expect(new Set(findings.map((f) => f.status))).toEqual(new Set(["unknown"]));
    expect(summarize(findings)).toMatchObject({ issues: 0, warnings: 0, unknowns: 9, passes: 0, weightedScore: 0 });
    for (const finding of findings) expect(finding.detail).toMatch(/JavaScript/);
  });

  it("still names the chat widget it saw in the static scripts", async () => {
    const { byCode } = await scan(spaStore);
    expect(byCode.ai_disclosure.meta).toMatchObject({ widgets: ["Intercom"] });
  });
});
