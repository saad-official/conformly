import { cn } from "@/lib/utils";
import { checkNumber, exampleMatrix, examplePages, exampleStore } from "./example-report";
import { ReportMasthead } from "./report-mock";
import { Verdict } from "./verdict";

const fieldLabel = "font-mono text-[0.6875rem] font-medium tracking-wide text-foreground/70 uppercase";

/** Lettered marker tying a region of the mock to the explainer list beside it. */
export function CalloutMarker({ letter, className }: { letter: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-xs font-medium text-primary-foreground",
        className,
      )}
    >
      {letter}
    </span>
  );
}

function Region({
  letter,
  className,
  markerClassName = "top-2.5",
  children,
}: {
  letter: string;
  className?: string;
  markerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative", className)}>
      <CalloutMarker letter={letter} className={cn("absolute right-2.5 z-10", markerClassName)} />
      {children}
    </div>
  );
}

/**
 * Second example: the whole report page, compressed, with lettered regions
 * (A to E) that the explainer list next to it describes.
 */
export function AnatomyMock({ className }: { className?: string }) {
  return (
    <figure className={cn("@container min-w-0", className)}>
      <div className="overflow-hidden rounded-lg border border-foreground/20 bg-card shadow-card">
        <Region letter="A" markerClassName="bottom-2">
          <ReportMasthead />
        </Region>

        <Region letter="B" className="border-b border-foreground/15 px-4 py-3">
          <p className={fieldLabel}>Matrix</p>
          <ol aria-label="Check matrix" className="mt-2 grid grid-cols-2 gap-1.5 pr-8 @sm:grid-cols-3">
            {exampleMatrix.map((row, index) => (
              <li
                key={row.code}
                className="flex items-center justify-between gap-2 rounded-sm border border-foreground/12 px-2 py-1.5"
              >
                <span className="font-mono text-[0.6875rem] text-foreground/70 tabular">
                  {checkNumber(index)}
                  <span className="sr-only"> {row.code}</span>
                </span>
                <Verdict status={row.status} className="px-1.5 py-1 text-[0.625rem]" />
              </li>
            ))}
          </ol>
        </Region>

        <Region letter="C" className="border-b border-foreground/15 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <p className="font-mono text-xs text-foreground/70 tabular">Finding 03</p>
            <Verdict status="fail" className="px-1.5 py-1 text-[0.625rem]" />
            <span className="rounded-sm border border-primary/40 px-1.5 py-0.5 font-mono text-[0.625rem] text-primary">
              rule + model
            </span>
          </div>
          <p className="mt-1.5 font-heading font-bold">Generic environmental claim</p>
          <blockquote className="mt-2 border-l-2 border-fail pl-3 text-sm">
            &ldquo;Our eco-friendly packaging is kind to the planet.&rdquo;
          </blockquote>
          <p className="mt-2">
            <cite className="font-mono text-xs not-italic">Directive (EU) 2024/825, Annex I, point 4a</cite>
          </p>
          <p className="mt-2 rounded-sm bg-muted px-2.5 py-2 font-mono text-[0.6875rem] leading-relaxed">
            Packaging: 80% recycled cardboard, FSC Recycled certified.
          </p>
        </Region>

        <Region letter="D" className="border-b border-foreground/15 px-4 py-3">
          <p className={fieldLabel}>Pages crawled · {exampleStore.pages}</p>
          <ul className="mt-2 space-y-1 pr-8">
            {examplePages.map((page) => (
              <li key={page.path} className="flex items-baseline justify-between gap-3 font-mono text-[0.6875rem]">
                <span className="min-w-0 truncate">{page.path}</span>
                <span className="shrink-0 text-foreground/70">{page.kind}</span>
              </li>
            ))}
            <li className="font-mono text-[0.6875rem] text-foreground/70">
              + {exampleStore.pages - examplePages.length} more
            </li>
          </ul>
        </Region>

        <Region letter="E" className="px-4 py-3.5">
          <div className="rounded-md border border-dashed border-foreground/35 px-3 py-2.5 pr-10">
            <p className={fieldLabel}>Limitations</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed">
              <li>The cookie banner is injected by JavaScript, so cookie_parity is unknown.</li>
              <li>a11y_sample is a sample of five checks, not a WCAG audit.</li>
            </ul>
          </div>
        </Region>
      </div>
      <figcaption className="mt-3 text-xs text-foreground/70">
        The same synthetic store, as a full report page. Letters match the list.
      </figcaption>
    </figure>
  );
}
