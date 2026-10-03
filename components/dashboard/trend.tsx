import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import type { ScanSummary } from "@/lib/report/summary";
import { cn } from "@/lib/utils";

export type TrendDirection = "better" | "worse" | "same" | "none";

/**
 * Latest vs previous finished scan: weighted fails first (high 3, medium 2,
 * low 1), then warnings. Fewer is better.
 */
export function trendBetween(
  current: ScanSummary | null | undefined,
  previous: ScanSummary | null | undefined,
): TrendDirection {
  if (!current || !previous) return "none";
  const a = [current.weightedScore, current.warnings];
  const b = [previous.weightedScore, previous.warnings];
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return "better";
    if (a[i] > b[i]) return "worse";
  }
  return "same";
}

const META: Record<TrendDirection, { label: string; Icon: typeof ArrowRight; tone: string }> = {
  better: { label: "Fewer issues than the previous scan", Icon: ArrowDownRight, tone: "text-pass" },
  worse: { label: "More issues than the previous scan", Icon: ArrowUpRight, tone: "text-fail" },
  same: { label: "Same as the previous scan", Icon: ArrowRight, tone: "text-foreground/60" },
  none: { label: "No previous scan to compare", Icon: Minus, tone: "text-foreground/40" },
};

export function TrendArrow({ direction, className }: { direction: TrendDirection; className?: string }) {
  const { label, Icon, tone } = META[direction];
  return (
    <span className={cn("inline-flex items-center", tone, className)} title={label}>
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
