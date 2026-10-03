import "server-only";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../client";
import { scans, sites } from "../schema";
import type { Site } from "../types";
import { clampLimit } from "./shared";

export async function listForOrg(orgId: string): Promise<Site[]> {
  const db = await getDb();
  return db.select().from(sites).where(eq(sites.orgId, orgId)).orderBy(asc(sites.hostname));
}

export async function getById(orgId: string, siteId: string): Promise<Site | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId)))
    .limit(1);
  return row ?? null;
}

/** Normalises a storefront URL to `https://host/` form and returns its hostname. */
export function normaliseSiteUrl(input: string): { url: string; hostname: string } {
  const raw = input.trim();
  const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http and https URLs can be scanned.");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  return { url: `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname}`, hostname };
}

export type CreateSiteInput = {
  url: string;
  platformGuess?: string | null;
  monitorEnabled?: boolean;
  monitorIntervalDays?: number;
};

export async function create(orgId: string, input: CreateSiteInput): Promise<Site> {
  const { url, hostname } = normaliseSiteUrl(input.url);
  const db = await getDb();
  const [row] = await db
    .insert(sites)
    .values({
      orgId,
      url,
      hostname,
      platformGuess: input.platformGuess ?? null,
      monitorEnabled: input.monitorEnabled ?? false,
      monitorIntervalDays: input.monitorIntervalDays ?? 30,
    })
    .returning();
  return row;
}

export type UpdateSiteInput = {
  url?: string;
  platformGuess?: string | null;
  lastScanId?: string | null;
};

export async function update(orgId: string, siteId: string, patch: UpdateSiteInput): Promise<Site | null> {
  const values: Partial<Site> = {};
  if (patch.url !== undefined) Object.assign(values, normaliseSiteUrl(patch.url));
  if (patch.platformGuess !== undefined) values.platformGuess = patch.platformGuess;
  if (patch.lastScanId !== undefined) values.lastScanId = patch.lastScanId;
  if (Object.keys(values).length === 0) return getById(orgId, siteId);
  const db = await getDb();
  const [row] = await db
    .update(sites)
    .set(values)
    .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId)))
    .returning();
  return row ?? null;
}

export async function setMonitor(
  orgId: string,
  siteId: string,
  enabled: boolean,
  intervalDays?: number,
): Promise<Site | null> {
  const values: Partial<Site> = { monitorEnabled: enabled };
  if (intervalDays !== undefined) {
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
      throw new Error("Monitor interval must be a whole number of days between 1 and 365.");
    }
    values.monitorIntervalDays = intervalDays;
  }
  const db = await getDb();
  const [row] = await db
    .update(sites)
    .set(values)
    .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId)))
    .returning();
  return row ?? null;
}

/**
 * Cron (spec 3.5), across all organizations: monitored sites whose last scan
 * finished at least `monitor_interval_days` before `now`, or that were never
 * scanned. Sites with a scan still queued or running are skipped. Oldest
 * first. Plan limits are the caller's business.
 */
export async function listDueForMonitoring(now: Date, limit?: number): Promise<Site[]> {
  const db = await getDb();
  const lastScannedAt = sql`coalesce(${scans.finishedAt}, ${scans.startedAt}, ${scans.createdAt})`;
  const rows = await db
    .select({ site: sites })
    .from(sites)
    .leftJoin(scans, eq(scans.id, sites.lastScanId))
    .where(
      and(
        eq(sites.monitorEnabled, true),
        or(
          isNull(scans.id),
          and(
            inArray(scans.status, ["done", "failed"]),
            sql`${lastScannedAt} <= ${now.toISOString()}::timestamptz - make_interval(days => ${sites.monitorIntervalDays})`,
          ),
        ),
      ),
    )
    .orderBy(sql`${lastScannedAt} asc nulls first`, asc(sites.createdAt))
    .limit(clampLimit(limit));
  return rows.map((r) => r.site);
}
