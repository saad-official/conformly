import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { alerts } from "../schema";
import type { Alert } from "../types";
import { assertScanInOrg } from "./scans";
import { assertSiteInOrg, clampLimit } from "./shared";

export type InsertAlertInput = {
  siteId: string;
  scanId?: string | null;
  kind: string;
  payload?: Record<string, unknown>;
  sentAt?: Date | null;
};

export async function insert(orgId: string, input: InsertAlertInput): Promise<Alert> {
  const db = await getDb();
  await assertSiteInOrg(db, orgId, input.siteId);
  if (input.scanId) await assertScanInOrg(orgId, input.scanId);
  const [row] = await db
    .insert(alerts)
    .values({
      orgId,
      siteId: input.siteId,
      scanId: input.scanId ?? null,
      kind: input.kind,
      payload: input.payload ?? {},
      sentAt: input.sentAt ?? null,
    })
    .returning();
  return row;
}

export async function listForOrg(orgId: string, options: { limit?: number } = {}): Promise<Alert[]> {
  const db = await getDb();
  return db
    .select()
    .from(alerts)
    .where(eq(alerts.orgId, orgId))
    .orderBy(desc(alerts.createdAt))
    .limit(clampLimit(options.limit));
}
