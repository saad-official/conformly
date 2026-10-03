import type { ScanSummary } from "@/lib/report/summary";
import { cn } from "@/lib/utils";

/**
 * "2 issues · 1 warning · 0 unknown" in mono. A count is coloured only when it
 * is above zero; the words carry the meaning.
 */
export function ScanCounts({ summary, className }: { summary: ScanSummary | null | undefined; className?: string }) {
  if (!summary) return <span className={cn("font-mono text-xs text-foreground/60", className)}>no counts</span>;
  const items = [
    { n: summary.issues, one: "issue", many: "issues", tone: "text-fail" },
    { n: summary.warnings, one: "warning", many: "warnings", tone: "text-warn" },
    { n: summary.unknowns, one: "unknown", many: "unknown", tone: "text-foreground" },
  ];
  return (
    <span className={cn("tabular inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs", className)}>
      {items.map((item, i) => (
        <span key={item.one} className="inline-flex items-center gap-1 whitespace-nowrap">
          {i > 0 ? (
            <span aria-hidden className="text-foreground/40">
              ·
            </span>
          ) : null}
          <span className={cn("font-semibold", item.n > 0 ? item.tone : "text-foreground/60")}>{item.n}</span>
          <span className="text-foreground/72">{item.n === 1 ? item.one : item.many}</span>
        </span>
      ))}
    </span>
  );
}
