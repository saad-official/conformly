import type { ScanSummary } from "@/lib/report/summary";
import { cn } from "@/lib/utils";
import { formatStamp, safeHref } from "./format";

function Count({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[0.6875rem] tracking-wide text-foreground/70 uppercase">{label}</dt>
      <dd className={cn("mt-1 font-heading text-3xl leading-none font-bold tabular", className)}>{value}</dd>
    </div>
  );
}

/**
 * Report masthead (spec 3.3): the store, when it was scanned, how many pages,
 * and the counts. Counts are "issues found", never a compliance percentage.
 */
export function SummaryStrip({
  url,
  hostname,
  scannedAt,
  pagesCrawled,
  summary,
}: {
  url: string;
  hostname: string;
  scannedAt: Date;
  pagesCrawled: number;
  summary: Pick<ScanSummary, "issues" | "warnings" | "unknowns" | "passes">;
}) {
  const href = safeHref(url);
  return (
    <header className="overflow-hidden rounded-lg border border-foreground/20 bg-card shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-foreground/15 px-4 py-3 sm:px-6">
        <p className="font-mono text-xs tracking-wide text-foreground/70 uppercase">Storefront report</p>
        <p className="font-mono text-xs text-foreground/72 tabular">
          <time dateTime={scannedAt.toISOString()}>{formatStamp(scannedAt)}</time> · {pagesCrawled}{" "}
          {pagesCrawled === 1 ? "page" : "pages"} crawled
        </p>
      </div>
      <div className="px-4 py-5 sm:px-6">
        <h1 className="text-2xl leading-tight break-all sm:text-3xl">{hostname}</h1>
        {href ? (
          <a
            href={href}
            rel="nofollow noopener noreferrer"
            className="mt-1 inline-block font-mono text-xs break-all text-foreground/72 underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
          >
            {url}
          </a>
        ) : (
          <p className="mt-1 font-mono text-xs break-all text-foreground/72">{url}</p>
        )}
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Count value={summary.issues} label={summary.issues === 1 ? "Issue" : "Issues"} className="text-fail" />
          <Count value={summary.warnings} label={summary.warnings === 1 ? "Warning" : "Warnings"} className="text-warn" />
          <Count value={summary.unknowns} label="Unknown" className="text-foreground/75" />
          <Count value={summary.passes} label={summary.passes === 1 ? "Pass" : "Passes"} className="text-pass" />
        </dl>
      </div>
      <p className="border-t border-foreground/15 bg-muted/60 px-4 py-2.5 text-xs leading-relaxed text-foreground/80 sm:px-6">
        <strong className="font-semibold">Not legal advice.</strong> Conformly reports issues it found on the crawled pages,
        with evidence and the rule they relate to. It does not certify that a shop is compliant.
      </p>
    </header>
  );
}
