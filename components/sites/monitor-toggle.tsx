"use client";

import Link from "next/link";
import { startTransition, useActionState, useOptimistic } from "react";
import { setMonitoring } from "@/app/(app)/sites/actions";
import { initialSiteActionState } from "@/app/(app)/sites/form-state";
import { Switch } from "@/components/ui/switch";

/** Monitoring switch. The server action enforces the plan's monitored-site limit and reports it here. */
export function MonitorToggle({ siteId, enabled, hostname }: { siteId: string; enabled: boolean; hostname: string }) {
  const [state, action, pending] = useActionState(setMonitoring, initialSiteActionState);
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const switchId = `monitor-${siteId}`;
  const statusId = `${switchId}-status`;

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <Switch
          id={switchId}
          checked={optimistic}
          disabled={pending}
          aria-describedby={statusId}
          onCheckedChange={(next) => {
            const formData = new FormData();
            formData.set("siteId", siteId);
            formData.set("enabled", String(next));
            startTransition(() => {
              setOptimistic(next);
              action(formData);
            });
          }}
        />
        <label htmlFor={switchId} className="text-sm font-medium">
          Monitor {hostname}
        </label>
      </div>
      <p id={statusId} aria-live="polite" className="text-sm">
        {state.error ? (
          <span className="text-destructive">
            {state.error}{" "}
            {/limit|upgrade/i.test(state.error) ? (
              <Link href="/billing" className="font-medium underline underline-offset-2">
                See plans
              </Link>
            ) : null}
          </span>
        ) : state.ok ? (
          <span className="text-foreground/72">{state.ok}</span>
        ) : null}
      </p>
    </div>
  );
}
