import Link from "next/link";
import { ArrowUpRight, Radar } from "lucide-react";
import type { Scan, Site } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { formatDate, quiet, scanTime } from "./format";
import { ScanCounts } from "./scan-counts";
import { TrendArrow, trendBetween } from "./trend";
import { VerdictPill, verdictForSummary } from "./verdict-pill";

export type MonitorState = "on" | "paused" | "off";

export type SiteRowData = {
  site: Pick<Site, "id" | "hostname" | "url" | "monitorEnabled" | "monitorIntervalDays">;
  /** Latest finished scan. */
  latest: Scan | null;
  /** The finished scan before it. */
  previous: Scan | null;
  /** "paused": monitoring is on but the plan no longer covers this site. */
  monitor: MonitorState;
  nextRun: Date | null;
};

/** Groups `listLatestDonePerSite` output (newest first per site) into latest + previous. */
export function latestTwoBySite(scans: readonly Scan[]): Map<string, { latest: Scan; previous: Scan | null }> {
  const out = new Map<string, { latest: Scan; previous: Scan | null }>();
  for (const scan of scans) {
    if (!scan.siteId) continue;
    const entry = out.get(scan.siteId);
    if (!entry) out.set(scan.siteId, { latest: scan, previous: null });
    else if (!entry.previous) entry.previous = scan;
  }
  return out;
}

export function MonitorBadge({ state, className }: { state: MonitorState; className?: string }) {
  if (state === "off") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[0.7rem] tracking-wide uppercase",
        state === "on" ? "bg-accent text-accent-foreground" : "bg-muted text-foreground/72",
        className,
      )}
      title={state === "paused" ? "Monitoring is on, but your plan's monitored-site limit does not cover this site." : undefined}
    >
      <Radar className="size-3" aria-hidden />
      {state === "on" ? "Monitored" : "Paused · over limit"}
    </span>
  );
}

/** Per-site overview: host, last scan, counts, trend, worst verdict, report link. */
export function SiteRows({ rows, timeZone, className }: { rows: readonly SiteRowData[]; timeZone: string; className?: string }) {
  return (
    <ul className={cn("@container divide-y rounded-xl bg-card shadow-card ring-1 ring-foreground/10", className)}>
      {rows.map(({ site, latest, previous, monitor, nextRun }) => {
        const verdict = latest ? verdictForSummary(latest.summary) : null;
        return (
          <li
            key={site.id}
            className="grid gap-x-4 gap-y-2 px-4 py-3.5 @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] @3xl:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/sites/${site.id}`}
                  className="truncate font-heading text-base font-semibold hover:underline focus-visible:underline"
                >
                  {site.hostname}
                </Link>
                <MonitorBadge state={monitor} />
              </div>
              <p className={cn("truncate font-mono text-xs", quiet)}>{site.url}</p>
            </div>
            <div className={cn("text-sm", quiet)}>
              {latest ? (
                <>
                  <span className="sr-only">Last scan: </span>
                  <time dateTime={scanTime(latest).toISOString()}>{formatDate(scanTime(latest), timeZone)}</time>
                </>
              ) : (
                "Not scanned yet"
              )}
              {monitor === "on" && nextRun ? (
                <span className="block text-xs">Next re-scan {formatDate(nextRun, timeZone)}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {latest ? (
                <>
                  <TrendArrow direction={trendBetween(latest.summary, previous?.summary)} />
                  <ScanCounts summary={latest.summary} />
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-3 @3xl:justify-end">
              {verdict ? <VerdictPill tone={verdict.tone}>{verdict.label}</VerdictPill> : <VerdictPill tone="muted">Not scanned</VerdictPill>}
              {latest ? (
                <Link
                  href={`/r/${latest.publicId}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:underline"
                >
                  Report
                  <span className="sr-only"> for {site.hostname}</span>
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
