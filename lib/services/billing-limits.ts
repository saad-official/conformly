import "server-only";
import * as scansExtra from "@/lib/db/repositories/scans-extra";
import * as sitesExtra from "@/lib/db/repositories/sites-extra";
import type { Plan, Site } from "@/lib/db/types";

/**
 * Plan limits (spec 2). Free: 5 scans a calendar month (UTC), 1 monitored
 * site. Pro: unlimited scans, 10 monitored sites, change-alert emails.
 * Failed scans do not count towards the monthly quota.
 */

export type PlanLimits = {
  /** null = unlimited. */
  scansPerMonth: number | null;
  monitoredSites: number;
  /** Email on monitor changes (Free monitors are re-scanned, the change is recorded, no email). */
  changeAlertEmails: boolean;
};

export const PLAN_LIMITS: Readonly<Record<Plan, PlanLimits>> = {
  free: { scansPerMonth: 5, monitoredSites: 1, changeAlertEmails: false },
  pro: { scansPerMonth: null, monitoredSites: 10, changeAlertEmails: true },
};

/** Monitor interval in v1: fixed. */
export const MONITOR_INTERVAL_DAYS = 30;

/** The daily cron's hour (vercel.json: "0 6 * * *"). */
export const CRON_HOUR_UTC = 6;

/**
 * When the daily cron will next re-scan a monitored site: the first 06:00 UTC
 * run at or after `lastScanAt + intervalDays` (and not in the past). A site
 * never scanned is due at the next run.
 */
export function nextMonitorRun(lastScanAt: Date | null, intervalDays: number, now: Date): Date {
  const dueAt = lastScanAt ? new Date(lastScanAt.getTime() + intervalDays * 24 * 60 * 60 * 1000) : now;
  const from = dueAt.getTime() > now.getTime() ? dueAt : now;
  const run = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), CRON_HOUR_UTC));
  if (run.getTime() < from.getTime()) run.setUTCDate(run.getUTCDate() + 1);
  return run;
}

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

/** First instant of the UTC calendar month containing `now`. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** First instant of the next UTC calendar month. */
export function nextMonthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export type ScanQuota = {
  used: number;
  /** null = unlimited. */
  limit: number | null;
  /** null = unlimited. */
  remaining: number | null;
  periodStart: Date;
  resetsAt: Date;
};

export async function getScanQuota(orgId: string, plan: Plan, now: Date = new Date()): Promise<ScanQuota> {
  const periodStart = monthStartUtc(now);
  const used = await scansExtra.countCreatedSince(orgId, periodStart);
  const limit = limitsFor(plan).scansPerMonth;
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    periodStart,
    resetsAt: nextMonthStartUtc(now),
  };
}

/**
 * For the scan service: may this org start another scan now? Monitor
 * re-scans started by the cron are a separate entitlement and should not be
 * checked against this quota.
 */
export async function canStartScan(
  orgId: string,
  plan: Plan,
  now: Date = new Date(),
): Promise<{ ok: true; quota: ScanQuota } | { ok: false; quota: ScanQuota; reason: string }> {
  const quota = await getScanQuota(orgId, plan, now);
  if (quota.remaining === null || quota.remaining > 0) return { ok: true, quota };
  return {
    ok: false,
    quota,
    reason: `The Free plan includes ${quota.limit} scans a month and this month's are used. Upgrade to Pro for unlimited scans.`,
  };
}

export type MonitorCapacity = { used: number; limit: number };

export async function getMonitorCapacity(orgId: string, plan: Plan): Promise<MonitorCapacity> {
  return { used: await sitesExtra.countMonitored(orgId), limit: limitsFor(plan).monitoredSites };
}

/**
 * Before turning monitoring on for `siteId`. Returns an error message when the
 * plan's monitored-site limit is already reached (the site itself excluded,
 * so re-enabling an already monitored site is fine).
 */
export async function checkCanEnableMonitor(orgId: string, plan: Plan, siteId: string): Promise<string | null> {
  const monitored = await sitesExtra.listMonitored(orgId);
  const others = monitored.filter((s) => s.id !== siteId).length;
  const limit = limitsFor(plan).monitoredSites;
  if (others < limit) return null;
  return plan === "free"
    ? `The Free plan monitors ${limit} site. Turn monitoring off on the other site, or upgrade to Pro for ${PLAN_LIMITS.pro.monitoredSites}.`
    : `Pro monitors up to ${limit} sites. Turn monitoring off on another site first.`;
}

/**
 * Monitored sites the plan actually covers: the oldest `limit` monitored
 * sites. After a downgrade the extras keep their flag but are not re-scanned.
 */
export function eligibleMonitoredSiteIds(monitored: readonly Pick<Site, "id" | "createdAt">[], plan: Plan): Set<string> {
  const ordered = [...monitored].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  return new Set(ordered.slice(0, limitsFor(plan).monitoredSites).map((s) => s.id));
}
