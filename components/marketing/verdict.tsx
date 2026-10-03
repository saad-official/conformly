import { cn } from "@/lib/utils";

export type VerdictStatus = "pass" | "fail" | "warn" | "unknown" | "info";

const styles: Record<VerdictStatus, string> = {
  pass: "text-pass",
  fail: "text-fail",
  warn: "text-warn",
  unknown: "text-foreground/70",
  info: "text-foreground/70",
};

/**
 * Verdict pill (dot + uppercase label). The label is always text, so the
 * verdict never depends on colour alone. Place on `bg-card`: the ochre warn
 * colour needs the white surface to clear 4.5:1.
 */
export function Verdict({ status, className }: { status: VerdictStatus; className?: string }) {
  return <span className={cn("verdict shrink-0 bg-card", styles[status], className)}>{status}</span>;
}
