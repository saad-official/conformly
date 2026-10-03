/**
 * CrawlResult -> CheckContext. Only 2xx pages reach the checks; locale guesses
 * come from <html lang> (primary subtag, most frequent first, ties by first
 * appearance) and fall back to the country-code TLD.
 */
import type { CrawlResult } from "@/lib/crawl/types";
import type { CheckContext } from "./types";

const TLD_LOCALE: Readonly<Record<string, string>> = {
  de: "de", at: "de", fr: "fr", it: "it", es: "es", nl: "nl", be: "nl", lu: "fr",
  pt: "pt", pl: "pl", se: "sv", dk: "da", fi: "fi", cz: "cs", sk: "sk", hu: "hu",
  ro: "ro", bg: "bg", hr: "hr", si: "sl", gr: "el", ee: "et", lv: "lv", lt: "lt",
  ie: "en", mt: "en", cy: "el",
};

export function guessLocales(langs: ReadonlyArray<string | null>, hostname: string): string[] {
  const counts = new Map<string, number>();
  for (const lang of langs) {
    const primary = lang?.trim().toLowerCase().split(/[-_]/)[0];
    if (primary && /^[a-z]{2,3}$/.test(primary)) counts.set(primary, (counts.get(primary) ?? 0) + 1);
  }
  if (counts.size > 0) {
    // Map preserves insertion order and Array.prototype.sort is stable: ties keep first appearance.
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([lang]) => lang);
  }
  const tld = hostname.toLowerCase().split(".").pop() ?? "";
  const fromTld = TLD_LOCALE[tld];
  return fromTld ? [fromTld] : [];
}

export function buildCheckContext(crawl: CrawlResult, now: Date): CheckContext {
  const pages = crawl.pages.filter((p) => p.statusCode >= 200 && p.statusCode < 300);
  return {
    pages,
    hostname: crawl.hostname,
    locales: guessLocales(
      pages.map((p) => p.lang),
      crawl.hostname,
    ),
    now,
    jsRenderedSuspected: crawl.jsRenderedSuspected,
  };
}
