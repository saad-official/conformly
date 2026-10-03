import type { FindingStatus } from "@/lib/checks/types";
import type { Scan } from "@/lib/db/types";
import type { ScanSummary } from "@/lib/report/summary";
import { cn } from "@/lib/utils";

export type PillTone = FindingStatus | "pending" | "muted";

const TONE: Record<PillTone, string> = {
  fail: "text-fail",
  warn: "text-warn",
  pass: "text-pass",
  unknown: "text-foreground/70",
  pending: "text-primary",
  muted: "text-foreground/60",
};

/**
 * Verdict pill (dot + uppercase label, the `verdict` utility). The label is
 * always text, so meaning never rests on colour alone. Sits on `bg-card` so
 * the ochre warn colour clears 4.5:1.
 */
export function VerdictPill({
  tone,
  children,
  className,
}: {
  tone: PillTone;
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("verdict shrink-0 bg-card", TONE[tone], className)}>{children}</span>;
}

export type Verdict = { tone: PillTone; label: string };

/** Worst status in a finished scan. "No issues found", never "compliant". */
export function verdictForSummary(summary: ScanSummary | null | undefined): Verdict {
  if (!summary) return { tone: "muted", label: "No result" };
  if (summary.issues > 0) return { tone: "fail", label: summary.issues === 1 ? "Issue" : "Issues" };
  if (summary.warnings > 0) return { tone: "warn", label: summary.warnings === 1 ? "Warning" : "Warnings" };
  if (summary.unknowns > 0) return { tone: "unknown", label: "Unknowns" };
  return { tone: "pass", label: "No issues found" };
}

export function verdictForScan(scan: Pick<Scan, "status" | "summary">): Verdict {
  switch (scan.status) {
    case "queued":
      return { tone: "pending", label: "Queued" };
    case "running":
      return { tone: "pending", label: "Running" };
    case "failed":
      return { tone: "muted", label: "Scan failed" };
    default:
      return verdictForSummary(scan.summary);
  }
}

export function StatusPill({ status, className }: { status: FindingStatus; className?: string }) {
  return (
    <VerdictPill tone={status} className={className}>
      {status}
    </VerdictPill>
  );
}
