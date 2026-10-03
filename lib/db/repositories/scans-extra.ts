import "server-only";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "../client";
import { scans } from "../schema";
import type { Scan } from "../types";

/**
 * Scan queries for the signed-in screens and the monitor that the original
 * scans repository does not cover. Every function is scoped by `orgId`.
 */

/** Org scans created at or after `since`; failed scans are excluded (they do not use quota). */
export async function countCreatedSince(orgId: string, since: Date): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(scans)
    .where(and(eq(scans.orgId, orgId), gte(scans.createdAt, since), ne(scans.status, "failed")));
  return row?.n ?? 0;
}

/**
 * The latest `perSite` finished (`done`) scans of every site in the org,
 * newest first within each site. Feeds the dashboard rows and trend arrows.
 */
export async function listLatestDonePerSite(orgId: string, perSite = 2): Promise<Scan[]> {
  const db = await getDb();
  const ranked = db
    .select({
      id: scans.id,
      rank: sql<number>`row_number() over (partition by ${scans.siteId} order by ${scans.finishedAt} desc nulls last, ${scans.createdAt} desc)`.as(
        "rank",
      ),
    })
    .from(scans)
    .where(and(eq(scans.orgId, orgId), isNotNull(scans.siteId), eq(scans.status, "done")))
    .as("ranked");
  const rows = await db
    .select({ scan: scans })
    .from(scans)
    .innerJoin(ranked, eq(ranked.id, scans.id))
    .where(lte(ranked.rank, perSite))
    .orderBy(scans.siteId, sql`${scans.finishedAt} desc nulls last`, desc(scans.createdAt));
  return rows.map((r) => r.scan);
}

/** The site's latest `done` scans, newest first. */
export async function listDoneForSite(orgId: string, siteId: string, limit = 2): Promise<Scan[]> {
  const db = await getDb();
  return db
    .select()
    .from(scans)
    .where(and(eq(scans.orgId, orgId), eq(scans.siteId, siteId), eq(scans.status, "done")))
    .orderBy(sql`${scans.finishedAt} desc nulls last`, desc(scans.createdAt))
    .limit(Math.max(1, Math.min(Math.floor(limit), 50)));
}

/** An org scan by its share id, without pages or findings. */
export async function getByPublicIdInOrg(orgId: string, publicId: string): Promise<Scan | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(scans)
    .where(and(eq(scans.orgId, orgId), eq(scans.publicId, publicId)))
    .limit(1);
  return row ?? null;
}

/** Org scans by id (any status). */
export async function listByIds(orgId: string, ids: readonly string[]): Promise<Scan[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  return db
    .select()
    .from(scans)
    .where(and(eq(scans.orgId, orgId), inArray(scans.id, [...ids])));
}

/**
 * Anonymous rate limiting (lib/services/scan.ts), the one query here that is
 * not org-scoped: anonymous scans (org_id null) recorded under a requester
 * hash. The hash already includes the UTC day, so no time filter is needed.
 * Every status counts, failed scans included: the limit protects the crawler.
 */
export async function countAnonymousByRequesterHash(requesterHash: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(scans)
    .where(and(isNull(scans.orgId), eq(scans.requesterHash, requesterHash)));
  return row?.n ?? 0;
}
