import "server-only";
import { latestTwoBySite, type MonitorState, type SiteRowData } from "@/components/dashboard/site-rows";
import { scanTime } from "@/components/dashboard/format";
import * as scansExtra from "@/lib/db/repositories/scans-extra";
import * as sitesRepo from "@/lib/db/repositories/sites";
import * as sitesExtra from "@/lib/db/repositories/sites-extra";
import type { Organization, Site } from "@/lib/db/types";
import { eligibleMonitoredSiteIds, limitsFor, nextMonitorRun } from "@/lib/services/billing-limits";

export type Overview = {
  sites: Site[];
  rows: SiteRowData[];
  /** Monitored sites the plan covers (re-scanned by the cron). */
  activeMonitors: number;
  /** Monitoring switched on, including sites beyond the plan limit. */
  monitorsOn: number;
  monitorLimit: number;
};

/** Sites with their latest two finished scans, monitor state and next re-scan, for the dashboard and sites list. */
export async function loadOverview(org: Pick<Organization, "id" | "plan">, now: Date): Promise<Overview> {
  const [sites, latestDone, monitored] = await Promise.all([
    sitesRepo.listForOrg(org.id),
    scansExtra.listLatestDonePerSite(org.id, 2),
    sitesExtra.listMonitored(org.id),
  ]);
  const lastScanIds = sites.map((s) => s.lastScanId).filter((id): id is string => Boolean(id));
  const lastScans = new Map((await scansExtra.listByIds(org.id, lastScanIds)).map((s) => [s.id, s]));
  const eligible = eligibleMonitoredSiteIds(monitored, org.plan);
  const pairs = latestTwoBySite(latestDone);

  const rows = sites.map((site): SiteRowData => {
    const pair = pairs.get(site.id);
    const last = site.lastScanId ? lastScans.get(site.lastScanId) : undefined;
    const monitor: MonitorState = !site.monitorEnabled ? "off" : eligible.has(site.id) ? "on" : "paused";
    return {
      site,
      latest: pair?.latest ?? null,
      previous: pair?.previous ?? null,
      monitor,
      nextRun: monitor === "on" ? nextMonitorRun(last ? scanTime(last) : null, site.monitorIntervalDays, now) : null,
    };
  });

  return {
    sites,
    rows,
    activeMonitors: eligible.size,
    monitorsOn: monitored.length,
    monitorLimit: limitsFor(org.plan).monitoredSites,
  };
}
