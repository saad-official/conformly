import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { CheckCode } from "@/lib/checks/types";
import { getDb } from "../client";
import { findingNotes } from "../schema";
import type { FindingNote, NoteState } from "../types";
import { assertSiteInOrg } from "./shared";

export type UpsertNoteInput = {
  siteId: string;
  checkCode: CheckCode;
  fingerprint: string;
  state: NoteState;
  note?: string | null;
  /** Better Auth user id of the editor. */
  updatedBy?: string | null;
};

/** One note per (org, site, check, fingerprint); a second call updates it. */
export async function upsert(orgId: string, input: UpsertNoteInput): Promise<FindingNote> {
  const db = await getDb();
  await assertSiteInOrg(db, orgId, input.siteId);
  const note = input.note?.trim() ? input.note.trim() : null;
  if (input.state === "not_applicable" && !note) {
    throw new Error("Say why the finding does not apply.");
  }
  const now = new Date();
  const [row] = await db
    .insert(findingNotes)
    .values({
      orgId,
      siteId: input.siteId,
      checkCode: input.checkCode,
      fingerprint: input.fingerprint,
      state: input.state,
      note,
      updatedBy: input.updatedBy ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [findingNotes.orgId, findingNotes.siteId, findingNotes.checkCode, findingNotes.fingerprint],
      set: { state: input.state, note, updatedBy: input.updatedBy ?? null, updatedAt: now },
    })
    .returning();
  return row;
}

export async function listForSite(orgId: string, siteId: string): Promise<FindingNote[]> {
  const db = await getDb();
  return db
    .select()
    .from(findingNotes)
    .where(and(eq(findingNotes.orgId, orgId), eq(findingNotes.siteId, siteId)))
    .orderBy(asc(findingNotes.checkCode), asc(findingNotes.updatedAt));
}
