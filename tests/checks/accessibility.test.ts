import { describe, expect, it } from "vitest";
import { a11ySampleCheck } from "@/lib/checks/a11y_sample";
import { accessibilityStatementCheck } from "@/lib/checks/accessibility_statement";
import { ctxFrom, doc, expectNoPlaceholders } from "./helpers";

const H = "https://shop.example";

describe("accessibility_statement", () => {
  const home = doc(`<h1>Shop</h1><a href="/pages/a11y">Accessibility</a>`);

  it("passes with statement language and a complaint e-mail, noting the micro-enterprise exemption", () => {
    const finding = accessibilityStatementCheck(
      ctxFrom({
        [`${H}/`]: home,
        [`${H}/pages/a11y`]: doc(
          "<h1>Accessibility statement</h1><p>This shop is partially compliant with WCAG 2.1 level AA.</p><p>Report barriers to <a href='mailto:access@shop.example'>access@shop.example</a>.</p>",
        ),
      }),
    );
    expect(finding).toMatchObject({ code: "accessibility_statement", status: "pass", severity: "medium" });
    expect(finding.evidence).toEqual([
      { url: `${H}/pages/a11y`, quote: "This shop is partially compliant with WCAG 2.1 level AA." },
      { url: `${H}/pages/a11y`, quote: "access@shop.example" },
    ]);
    expect(finding.detail).toMatch(/micro-enterprise/i);
  });

  it("accepts a contact form as the complaint channel (German statement)", () => {
    const finding = accessibilityStatementCheck(
      ctxFrom({
        [`${H}/`]: doc(`<a href="/barrierefreiheit">Barrierefreiheit</a>`, { lang: "de" }),
        [`${H}/barrierefreiheit`]: doc(
          "<h1>Erklärung zur Barrierefreiheit</h1><p>Wir sind teilweise konform.</p><form action='/kontakt'><label>Nachricht <textarea name='m'></textarea></label></form>",
          { lang: "de" },
        ),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  it("warns when the page lacks statement language or a complaint channel", () => {
    const finding = accessibilityStatementCheck(
      ctxFrom({ [`${H}/`]: home, [`${H}/pages/a11y`]: doc("<h1>Accessibility</h1><p>We care about everyone.</p>") }),
    );
    expect(finding.status).toBe("warn");
    expect(finding.detail).toMatch(/statement wording.*complaint channel|complaint channel.*statement wording/);
  });

  it("fails without a statement and is unknown on a shell", () => {
    expect(accessibilityStatementCheck(ctxFrom({ [`${H}/`]: doc("<h1>Shop</h1>") })).status).toBe("fail");
    expect(accessibilityStatementCheck(ctxFrom({ [`${H}/`]: doc("<div id='root'></div>") })).status).toBe("unknown");
  });

  it("offers a statement with a complaint address on the shop's own domain", () => {
    const finding = accessibilityStatementCheck(ctxFrom({ "https://www.boutique.example/": doc("<h1>Shop</h1>") }));
    expect(finding.fix.html).toContain("mailto:accessibility@boutique.example");
    expectNoPlaceholders(finding);
  });
});

describe("a11y_sample", () => {
  it("passes a clean page", () => {
    const finding = a11ySampleCheck(
      ctxFrom({
        [`${H}/`]: doc(`<h1>Shop</h1><img src="/a.png" alt=""><a href="/cart" aria-label="Cart"><svg></svg></a><label for="q">Search</label><input id="q">`),
      }),
    );
    expect(finding).toMatchObject({ code: "a11y_sample", status: "pass", severity: "low", evidence: [] });
    expect(finding.detail).toMatch(/sample/i);
    expect(finding.detail).toMatch(/not a (full )?WCAG audit/i);
  });

  it("fails on missing lang, missing alt, unlabelled inputs and empty links, with counts", () => {
    const finding = a11ySampleCheck(
      ctxFrom({
        [`${H}/`]: doc(`<h1>Shop</h1><img src="/hero.jpg"><a href="/cart"><svg></svg></a>`, { lang: null }),
        [`${H}/login`]: doc(`<h1>Login</h1><form><input type="email" name="email" placeholder="Email"></form>`),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.meta).toEqual({
      pagesSampled: 2,
      missingLang: 1,
      headingIssues: 0,
      missingAlt: 1,
      unlabelledInputs: 1,
      emptyLinks: 1,
    });
    expect(finding.evidence).toEqual([
      { url: `${H}/`, quote: "<html> has no lang attribute" },
      { url: `${H}/`, quote: `<img src="${H}/hero.jpg"> has no alt attribute` },
      { url: `${H}/`, quote: `Link to ${H}/cart has no text or label` },
      { url: `${H}/login`, quote: 'Input "email" (type email) has no label' },
    ]);
    expect(finding.fix.html).toContain("<html lang=");
    expect(finding.fix.html).toContain("alt=");
    expect(finding.fix.html).toContain("<label for=");
    expect(finding.fix.html).toContain("aria-label=");
    expectNoPlaceholders(finding);
  });

  it("only warns when the h1 count is off", () => {
    const finding = a11ySampleCheck(ctxFrom({ [`${H}/`]: doc(`<h1>A</h1><h1>B</h1>`), [`${H}/x`]: doc("<p>no heading</p>") }));
    expect(finding.status).toBe("warn");
    expect(finding.evidence).toEqual([
      { url: `${H}/`, quote: '2 h1 headings: "A", "B"' },
      { url: `${H}/x`, quote: "No h1 heading" },
    ]);
  });

  it("is unknown on a shell", () => {
    expect(a11ySampleCheck(ctxFrom({ [`${H}/`]: doc("<div id='root'></div>") })).status).toBe("unknown");
  });
});
