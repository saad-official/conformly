import { cn } from "@/lib/utils";
import { checkNumber, exampleMatrix, exampleStore, exampleSummary } from "./example-report";
import { Verdict } from "./verdict";

const fieldLabel = "font-mono text-[0.6875rem] font-medium tracking-wide text-foreground/70 uppercase";

/** Shared header of the report mocks: document reference line and summary strip. */
export function ReportMasthead({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-foreground/15 px-4 py-3">
        <p className="font-mono text-xs font-medium break-all">{exampleStore.host}</p>
        <p className="font-mono text-[0.6875rem] text-foreground/70 tabular">
          <time dateTime={exampleStore.scannedIso}>{exampleStore.scannedOn}</time> · {exampleStore.pages} pages
        </p>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 border-b border-foreground/15 px-4 py-2.5 text-sm font-semibold tabular">
        <span className="text-fail">{exampleSummary.issues} issues</span>
        <span className="text-warn">{exampleSummary.warnings} warnings</span>
        <span className="text-foreground/75">{exampleSummary.unknowns} unknown</span>
      </p>
    </div>
  );
}

/**
 * Hero example: a report page with the matrix as a left rail and the first
 * finding open. Lays itself out from its own width (container query), so the
 * rail sits beside the finding only when the card is wide enough.
 */
export function ReportMock({ className }: { className?: string }) {
  return (
    <figure className={cn("@container min-w-0", className)}>
      <div className="overflow-hidden rounded-lg border border-foreground/20 bg-card shadow-card">
        <ReportMasthead />
        <div className="grid @min-[37rem]:grid-cols-[18rem_minmax(0,1fr)]">
          <ol
            aria-label="Check matrix"
            className="border-b border-foreground/15 py-1.5 @min-[37rem]:border-r @min-[37rem]:border-b-0"
          >
            {exampleMatrix.map((row, index) => (
              <li
                key={row.code}
                aria-current={index === 0 ? "true" : undefined}
                className={cn(
                  "flex items-center gap-2.5 border-l-2 border-transparent py-1.5 pr-3 pl-3.5",
                  index === 0 && "border-primary bg-accent",
                )}
              >
                <span className="font-mono text-[0.6875rem] text-foreground/70 tabular">{checkNumber(index)}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[0.6875rem]">{row.code}</span>
                <Verdict status={row.status} className="px-1.5 py-1 text-[0.625rem]" />
              </li>
            ))}
          </ol>

          <div className="min-w-0 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-foreground/70 tabular">Finding 01 · severity high</p>
                <p className="mt-1 font-heading text-lg leading-snug font-bold">No on-site withdrawal function</p>
              </div>
              <Verdict status="fail" />
            </div>
            <p className="mt-1 font-mono text-xs break-all">withdrawal_function</p>

            <p className={cn(fieldLabel, "mt-4")}>Evidence</p>
            <p className="mt-1 font-mono text-[0.6875rem] break-all text-foreground/75">
              https://{exampleStore.host}/
            </p>
            <blockquote className="mt-1.5 border-l-2 border-fail pl-3 text-sm">
              &ldquo;Footer links: Returns, Contact, Imprint&rdquo;
            </blockquote>

            <p className={cn(fieldLabel, "mt-4")}>Citation</p>
            <p className="mt-1">
              <cite className="font-mono text-xs not-italic">Directive (EU) 2023/2673, Art. 11a</cite>
            </p>

            <p className={cn(fieldLabel, "mt-4")}>Fix</p>
            <pre className="mt-1.5 rounded-md bg-foreground px-3 py-2.5 font-mono text-[0.6875rem] leading-relaxed whitespace-pre-wrap text-background">
              <code>{`<a href="/account/withdraw">\n  Withdraw from contract\n</a>`}</code>
            </pre>
            <p className="mt-2 text-xs leading-relaxed text-foreground/75">
              Shopify: add the link to the footer menu and the order status page, then confirm in two steps.
            </p>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-foreground/70">
        Example report for a synthetic store. Real reports list every finding, not only the first.
      </figcaption>
    </figure>
  );
}
