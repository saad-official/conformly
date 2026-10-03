import "server-only";
import { createHash } from "node:crypto";
import type { CallMeta } from "@/lib/ai/generate";
import { createLlmClaimClassifier } from "@/lib/ai/claims";
import { logAgentEvent } from "@/lib/ai/log";
import { hasFallback, hasPrimary } from "@/lib/ai/model";
import { buildCheckContext, runChecks, type ClaimClassifier } from "@/lib/checks";
import type { Finding } from "@/lib/checks/types";
import { crawlSite, DEFAULT_MAX_PAGES, DEFAULT_USER_AGENT, type FetchLike } from "@/lib/crawl/fetcher";
import type { CrawlResult } from "@/lib/crawl/types";
import { getDb } from "@/lib/db/client";
import * as findingsRepo from "@/lib/db/repositories/findings";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import * as scansRepo from "@/lib/db/repositories/scans";
import * as scansExtra from "@/lib/db/repositories/scans-extra";
import * as sitesRepo from "@/lib/db/repositories/sites";
import type { Json, Scan, ScanLimitations } from "@/lib/db/types";
import { summarize } from "@/lib/report/summary";
import { canStartScan } from "./billing-limits";
import { createSafeFetch, dnsResolver, platformFetch, validateTargetUrl, type HostResolver } from "./target";

/**
 * The scan pipeline (spec 3.1–3.3), run inside one request:
 * validate the target -> enforce limits -> scan row (queued -> running) ->
 * crawl -> checks -> persist pages, findings, summary and limitations ->
 * agent event. A failure after the row exists marks the scan failed with a
 * message for the report page; it never throws past that point.
 */

export { isPrivateAddress, validateTargetUrl, type TargetCheck } from "./target";

/** Anonymous scans per requester (IP + UTC day). */
export const ANONYMOUS_DAILY_LIMIT = 3;
/** A queued or running scan older than this was killed with its request (maxDuration is 300 s). */
export const STALE_SCAN_MS = 10 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Errors the route maps to responses                                  */
/* ------------------------------------------------------------------ */

/** Bad input from the requester (URL, site); nothing was created. */
export class ScanInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanInputError";
  }
}

export type ScanLimitKind = "anonymous_daily" | "plan_monthly";

/** Over a scan limit; nothing was created. */
export class ScanLimitError extends Error {
  constructor(
    readonly kind: ScanLimitKind,
    readonly limit: number,
    readonly resetsAt: Date,
    message: string,
  ) {
    super(message);
    this.name = "ScanLimitError";
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Stable identity of a finding across scans of a site (the repository's fingerprint). */
export function fingerprintFor(finding: Pick<Finding, "code" | "status" | "evidence">): string {
  return findingsRepo.findingFingerprint(finding);
}

/** SHA-256 of the IP and the UTC day: anonymous scans are counted per day without storing the IP. */
export function requesterHash(ip: string, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip.trim().toLowerCase()}|${day}`).digest("hex");
}

/** Client IP from `x-forwarded-for` (first entry, set by the platform's proxy), else `x-real-ip`. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || "unknown";
}

function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export type Requester = {
  /** Client IP; only hashed, never stored. Required for anonymous scans. */
  ip?: string | null;
  /** Signed-in organization; null or omitted for an anonymous scan. */
  orgId?: string | null;
  siteId?: string | null;
  /** Better Auth user id, for the audit trail. */
  userId?: string | null;
};

export type ScanAllowance = { requesterHash: string | null };

/**
 * Throws ScanLimitError when the requester is over their limit:
 * anonymous 3 a day per IP; Free orgs 5 per UTC calendar month (failed scans
 * excluded, see billing-limits.ts); Pro unlimited.
 */
export async function assertScanAllowed(requester: Requester, now: Date): Promise<ScanAllowance> {
  if (!requester.orgId) {
    const hash = requesterHash(requester.ip || "unknown", now);
    const used = await scansExtra.countAnonymousByRequesterHash(hash);
    if (used >= ANONYMOUS_DAILY_LIMIT) {
      throw new ScanLimitError(
        "anonymous_daily",
        ANONYMOUS_DAILY_LIMIT,
        nextUtcMidnight(now),
        `You have used today's ${ANONYMOUS_DAILY_LIMIT} free scans. Try again tomorrow, or create a free account for 5 scans a month and scan history.`,
      );
    }
    return { requesterHash: hash };
  }
  const org = await organizationsRepo.getById(requester.orgId);
  if (!org) throw new ScanInputError("Your organization could not be found. Sign in again.");
  const verdict = await canStartScan(org.id, org.plan, now);
  if (!verdict.ok) {
    throw new ScanLimitError("plan_monthly", verdict.quota.limit ?? 0, verdict.quota.resetsAt, verdict.reason);
  }
  return { requesterHash: null };
}

/** The org's site for this URL: the given one (must match the host), else an existing site with the same host. */
async function resolveSite(orgId: string, siteId: string | null | undefined, url: string): Promise<string | null> {
  const { hostname } = sitesRepo.normaliseSiteUrl(url);
  if (siteId) {
    const site = await sitesRepo.getById(orgId, siteId);
    if (!site) throw new ScanInputError("That site does not exist in your organization.");
    if (site.hostname !== hostname) throw new ScanInputError(`That URL is not on ${site.hostname}.`);
    return site.id;
  }
  const match = (await sitesRepo.listForOrg(orgId)).find((s) => s.hostname === hostname);
  return match?.id ?? null;
}

function combineMeta(metas: readonly CallMeta[]): CallMeta | undefined {
  if (metas.length === 0) return undefined;
  return {
    model: [...new Set(metas.map((m) => m.model))].join(","),
    promptVersion: metas[0].promptVersion,
    tokensIn: metas.reduce((n, m) => n + m.tokensIn, 0),
    tokensOut: metas.reduce((n, m) => n + m.tokensOut, 0),
    latencyMs: metas.reduce((n, m) => n + m.latencyMs, 0),
    attempts: metas.reduce((n, m) => n + m.attempts, 0),
  };
}

function limitationsOf(crawl: CrawlResult): ScanLimitations {
  return {
    jsRenderedSuspected: crawl.jsRenderedSuspected,
    robotsBlocked: crawl.robotsBlocked,
    errors: crawl.errors,
  };
}

/** Why nothing could be checked, in words for the report page; null when at least one page loaded. */
function crawlFailure(crawl: CrawlResult): string | null {
  if (crawl.pages.some((p) => p.statusCode >= 200 && p.statusCode < 300)) return null;
  if (crawl.robotsBlocked.includes(crawl.startUrl)) {
    return "The store's robots.txt does not allow ConformlyBot to fetch the homepage, so nothing was scanned.";
  }
  const home = crawl.pages[0];
  if (home) return `The homepage answered with HTTP ${home.statusCode}, so there was nothing to check.`;
  const error = crawl.errors.find((e) => e.url === crawl.startUrl) ?? crawl.errors.at(-1);
  return error ? `The homepage could not be loaded: ${error.message.replace(/\.+$/, "")}.` : "The homepage could not be loaded.";
}

const INTERNAL_FAILURE =
  "The scan stopped because of an internal error, so nothing about this store was concluded. Try again in a few minutes.";

/* ------------------------------------------------------------------ */
/* startScan                                                           */
/* ------------------------------------------------------------------ */

export type StartScanInput = {
  url: string;
  requester: Requester;
  now?: Date;
  /**
   * "monitor": a scheduled re-scan of a monitored site. Skips the plan's
   * monthly quota (a separate entitlement) and logs as the cron.
   */
  trigger?: "user" | "monitor";
  /** Tests: a fake fetch. Default: the platform fetch with DNS checks. Always wrapped by the target guard. */
  fetchImpl?: FetchLike;
  /** Default: DNS when using the platform fetch, none with an injected fetch. */
  resolveHost?: HostResolver | null;
  /** Default: the LLM classifier when a model key is configured, else none (green_claims may be unknown). null forces none. */
  classifier?: ClaimClassifier | null;
  /** Tests: shorter per-page timeout. */
  perPageTimeoutMs?: number;
};

export type StartScanResult = { publicId: string; scanId: string; status: "done" | "failed" };

export async function startScan(input: StartScanInput): Promise<StartScanResult> {
  const now = input.now ?? new Date();
  const target = validateTargetUrl(input.url);
  if (!target.ok) throw new ScanInputError(target.reason);

  const orgId = input.requester.orgId ?? null;
  const trigger = input.trigger ?? "user";
  if (!orgId && input.requester.siteId) throw new ScanInputError("Sign in to scan one of your sites.");

  const allowance =
    trigger === "monitor" && orgId ? { requesterHash: null } : await assertScanAllowed(input.requester, now);
  const siteId = orgId ? await resolveSite(orgId, input.requester.siteId, target.url) : null;

  const scan = await scansRepo.create(orgId, { url: target.url, siteId, requesterHash: allowance.requesterHash });
  const db = await getDb();
  const actor = trigger === "monitor" ? "cron" : "agent";
  const metas: CallMeta[] = [];

  const fail = async (message: string, extra: { limitations?: ScanLimitations; pagesCrawled?: number; cause?: string } = {}) => {
    await scansRepo.finish(orgId, scan.id, {
      status: "failed",
      error: message,
      limitations: extra.limitations ?? null,
      pagesCrawled: extra.pagesCrawled ?? 0,
    });
    await logAgentEvent(db, {
      orgId,
      actor,
      type: "scan.failed",
      entityType: "scan",
      entityId: scan.id,
      input: { url: target.url, trigger },
      output: { error: message, ...(extra.cause ? { cause: extra.cause } : {}) },
      meta: combineMeta(metas),
    });
    return { publicId: scan.publicId, scanId: scan.id, status: "failed" as const };
  };

  try {
    await scansRepo.setStatus(orgId, scan.id, "running");

    const usingPlatform = !input.fetchImpl;
    const resolveHost = input.resolveHost === undefined ? (usingPlatform ? dnsResolver : undefined) : (input.resolveHost ?? undefined);
    const fetchImpl = createSafeFetch(input.fetchImpl ?? platformFetch, { resolveHost });
    const crawl = await crawlSite(target.url, {
      fetchImpl,
      maxPages: DEFAULT_MAX_PAGES,
      userAgent: DEFAULT_USER_AGENT,
      ...(input.perPageTimeoutMs ? { perPageTimeoutMs: input.perPageTimeoutMs } : {}),
    });
    const limitations = limitationsOf(crawl);
    if (crawl.pages.length > 0) await scansRepo.addPages(orgId, scan.id, crawl.pages);

    const failure = crawlFailure(crawl);
    if (failure) return await fail(failure, { limitations, pagesCrawled: crawl.pages.length });

    const classifier =
      input.classifier !== undefined
        ? (input.classifier ?? undefined)
        : hasPrimary() || hasFallback()
          ? createLlmClaimClassifier((meta) => metas.push(meta))
          : undefined;
    const findings = await runChecks(buildCheckContext(crawl, now), classifier ? { claimClassifier: classifier } : {});
    const modelMeta = combineMeta(metas);
    const rows = findings.map((finding) => {
      const meta = finding.code === "green_claims" && modelMeta ? { ...finding.meta, llm: modelMeta } : finding.meta;
      return { ...finding, ...(meta ? { meta } : {}), fingerprint: fingerprintFor(finding) };
    });
    await findingsRepo.bulkInsert(orgId, scan.id, rows);

    const summary = summarize(findings);
    await scansRepo.finish(orgId, scan.id, { status: "done", summary, pagesCrawled: crawl.pages.length, limitations });
    await logAgentEvent(db, {
      orgId,
      actor,
      type: "scan.completed",
      entityType: "scan",
      entityId: scan.id,
      input: { url: target.url, trigger, classifier: classifier ? (input.classifier ? "injected" : "llm") : "none" },
      output: {
        summary: { issues: summary.issues, warnings: summary.warnings, unknowns: summary.unknowns, passes: summary.passes },
        pagesCrawled: crawl.pages.length,
        robotsBlocked: crawl.robotsBlocked.length,
        errors: crawl.errors.length,
        jsRenderedSuspected: crawl.jsRenderedSuspected,
        durationMs: crawl.durationMs,
      } satisfies Json,
      meta: modelMeta,
    });
    return { publicId: scan.publicId, scanId: scan.id, status: "done" };
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    console.error("[scan] failed", scan.id, cause);
    try {
      return await fail(INTERNAL_FAILURE, { cause });
    } catch (finishError) {
      console.error("[scan] could not mark the scan failed", scan.id, finishError);
      return { publicId: scan.publicId, scanId: scan.id, status: "failed" };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export const STALE_SCAN_MESSAGE =
  "This scan did not finish within the time limit, so nothing about this store was concluded. Run it again.";

/**
 * A queued or running scan whose request died (timeout, deploy) would stay
 * "running" forever; past STALE_SCAN_MS it is marked failed on read.
 */
export async function expireIfStale(scan: Scan, now: Date = new Date()): Promise<Scan> {
  if (scan.status !== "queued" && scan.status !== "running") return scan;
  const since = (scan.startedAt ?? scan.createdAt).getTime();
  if (now.getTime() - since < STALE_SCAN_MS) return scan;
  const updated = await scansRepo.finish(scan.orgId, scan.id, { status: "failed", error: STALE_SCAN_MESSAGE });
  return updated ?? scan;
}

export type ScanStatusView = Pick<Scan, "status" | "publicId" | "hostname" | "url" | "createdAt">;

/** For polling: the scan's status by share id (stale scans expired), or null. */
export async function getScanStatus(publicId: string, now: Date = new Date()): Promise<ScanStatusView | null> {
  // A queued or running scan has no pages or findings yet, so this stays a light read while polling.
  const report = await scansRepo.getByPublicId(publicId);
  if (!report) return null;
  const scan = await expireIfStale(report.scan, now);
  return { status: scan.status, publicId: scan.publicId, hostname: scan.hostname, url: scan.url, createdAt: scan.createdAt };
}
