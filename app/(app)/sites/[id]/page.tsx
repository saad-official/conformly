import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, Loader2 } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { formatDate, quiet, scanTime } from "@/components/dashboard/format";
import { LegalNote, SectionHeading } from "@/components/dashboard/legal-note";
import { ScanCounts } from "@/components/dashboard/scan-counts";
import { SiteScanForm } from "@/components/dashboard/scan-forms";
import { ScanList } from "@/components/dashboard/scan-list";
import { MonitorBadge } from "@/components/dashboard/site-rows";
import { VerdictPill, verdictForSummary } from "@/components/dashboard/verdict-pill";
import { DeleteSiteDialog } from "@/components/sites/delete-site-dialog";
import { MonitorToggle } from "@/components/sites/monitor-toggle";
import { NotesList } from "@/components/sites/notes-list";
import { ScanDiffView } from "@/components/sites/scan-diff";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/session";
import * as findingNotesRepo from "@/lib/db/repositories/findingNotes";
import * as findingsRepo from "@/lib/db/repositories/findings";
import * as scansRepo from "@/lib/db/repositories/scans";
import * as scansExtra from "@/lib/db/repositories/scans-extra";
import * as sitesRepo from "@/lib/db/repositories/sites";
import * as sitesExtra from "@/lib/db/repositories/sites-extra";
import {
  MONITOR_INTERVAL_DAYS,
  eligibleMonitoredSiteIds,
  getScanQuota,
  limitsFor,
  nextMonitorRun,
} from "@/lib/services/billing-limits";
import { diffFindings } from "@/lib/services/monitor";

export const metadata: Metadata = { title: "Site" };

const idSchema = z.uuid();

function requestTime(): Date {
  return new Date();
}

export default async function SitePage({ params, searchParams }: PageProps<"/sites/[id]">) {
  const { org, role } = await requireOrgContext();
  const [{ id }, { added }] = await Promise.all([params, searchParams]);
  if (!idSchema.safeParse(id).success) notFound();

  const site = await sitesRepo.getById(org.id, id);
  if (!site) notFound();

  const now = requestTime();
  const tz = org.timezone;
  const [history, done, notes, quota, monitored, lastScan] = await Promise.all([
    scansRepo.listForSite(org.id, site.id, { limit: 50 }),
    scansExtra.listDoneForSite(org.id, site.id, 2),
    findingNotesRepo.listForSite(org.id, site.id),
    getScanQuota(org.id, org.plan, now),
    sitesExtra.listMonitored(org.id),
    site.lastScanId ? scansRepo.getById(org.id, site.lastScanId) : Promise.resolve(null),
  ]);
  const [latest, previous] = done;
  const diff =
    latest && previous
      ? diffFindings(
          ...(await Promise.all([
            findingsRepo.listForScan(org.id, previous.id),
            findingsRepo.listForScan(org.id, latest.id),
          ])),
        )
      : null;

  const eligible = eligibleMonitoredSiteIds(monitored, org.plan);
  const monitorState = !site.monitorEnabled ? "off" : eligible.has(site.id) ? "on" : "paused";
  const nextRun =
    monitorState === "on" ? nextMonitorRun(lastScan ? scanTime(lastScan) : null, site.monitorIntervalDays, now) : null;
  const inProgress = history.find((s) => s.status === "queued" || s.status === "running");
  const quotaReason =
    quota.remaining === 0
      ? `This month's ${quota.limit} scans are used. They reset on ${formatDate(quota.resetsAt, "UTC")}, or upgrade to Pro.`
      : null;
  const verdict = latest ? verdictForSummary(latest.summary) : null;
  const limit = limitsFor(org.plan).monitoredSites;

  return (
    <>
      <Link
        href="/sites"
        className="mb-4 inline-flex items-center gap-1 text-sm text-foreground/72 hover:text-foreground focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Sites
      </Link>
      <PageHeader
        title={site.hostname}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono break-all">{site.url}</span>
            {site.platformGuess ? <span className="code">{site.platformGuess}</span> : null}
            <MonitorBadge state={monitorState} />
          </span>
        }
        actions={added === "1" ? null : <SiteScanForm url={site.url} siteId={site.id} disabledReason={quotaReason} />}
      />

      {added === "1" ? (
        <section
          aria-labelledby="first-scan-heading"
          className="ruled mb-8 rounded-xl bg-card p-5 shadow-card ring-1 ring-foreground/10"
        >
          <p className="flex items-center gap-2 text-sm text-pass">
            <CircleCheck className="size-4" aria-hidden />
            Site added
          </p>
          <h2 id="first-scan-heading" className="mt-2 font-heading text-xl">
            Run the first scan of {site.hostname}
          </h2>
          <p className={`mt-1 max-w-xl text-sm ${quiet}`}>
            Up to 12 pages: homepage, product, cart and legal pages. Takes about a minute; the report opens when it is
            ready.
          </p>
          <SiteScanForm
            className="mt-4"
            url={site.url}
            siteId={site.id}
            label="Run first scan"
            size="lg"
            disabledReason={quotaReason}
          />
        </section>
      ) : null}

      {inProgress ? (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          A scan is {inProgress.status === "queued" ? "queued" : "running"}.{" "}
          <Link href={`/r/${inProgress.publicId}`} className="font-medium underline underline-offset-2">
            Follow it
          </Link>
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="latest-heading">
            <SectionHeading id="latest-heading" title="Latest result" />
            {latest ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10">
                {verdict ? <VerdictPill tone={verdict.tone}>{verdict.label}</VerdictPill> : null}
                <ScanCounts summary={latest.summary} />
                <span className={`text-sm ${quiet}`}>{formatDate(scanTime(latest), tz)}</span>
                <Link href={`/r/${latest.publicId}`} className="text-sm font-medium text-primary hover:underline sm:ml-auto">
                  Open report
                </Link>
              </div>
            ) : (
              <p className={`rounded-xl border border-dashed px-4 py-6 text-sm ${quiet}`}>
                No finished scan yet. Run one to see issues, warnings and citations.
              </p>
            )}
          </section>

          <section aria-labelledby="diff-heading">
            <SectionHeading
              id="diff-heading"
              title="Changes since the previous scan"
              description="By check status and finding fingerprint (the check, its status and the pages with evidence)."
            />
            {diff && latest && previous ? (
              <ScanDiffView diff={diff} latest={latest} previous={previous} timeZone={tz} />
            ) : (
              <p className={`rounded-xl border border-dashed px-4 py-6 text-sm ${quiet}`}>
                Two finished scans are needed to compare. {latest ? "One more scan will show what changed." : null}
              </p>
            )}
          </section>

          <section aria-labelledby="history-heading">
            <SectionHeading
              id="history-heading"
              title="Scan history"
              action={
                <Link href={`/scans?site=${site.id}`} className="text-sm font-medium text-primary hover:underline">
                  In Scans
                </Link>
              }
            />
            {history.length > 0 ? (
              <ScanList scans={history} timeZone={tz} showHost={false} />
            ) : (
              <p className={`rounded-xl border border-dashed px-4 py-6 text-sm ${quiet}`}>No scans yet.</p>
            )}
          </section>

          <section aria-labelledby="notes-heading">
            <SectionHeading
              id="notes-heading"
              title="Finding notes"
              description="Added from the report. Fixed and not-applicable findings stop counting as open issues."
            />
            {notes.length > 0 ? (
              <NotesList notes={notes} timeZone={tz} />
            ) : (
              <p className={`rounded-xl border border-dashed px-4 py-6 text-sm ${quiet}`}>
                No notes yet. Open a report to mark a finding fixed or not applicable.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-6" aria-label="Site settings">
          <Card>
            <CardHeader>
              <CardTitle>Monitoring</CardTitle>
              <CardDescription>
                Re-scan every {MONITOR_INTERVAL_DAYS} days and compare with the previous scan.
                {org.plan === "pro" ? " Changes are emailed to the owner." : " Change emails are a Pro feature."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <MonitorToggle siteId={site.id} enabled={site.monitorEnabled} hostname={site.hostname} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className={quiet}>Interval</dt>
                <dd>
                  Every {site.monitorIntervalDays} days <span className="text-xs text-foreground/60">(fixed in v1)</span>
                </dd>
                <dt className={quiet}>Next re-scan</dt>
                <dd>
                  {monitorState === "on" && nextRun
                    ? formatDate(nextRun, tz)
                    : monitorState === "paused"
                      ? "Paused: over the plan limit"
                      : "Off"}
                </dd>
                <dt className={quiet}>Plan</dt>
                <dd>
                  {eligible.size} of {limit} monitored {limit === 1 ? "site" : "sites"}
                </dd>
              </dl>
              {monitorState === "paused" ? (
                <p className="text-sm text-warn">
                  Your plan covers {limit} monitored {limit === 1 ? "site" : "sites"}; older ones take priority.{" "}
                  <Link href="/billing" className="font-medium underline underline-offset-2">
                    See plans
                  </Link>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
              <CardDescription>
                {role === "owner"
                  ? "Deleting keeps past scans and their report links."
                  : "Only the organisation owner can delete a site."}
              </CardDescription>
            </CardHeader>
            {role === "owner" ? (
              <CardContent>
                <DeleteSiteDialog siteId={site.id} hostname={site.hostname} />
              </CardContent>
            ) : null}
          </Card>
        </aside>
      </div>

      <LegalNote className="mt-10" />
    </>
  );
}
