import { cn } from "@/lib/utils";
import { exampleStore } from "./example-report";
import { Verdict } from "./verdict";

/** Change alert from a monthly re-scan of the example store. */
export function MonitorMock({ className }: { className?: string }) {
  return (
    <figure className={cn("min-w-0", className)}>
      <div className="overflow-hidden rounded-lg border border-foreground/20 bg-card shadow-card">
        <div className="border-b border-foreground/15 px-4 py-3">
          <p className="font-mono text-xs font-medium break-all">{exampleStore.host}</p>
          <p className="mt-0.5 font-mono text-[0.6875rem] text-foreground/70 tabular">
            Re-scan <time dateTime={exampleStore.rescannedIso}>{exampleStore.rescannedOn}</time> against{" "}
            <time dateTime={exampleStore.scannedIso}>{exampleStore.scannedOn}</time>
          </p>
        </div>
        <ul className="divide-y divide-foreground/10">
          <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
            <span className="w-20 shrink-0 font-mono text-xs font-medium">+ New</span>
            <span className="min-w-0 flex-1 font-mono text-xs">cookie_parity</span>
            <Verdict status="warn" />
          </li>
          <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
            <span className="w-20 shrink-0 font-mono text-xs font-medium">&minus; Resolved</span>
            <span className="min-w-0 flex-1 font-mono text-xs text-foreground/75 line-through decoration-foreground/40">
              legal_notice
            </span>
            <Verdict status="fail" />
          </li>
          <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
            <span className="w-20 shrink-0 font-mono text-xs font-medium">~ Changed</span>
            <span className="min-w-0 flex-1 text-xs">
              <span className="font-mono">green_claims</span>: one evidence quote rewritten
            </span>
          </li>
        </ul>
        <p className="border-t border-foreground/15 px-4 py-2.5 text-xs text-foreground/75">
          Alert emailed to the site owner. Next re-scan in 30 days.
        </p>
      </div>
      <figcaption className="sr-only">Example change alert for the synthetic store.</figcaption>
    </figure>
  );
}
