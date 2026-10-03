"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const POLL_MS = 2000;

/**
 * Polls /api/scan/<id>/status every 2 s and moves to the report once the scan
 * is done or failed. Network errors are retried on the next tick.
 */
export function StatusPoller({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const response = await fetch(`/api/scan/${encodeURIComponent(publicId)}/status`, { cache: "no-store" });
        if (response.status === 404) {
          setMissing(true);
          return;
        }
        if (response.ok) {
          const body = (await response.json()) as { status?: string };
          if (body.status === "done" || body.status === "failed") {
            router.replace(`/r/${publicId}`);
            return;
          }
        }
      } catch {
        // Offline or a deploy in progress: try again on the next tick.
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [publicId, router]);

  return (
    <p role="status" aria-live="polite" className="text-sm text-foreground/72">
      {missing ? "This scan no longer exists." : "Checking for results every 2 seconds. This page moves on by itself."}
    </p>
  );
}
