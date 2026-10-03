/**
 * Scan summary (spec 3.2): "N issues, M warnings". The weighted score is
 * informational only: each fail weighs by severity (high 3, medium 2, low 1);
 * warnings, unknowns and passes weigh nothing. Never shown as a percentage.
 */
import type { Finding, FindingStatus, Severity } from "@/lib/checks/types";

export const SEVERITY_WEIGHT: Readonly<Record<Severity, number>> = { high: 3, medium: 2, low: 1 };

export interface ScanSummary {
  /** Number of fails. */
  issues: number;
  warnings: number;
  unknowns: number;
  passes: number;
  byStatus: Record<FindingStatus, number>;
  weightedScore: number;
}

export function summarize(findings: ReadonlyArray<Pick<Finding, "status" | "severity">>): ScanSummary {
  const byStatus: Record<FindingStatus, number> = { pass: 0, fail: 0, warn: 0, unknown: 0 };
  let weightedScore = 0;
  for (const finding of findings) {
    byStatus[finding.status] += 1;
    if (finding.status === "fail") weightedScore += SEVERITY_WEIGHT[finding.severity];
  }
  return {
    issues: byStatus.fail,
    warnings: byStatus.warn,
    unknowns: byStatus.unknown,
    passes: byStatus.pass,
    byStatus,
    weightedScore,
  };
}
