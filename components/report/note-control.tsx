"use client";

import { useActionState, useId, useState } from "react";
import type { NoteState } from "@/lib/db/types";
import { cn } from "@/lib/utils";

export type NoteFormState = { ok: boolean; message: string } | null;
export type NoteAction = (state: NoteFormState, formData: FormData) => Promise<NoteFormState>;

const LABELS: Record<NoteState, string> = { open: "Open", fixed: "Fixed", not_applicable: "Not applicable" };
const STATES: readonly NoteState[] = ["open", "fixed", "not_applicable"];

/**
 * Owner-only: mark a finding fixed or not applicable (with a reason). The
 * note is keyed by the finding's fingerprint, so it carries over to the next
 * scan of the site while the finding stays the same.
 */
export function NoteControl({
  action,
  publicId,
  findingId,
  current,
}: {
  action: NoteAction;
  publicId: string;
  findingId: string;
  current: { state: NoteState; note: string | null; updatedAt: string | null } | null;
}) {
  const [result, formAction, pending] = useActionState(action, null);
  const [state, setState] = useState<NoteState>(current?.state ?? "open");
  const id = useId();
  const reasonId = `${id}-reason`;
  const statusId = `${id}-status`;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="publicId" value={publicId} />
      <input type="hidden" name="findingId" value={findingId} />
      <fieldset>
        <legend className="font-mono text-[0.6875rem] font-medium tracking-wide text-foreground/70 uppercase">
          Your note
          {current && current.state !== "open" ? (
            <span className="ml-2 normal-case">· marked {LABELS[current.state].toLowerCase()}</span>
          ) : null}
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {STATES.map((value) => (
            <label
              key={value}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm",
                state === value ? "border-primary bg-accent text-accent-foreground" : "border-foreground/25",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-primary",
              )}
            >
              <input
                type="radio"
                name="state"
                value={value}
                checked={state === value}
                onChange={() => setState(value)}
                className="sr-only"
              />
              {LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={reasonId} className="text-sm font-medium">
          {state === "not_applicable" ? "Why does it not apply? (required)" : "Note (optional)"}
        </label>
        <textarea
          id={reasonId}
          name="note"
          rows={2}
          maxLength={1000}
          required={state === "not_applicable"}
          defaultValue={current?.note ?? ""}
          aria-describedby={result ? statusId : undefined}
          className={cn(
            "mt-1 block w-full rounded-md border border-foreground/25 bg-background px-3 py-2 text-sm",
            "focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-primary",
          )}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/88",
            "disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-primary",
          )}
        >
          {pending ? "Saving…" : "Save note"}
        </button>
        <p id={statusId} role="status" aria-live="polite" className={cn("text-sm", result && !result.ok ? "text-fail" : "text-foreground/72")}>
          {result?.message ?? ""}
        </p>
      </div>
    </form>
  );
}
