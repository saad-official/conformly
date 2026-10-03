import "server-only";
import { and, asc, eq, gte, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "../client";
import { agentEvents, scans } from "../schema";
import type { ScanStatus } from "../types";

/**
 * Monitor bookkeeping on the append-only agent_events log. The cron writes
 * `monitor.scan_started` (entity = the new scan, input = { siteId,
 * previousScanId }) when it starts a re-scan, and `monitor.scan_processed`
 * once that scan has been diffed and alerted. A started scan without a
 * processed event is pending; a later tick picks it up once it has finished,
 * whether the scan service runs scans inline or in the background.
 *
 * Cron only: spans every organization.
 */

export const MONITOR_STARTED = "monitor.scan_started";
export const MONITOR_PROCESSED = "monitor.scan_processed";

export type PendingMonitorScan = {
  orgId: string;
  scanId: string;
  siteId: string | null;
  previousScanId: string | null;
  status: ScanStatus;
  startedEventAt: Date;
};

export async function listPendingMonitorScans(since: Date): Promise<PendingMonitorScan[]> {
  const db = await getDb();
  const processed = alias(agentEvents, "processed");
  const rows = await db
    .select({
      orgId: agentEvents.orgId,
      scanId: scans.id,
      siteId: scans.siteId,
      input: agentEvents.input,
      status: scans.status,
      createdAt: agentEvents.createdAt,
    })
    .from(agentEvents)
    .innerJoin(scans, eq(scans.id, agentEvents.entityId))
    .where(
      and(
        eq(agentEvents.type, MONITOR_STARTED),
        eq(agentEvents.entityType, "scan"),
        gte(agentEvents.createdAt, since),
        notExists(
          db
            .select({ one: sql`1` })
            .from(processed)
            .where(and(eq(processed.type, MONITOR_PROCESSED), eq(processed.entityId, agentEvents.entityId))),
        ),
      ),
    )
    .orderBy(asc(agentEvents.createdAt));

  const out: PendingMonitorScan[] = [];
  for (const row of rows) {
    if (!row.orgId) continue;
    const input = (row.input ?? {}) as { previousScanId?: unknown };
    out.push({
      orgId: row.orgId,
      scanId: row.scanId,
      siteId: row.siteId,
      previousScanId: typeof input.previousScanId === "string" ? input.previousScanId : null,
      status: row.status,
      startedEventAt: row.createdAt,
    });
  }
  return out;
}
