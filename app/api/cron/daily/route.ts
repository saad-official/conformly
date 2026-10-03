import { isAuthorizedCron, unauthorized } from "@/app/api/_lib/secrets";
import { runMonitorTick } from "@/lib/services/monitor";

/**
 * Daily job (vercel.json: 06:00 UTC). `Authorization: Bearer <CRON_SECRET>`.
 * Starts due monitor re-scans (at most 5), diffs finished ones and alerts,
 * then purges anonymous scans older than 30 days. Returns a JSON summary.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  try {
    const summary = await runMonitorTick(new Date());
    console.info(
      `[cron] daily: started ${summary.started.length}, processed ${summary.processed.length}, pending ${summary.pending}, purged ${summary.purgedAnonymousScans}, errors ${summary.errors.length}`,
    );
    return Response.json(summary);
  } catch (error) {
    console.error("[cron] daily failed", error instanceof Error ? error.message : error);
    return Response.json({ ok: false, error: "tick failed" }, { status: 500 });
  }
}
