import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { getDb } from "../client";
import { sites } from "../schema";
import type { Site } from "../types";

/**
 * Site queries the original sites repository does not cover: monitored-site
 * capacity (billing limits, cron eligibility) and deletion. Every function is
 * scoped by `orgId`.
 */

/** Monitored sites of the org, oldest first (the order plan limits keep). */
export async function listMonitored(orgId: string): Promise<Site[]> {
  const db = await getDb();
  return db
    .select()
    .from(sites)
    .where(and(eq(sites.orgId, orgId), eq(sites.monitorEnabled, true)))
    .orderBy(asc(sites.createdAt), asc(sites.id));
}

export async function countMonitored(orgId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(sites)
    .where(and(eq(sites.orgId, orgId), eq(sites.monitorEnabled, true)));
  return row?.n ?? 0;
}

/**
 * Deletes a site. Its scans stay (scans.site_id is `on delete set null`), so
 * shared report links keep working; its finding notes and alerts cascade.
 * Returns false when the site does not exist in this org.
 */
export async function deleteSite(orgId: string, siteId: string): Promise<boolean> {
  const db = await getDb();
  const deleted = await db
    .delete(sites)
    .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId)))
    .returning({ id: sites.id });
  return deleted.length > 0;
}
