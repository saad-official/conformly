import type { Scan } from "@/lib/db/types";

/** Secondary text: `text-muted-foreground` sits just under 4.5:1 on chalk, so this is used instead. */
export const quiet = "text-foreground/72";

/** Text link in the signed-in screens. */
export const textLink =
  "font-medium text-primary underline decoration-primary/40 underline-offset-[3px] hover:decoration-primary rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function safeZone(timeZone: string | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** "3 Oct 2026" in the organisation's time zone. */
export function formatDate(date: Date | null | undefined, timeZone?: string): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: safeZone(timeZone),
  }).format(date);
}

/** "3 Oct 2026, 14:05" in the organisation's time zone. */
export function formatDateTime(date: Date | null | undefined, timeZone?: string): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: safeZone(timeZone),
  }).format(date);
}

/** "3 Oct" (tiles, where the year is in the caption). */
export function formatDayMonth(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: safeZone(timeZone) }).format(date);
}

/** When a scan last did something: finished, else started, else created. */
export function scanTime(scan: Pick<Scan, "finishedAt" | "startedAt" | "createdAt">): Date {
  return scan.finishedAt ?? scan.startedAt ?? scan.createdAt;
}
