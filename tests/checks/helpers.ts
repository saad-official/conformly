/**
 * Builds a CheckContext from HTML keyed by URL (first entry is the homepage),
 * through the real extractor and context builder.
 */
import { expect } from "vitest";
import { buildCheckContext } from "@/lib/checks/context";
import type { CheckContext, Finding } from "@/lib/checks/types";
import { analyzeDocument } from "@/lib/crawl/extract";
import type { CrawledPage } from "@/lib/crawl/types";

export const NOW = new Date("2026-10-03T12:00:00Z");

export interface CtxOptions {
  now?: Date;
  /** Force the flag; by default it comes from the homepage analysis. */
  jsRenderedSuspected?: boolean;
}

export function ctxFrom(pages: Record<string, string>, options: CtxOptions = {}): CheckContext {
  const entries = Object.entries(pages);
  let homeShell = false;
  const crawled: CrawledPage[] = entries.map(([url, html], i) => {
    const analyzed = analyzeDocument(html, url);
    if (i === 0) homeShell = analyzed.jsRenderedSuspected;
    return i === 0 ? { ...analyzed.page, kind: "home" } : analyzed.page;
  });
  const first = new URL(entries[0][0]);
  return buildCheckContext(
    {
      startUrl: first.href,
      hostname: first.hostname,
      pages: crawled,
      robotsBlocked: [],
      errors: [],
      jsRenderedSuspected: options.jsRenderedSuspected ?? homeShell,
      durationMs: 0,
    },
    options.now ?? NOW,
  );
}

export function doc(body: string, options: { lang?: string | null; title?: string; head?: string } = {}): string {
  const lang = options.lang === undefined ? "en" : options.lang;
  const langAttr = lang === null ? "" : ` lang="${lang}"`;
  return `<!doctype html><html${langAttr}><head><title>${options.title ?? "Shop"}</title>${options.head ?? ""}</head><body>${body}</body></html>`;
}

/** Template markers a merchant would have to fill in. Fix snippets must contain none. */
export const PLACEHOLDER_PATTERN =
  /\[[^\]]*\]|\{\{|\}\}|\{[a-z_]+\}|<insert|\bTODO\b|\bTBD\b|\bXXX+\b|lorem ipsum|\byour[ _-]?(company|name|email|address|shop|store)\b|example\.(com|org|net)\b|\.\.\.|…/i;

export function expectNoPlaceholders(finding: Finding): void {
  for (const part of [finding.fix.summary, finding.fix.html ?? "", finding.fix.shopify ?? ""]) {
    expect(part, `${finding.code} fix contains a placeholder`).not.toMatch(PLACEHOLDER_PATTERN);
  }
}
