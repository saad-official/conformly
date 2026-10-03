import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { memberships, user } from "../schema";

/**
 * The organization owner's sign-in email: where change alerts go (v1 has no
 * separate alert address). Null when the org has no owner.
 */
export async function getOwnerEmail(orgId: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ email: user.email })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner")))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  return row?.email ?? null;
}
