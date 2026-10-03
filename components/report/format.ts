import type { VerdictStatus } from "@/components/marketing/verdict";
import type { CheckCode, FindingStatus } from "@/lib/checks/types";

/** Field label above evidence, citation and fix (matches the landing-page report mock). */
export const fieldLabel = "font-mono text-[0.6875rem] font-medium tracking-wide text-foreground/70 uppercase";

/** Two-digit finding number, 01–09. */
export function findingNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function anchorFor(code: CheckCode): string {
  return `check-${code}`;
}

/**
 * The pill shown for a check. eu_targeting is informational: its "pass"
 * means "the EU rules apply", which reads wrong as a green pass, so it is
 * shown as info.
 */
export function verdictFor(code: CheckCode, status: FindingStatus): VerdictStatus {
  if (code === "eu_targeting" && status === "pass") return "info";
  return status;
}

const STAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** "3 Oct 2026, 14:05 UTC": the server renders this, so the zone is stated rather than guessed. */
export function formatStamp(date: Date): string {
  return `${STAMP.format(date)} UTC`;
}

/** Path and query of a crawled URL for compact tables; the full URL when it is on another host. */
export function displayPath(url: string, hostname: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host !== hostname.replace(/^www\./, "")) return url;
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

/** Only http(s) URLs become links; anything else renders as text. */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
