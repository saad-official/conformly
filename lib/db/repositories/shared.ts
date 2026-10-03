import "server-only";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Db } from "../client";
import { sites } from "../schema";

/** `org_id = $orgId`, or `org_id is null` for anonymous (org-less) rows. */
export function orgMatch(column: PgColumn, orgId: string | null): SQL {
  return orgId === null ? isNull(column) : eq(column, orgId);
}

const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Random url-safe id. 64 symbols, so masking a byte to 6 bits is unbiased. */
export function randomUrlSafeId(length = 12): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += URL_SAFE[byte & 63];
  return out;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

/** Throws unless the site exists and belongs to the organization. */
export async function assertSiteInOrg(db: Db, orgId: string, siteId: string): Promise<void> {
  const [row] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)))
    .limit(1);
  if (!row) throw new NotFoundError("Site");
}

/** Postgres unique violation (23505), optionally on one constraint; follows `cause` chains (Drizzle wraps driver errors). */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const e = current as { code?: unknown; constraint?: unknown; constraint_name?: unknown; cause?: unknown };
    if (e.code === "23505") {
      if (!constraint) return true;
      if (e.constraint === constraint || e.constraint_name === constraint) return true;
    }
    current = e.cause;
  }
  return false;
}

export function clampLimit(limit: number | undefined, fallback = 50, max = 200): number {
  if (!limit || !Number.isFinite(limit) || limit < 1) return fallback;
  return Math.min(Math.floor(limit), max);
}
