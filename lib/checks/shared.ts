/**
 * Helpers shared by the check modules: locating legal pages, sentence-level
 * evidence, the JS-shell downgrade and finding construction.
 */
import { classifyLink, legalCategoriesOf } from "@/lib/crawl/classify";
import { excerpt, splitSentences } from "@/lib/crawl/text";
import type { CrawledPage } from "@/lib/crawl/types";
import { normalizeUrl } from "@/lib/crawl/url";
import type { LegalCategory } from "@/lib/crawl/vocabulary";
import type { CheckContext, CheckDefinition, Evidence, Finding, Fix } from "./types";

export const QUOTE_MAX_CHARS = 200;
export const MAX_EVIDENCE = 10;

export const JS_SHELL_NOTE =
  "This storefront renders its content with JavaScript, which Conformly does not execute, so missing evidence is reported as unknown. Check this point manually in a browser.";

/** Pages of a legal category, by their own URL/title/h1 or by the text of links pointing at them; ctx order. */
export function pagesInCategory(ctx: CheckContext, category: LegalCategory): CrawledPage[] {
  const linkedTargets = new Set<string>();
  for (const page of ctx.pages) {
    for (const link of page.links) {
      const target = classifyLink(link.text, link.abs);
      const url = normalizeUrl(link.abs);
      if (url && target?.kind === "legal" && target.category === category) linkedTargets.add(url);
    }
  }
  return ctx.pages.filter((page) => {
    if (linkedTargets.has(normalizeUrl(page.url) ?? page.url) || linkedTargets.has(normalizeUrl(page.finalUrl) ?? page.finalUrl)) {
      return true;
    }
    return [page.url, page.finalUrl].some((url) =>
      legalCategoriesOf({ url, title: page.title, headings: page.headings }).includes(category),
    );
  });
}

export interface LocatedSentence {
  url: string;
  text: string;
}

/** Every sentence of every page, in page order. */
export function sentencesOf(pages: readonly CrawledPage[]): LocatedSentence[] {
  return pages.flatMap((page) => splitSentences(page.text).map((text) => ({ url: page.finalUrl, text })));
}

export function quote(url: string, text: string): Evidence {
  return { url, quote: excerpt(text, QUOTE_MAX_CHARS) };
}

/** Distinct evidence (by url + quote), capped. */
export function uniqueEvidence(items: readonly Evidence[], max = MAX_EVIDENCE): Evidence[] {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const item of items) {
    const key = `${item.url}\u0000${item.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** Footer links repeat on every page: each link target is reported once, from the first page that has it. */
export function firstPerTarget<T extends { abs: string }>(seen: Set<string>, links: readonly T[]): T[] {
  return links.filter((link) => {
    if (seen.has(link.abs)) return false;
    seen.add(link.abs);
    return true;
  });
}

export interface FindingFields {
  status: Finding["status"];
  detail: string;
  evidence?: Evidence[];
  fix: Fix;
  meta?: Record<string, unknown>;
}

export function makeFinding(definition: CheckDefinition, fields: FindingFields): Finding {
  const finding: Finding = {
    code: definition.code,
    status: fields.status,
    severity: definition.severity,
    title: definition.title,
    detail: fields.detail,
    evidence: fields.evidence ?? [],
    citation: definition.citation,
    fix: fields.fix,
  };
  if (fields.meta) finding.meta = fields.meta;
  return finding;
}

/** For verdicts based on the absence of something: on a JS shell, absence proves nothing. */
export function absenceFinding(ctx: CheckContext, definition: CheckDefinition, fields: FindingFields): Finding {
  if (!ctx.jsRenderedSuspected) return makeFinding(definition, fields);
  return makeFinding(definition, {
    ...fields,
    status: "unknown",
    detail: `${JS_SHELL_NOTE} Without JavaScript: ${lowerFirst(fields.detail)}`,
    meta: { ...fields.meta, jsRenderedSuspected: true },
  });
}

function lowerFirst(text: string): string {
  return text.length > 0 ? text[0].toLowerCase() + text.slice(1) : text;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

export const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const OBFUSCATED_EMAIL = /[A-Za-z0-9._%+-]+\s*[[(]\s*at\s*[\])]\s*[A-Za-z0-9-]+(?:\s*(?:\.|[[(]\s*dot\s*[\])])\s*[A-Za-z0-9-]+)+/i;

/** First e-mail address on the page: a mailto link, else an (optionally "[at]"-obfuscated) address in the text. */
export function findEmail(page: CrawledPage): Evidence | null {
  const mailto = page.links.find((l) => l.abs.toLowerCase().startsWith("mailto:") && EMAIL_PATTERN.test(l.abs));
  if (mailto) return quote(page.finalUrl, mailto.text || mailto.abs.slice("mailto:".length));
  for (const sentence of splitSentences(page.text)) {
    if (EMAIL_PATTERN.test(sentence) || OBFUSCATED_EMAIL.test(sentence)) return quote(page.finalUrl, sentence);
  }
  return null;
}

export const SUPPORTED_LOCALES = ["en", "de", "fr", "it", "es", "nl"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** The first guessed locale we have copy for, else English. */
export function pickLocale(ctx: CheckContext): SupportedLocale {
  for (const locale of ctx.locales) {
    const supported = SUPPORTED_LOCALES.find((l) => l === locale);
    if (supported) return supported;
  }
  return "en";
}

const DOCUMENT_EXTENSION = /\.(pdf|docx?|odt|rtf)$/i;

export function isDocumentUrl(url: string): boolean {
  try {
    return DOCUMENT_EXTENSION.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** "19 June 2026", in UTC so results do not depend on the server zone. */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "applies from" before the date, "has applied since" on or after it. */
export function appliesPhrase(now: Date, from: Date): string {
  return now.getTime() < from.getTime() ? `applies from ${formatDate(from)}` : `has applied since ${formatDate(from)}`;
}
