/**
 * a11y_sample (spec 3.2): a handful of automated checks on the crawled pages.
 * A sample, not a WCAG audit (that needs a browser and a human).
 *
 * fail: any definite WCAG 2.1 failure in the sample: <html> without lang
 *       (3.1.1), <img> without alt attribute (1.1.1; alt="" is fine), form
 *       fields without a label (1.3.1/4.1.2), links without text or label (2.4.4).
 * warn: only heading issues (no h1 or more than one h1: best practice).
 * pass: none found. unknown: JavaScript shell or no pages.
 */
import { absenceFinding, makeFinding, pickLocale, quote, uniqueEvidence } from "./shared";
import type { CheckContext, CheckDefinition, Evidence, Finding, Fix } from "./types";

export const definition: CheckDefinition = {
  code: "a11y_sample",
  title: "Accessibility sample checks",
  severity: "low",
  citation: {
    law: "Directive (EU) 2019/882 (European Accessibility Act), via EN 301 549 / WCAG 2.1 level AA",
    article: "Annex I",
    url: "https://www.w3.org/TR/WCAG21/",
  },
};

const MAX_A11Y_EVIDENCE = 12;
const SAMPLE_NOTE = "This is a sample of automated checks, not a WCAG audit.";

interface Counts {
  pagesSampled: number;
  missingLang: number;
  headingIssues: number;
  missingAlt: number;
  unlabelledInputs: number;
  emptyLinks: number;
}

function buildFix(counts: Counts, lang: string): Fix {
  const lines: string[] = [];
  if (counts.missingLang > 0) lines.push(`<html lang="${lang}">`);
  if (counts.headingIssues > 0) lines.push("<h1>Linen shirt, short sleeves</h1>");
  if (counts.missingAlt > 0) lines.push('<img src="/media/linen-shirt-blue.jpg" alt="Blue linen shirt with short sleeves">');
  if (counts.emptyLinks > 0) {
    lines.push('<a href="/cart" aria-label="Cart"><svg aria-hidden="true" focusable="false" width="24" height="24"></svg></a>');
  }
  if (counts.unlabelledInputs > 0) {
    lines.push('<label for="newsletter-email">Email address</label>', '<input id="newsletter-email" name="email" type="email" autocomplete="email">');
  }
  if (lines.length === 0) {
    return { summary: "Nothing to fix in this sample. Have the shop audited against WCAG 2.1 level AA to cover the rest." };
  }
  return {
    summary:
      "Set the page language, give every image a text alternative (alt=\"\" for decorative ones), label every form field, give icon links an accessible name and use one h1 per page.",
    html: lines.join("\n"),
    shopify:
      "Add image alt text under Products > Media; theme fields and icons are fixed in the theme code (Online Store > Themes > Edit code).",
  };
}

export function a11ySampleCheck(ctx: CheckContext): Finding {
  const counts: Counts = {
    pagesSampled: ctx.pages.length,
    missingLang: 0,
    headingIssues: 0,
    missingAlt: 0,
    unlabelledInputs: 0,
    emptyLinks: 0,
  };
  const headingEvidence: Evidence[] = [];
  const all: Evidence[] = [];

  for (const page of ctx.pages) {
    const url = page.finalUrl;
    if (!page.lang) {
      counts.missingLang += 1;
      all.push(quote(url, "<html> has no lang attribute"));
    }
    const h1s = page.headings.filter((h) => h.level === 1);
    if (h1s.length !== 1) {
      counts.headingIssues += 1;
      const e = quote(url, h1s.length === 0 ? "No h1 heading" : `${h1s.length} h1 headings: ${h1s.map((h) => `"${h.text}"`).join(", ")}`);
      headingEvidence.push(e);
      all.push(e);
    }
    for (const image of page.images.filter((img) => img.alt === null)) {
      counts.missingAlt += 1;
      all.push(quote(url, `<img src="${image.src}"> has no alt attribute`));
    }
    for (const link of page.links.filter((l) => l.text.trim() === "")) {
      counts.emptyLinks += 1;
      all.push(quote(url, `Link to ${link.abs || link.href} has no text or label`));
    }
    for (const input of page.forms.flatMap((f) => f.inputs).filter((i) => !i.labelled)) {
      counts.unlabelledInputs += 1;
      all.push(quote(url, `Input "${input.name || input.id || input.type}" (type ${input.type}) has no label`));
    }
  }

  const fix = buildFix(counts, ctx.locales[0] ?? pickLocale(ctx));
  const failCount = counts.missingLang + counts.missingAlt + counts.unlabelledInputs + counts.emptyLinks;

  if (ctx.pages.length === 0 || ctx.jsRenderedSuspected) {
    return absenceFinding(ctx, definition, {
      status: "unknown",
      detail: `No server-rendered pages to sample. ${SAMPLE_NOTE}`,
      fix,
      meta: { ...counts },
    });
  }
  if (failCount > 0) {
    return makeFinding(definition, {
      status: "fail",
      detail: `Found ${failCount} accessibility failure(s) across ${counts.pagesSampled} page(s): ${counts.missingLang} without a page language, ${counts.missingAlt} image(s) without alt, ${counts.unlabelledInputs} unlabelled field(s), ${counts.emptyLinks} link(s) without a name. ${SAMPLE_NOTE}`,
      evidence: uniqueEvidence(all, MAX_A11Y_EVIDENCE),
      fix,
      meta: { ...counts },
    });
  }
  if (counts.headingIssues > 0) {
    return makeFinding(definition, {
      status: "warn",
      detail: `${counts.headingIssues} page(s) do not have exactly one h1 heading, which makes the structure harder to follow with a screen reader. ${SAMPLE_NOTE}`,
      evidence: uniqueEvidence(headingEvidence, MAX_A11Y_EVIDENCE),
      fix,
      meta: { ...counts },
    });
  }
  return makeFinding(definition, {
    status: "pass",
    detail: `No issues in the sampled checks on ${counts.pagesSampled} page(s). ${SAMPLE_NOTE}`,
    fix,
    meta: { ...counts },
  });
}
