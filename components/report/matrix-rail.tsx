import { Verdict } from "@/components/marketing/verdict";
import type { CheckCode, FindingStatus } from "@/lib/checks/types";
import { cn } from "@/lib/utils";
import { anchorFor, findingNumber, verdictFor } from "./format";

export type MatrixRow = { code: CheckCode; title: string; status: FindingStatus | null };

/**
 * The check matrix as a left rail (spec 6): every check with its verdict,
 * linking to its numbered section. Sticky beside the findings on wide
 * screens, a plain list above them on phones.
 */
export function MatrixRail({ rows, className }: { rows: readonly MatrixRow[]; className?: string }) {
  return (
    <nav aria-label="Check matrix" className={cn("lg:sticky lg:top-6 lg:self-start", className)}>
      <div className="overflow-hidden rounded-lg border border-foreground/20 bg-card">
        <p className="border-b border-foreground/15 px-4 py-2.5 font-mono text-[0.6875rem] font-medium tracking-wide text-foreground/70 uppercase">
          Matrix · {rows.length} checks
        </p>
        <ol className="py-1.5">
          {rows.map((row, index) => (
            <li key={row.code}>
              <a
                href={`#${anchorFor(row.code)}`}
                className={cn(
                  "flex items-center gap-2.5 border-l-2 border-transparent py-2 pr-3 pl-3.5 hover:border-primary hover:bg-accent",
                  "focus-visible:border-primary focus-visible:bg-accent focus-visible:outline-none",
                )}
              >
                <span className="font-mono text-[0.6875rem] text-foreground/70 tabular">{findingNumber(index)}</span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm leading-snug font-medium">{row.title}</span>
                  <span className="block truncate font-mono text-[0.6875rem] text-foreground/70">{row.code}</span>
                </span>
                {row.status ? (
                  <Verdict status={verdictFor(row.code, row.status)} className="px-1.5 py-1 text-[0.625rem]" />
                ) : (
                  <span className="font-mono text-[0.625rem] text-foreground/70 uppercase">not run</span>
                )}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
