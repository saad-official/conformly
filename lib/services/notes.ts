import "server-only";
import * as findingNotesRepo from "@/lib/db/repositories/findingNotes";
import * as scansRepo from "@/lib/db/repositories/scans";
import type { FindingNote, NoteState } from "@/lib/db/types";

/**
 * Owner notes on report findings (spec 3.3): "fixed" or "not applicable"
 * (with a reason), keyed by the finding's fingerprint so they carry over to
 * the next scan of the same site. Only members of the organization that owns
 * the scan may write, and only on scans linked to a site.
 */

export const NOTE_STATES: readonly NoteState[] = ["open", "fixed", "not_applicable"];
export const MAX_NOTE_LENGTH = 1000;

export class NoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteError";
  }
}

export function isNoteState(value: unknown): value is NoteState {
  return typeof value === "string" && (NOTE_STATES as readonly string[]).includes(value);
}

export type SaveNoteInput = {
  orgId: string;
  userId: string | null;
  publicId: string;
  findingId: string;
  state: NoteState;
  note?: string | null;
};

export async function saveFindingNote(input: SaveNoteInput): Promise<FindingNote> {
  const report = await scansRepo.getByPublicId(input.publicId);
  if (!report) throw new NoteError("This report no longer exists.");
  const { scan } = report;
  if (scan.orgId !== input.orgId) throw new NoteError("Only the store's owners can add notes to this report.");
  if (!scan.siteId) throw new NoteError("Notes need the scan to belong to one of your sites.");
  const finding = report.findings.find((f) => f.id === input.findingId);
  if (!finding) throw new NoteError("That finding is not part of this report.");
  if (!isNoteState(input.state)) throw new NoteError("Choose open, fixed or not applicable.");
  const note = input.note?.trim() ?? "";
  if (note.length > MAX_NOTE_LENGTH) throw new NoteError(`Keep the note under ${MAX_NOTE_LENGTH} characters.`);
  if (input.state === "not_applicable" && !note) throw new NoteError("Say why the finding does not apply.");
  return findingNotesRepo.upsert(input.orgId, {
    siteId: scan.siteId,
    checkCode: finding.checkCode,
    fingerprint: finding.fingerprint,
    state: input.state,
    note: note || null,
    updatedBy: input.userId,
  });
}

export function noteKey(checkCode: string, fingerprint: string): string {
  return `${checkCode}\u0000${fingerprint}`;
}

/** The site's notes keyed by (check, fingerprint). */
export async function notesBySiteKey(orgId: string, siteId: string): Promise<Map<string, FindingNote>> {
  const notes = await findingNotesRepo.listForSite(orgId, siteId);
  return new Map(notes.map((n) => [noteKey(n.checkCode, n.fingerprint), n]));
}
