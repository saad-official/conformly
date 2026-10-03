import "server-only";
import { and, asc, desc, eq, isNull, lt } from "drizzle-orm";
import type { CrawledPage } from "@/lib/crawl/types";
import type { ScanSummary } from "@/lib/report/summary";
import { getDb } from "../client";
import { findings, scanPages, scans, sites } from "../schema";
import type { Scan, ScanLimitations, ScanReport, ScanStatus } from "../types";
import { NotFoundError, assertSiteInOrg, clampLimit, isUniqueViolation, orgMatch, randomUrlSafeId } from "./shared";
import { normaliseSiteUrl } from "./sites";

/** Characters of page text kept per page (the full text is not stored). */
export const TEXT_EXCERPT_LENGTH = 1_000;

export type CreateScanInput = {
  url: string;
  siteId?: string | null;
  /** Salted hash of the requester IP (anonymous rate limiting). Never the raw IP. */
  requesterHash?: string | null;
};

/** `orgId` null creates an anonymous scan. A `siteId` must belong to `orgId`. */
export async function create(orgId: string | null, input: CreateScanInput): Promise<Scan> {
  const db = await getDb();
  const siteId = input.siteId ?? null;
  if (siteId) {
    if (orgId === null) throw new Error("Anonymous scans cannot belong to a site.");
    await assertSiteInOrg(db, orgId, siteId);
  }
  const { url, hostname } = normaliseSiteUrl(input.url);
  // 64^12 ids: a collision is astronomically unlikely, but retry rather than fail.
  for (let attempt = 0; ; attempt++) {
    try {
      const [row] = await db
        .insert(scans)
        .values({ orgId, siteId, url, hostname, publicId: randomUrlSafeId(12), requesterHash: input.requesterHash ?? null })
        .returning();
      return row;
    } catch (error) {
      if (attempt < 2 && isUniqueViolation(error, "scans_public_id_unique")) continue;
      throw error;
    }
  }
}

export async function setStatus(orgId: string | null, scanId: string, status: ScanStatus): Promise<Scan | null> {
  const db = await getDb();
  const values: Partial<Scan> = { status };
  if (status === "running") values.startedAt = new Date();
  const [row] = await db
    .update(scans)
    .set(values)
    .where(and(eq(scans.id, scanId), orgMatch(scans.orgId, orgId)))
    .returning();
  return row ?? null;
}

/** Stores the crawled pages of a scan in crawl order (homepage first). */
export async function addPages(orgId: string | null, scanId: string, pages: readonly CrawledPage[]): Promise<number> {
  if (pages.length === 0) return 0;
  const db = await getDb();
  await assertScanInOrg(orgId, scanId);
  const rows = pages.map((page, position) => {
    const { text, ...extracted } = page;
    return {
      scanId,
      url: page.url,
      finalUrl: page.finalUrl,
      kind: page.kind,
      statusCode: page.statusCode,
      title: page.title,
      textExcerpt: text.slice(0, TEXT_EXCERPT_LENGTH),
      extracted: extracted as Record<string, unknown>,
      position,
    };
  });
  await db.insert(scanPages).values(rows);
  return rows.length;
}

export type FinishScanInput = {
  status: "done" | "failed";
  summary?: ScanSummary | null;
  pagesCrawled?: number;
  limitations?: ScanLimitations | null;
  error?: string | null;
};

/** Marks the scan finished and, for a site scan, points the site at it. */
export async function finish(orgId: string | null, scanId: string, input: FinishScanInput): Promise<Scan | null> {
  const db = await getDb();
  const values: Partial<Scan> = { status: input.status, finishedAt: new Date() };
  if (input.summary !== undefined) values.summary = input.summary;
  if (input.pagesCrawled !== undefined) values.pagesCrawled = input.pagesCrawled;
  if (input.limitations !== undefined) values.limitations = input.limitations;
  if (input.error !== undefined) values.error = input.error;
  const [row] = await db
    .update(scans)
    .set(values)
    .where(and(eq(scans.id, scanId), orgMatch(scans.orgId, orgId)))
    .returning();
  if (row?.siteId && row.orgId) {
    await db
      .update(sites)
      .set({ lastScanId: row.id })
      .where(and(eq(sites.id, row.siteId), eq(sites.orgId, row.orgId)));
  }
  return row ?? null;
}

/**
 * The public report (`/r/<public_id>`): the unguessable id is the capability,
 * so this is not scoped to an organization.
 */
export async function getByPublicId(publicId: string): Promise<ScanReport | null> {
  if (!/^[A-Za-z0-9_-]{12}$/.test(publicId)) return null;
  const db = await getDb();
  const [scan] = await db.select().from(scans).where(eq(scans.publicId, publicId)).limit(1);
  if (!scan) return null;
  const [pages, rows] = await Promise.all([
    db.select().from(scanPages).where(eq(scanPages.scanId, scan.id)).orderBy(asc(scanPages.position)),
    db.select().from(findings).where(eq(findings.scanId, scan.id)).orderBy(asc(findings.position)),
  ]);
  return { scan, pages, findings: rows };
}

export async function getById(orgId: string | null, scanId: string): Promise<Scan | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(scans)
    .where(and(eq(scans.id, scanId), orgMatch(scans.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function listForOrg(orgId: string, options: { limit?: number } = {}): Promise<Scan[]> {
  const db = await getDb();
  return db
    .select()
    .from(scans)
    .where(eq(scans.orgId, orgId))
    .orderBy(desc(scans.createdAt))
    .limit(clampLimit(options.limit));
}

export async function listForSite(orgId: string, siteId: string, options: { limit?: number } = {}): Promise<Scan[]> {
  const db = await getDb();
  return db
    .select()
    .from(scans)
    .where(and(eq(scans.orgId, orgId), eq(scans.siteId, siteId)))
    .orderBy(desc(scans.createdAt))
    .limit(clampLimit(options.limit));
}

/** Deletes anonymous scans (and, by cascade, their pages and findings) older than `days`. Returns the count. */
export async function purgeAnonymousOlderThan(days: number, now: Date = new Date()): Promise<number> {
  if (!Number.isFinite(days) || days < 0) throw new Error("days must be a non-negative number");
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const db = await getDb();
  const deleted = await db
    .delete(scans)
    .where(and(isNull(scans.orgId), lt(scans.createdAt, cutoff)))
    .returning({ id: scans.id });
  return deleted.length;
}

export async function assertScanInOrg(orgId: string | null, scanId: string): Promise<Scan> {
  const scan = await getById(orgId, scanId);
  if (!scan) throw new NotFoundError("Scan");
  return scan;
}
