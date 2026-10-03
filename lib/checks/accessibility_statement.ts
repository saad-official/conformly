/**
 * accessibility_statement (spec 3.2): the European Accessibility Act requires
 * e-commerce services to publish accessibility information (Annex V) and a way
 * to give feedback or complain.
 *
 * Statement pages: the "accessibility" legal category (URL/title/h1 or inbound
 * link text). pass: statement wording (statement title, WCAG / EN 301 549, a
 * conformance status) and a complaint channel (e-mail or a form with fields).
 * warn: a page exists but one of the two is missing. fail: no page.
 * Micro-enterprises providing services are exempt (Art. 4(5)); Conformly
 * cannot know company size, so the detail always notes the exemption.
 */
import { compileTerms, splitSentences } from "@/lib/crawl/text";
import { absenceFinding, findEmail, makeFinding, pagesInCategory, quote } from "./shared";
import type { CheckContext, CheckDefinition, Evidence, Finding, Fix } from "./types";

export const definition: CheckDefinition = {
  code: "accessibility_statement",
  title: "Accessibility statement and complaint channel",
  severity: "medium",
  citation: {
    law: "Directive (EU) 2019/882 (European Accessibility Act)",
    article: "Art. 13(2) and Annex V",
    url: "https://eur-lex.europa.eu/eli/dir/2019/882/oj",
  },
};

export const MICRO_ENTERPRISE_NOTE =
  "Micro-enterprises (fewer than 10 employees and annual turnover or balance sheet of at most EUR 2 million) that provide services are exempt (EAA Art. 4(5)).";

/** Conformance wording; preferred as evidence over the bare title. */
export const CONFORMANCE_TERMS: readonly string[] = [
  "wcag", "en 301 549", "european accessibility act", "barrierefreiheitsstarkungsgesetz", "bfsg", "rgaa",
  "fully compliant", "partially compliant", "not compliant", "partially conform*", "fully conform*",
  "teilweise konform", "vollstandig konform", "nicht konform",
  "partiellement conforme", "totalement conforme", "non conforme",
  "parzialmente conforme", "pienamente conforme",
  "parcialmente conforme", "totalmente conforme",
  "gedeeltelijk conform*", "volledig conform*",
];
/** Statement titles. */
export const STATEMENT_TITLE_TERMS: readonly string[] = [
  "accessibility statement", "erklarung zur barrierefreiheit", "barrierefreiheitserklarung",
  "declaration d'accessibilite", "dichiarazione di accessibilita", "declaracion de accesibilidad",
  "toegankelijkheidsverklaring",
];
const CONFORMANCE = compileTerms(CONFORMANCE_TERMS);
const STATEMENT_TITLE = compileTerms(STATEMENT_TITLE_TERMS);

function siteDomain(hostname: string): string {
  return hostname.replace(/^www\./, "");
}

function buildFix(ctx: CheckContext): Fix {
  const email = `accessibility@${siteDomain(ctx.hostname)}`;
  return {
    summary:
      "Publish an accessibility statement linked from the footer: describe the shop, how it meets WCAG 2.1 level AA (EN 301 549), known limitations, a feedback and complaint channel, and the national market surveillance authority consumers can turn to.",
    html: [
      '<section id="accessibility-statement">',
      "  <h1>Accessibility statement</h1>",
      "  <p>This shop aims to conform to WCAG 2.1 level AA (EN 301 549), as required by the European Accessibility Act.</p>",
      "  <h2>Feedback and complaints</h2>",
      `  <p>If any part of this shop is not accessible to you, write to <a href="mailto:${email}">${email}</a>.</p>`,
      "</section>",
    ].join("\n"),
    shopify: "Create it under Online Store > Pages, then add the page to the footer menu under Online Store > Navigation.",
  };
}

export function accessibilityStatementCheck(ctx: CheckContext): Finding {
  const fix = buildFix(ctx);
  const pages = pagesInCategory(ctx, "accessibility");
  if (pages.length === 0) {
    return absenceFinding(ctx, definition, {
      status: "fail",
      detail: `No accessibility statement was found on the crawled pages. ${MICRO_ENTERPRISE_NOTE}`,
      fix,
    });
  }

  let statement: Evidence | null = null;
  let channel: Evidence | null = null;
  for (const page of pages) {
    const sentences = splitSentences(page.text);
    const wording = sentences.find((s) => CONFORMANCE.test(s)) ?? sentences.find((s) => STATEMENT_TITLE.test(s));
    if (!statement && wording) statement = quote(page.finalUrl, wording);
    channel ??= findEmail(page);
    if (!channel && page.forms.some((form) => form.inputs.length > 0)) channel = quote(page.finalUrl, "Contact form on the statement page");
  }

  const evidence = [statement, channel].filter((e): e is Evidence => e !== null);
  if (statement && channel) {
    return makeFinding(definition, {
      status: "pass",
      detail: `An accessibility statement with a complaint channel was found. ${MICRO_ENTERPRISE_NOTE}`,
      evidence,
      fix,
    });
  }
  const missing = [statement ? "" : "statement wording (conformance status, WCAG or EN 301 549)", channel ? "" : "a complaint channel (e-mail or form)"]
    .filter(Boolean)
    .join(" and ");
  return makeFinding(definition, {
    status: "warn",
    detail: `An accessibility page exists but lacks ${missing}. ${MICRO_ENTERPRISE_NOTE}`,
    evidence: evidence.length > 0 ? evidence : pages.map((p) => quote(p.finalUrl, p.title || p.url)),
    fix,
  });
}
