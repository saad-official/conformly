import { cn } from "@/lib/utils";
import { quiet } from "./site";

/**
 * Numbered section heading, set like a clause in a report: the section number
 * in mono on the rule line, then the heading and an optional lead paragraph.
 */
export function SectionHeading({
  number,
  id,
  title,
  lead,
  className,
}: {
  number: string;
  /** id of the h2, used by the section's aria-labelledby. */
  id: string;
  title: string;
  lead?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-t-2 border-foreground pt-4", className)}>
      <p className="font-mono text-xs font-medium tracking-wide text-primary tabular">§ {number}</p>
      <h2 id={id} className="mt-3 max-w-2xl text-3xl leading-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {lead ? <p className={cn("mt-4 max-w-2xl text-base leading-relaxed text-pretty", quiet)}>{lead}</p> : null}
    </div>
  );
}
