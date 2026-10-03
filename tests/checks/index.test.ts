import { describe, expect, it } from "vitest";
import { CHECK_DEFINITIONS, runCheckSafely, runChecks } from "@/lib/checks";
import { CHECK_CODES } from "@/lib/checks/types";
import { ctxFrom, doc } from "./helpers";
import { fakeClassifier } from "./fake-classifier";

const H = "https://shop.example";

describe("runChecks", () => {
  const ctx = ctxFrom({ [`${H}/`]: doc("<h1>Shop</h1><p>Sustainable lamps.</p>") });

  it("returns one finding per check in the fixed spec order", async () => {
    const findings = await runChecks(ctx);
    expect(findings.map((f) => f.code)).toEqual([...CHECK_CODES]);
    expect(Object.keys(CHECK_DEFINITIONS)).toEqual([...CHECK_CODES]);
  });

  it("reports green_claims as unknown without a classifier and uses one when given", async () => {
    const without = await runChecks(ctx);
    expect(without.find((f) => f.code === "green_claims")?.status).toBe("unknown");
    const classifier = fakeClassifier([{ includes: "Sustainable", verdict: "generic_unsubstantiated" }]);
    const withIt = await runChecks(ctx, { claimClassifier: classifier });
    expect(withIt.find((f) => f.code === "green_claims")?.status).toBe("fail");
    expect(classifier.calls).toHaveLength(1);
  });
});

describe("runCheckSafely", () => {
  it("turns a crashing check into an unknown finding with the check's identity", async () => {
    const finding = await runCheckSafely("legal_notice", () => {
      throw new Error("boom");
    }, plainCtx());
    expect(finding).toMatchObject({
      code: "legal_notice",
      status: "unknown",
      severity: "high",
      title: CHECK_DEFINITIONS.legal_notice.title,
      citation: CHECK_DEFINITIONS.legal_notice.citation,
      meta: { error: "boom" },
    });
    expect(finding.detail).toMatch(/could not be completed/);
  });

  it("also catches rejected promises", async () => {
    const finding = await runCheckSafely("cookie_parity", async () => Promise.reject(new Error("late boom")), plainCtx());
    expect(finding).toMatchObject({ code: "cookie_parity", status: "unknown", meta: { error: "late boom" } });
  });
});

function plainCtx() {
  return ctxFrom({ [`${H}/`]: doc("<h1>Shop</h1>") });
}
