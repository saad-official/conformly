import { cn } from "@/lib/utils";
import { focusRing } from "./site";

export type ContentsEntry = { id: string; number: string; label: string };

/**
 * The landing page's own table of contents, set like the matrix rail of a
 * report: numbered rows on a left rule. Sticky on wide screens, hidden on
 * phones (the header carries the same destinations there).
 */
export function ContentsRail({ entries, className }: { entries: ContentsEntry[]; className?: string }) {
  return (
    <nav aria-label="On this page" className={cn("sticky top-8 self-start", className)}>
      <p className="font-mono text-xs tracking-wide text-foreground/70 uppercase">Contents</p>
      <ol className="mt-3 border-l border-foreground/20">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className={cn(
                "-ml-px flex gap-3 border-l-2 border-transparent py-1.5 pl-3 text-sm text-foreground/80",
                "hover:border-primary hover:text-foreground motion-safe:transition-colors",
                focusRing,
              )}
            >
              <span className="font-mono text-xs leading-5 text-primary tabular">§ {entry.number}</span>
              {entry.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
