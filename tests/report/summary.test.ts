import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/report/summary";
import type { FindingStatus, Severity } from "@/lib/checks/types";

const f = (status: FindingStatus, severity: Severity) => ({ status, severity });

describe("summarize", () => {
  it("counts statuses and weighs only fails: high 3, medium 2, low 1", () => {
    expect(
      summarize([
        f("fail", "high"),
        f("fail", "medium"),
        f("fail", "low"),
        f("fail", "high"),
        f("warn", "high"),
        f("warn", "low"),
        f("unknown", "medium"),
        f("pass", "high"),
      ]),
    ).toEqual({
      issues: 4,
      warnings: 2,
      unknowns: 1,
      passes: 1,
      byStatus: { pass: 1, fail: 4, warn: 2, unknown: 1 },
      weightedScore: 9,
    });
  });

  it("returns zeros for no findings", () => {
    expect(summarize([])).toEqual({
      issues: 0,
      warnings: 0,
      unknowns: 0,
      passes: 0,
      byStatus: { pass: 0, fail: 0, warn: 0, unknown: 0 },
      weightedScore: 0,
    });
  });
});
