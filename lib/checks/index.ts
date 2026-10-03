/**
 * Runs every check (spec 3.2) over one CheckContext. Findings come back in
 * CHECK_CODES order whatever the completion order. A check that throws becomes
 * an `unknown` finding carrying the error, so one bug never sinks a report.
 * Missing dependencies (no ClaimClassifier) make the dependent check report
 * `unknown` for what it could not decide.
 */
import { a11ySampleCheck, definition as a11ySample } from "./a11y_sample";
import { accessibilityStatementCheck, definition as accessibilityStatement } from "./accessibility_statement";
import { aiDisclosureCheck, definition as aiDisclosure } from "./ai_disclosure";
import { cookieParityCheck, definition as cookieParity } from "./cookie_parity";
import { euTargetingCheck, definition as euTargeting } from "./eu_targeting";
import { createGreenClaimsCheck, definition as greenClaims, type ClaimClassifier } from "./green_claims";
import { legalNoticeCheck, definition as legalNotice } from "./legal_notice";
import { makeFinding } from "./shared";
import { CHECK_CODES, type Check, type CheckCode, type CheckContext, type CheckDefinition, type Finding } from "./types";
import { definition as withdrawalFunction, withdrawalFunctionCheck } from "./withdrawal_function";
import { definition as withdrawalPolicy, withdrawalPolicyCheck } from "./withdrawal_policy";

export type { ClaimClassifier } from "./green_claims";
export { buildCheckContext } from "./context";

export interface CheckDeps {
  claimClassifier?: ClaimClassifier;
}

export const CHECK_DEFINITIONS: Readonly<Record<CheckCode, CheckDefinition>> = {
  withdrawal_function: withdrawalFunction,
  withdrawal_policy: withdrawalPolicy,
  green_claims: greenClaims,
  accessibility_statement: accessibilityStatement,
  a11y_sample: a11ySample,
  ai_disclosure: aiDisclosure,
  cookie_parity: cookieParity,
  legal_notice: legalNotice,
  eu_targeting: euTargeting,
};

function checksFor(deps: CheckDeps): Record<CheckCode, Check> {
  return {
    withdrawal_function: withdrawalFunctionCheck,
    withdrawal_policy: withdrawalPolicyCheck,
    green_claims: createGreenClaimsCheck(deps.claimClassifier),
    accessibility_statement: accessibilityStatementCheck,
    a11y_sample: a11ySampleCheck,
    ai_disclosure: aiDisclosureCheck,
    cookie_parity: cookieParityCheck,
    legal_notice: legalNoticeCheck,
    eu_targeting: euTargetingCheck,
  };
}

export async function runCheckSafely(code: CheckCode, check: Check, ctx: CheckContext): Promise<Finding> {
  try {
    return await check(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return makeFinding(CHECK_DEFINITIONS[code], {
      status: "unknown",
      detail: "This check could not be completed because of an internal error. The other checks are unaffected.",
      fix: { summary: "Re-run the scan; if the problem persists, check this point by hand." },
      meta: { error: message },
    });
  }
}

export async function runChecks(ctx: CheckContext, deps: CheckDeps = {}): Promise<Finding[]> {
  const checks = checksFor(deps);
  return Promise.all(CHECK_CODES.map((code) => runCheckSafely(code, checks[code], ctx)));
}
