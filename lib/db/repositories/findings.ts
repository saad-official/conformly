import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, eq, inArray, isNotNull, ne, notExists, sql } from "drizzle-orm";
import type { Finding, Severity } from "@/lib/checks/types";
import { getDb } from "../client";
import { findingNotes, findings, scans } from "../schema";
import type { FindingRow } from "../types";
import { assertScanInOrg } from "./scans";
import { orgMatch } from "./shared";

/**
 * Stable identity of a finding across scans of the same site, so notes
 * ("fixed", "not applicable") carry over (spec 3.3). Built from the check,
 * its status and the set of evidence URLs: a new page with the problem, or a
 * status change, yields a new fingerprint and the note no longer applies.
 */
export function findingFingerprint(finding: Pick<Finding, "code" | "status" | "evidence">): string {
  const urls = [...new Set(finding.evidence.map((e) => e.url))].sort();
  return createHash("sha256")
    .update(JSON.stringify([finding.code, finding.status, urls]))
    .digest("base64url")
    .slice(0, 22);
}

export type FindingInput = Finding & { fingerprint?: string };

/** Persists the findings of one scan in the given (report) order. */
export async function bulkInsert(
  orgId: string | null,
  scanId: string,
  input: readonly FindingInput[],
): Promise<FindingRow[]> {
  if (input.length === 0) return [];
  await assertScanInOrg(orgId, scanId);
  const db = await getDb();
  return db
    .insert(findings)
    .values(
      input.map((f, position) => ({
        scanId,
        checkCode: f.code,
        fingerprint: f.fingerprint ?? findingFingerprint(f),
        status: f.status,
        severity: f.severity,
        title: f.title,
        detail: f.detail,
        evidence: f.evidence,
        citation: f.citation,
        fix: f.fix,
        llmMeta: f.meta ?? null,
        position,
      })),
    )
    .returning();
}

export async function listForScan(orgId: string | null, scanId: string): Promise<FindingRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ finding: findings })
    .from(findings)
    .innerJoin(scans, eq(scans.id, findings.scanId))
    .where(and(eq(findings.scanId, scanId), orgMatch(scans.orgId, orgId)))
    .orderBy(asc(findings.position));
  return rows.map((r) => r.finding);
}

/**
 * Open fails in each site's latest finished scan: status `fail`, severity in
 * `severities` (default: high only, the app-shell badge), and no note marking
 * them fixed or not applicable.
 */
export async function countOpenFails(
  orgId: string,
  options: { severities?: readonly Severity[] } = {},
): Promise<number> {
  const severities = options.severities ?? ["high"];
  if (severities.length === 0) return 0;
  const db = await getDb();

  const latest = db
    .selectDistinctOn([scans.siteId], { id: scans.id, siteId: scans.siteId })
    .from(scans)
    .where(and(eq(scans.orgId, orgId), isNotNull(scans.siteId), eq(scans.status, "done")))
    .orderBy(scans.siteId, sql`${scans.finishedAt} desc nulls last`, sql`${scans.createdAt} desc`)
    .as("latest");

  const [row] = await db
    .select({ n: count() })
    .from(findings)
    .innerJoin(latest, eq(findings.scanId, latest.id))
    .where(
      and(
        eq(findings.status, "fail"),
        inArray(findings.severity, [...severities]),
        notExists(
          db
            .select({ one: sql`1` })
            .from(findingNotes)
            .where(
              and(
                eq(findingNotes.orgId, orgId),
                sql`${findingNotes.siteId} = ${latest.siteId}`,
                eq(findingNotes.checkCode, findings.checkCode),
                eq(findingNotes.fingerprint, findings.fingerprint),
                ne(findingNotes.state, "open"),
              ),
            ),
        ),
      ),
    );
  return row?.n ?? 0;
}
