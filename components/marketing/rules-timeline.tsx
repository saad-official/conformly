import { cn } from "@/lib/utils";
import { rules } from "./content";
import { quiet } from "./site";

/**
 * Four dated rules on one line: a vertical rail on phones, a horizontal one
 * from md up. The dot sits on the rail; the date leads each entry in mono.
 */
export function RulesTimeline({ className }: { className?: string }) {
  return (
    <ol className={cn("grid md:grid-cols-4", className)}>
      {rules.map((rule) => (
        <li
          key={rule.iso}
          className="relative border-l border-foreground/30 pb-8 pl-6 last:pb-0 md:border-t md:border-l-0 md:pt-7 md:pr-6 md:pb-0 md:pl-0"
        >
          <span
            aria-hidden="true"
            className="absolute top-1 -left-[5px] size-2.5 rounded-full bg-primary ring-4 ring-background md:-top-[5px] md:left-0"
          />
          <p className="font-mono text-sm font-medium tabular">
            <time dateTime={rule.iso}>{rule.date}</time>
          </p>
          <h3 className="mt-2 text-lg leading-snug">{rule.name}</h3>
          <p className="mt-1 font-mono text-xs text-foreground/75">{rule.instrument}</p>
          <p className={cn("mt-3 text-sm leading-relaxed text-pretty", quiet)}>{rule.duty}</p>
        </li>
      ))}
    </ol>
  );
}
