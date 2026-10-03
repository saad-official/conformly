"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateOrganisation } from "./actions";
import { initialSettingsState } from "./form-state";

const field =
  "h-10 w-full min-w-0 rounded-lg border border-foreground/25 bg-card px-3 text-base outline-none hover:border-foreground/45 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-fail disabled:opacity-60 md:text-sm";

export function OrganisationForm({
  name,
  timezone,
  timezones,
  canEdit,
}: {
  name: string;
  timezone: string;
  timezones: readonly string[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateOrganisation, initialSettingsState);
  const errors = state.fieldErrors ?? {};

  return (
    // Keyed on the saved values: React resets a form after its action, and the
    // remount makes that reset land on the new values rather than the old ones.
    <form key={`${name}|${timezone}`} action={formAction} className="grid max-w-lg gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="org-name" className="text-sm font-medium">
          Organisation name
        </label>
        <input
          id="org-name"
          name="name"
          defaultValue={name}
          required
          maxLength={120}
          disabled={!canEdit}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "org-name-error" : undefined}
          className={field}
        />
        {errors.name ? (
          <p id="org-name-error" className="text-sm text-destructive">
            {errors.name}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="org-timezone" className="text-sm font-medium">
          Time zone
        </label>
        <select
          id="org-timezone"
          name="timezone"
          defaultValue={timezone}
          disabled={!canEdit}
          aria-invalid={errors.timezone ? true : undefined}
          aria-describedby={errors.timezone ? "org-timezone-error" : "org-timezone-hint"}
          className={cn(field, "font-mono")}
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {errors.timezone ? (
          <p id="org-timezone-error" className="text-sm text-destructive">
            {errors.timezone}
          </p>
        ) : (
          <p id="org-timezone-hint" className="text-xs text-foreground/72">
            Dates in the app use this zone. Monitor re-scans run daily at 06:00 UTC.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!canEdit || pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? "Saving" : "Save"}
        </Button>
        <p aria-live="polite" className="text-sm">
          {state.error && !state.fieldErrors ? <span className="text-destructive">{state.error}</span> : null}
          {state.ok ? <span className="text-pass">{state.ok}</span> : null}
        </p>
      </div>
    </form>
  );
}
