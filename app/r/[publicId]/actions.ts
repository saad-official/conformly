"use server";

import { refresh } from "next/cache";
import type { NoteFormState } from "@/components/report/note-control";
import { requireOrgContext } from "@/lib/auth/session";
import { isNoteState, NoteError, saveFindingNote } from "@/lib/services/notes";

/**
 * Upserts the owner's note on one finding. Reachable by any POST, so it
 * re-checks everything: a signed-in session (requireOrgContext), and in the
 * service that the scan belongs to that organization and the finding to the
 * scan. The fingerprint and check code come from the database, never the form.
 */
export async function saveNoteAction(_previous: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const { org, user } = await requireOrgContext();
  const publicId = formData.get("publicId");
  const findingId = formData.get("findingId");
  const state = formData.get("state");
  const note = formData.get("note");
  if (typeof publicId !== "string" || typeof findingId !== "string") return { ok: false, message: "Reload the page and try again." };
  if (!isNoteState(state)) return { ok: false, message: "Choose open, fixed or not applicable." };

  try {
    await saveFindingNote({
      orgId: org.id,
      userId: user.id,
      publicId,
      findingId,
      state,
      note: typeof note === "string" ? note : null,
    });
  } catch (error) {
    if (error instanceof NoteError) return { ok: false, message: error.message };
    console.error("[report] saving a note failed", error);
    return { ok: false, message: "The note could not be saved. Try again." };
  }
  refresh();
  return { ok: true, message: state === "open" ? "Reopened." : "Saved." };
}
