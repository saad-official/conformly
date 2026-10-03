/**
 * withdrawal_policy (spec 3.2): a withdrawal policy page that states the
 * 14-day period (Directive 2011/83/EU Art. 6(1)(h) and Art. 9).
 *
 * Policy pages: pages in the "withdrawal" legal category (own URL/title/h1 or
 * inbound link text) plus legal pages with a withdrawal heading (a section of
 * the terms). Periods are read in days (digits or number words) and months
 * (30 days each).
 * pass: a 14-day period is stated, or only periods longer than 14 days.
 * fail: only periods shorter than 14 days; or no policy at all.
 * warn: a policy page without any period, or the policy is only a PDF.
 */
import { compileTerms, normalizeForMatch, splitSentences } from "@/lib/crawl/text";
import { LEGAL_VOCABULARY } from "@/lib/crawl/vocabulary";
import { pathText } from "@/lib/crawl/classify";
import { absenceFinding, firstPerTarget, isDocumentUrl, makeFinding, pagesInCategory, quote, uniqueEvidence } from "./shared";
import type { CheckContext, CheckDefinition, Evidence, Finding, Fix } from "./types";

export const definition: CheckDefinition = {
  code: "withdrawal_policy",
  title: "Withdrawal policy states 14 days",
  severity: "medium",
  citation: {
    law: "Directive 2011/83/EU (Consumer Rights Directive)",
    article: "Art. 6(1)(h) and Art. 9",
    url: "https://eur-lex.europa.eu/eli/dir/2011/83/oj",
  },
};

export const STATUTORY_DAYS = 14;

/** Day units in EN, DE, FR, IT, ES, NL (normalised: no accents, "ß" -> "ss"). */
const DAY_UNIT = "(?:calendar\\s+|working\\s+|kalender)?(?:days?|tage?n?|kalendertage?n?|werktage?n?|jours?|giorni|dias|dagen|kalenderdagen)";
const MONTH_UNIT = "(?:months?|monat(?:e|en)?|mois|mes[ei]?|meses|maand(?:en)?)";
/** Number words that matter here: 14 and 30 in each language, and "one" for months. */
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  fourteen: 14, vierzehn: 14, quatorze: 14, quattordici: 14, catorce: 14, veertien: 14,
  thirty: 30, dreissig: 30, trente: 30, trenta: 30, treinta: 30, dertig: 30,
  one: 1, ein: 1, einen: 1, einem: 1, un: 1, une: 1, uno: 1, una: 1, een: 1,
};
const NUMBER = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join("|")})`;
const DAYS_RE = new RegExp(`(?<![\\p{L}\\p{N}.,])${NUMBER}\\s*${DAY_UNIT}(?![\\p{L}])`, "gu");
const MONTHS_RE = new RegExp(`(?<![\\p{L}\\p{N}.,])${NUMBER}\\s*${MONTH_UNIT}(?![\\p{L}])`, "gu");

const WITHDRAWAL_HEADING = compileTerms(LEGAL_VOCABULARY.withdrawal.text);
const WITHDRAWAL_LINK = compileTerms([...LEGAL_VOCABULARY.withdrawal.text, ...LEGAL_VOCABULARY.withdrawal.slugs]);

function toNumber(token: string): number {
  return /^\d+$/.test(token) ? Number(token) : (NUMBER_WORDS[token] ?? 0);
}

/** Periods in days stated in a sentence. */
export function periodsInDays(sentence: string): number[] {
  const text = normalizeForMatch(sentence);
  const days = [...text.matchAll(DAYS_RE)].map((m) => toNumber(m[1]));
  const months = [...text.matchAll(MONTHS_RE)].map((m) => toNumber(m[1]) * 30);
  return [...days, ...months].filter((n) => n > 0);
}

const FIX: Fix = {
  summary:
    "Publish the withdrawal information as a web page (not only a PDF), linked from the footer, stating the 14-day period, how it is calculated and how to withdraw. The model text is in Annex I(A) of Directive 2011/83/EU in every EU language.",
  html: [
    "<h1>Right of withdrawal</h1>",
    "<p>You have the right to withdraw from this contract within 14 days without giving any reason.</p>",
    "<p>The withdrawal period will expire after 14 days from the day on which you acquire, or a third party other than the carrier and indicated by you acquires, physical possession of the goods.</p>",
    "<p>To exercise the right of withdrawal, use the withdrawal button in your customer account or inform us of your decision to withdraw from this contract by an unequivocal statement.</p>",
    "<p>If you withdraw from this contract, we shall reimburse to you all payments received from you, including the costs of delivery, without undue delay and in any event not later than 14 days from the day on which we are informed about your decision to withdraw.</p>",
  ].join("\n"),
  shopify: "Put this text in Settings > Policies > Return and refund policy, and link that policy in the footer menu.",
};

function policyPages(ctx: CheckContext) {
  const inCategory = pagesInCategory(ctx, "withdrawal");
  const sections = ctx.pages.filter(
    (page) =>
      page.kind === "legal" && !inCategory.includes(page) && page.headings.some((h) => h.level > 1 && WITHDRAWAL_HEADING.test(h.text)),
  );
  return ctx.pages.filter((page) => inCategory.includes(page) || sections.includes(page));
}

export function withdrawalPolicyCheck(ctx: CheckContext): Finding {
  const pages = policyPages(ctx);

  if (pages.length > 0) {
    const stated: Array<{ evidence: Evidence; days: number[] }> = [];
    for (const page of pages) {
      for (const sentence of splitSentences(page.text)) {
        const days = periodsInDays(sentence);
        if (days.length > 0) stated.push({ evidence: quote(page.finalUrl, sentence), days });
      }
    }
    const statutory = stated.find((s) => s.days.includes(STATUTORY_DAYS));
    if (statutory) {
      return makeFinding(definition, {
        status: "pass",
        detail: "The withdrawal policy states the 14-day withdrawal period.",
        evidence: [statutory.evidence],
        fix: FIX,
        meta: { periodDays: STATUTORY_DAYS },
      });
    }
    if (stated.length > 0) {
      const longest = stated.reduce((best, s) => (Math.max(...s.days) > Math.max(...best.days) ? s : best));
      const days = Math.max(...longest.days);
      if (days > STATUTORY_DAYS) {
        return makeFinding(definition, {
          status: "pass",
          detail: `The policy states ${days} days, longer than the statutory 14-day minimum. Make sure it is presented as the right of withdrawal, not only as a goodwill return policy.`,
          evidence: [longest.evidence],
          fix: FIX,
          meta: { periodDays: days },
        });
      }
      return makeFinding(definition, {
        status: "fail",
        detail: `The policy states ${days} days; consumers have at least 14 days to withdraw from a distance contract.`,
        evidence: [longest.evidence],
        fix: FIX,
        meta: { periodDays: days },
      });
    }
    return makeFinding(definition, {
      status: "warn",
      detail: "A withdrawal policy page exists but does not state the withdrawal period.",
      evidence: pages.map((page) => quote(page.finalUrl, page.headings.find((h) => h.level === 1)?.text || page.title)),
      fix: FIX,
    });
  }

  const seen = new Set<string>();
  const pdfs = uniqueEvidence(
    ctx.pages.flatMap((page) =>
      firstPerTarget(seen, page.links)
        .filter((link) => isDocumentUrl(link.abs) && (WITHDRAWAL_LINK.test(link.text) || WITHDRAWAL_LINK.test(pathText(link.abs))))
        .map((link) => quote(page.finalUrl, link.text || link.abs)),
    ),
  );
  if (pdfs.length > 0) {
    return makeFinding(definition, {
      status: "warn",
      detail:
        "The withdrawal policy is only offered as a downloadable document, which Conformly cannot read and which is harder to access on mobile. Publish it as a web page that states the 14-day period.",
      evidence: pdfs,
      fix: FIX,
    });
  }

  return absenceFinding(ctx, definition, {
    status: "fail",
    detail: "No withdrawal policy was found on the crawled pages (footer links, legal pages, terms).",
    fix: FIX,
  });
}
