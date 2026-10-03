/**
 * Check contract (spec 3.2). Every check is a pure function of the crawled
 * documents and returns exactly one Finding. Conformly reports issues with
 * evidence and citations; it never states that a shop is compliant.
 */
import type { CrawledPage } from "@/lib/crawl/types";

/** Spec 3.2 order; `runChecks` returns findings in this order. */
export const CHECK_CODES = [
  "withdrawal_function",
  "withdrawal_policy",
  "green_claims",
  "accessibility_statement",
  "a11y_sample",
  "ai_disclosure",
  "cookie_parity",
  "legal_notice",
  "eu_targeting",
] as const;
export type CheckCode = (typeof CHECK_CODES)[number];

export const FINDING_STATUSES = ["pass", "fail", "warn", "unknown"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const SEVERITIES = ["high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface Evidence {
  url: string;
  quote: string;
}

export interface Citation {
  law: string;
  article?: string;
  url: string;
}

export interface Fix {
  summary: string;
  /** Generic HTML the merchant can paste; never contains placeholders. */
  html?: string;
  /** One-line note for Shopify stores. */
  shopify?: string;
}

export interface Finding {
  code: CheckCode;
  status: FindingStatus;
  /** Fixed per check: how much a fail matters, whatever the status. */
  severity: Severity;
  title: string;
  detail: string;
  evidence: Evidence[];
  citation: Citation;
  fix: Fix;
  meta?: Record<string, unknown>;
}

export interface CheckContext {
  /** Successfully fetched (2xx) pages, homepage first. */
  pages: CrawledPage[];
  hostname: string;
  /** Primary language subtags, most frequent first ("de", "fr"); empty when unknown. */
  locales: string[];
  now: Date;
  /** The storefront renders in the browser; absence of evidence then means `unknown`, not `fail`. */
  jsRenderedSuspected: boolean;
}

export type Check = (ctx: CheckContext) => Promise<Finding> | Finding;

/** The static part of a check's findings. */
export interface CheckDefinition {
  code: CheckCode;
  title: string;
  severity: Severity;
  citation: Citation;
}
