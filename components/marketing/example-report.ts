import type { VerdictStatus } from "./verdict";

/**
 * One synthetic store, used by every mock on the landing page so the numbers
 * agree: the hero report, the report anatomy and the monitoring diff.
 * `.example` is a reserved domain; this shop does not exist.
 */
export const exampleStore = {
  host: "nordlicht-home.example",
  scannedOn: "3 Oct 2026",
  scannedIso: "2026-10-03",
  rescannedOn: "2 Nov 2026",
  rescannedIso: "2026-11-02",
  pages: 11,
};

export const exampleMatrix: { code: string; status: VerdictStatus }[] = [
  { code: "withdrawal_function", status: "fail" },
  { code: "withdrawal_policy", status: "pass" },
  { code: "green_claims", status: "fail" },
  { code: "accessibility_statement", status: "warn" },
  { code: "a11y_sample", status: "warn" },
  { code: "ai_disclosure", status: "pass" },
  { code: "cookie_parity", status: "unknown" },
  { code: "legal_notice", status: "fail" },
  { code: "eu_targeting", status: "info" },
];

export const exampleSummary = {
  issues: exampleMatrix.filter((row) => row.status === "fail").length,
  warnings: exampleMatrix.filter((row) => row.status === "warn").length,
  unknowns: exampleMatrix.filter((row) => row.status === "unknown").length,
};

export const examplePages: { path: string; kind: string }[] = [
  { path: "/", kind: "home" },
  { path: "/products/linen-throw", kind: "product" },
  { path: "/products/oak-tray", kind: "product" },
  { path: "/cart", kind: "cart" },
  { path: "/pages/imprint", kind: "legal" },
  { path: "/pages/returns", kind: "legal" },
];

/** Two-digit check number, matching the numbered list in the checks section. */
export function checkNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}
