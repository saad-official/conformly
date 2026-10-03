"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { addSite } from "@/app/(app)/sites/actions";
import { initialSiteActionState } from "@/app/(app)/sites/form-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Adds a storefront; on success the action redirects to the site page to run its first scan. */
export function AddSiteForm({ className }: { className?: string }) {
  const [state, formAction, pending] = useActionState(addSite, initialSiteActionState);
  const errorId = "add-site-error";
  return (
    <form action={formAction} className={cn("w-full", className)} noValidate>
      <label htmlFor="add-site-url" className="block text-sm font-semibold">
        Add a storefront
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="add-site-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={2048}
          defaultValue={state.url ?? ""}
          key={state.url ?? "empty"}
          placeholder="yourstore.example"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className={cn(
            "h-10 w-full min-w-0 rounded-lg border border-foreground/25 bg-card px-3 font-mono text-base sm:flex-1",
            "placeholder:text-foreground/55 hover:border-foreground/45 aria-invalid:border-fail",
            "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        />
        <Button type="submit" disabled={pending} className="h-10 px-4">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          {pending ? "Adding" : "Add site"}
        </Button>
      </div>
      <div aria-live="polite">
        {state.error ? (
          <p id={errorId} className="mt-2 text-sm text-destructive">
            {state.error}{" "}
            {state.existingSiteId ? (
              <Link href={`/sites/${state.existingSiteId}`} className="font-medium underline underline-offset-2">
                Open it
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>
    </form>
  );
}
