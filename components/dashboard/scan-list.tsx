import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Scan } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { formatDateTime, quiet, scanTime } from "./format";
import { ScanCounts } from "./scan-counts";
import { VerdictPill, verdictForScan } from "./verdict-pill";

export type ScanListItem = Pick<
  Scan,
  "id" | "publicId" | "hostname" | "url" | "status" | "summary" | "siteId" | "createdAt" | "startedAt" | "finishedAt" | "pagesCrawled"
>;

/**
 * Scans as a ruled list: verdict, host, date, counts, report link. One line
 * per scan when the list is at least 42rem wide (container query); stacked otherwise.
 */
export function ScanList({
  scans,
  timeZone,
  showHost = true,
  siteLinks = false,
  className,
}: {
  scans: readonly ScanListItem[];
  timeZone: string;
  /** Hide the host on a single site's history. */
  showHost?: boolean;
  /** Link the host to its site page (when the scan belongs to a site). */
  siteLinks?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn("@container divide-y rounded-xl bg-card shadow-card ring-1 ring-foreground/10", className)}>
      {scans.map((scan) => {
        const verdict = verdictForScan(scan);
        const finished = scan.status === "done";
        return (
          <li key={scan.id} className="grid gap-2 px-4 py-3 @2xl:grid-cols-[9.5rem_minmax(10rem,1fr)_auto_auto] @2xl:items-center @2xl:gap-4">
            <div>
              <VerdictPill tone={verdict.tone}>{verdict.label}</VerdictPill>
            </div>
            <div className="min-w-0">
              {showHost ? (
                siteLinks && scan.siteId ? (
                  <Link
                    href={`/sites/${scan.siteId}`}
                    className="block truncate font-medium hover:underline focus-visible:underline"
                  >
                    {scan.hostname}
                  </Link>
                ) : (
                  <p className="truncate font-medium">{scan.hostname}</p>
                )
              ) : null}
              <p className={cn("text-xs", quiet)}>
                <time dateTime={scanTime(scan).toISOString()}>{formatDateTime(scanTime(scan), timeZone)}</time>
                {finished ? ` · ${scan.pagesCrawled} ${scan.pagesCrawled === 1 ? "page" : "pages"}` : null}
              </p>
            </div>
            <div>{finished ? <ScanCounts summary={scan.summary} /> : <span className={cn("text-xs", quiet)}>—</span>}</div>
            <Link
              href={`/r/${scan.publicId}`}
              className="inline-flex items-center gap-1 justify-self-start text-sm font-medium text-primary hover:underline focus-visible:underline @2xl:justify-self-end"
            >
              Report
              <span className="sr-only"> for {scan.hostname}</span>
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
