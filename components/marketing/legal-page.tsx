import { cn } from "@/lib/utils";
import { container, quiet } from "./site";

/**
 * Shared shell for Privacy and Terms, set like the report: a left column with
 * the document title and status, numbered clauses on the right. Child `h2`s
 * are numbered with a CSS counter so the source stays plain.
 */
export function LegalPage({
  label,
  title,
  updated,
  children,
}: {
  label: string;
  title: string;
  /** ISO date, shown as-is in mono. */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(container, "grid gap-10 py-14 md:grid-cols-12 md:py-20")}>
      <header className="md:col-span-4">
        <p className="font-mono text-xs font-medium tracking-wide text-primary">{label}</p>
        <h1 className="mt-4 text-4xl leading-tight sm:text-5xl">{title}</h1>
        <p className={cn("mt-4 text-sm", quiet)}>
          Last updated{" "}
          <time dateTime={updated} className="font-mono tabular">
            {updated}
          </time>
        </p>
        <p className="mt-8 border-l-2 border-primary pl-3 text-sm leading-relaxed font-medium">
          Conformly is a demo project. This page describes how it actually works; it is not legal advice.
        </p>
      </header>
      <div
        className={cn(
          "max-w-2xl min-w-0 text-[0.9375rem] leading-relaxed md:col-span-7 md:col-start-6",
          "text-foreground/85 [counter-reset:clause]",
          "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:border-t [&_h2]:border-foreground/15 [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:text-foreground [&>h2:first-child]:mt-0",
          "[&_h2]:[counter-increment:clause] [&_h2]:before:mr-3 [&_h2]:before:font-mono [&_h2]:before:text-sm [&_h2]:before:font-medium [&_h2]:before:text-primary [&_h2]:before:content-['§_'_counter(clause)]",
          "[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_li]:marker:text-foreground/50",
          "[&_strong]:font-semibold [&_strong]:text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}
