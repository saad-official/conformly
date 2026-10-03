import { CHECK_DEFINITIONS } from "@/lib/checks";
import type { FindingNote, NoteState } from "@/lib/db/types";
import { formatDate, quiet } from "@/components/dashboard/format";
import { cn } from "@/lib/utils";

const STATE: Record<NoteState, { label: string; className: string }> = {
  open: { label: "Open", className: "text-foreground/75" },
  fixed: { label: "Fixed", className: "text-pass" },
  not_applicable: { label: "Not applicable", className: "text-foreground/60" },
};

export function NoteStateBadge({ state }: { state: NoteState }) {
  const meta = STATE[state];
  return <span className={cn("verdict shrink-0 bg-card", meta.className)}>{meta.label}</span>;
}

/**
 * Notes owners left on this site's findings (from the report page). They
 * follow a finding by fingerprint, so a note carries over to the next scan
 * while the finding stays the same.
 */
export function NotesList({ notes, timeZone }: { notes: readonly FindingNote[]; timeZone: string }) {
  return (
    <ul className="divide-y rounded-xl bg-card shadow-card ring-1 ring-foreground/10">
      {notes.map((note) => (
        <li key={note.id} className="grid gap-1.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
          <div className="min-w-0">
            <p className="font-medium">{CHECK_DEFINITIONS[note.checkCode]?.title ?? note.checkCode}</p>
            <p className="truncate font-mono text-xs text-foreground/60" title={note.fingerprint}>
              {note.checkCode} · {note.fingerprint.slice(0, 10)}
            </p>
            {note.note ? <p className="mt-1 text-sm whitespace-pre-line">{note.note}</p> : null}
            <p className={cn("mt-1 text-xs", quiet)}>Updated {formatDate(note.updatedAt, timeZone)}</p>
          </div>
          <NoteStateBadge state={note.state} />
        </li>
      ))}
    </ul>
  );
}
