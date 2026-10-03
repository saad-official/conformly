import { cn } from "@/lib/utils";
import { checks } from "./content";
import { checkNumber } from "./example-report";
import { quiet } from "./site";

/**
 * The nine checks as numbered clauses. Each row: number, code and name, what
 * it looks for, how it decides, and the citation it reports.
 */
export function ChecksList({ className }: { className?: string }) {
  return (
    <ol className={cn("divide-y divide-foreground/15 border-y border-foreground/15", className)}>
      {checks.map((check, index) => (
        <li key={check.code} className="grid gap-x-6 gap-y-3 py-6 sm:grid-cols-[3rem_minmax(0,1fr)]">
          <p aria-hidden="true" className="font-mono text-2xl leading-none font-medium text-primary tabular">
            {checkNumber(index)}
          </p>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-lg leading-snug">
                <span className="sr-only">{checkNumber(index)}. </span>
                {check.name}
              </h3>
              <code className="code break-all">{check.code}</code>
            </div>
            <p className={cn("mt-2 max-w-2xl text-sm leading-relaxed text-pretty", quiet)}>{check.looksFor}</p>
            {check.note ? (
              <p className="mt-3 max-w-2xl border-l-2 border-foreground pl-3 text-sm leading-relaxed font-medium">
                {check.note}
              </p>
            ) : null}
            <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
              <dt className="font-mono text-xs tracking-wide text-foreground/70 uppercase sm:pt-0.5">Decides by</dt>
              <dd>
                <span
                  className={cn(
                    "inline-block rounded-sm border px-1.5 py-0.5 font-mono text-xs",
                    check.decides === "rule"
                      ? "border-foreground/25 text-foreground"
                      : "border-primary/50 bg-accent text-accent-foreground",
                  )}
                >
                  {check.decides}
                </span>
              </dd>
              <dt className="font-mono text-xs tracking-wide text-foreground/70 uppercase sm:pt-0.5">Cites</dt>
              <dd>
                <cite className="font-mono text-xs not-italic">{check.citation}</cite>
              </dd>
            </dl>
          </div>
        </li>
      ))}
    </ol>
  );
}
