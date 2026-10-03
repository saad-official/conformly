import { cn } from "@/lib/utils";

/** The product's legal posture, repeated wherever results are summarised. */
export function LegalNote({ className }: { className?: string }) {
  return (
    <p className={cn("font-mono text-xs tracking-wide text-foreground/72", className)}>
      Issues found, with citations. Not legal advice.
    </p>
  );
}

/** Section heading inside a page: small caps label plus an optional trailing element. */
export function SectionHeading({
  id,
  title,
  description,
  action,
  className,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-end justify-between gap-2", className)}>
      <div className="min-w-0">
        <h2 id={id} className="font-heading text-lg">
          {title}
        </h2>
        {description ? <p className="text-sm text-foreground/72">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
