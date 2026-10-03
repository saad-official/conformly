import { describe, expect, it } from "vitest";
import { euTargetingCheck } from "@/lib/checks/eu_targeting";
import { legalNoticeCheck } from "@/lib/checks/legal_notice";
import { ctxFrom, doc, expectNoPlaceholders } from "./helpers";

const H = "https://laden.example";

describe("legal_notice", () => {
  const impressum = (body: string) =>
    ctxFrom({
      [`${H}/`]: doc(`<h1>Laden</h1><footer><a href="/impressum">Impressum</a></footer>`, { lang: "de" }),
      [`${H}/impressum`]: doc(`<h1>Impressum</h1>${body}`, { lang: "de" }),
    });

  it("passes with address, e-mail and VAT ID, quoting each", () => {
    const finding = legalNoticeCheck(
      impressum(
        "<p>Grüner Laden GmbH<br>Lindenstraße 12<br>10115 Berlin</p><p>E-Mail: kontakt@laden.example</p><p>USt-IdNr.: DE 123 456 789</p>",
      ),
    );
    expect(finding).toMatchObject({ code: "legal_notice", status: "pass", severity: "high" });
    expect(finding.evidence).toEqual([
      { url: `${H}/impressum`, quote: "Lindenstraße 12 10115 Berlin" },
      { url: `${H}/impressum`, quote: "E-Mail: kontakt@laden.example" },
      { url: `${H}/impressum`, quote: "USt-IdNr.: DE 123 456 789" },
    ]);
    expect(finding.meta).toEqual({ address: true, email: true, registration: true, source: "imprint" });
  });

  it.each([
    ["NL", "<p>Keizersgracht 123, 1015 CJ Amsterdam</p><p>info@shop.example</p><p>KvK 12345678</p>"],
    ["FR", "<p>12 rue de la Paix, 75002 Paris</p><p>contact (at) shop.example</p><p>RCS Paris 123 456 789</p>"],
    ["IT", "<p>Via Roma 5, 00184 Roma</p><p><a href='mailto:info@shop.example'>Scrivici</a></p><p>P.IVA IT12345678901</p>"],
    ["ES", "<p>Calle Mayor 10, 28013 Madrid</p><p>hola@shop.example</p><p>CIF: ESB12345678</p>"],
    ["UK-style street", "<p>Unit 4, 22 Harbour Street, Dublin 2, D02 X285</p><p>hello@shop.example</p><p>VAT IE1234567TA</p>"],
  ])("recognises %s details", (_label, body) => {
    expect(legalNoticeCheck(impressum(body)).status).toBe("pass");
  });

  it("warns and names what is missing", () => {
    const finding = legalNoticeCheck(impressum("<p>Lindenstraße 12, 10115 Berlin</p><p>kontakt@laden.example</p>"));
    expect(finding.status).toBe("warn");
    expect(finding.meta).toMatchObject({ address: true, email: true, registration: false });
    expect(finding.detail).toMatch(/registration or VAT/);
    expect(finding.fix.summary).toMatch(/trade register/);
  });

  it("does not take a copyright year or 'prices include VAT' for details", () => {
    const finding = legalNoticeCheck(impressum("<p>© 2026 Grüner Laden</p><p>Alle Preise inkl. MwSt. Prices include VAT.</p>"));
    expect(finding.status).toBe("fail");
    expect(finding.meta).toMatchObject({ address: false, email: false, registration: false });
  });

  it("falls back to other legal pages when there is no imprint", () => {
    const ctx = ctxFrom({
      [`${H}/`]: doc(`<a href="/terms">Terms</a>`),
      [`${H}/terms`]: doc("<h1>Terms</h1><p>Shop Ltd, 22 Harbour Street, Dublin 2, D02 X285. hello@shop.example. VAT IE1234567TA</p>"),
    });
    expect(legalNoticeCheck(ctx)).toMatchObject({ status: "pass", meta: { source: "other_legal" } });
  });

  it("fails without any legal page and is unknown on a shell", () => {
    expect(legalNoticeCheck(ctxFrom({ [`${H}/`]: doc("<h1>Shop</h1>") })).status).toBe("fail");
    expect(legalNoticeCheck(ctxFrom({ [`${H}/`]: doc("<div id='root'></div>") })).status).toBe("unknown");
  });

  it("offers a footer link in the shop's language without placeholders", () => {
    const finding = legalNoticeCheck(ctxFrom({ [`${H}/`]: doc("<h1>Laden</h1>", { lang: "de" }) }));
    expect(finding.fix.html).toBe('<footer>\n  <a href="/impressum">Impressum</a>\n</footer>');
    expectNoPlaceholders(finding);
  });
});

describe("eu_targeting", () => {
  it("passes with EUR prices, EU shipping and an EU language, listing the signals", () => {
    const finding = euTargetingCheck(
      ctxFrom({ [`${H}/`]: doc("<p>Seife 4,90 €</p><p>Versand innerhalb der EU.</p>", { lang: "de" }) }),
    );
    expect(finding).toMatchObject({ code: "eu_targeting", status: "pass", severity: "low" });
    expect(finding.meta).toEqual({ signals: ["eur_prices", "eu_shipping", "eu_language"] });
    expect(finding.evidence).toEqual([
      { url: `${H}/`, quote: "Seife 4,90 €" },
      { url: `${H}/`, quote: "Versand innerhalb der EU." },
      { url: `${H}/`, quote: 'lang="de"' },
    ]);
  });

  it("reads EUR from meta tags, Europe-wide shipping in French and EU TLDs", () => {
    const meta = euTargetingCheck(
      ctxFrom({ [`${H}/`]: doc("<p>Lamp</p>", { head: '<meta property="og:price:currency" content="EUR">' }) }),
    );
    expect(meta.meta).toEqual({ signals: ["eur_prices"] });
    const fr = euTargetingCheck(ctxFrom({ [`${H}/`]: doc("<p>Livraison en Europe</p>", { lang: "en" }) }));
    expect(fr.meta).toEqual({ signals: ["eu_shipping"] });
    const tld = euTargetingCheck(ctxFrom({ "https://laden.de/": doc("<p>Hello</p>") }));
    expect(tld.meta).toEqual({ signals: ["eu_domain"] });
  });

  it("is unknown without signals (English alone is not one), with a no-op fix", () => {
    const finding = euTargetingCheck(ctxFrom({ [`${H}/`]: doc("<p>Prices in USD. We ship to the US.</p>") }));
    expect(finding.status).toBe("unknown");
    expect(finding.fix.html).toBeUndefined();
    expectNoPlaceholders(finding);
  });
});
