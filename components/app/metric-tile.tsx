import { cn } from "@/lib/utils";

export function MetricTile({
  label,
  value,
  caption,
  tone = "default",
  className,
}: {
  label: string;
  /** Pre-formatted value, e.g. "$1,240.00" or "3". */
  value: string;
  caption?: string;
  /** "positive" is moss (money recovered); "attention" is amber (needs action). */
  tone?: "default" | "positive" | "attention";
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10", className)}>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          "money tabular mt-2 font-display text-3xl leading-none",
          tone === "positive" && "text-moss",
          tone === "attention" && "text-amber-foreground dark:text-amber",
        )}
      >
        {value}
      </p>
      {caption ? <p className="mt-2 text-xs text-muted-foreground">{caption}</p> : null}
    </div>
  );
}
