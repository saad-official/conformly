import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { loadOverview } from "@/app/(app)/_lib/overview";
import { EmptyState } from "@/components/app/empty-state";
import { MetricTile } from "@/components/app/metric-tile";
import { PageHeader } from "@/components/app/page-header";
import { formatDate, formatDayMonth, plural, textLink } from "@/components/dashboard/format";
import { LegalNote, SectionHeading } from "@/components/dashboard/legal-note";
import { UrlScanForm } from "@/components/dashboard/scan-forms";
import { ScanList } from "@/components/dashboard/scan-list";
import { SiteRows } from "@/components/dashboard/site-rows";
import { Button } from "@/components/ui/button";
import { getOpenIssueCount, requireOrgContext } from "@/lib/auth/session";
import * as scansRepo from "@/lib/db/repositories/scans";
import { getScanQuota } from "@/lib/services/billing-limits";

export const metadata: Metadata = {
  title: "Dashboard",
};

function requestTime(): Date {
  return new Date();
}

export default async function DashboardPage() {
  const { org } = await requireOrgContext();
  const now = requestTime();
  const [overview, openIssues, quota, recent] = await Promise.all([
    loadOverview(org, now),
    getOpenIssueCount(org.id),
    getScanQuota(org.id, org.plan, now),
    scansRepo.listForOrg(org.id, { limit: 8 }),
  ]);
  const tz = org.timezone;
  const warnings = overview.rows.reduce((sum, row) => sum + (row.latest?.summary?.warnings ?? 0), 0);
  const nextRow = overview.rows
    .filter((r) => r.nextRun)
    .sort((a, b) => a.nextRun!.getTime() - b.nextRun!.getTime())[0];

  if (overview.sites.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" description={`Storefronts watched by ${org.name}.`} />
        <EmptyState
          className="ruled"
          title="Scan your first storefront"
          description="Withdrawal function, green claims, accessibility statement, AI-chatbot disclosure, cookie consent and legal notice: one URL, about a minute, every finding with evidence and a citation."
          action={
            <div className="grid justify-items-center gap-4">
              <UrlScanForm
                id="dashboard-scan"
                note={
                  quota.limit === null
                    ? "Unlimited scans on Pro."
                    : `${quota.remaining} of ${quota.limit} scans left this month on Free.`
                }
              />
              <p className="text-sm text-foreground/72">
                Or{" "}
                <Link href="/sites" className={textLink}>
                  add a site to monitor
                </Link>{" "}
                and keep its scan history in one place.
              </p>
            </div>
          }
        />
        {recent.length > 0 ? (
          <section aria-labelledby="recent-heading" className="mt-10">
            <SectionHeading id="recent-heading" title="Recent scans" />
            <ScanList scans={recent} timeZone={tz} />
          </section>
        ) : null}
        <LegalNote className="mt-8" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Storefronts watched by ${org.name}.`}
        actions={
          <Button asChild variant="outline">
            <Link href="/sites">
              Manage sites
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricTile
          label="Monitored sites"
          value={`${overview.activeMonitors}/${overview.monitorLimit}`}
          caption={
            overview.monitorsOn > overview.activeMonitors
              ? `${overview.monitorsOn - overview.activeMonitors} paused over the plan limit`
              : "Re-scanned every 30 days"
          }
        />
        <MetricTile
          label="Open issues"
          value={String(openIssues)}
          caption="High-severity fails, latest scans"
        />
        <MetricTile label="Warnings" value={String(warnings)} caption="Across each site's latest scan" />
        <MetricTile
          label="Scans this month"
          value={quota.limit === null ? String(quota.used) : `${quota.used}/${quota.limit}`}
          caption={
            quota.limit === null
              ? "Unlimited on Pro"
              : quota.remaining === 0
                ? `All used. Resets ${formatDate(quota.resetsAt, "UTC")}`
                : `Resets ${formatDate(quota.resetsAt, "UTC")}`
          }
        />
        <MetricTile
          className="col-span-2 lg:col-span-1"
          label="Next re-scan"
          value={nextRow?.nextRun ? formatDayMonth(nextRow.nextRun, tz) : "—"}
          caption={nextRow ? nextRow.site.hostname : "Turn on monitoring for a site"}
        />
      </div>

      <section aria-labelledby="sites-heading" className="mt-10">
        <SectionHeading
          id="sites-heading"
          title="Sites"
          description={`${plural(overview.sites.length, "site")}. Trend compares the latest scan with the one before.`}
        />
        <SiteRows rows={overview.rows} timeZone={tz} />
      </section>

      <section aria-labelledby="recent-heading" className="mt-10">
        <SectionHeading
          id="recent-heading"
          title="Recent scans"
          action={
            <Link href="/scans" className={`${textLink} text-sm`}>
              All scans
            </Link>
          }
        />
        {recent.length > 0 ? (
          <ScanList scans={recent} timeZone={tz} siteLinks />
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-foreground/72">
            No scans yet. Open a site and run its first scan.
          </p>
        )}
      </section>

      <LegalNote className="mt-8" />
    </>
  );
}
