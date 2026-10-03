import "server-only";
import { logAgentEvent } from "@/lib/ai/log";
import { CHECK_DEFINITIONS } from "@/lib/checks";
import { CHECK_CODES, type CheckCode, type FindingStatus, type Severity } from "@/lib/checks/types";
import { getDb } from "@/lib/db/client";
import * as alertsRepo from "@/lib/db/repositories/alerts";
import * as findingsRepo from "@/lib/db/repositories/findings";
import * as membersRepo from "@/lib/db/repositories/members";
import {
  MONITOR_PROCESSED,
  MONITOR_STARTED,
  listPendingMonitorScans,
  type PendingMonitorScan,
} from "@/lib/db/repositories/monitor-events";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import * as outboxRepo from "@/lib/db/repositories/outbox";
import * as scansRepo from "@/lib/db/repositories/scans";
import * as scansExtra from "@/lib/db/repositories/scans-extra";
import * as sitesRepo from "@/lib/db/repositories/sites";
import * as sitesExtra from "@/lib/db/repositories/sites-extra";
import type { FindingRow, Organization, Scan, Site } from "@/lib/db/types";
import { getEmailProvider, type EmailProvider } from "@/lib/email/provider";
import { publicEnv } from "@/lib/env";
import { startScan as defaultStartScan } from "@/lib/services/scan";
import { eligibleMonitoredSiteIds, limitsFor } from "./billing-limits";

/**
 * Monitor (spec 3.4, 3.5). The daily cron calls `runMonitorTick(now)`:
 *
 * 1. Due sites (monitor on, last scan older than the interval, covered by the
 *    org's plan) get a re-scan through the scan service, at most
 *    MONITOR_SCANS_PER_TICK per run. Each start is logged as
 *    `monitor.scan_started` with the previous finished scan.
 * 2. Every started re-scan that has finished (this tick or an earlier one) is
 *    diffed against that previous scan. Changes become an `alerts` row; Pro
 *    orgs also get an email to the owner (Outbox provider by default),
 *    recorded in `outbox`. The scan is then logged `monitor.scan_processed`.
 * 3. Anonymous scans older than 30 days are purged.
 */

export const MONITOR_SCANS_PER_TICK = 5;
export const ANONYMOUS_RETENTION_DAYS = 30;
/** Started re-scans older than this are no longer waited for. */
export const PENDING_WINDOW_DAYS = 14;
/**
 * Stop starting scans after this much wall time. The scan service runs a scan
 * inline (up to 12 pages, 10 s each), so this leaves room for the last one
 * under the route's maxDuration (300 s).
 */
export const START_BUDGET_MS = 150_000;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Diff (pure)
// ---------------------------------------------------------------------------

export type DiffableFinding = Pick<FindingRow, "checkCode" | "fingerprint" | "status" | "severity" | "title">;

export type FindingChange = {
  checkCode: CheckCode;
  title: string;
  severity: Severity;
  before: FindingStatus | null;
  after: FindingStatus | null;
};

export type ScanDiff = {
  /** Was not a fail or warning, now is. */
  new: FindingChange[];
  /** Was a fail or warning, now passes (or the check no longer reports). */
  resolved: FindingChange[];
  /** Status moved otherwise (fail ↔ warn, to or from unknown), or the evidence pages of a problem changed. */
  changed: FindingChange[];
  unchanged: number;
};

const isProblem = (status: FindingStatus | null | undefined) => status === "fail" || status === "warn";

/**
 * Compares two scans of the same site check by check (each check reports one
 * finding per scan), using status and the finding fingerprint (check, status,
 * evidence URLs).
 */
export function diffFindings(previous: readonly DiffableFinding[], current: readonly DiffableFinding[]): ScanDiff {
  const before = new Map<CheckCode, DiffableFinding>();
  const after = new Map<CheckCode, DiffableFinding>();
  for (const f of previous) if (!before.has(f.checkCode)) before.set(f.checkCode, f);
  for (const f of current) if (!after.has(f.checkCode)) after.set(f.checkCode, f);

  const diff: ScanDiff = { new: [], resolved: [], changed: [], unchanged: 0 };
  const codes = [
    ...CHECK_CODES.filter((c) => before.has(c) || after.has(c)),
    ...[...new Set([...before.keys(), ...after.keys()])].filter((c) => !CHECK_CODES.includes(c)),
  ];
  for (const code of codes) {
    const b = before.get(code);
    const a = after.get(code);
    const ref = a ?? b!;
    const change: FindingChange = {
      checkCode: code,
      title: ref.title || CHECK_DEFINITIONS[code]?.title || code,
      severity: ref.severity,
      before: b?.status ?? null,
      after: a?.status ?? null,
    };
    if (!isProblem(change.before) && isProblem(change.after)) diff.new.push(change);
    else if (isProblem(change.before) && (change.after === "pass" || change.after === null)) diff.resolved.push(change);
    else if (!b || !a) diff.unchanged += 1;
    else if (b.status !== a.status || (isProblem(a.status) && b.fingerprint !== a.fingerprint)) diff.changed.push(change);
    else diff.unchanged += 1;
  }
  return diff;
}

export function hasChanges(diff: ScanDiff): boolean {
  return diff.new.length + diff.resolved.length + diff.changed.length > 0;
}

// ---------------------------------------------------------------------------
// Alert email
// ---------------------------------------------------------------------------

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const STATUS_LABEL: Record<FindingStatus, string> = { fail: "issue", warn: "warning", unknown: "unknown", pass: "pass" };
const label = (s: FindingStatus | null) => (s ? STATUS_LABEL[s] : "not reported");

export function buildAlertEmail(input: {
  hostname: string;
  diff: ScanDiff;
  reportUrl: string;
  siteUrl: string;
}): { subject: string; text: string; html: string } {
  const { hostname, diff, reportUrl, siteUrl } = input;
  const parts = [
    diff.new.length ? `${diff.new.length} new` : null,
    diff.resolved.length ? `${diff.resolved.length} resolved` : null,
    diff.changed.length ? `${diff.changed.length} changed` : null,
  ].filter(Boolean);
  const subject = `${hostname}: ${parts.join(", ")} since the last scan`;

  const sections: Array<[string, FindingChange[]]> = [
    ["New", diff.new],
    ["Resolved", diff.resolved],
    ["Changed", diff.changed],
  ];
  const textLines = [`The monthly re-scan of ${hostname} found changes since the previous scan.`, ""];
  let html = `<p>The monthly re-scan of <strong>${escapeHtml(hostname)}</strong> found changes since the previous scan.</p>`;
  for (const [heading, items] of sections) {
    if (items.length === 0) continue;
    textLines.push(`${heading}:`);
    html += `<h3 style="font:600 15px system-ui;margin:16px 0 4px">${heading}</h3><ul>`;
    for (const c of items) {
      const line = `${c.title} (${c.checkCode}): ${label(c.before)} → ${label(c.after)}`;
      textLines.push(`- ${line}`);
      html += `<li>${escapeHtml(c.title)} <code>${escapeHtml(c.checkCode)}</code>: ${label(c.before)} → ${label(c.after)}</li>`;
    }
    html += "</ul>";
    textLines.push("");
  }
  textLines.push(`Full report: ${reportUrl}`, `Site history: ${siteUrl}`, "", "Issues found, with citations. Not legal advice.");
  html += `<p><a href="${escapeHtml(reportUrl)}">Open the full report</a> · <a href="${escapeHtml(siteUrl)}">Site history</a></p>`;
  html += `<p style="color:#667085;font-size:12px">Issues found, with citations. Not legal advice.</p>`;
  return { subject, text: textLines.join("\n"), html };
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

/** The scan service's entry point (lib/services/scan.ts). */
export type StartScanFn = typeof defaultStartScan;

export type MonitorDeps = {
  startScan?: StartScanFn;
  emailProvider?: EmailProvider;
  appUrl?: string;
  /** Wall-clock budget for starting scans, in ms. */
  startBudgetMs?: number;
};

export type ProcessOutcome =
  | "alerted"
  | "alerted_no_email"
  | "unchanged"
  | "baseline"
  | "scan_failed"
  | "site_deleted";

export type MonitorTickSummary = {
  ok: true;
  now: string;
  due: number;
  started: Array<{ siteId: string; hostname: string; publicId: string }>;
  skipped: Array<{ siteId: string; reason: "over_plan_limit" | "scan_in_progress" | "per_run_cap" | "time_budget" }>;
  processed: Array<{ scanId: string; siteId: string | null; outcome: ProcessOutcome; alertId?: string; emailed?: boolean }>;
  /** Started re-scans still queued or running. */
  pending: number;
  purgedAnonymousScans: number;
  errors: Array<{ siteId?: string; scanId?: string; message: string }>;
  durationMs: number;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runMonitorTick(now: Date, deps: MonitorDeps = {}): Promise<MonitorTickSummary> {
  const t0 = Date.now();
  const startScan = deps.startScan ?? defaultStartScan;
  const budget = deps.startBudgetMs ?? START_BUDGET_MS;
  const db = await getDb();
  const summary: MonitorTickSummary = {
    ok: true,
    now: now.toISOString(),
    due: 0,
    started: [],
    skipped: [],
    processed: [],
    pending: 0,
    purgedAnonymousScans: 0,
    errors: [],
    durationMs: 0,
  };
  // agent_events are stamped by the database clock; a simulated `now` ahead of it must not hide them.
  const pendingSince = new Date(Math.min(now.getTime(), Date.now()) - PENDING_WINDOW_DAYS * DAY_MS);

  // 1. Start re-scans for due sites.
  const inFlight = new Set(
    (await listPendingMonitorScans(pendingSince))
      .filter((p) => p.status === "queued" || p.status === "running")
      .map((p) => p.siteId)
      .filter((id): id is string => Boolean(id)),
  );
  const due = await sitesRepo.listDueForMonitoring(now, 100);
  summary.due = due.length;
  const orgs = new Map<string, { org: Organization | null; eligible: Set<string> }>();

  for (const site of due) {
    if (inFlight.has(site.id)) {
      summary.skipped.push({ siteId: site.id, reason: "scan_in_progress" });
      continue;
    }
    let entry = orgs.get(site.orgId);
    if (!entry) {
      const org = await organizationsRepo.getById(site.orgId);
      const monitored = org ? await sitesExtra.listMonitored(site.orgId) : [];
      entry = { org, eligible: org ? eligibleMonitoredSiteIds(monitored, org.plan) : new Set() };
      orgs.set(site.orgId, entry);
    }
    if (!entry.org || !entry.eligible.has(site.id)) {
      summary.skipped.push({ siteId: site.id, reason: "over_plan_limit" });
      continue;
    }
    if (summary.started.length >= MONITOR_SCANS_PER_TICK) {
      summary.skipped.push({ siteId: site.id, reason: "per_run_cap" });
      continue;
    }
    if (Date.now() - t0 > budget) {
      summary.skipped.push({ siteId: site.id, reason: "time_budget" });
      continue;
    }
    try {
      await startOne(site, now, startScan, summary);
    } catch (error) {
      summary.errors.push({ siteId: site.id, message: message(error) });
      await logAgentEvent(db, {
        orgId: site.orgId,
        actor: "cron",
        type: "monitor.scan_start_failed",
        entityType: "site",
        entityId: site.id,
        output: { error: message(error) },
      });
    }
  }

  // 2. Diff and alert every finished re-scan (this tick's, if the scan service ran it inline, and earlier ones).
  const pending = await listPendingMonitorScans(pendingSince);
  for (const p of pending) {
    if (p.status === "queued" || p.status === "running") {
      summary.pending += 1;
      continue;
    }
    try {
      summary.processed.push(await processFinished(p, deps));
    } catch (error) {
      summary.errors.push({ scanId: p.scanId, siteId: p.siteId ?? undefined, message: message(error) });
    }
  }

  // 3. Retention: anonymous scans are kept 30 days.
  try {
    summary.purgedAnonymousScans = await scansRepo.purgeAnonymousOlderThan(ANONYMOUS_RETENTION_DAYS, now);
  } catch (error) {
    summary.errors.push({ message: `purge: ${message(error)}` });
  }

  summary.durationMs = Date.now() - t0;
  return summary;
}

async function startOne(site: Site, now: Date, startScan: StartScanFn, summary: MonitorTickSummary): Promise<void> {
  const [previous] = await scansExtra.listDoneForSite(site.orgId, site.id, 1);
  const { publicId } = await startScan({
    url: site.url,
    requester: { ip: "cron", orgId: site.orgId, siteId: site.id },
    now,
    // Monitor re-scans are their own entitlement: they skip the monthly scan quota.
    trigger: "monitor",
  });
  const scan = await scansExtra.getByPublicIdInOrg(site.orgId, publicId);
  if (!scan) throw new Error(`scan ${publicId} was not created for this organization`);
  const db = await getDb();
  await logAgentEvent(db, {
    orgId: site.orgId,
    actor: "cron",
    type: MONITOR_STARTED,
    entityType: "scan",
    entityId: scan.id,
    input: { siteId: site.id, previousScanId: previous?.id ?? null, publicId },
  });
  summary.started.push({ siteId: site.id, hostname: site.hostname, publicId });
}

async function processFinished(p: PendingMonitorScan, deps: MonitorDeps): Promise<MonitorTickSummary["processed"][number]> {
  const db = await getDb();
  const done = async (outcome: ProcessOutcome, extra: { alertId?: string; emailed?: boolean; detail?: object } = {}) => {
    await logAgentEvent(db, {
      orgId: p.orgId,
      actor: "cron",
      type: MONITOR_PROCESSED,
      entityType: "scan",
      entityId: p.scanId,
      output: { outcome, alertId: extra.alertId ?? null, emailed: extra.emailed ?? false, ...(extra.detail ?? {}) },
    });
    return { scanId: p.scanId, siteId: p.siteId, outcome, alertId: extra.alertId, emailed: extra.emailed };
  };

  const site = p.siteId ? await sitesRepo.getById(p.orgId, p.siteId) : null;
  const scan = await scansRepo.getById(p.orgId, p.scanId);
  if (!site || !scan) return done("site_deleted");
  const org = await organizationsRepo.getById(p.orgId);
  if (!org) return done("site_deleted");

  const appUrl = deps.appUrl ?? publicEnv.appUrl;
  const reportUrl = joinUrl(appUrl, `/r/${scan.publicId}`);
  const siteUrl = joinUrl(appUrl, `/sites/${site.id}`);

  if (scan.status === "failed") {
    const alert = await alertsRepo.insert(p.orgId, {
      siteId: site.id,
      scanId: scan.id,
      kind: "scan_failed",
      payload: { publicId: scan.publicId, error: scan.error ?? null },
    });
    return done("scan_failed", { alertId: alert.id });
  }

  const previous = p.previousScanId ? await scansRepo.getById(p.orgId, p.previousScanId) : null;
  if (!previous || previous.status !== "done") return done("baseline");

  const [before, after] = await Promise.all([
    findingsRepo.listForScan(p.orgId, previous.id),
    findingsRepo.listForScan(p.orgId, scan.id),
  ]);
  const diff = diffFindings(before, after);
  if (!hasChanges(diff)) return done("unchanged", { detail: { unchanged: diff.unchanged } });

  return alertOnDiff({ org, site, scan, previous, diff, reportUrl, siteUrl, deps, done });
}

async function alertOnDiff(input: {
  org: Organization;
  site: Site;
  scan: Scan;
  previous: Scan;
  diff: ScanDiff;
  reportUrl: string;
  siteUrl: string;
  deps: MonitorDeps;
  done: (outcome: ProcessOutcome, extra?: { alertId?: string; emailed?: boolean }) => Promise<MonitorTickSummary["processed"][number]>;
}) {
  const { org, site, scan, previous, diff, reportUrl, siteUrl, deps, done } = input;
  const payload = {
    publicId: scan.publicId,
    previousPublicId: previous.publicId,
    hostname: site.hostname,
    counts: { new: diff.new.length, resolved: diff.resolved.length, changed: diff.changed.length },
    new: diff.new,
    resolved: diff.resolved,
    changed: diff.changed,
  };

  const ownerEmail = limitsFor(org.plan).changeAlertEmails ? await membersRepo.getOwnerEmail(org.id) : null;
  if (!ownerEmail) {
    const alert = await alertsRepo.insert(org.id, {
      siteId: site.id,
      scanId: scan.id,
      kind: "scan_diff",
      payload: { ...payload, email: limitsFor(org.plan).changeAlertEmails ? "no_owner_email" : "free_plan" },
    });
    return done("alerted_no_email", { alertId: alert.id, emailed: false });
  }

  const email = buildAlertEmail({ hostname: site.hostname, diff, reportUrl, siteUrl });
  const provider = deps.emailProvider ?? getEmailProvider();
  let sent: Awaited<ReturnType<EmailProvider["send"]>> | null = null;
  let sendError: string | null = null;
  try {
    sent = await provider.send({ to: ownerEmail, ...email });
  } catch (error) {
    sendError = message(error);
  }

  const alert = await alertsRepo.insert(org.id, {
    siteId: site.id,
    scanId: scan.id,
    kind: "scan_diff",
    payload: { ...payload, email: sent ? "sent" : "failed", ...(sendError ? { emailError: sendError } : {}) },
    sentAt: sent ? new Date() : null,
  });
  await outboxRepo.insert(org.id, {
    alertId: alert.id,
    toEmail: ownerEmail,
    subject: email.subject,
    text: email.text,
    html: email.html,
    provider: sent?.provider ?? provider.name,
    providerMessageId: sent?.providerMessageId ?? null,
    deliveredTo: sent?.deliveredTo ?? null,
    status: sent ? "sent" : "failed",
  });
  return done(sent ? "alerted" : "alerted_no_email", { alertId: alert.id, emailed: Boolean(sent) });
}
