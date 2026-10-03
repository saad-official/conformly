import { cn } from "@/lib/utils";
import { focusRing, quiet } from "./site";

export type FaqItem = { question: string; answer: React.ReactNode };

/**
 * Native disclosure widgets: keyboard and screen-reader support come with the
 * element, the answers stay findable with Find in page, and no script ships.
 */
export function Faq({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={cn("divide-y divide-foreground/15 border-y border-foreground/15", className)}>
      {items.map((item) => (
        <details key={item.question} className="group">
          <summary
            className={cn(
              "flex cursor-pointer list-none items-start justify-between gap-6 py-5 [&::-webkit-details-marker]:hidden",
              focusRing,
            )}
          >
            <h3 className="font-heading text-lg leading-snug font-bold">{item.question}</h3>
            <span
              aria-hidden="true"
              className="mt-0.5 shrink-0 font-mono text-lg leading-none text-primary group-open:hidden"
            >
              +
            </span>
            <span
              aria-hidden="true"
              className="mt-0.5 hidden shrink-0 font-mono text-lg leading-none text-primary group-open:inline"
            >
              &minus;
            </span>
          </summary>
          <div className={cn("max-w-2xl pb-6 text-[0.9375rem] leading-relaxed text-pretty [&_p+p]:mt-3", quiet)}>
            {item.answer}
          </div>
        </details>
      ))}
    </div>
  );
}
