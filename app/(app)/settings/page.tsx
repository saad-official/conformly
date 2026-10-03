import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { formatDateTime, quiet } from "@/components/dashboard/format";
import { SectionHeading } from "@/components/dashboard/legal-note";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/session";
import * as alertsRepo from "@/lib/db/repositories/alerts";
import * as membersRepo from "@/lib/db/repositories/members";
import * as outboxRepo from "@/lib/db/repositories/outbox";
import * as sitesRepo from "@/lib/db/repositories/sites";
import { cn } from "@/lib/utils";
import { OrganisationForm } from "./organisation-form";

export const metadata: Metadata = { title: "Settings" };

function timeZones(current: string): string[] {
  const zones = new Set<string>(["UTC", ...Intl.supportedValuesOf("timeZone")]);
  zones.add(current);
  return [...zones].sort((a, b) => (a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b)));
}

const ALERT_KIND: Record<string, string> = {
  scan_diff: "Changes found",
  scan_failed: "Re-scan failed",
};

function alertSummary(payload: Record<string, unknown>): string | null {
  const counts = payload.counts as { new?: number; resolved?: number; changed?: number } | undefined;
  if (!counts) return null;
  return [
    counts.new ? `${counts.new} new` : null,
    counts.resolved ? `${counts.resolved} resolved` : null,
    counts.changed ? `${counts.changed} changed` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export default async function SettingsPage() {
  const { org, role, user } = await requireOrgContext();
  const [ownerEmail, alerts, messages, sites] = await Promise.all([
    membersRepo.getOwnerEmail(org.id),
    alertsRepo.listForOrg(org.id, { limit: 10 }),
    outboxRepo.listForOrg(org.id, { limit: 10 }),
    sitesRepo.listForOrg(org.id),
  ]);
  const hosts = new Map(sites.map((s) => [s.id, s.hostname]));
  const isOwner = role === "owner";
  const tz = org.timezone;

  return (
    <>
      <PageHeader title="Settings" description="Your organisation, where change alerts go, and account removal." />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Organisation</CardTitle>
            <CardDescription>
              {isOwner ? "Shown in the app and on alert emails." : "Only the organisation owner can change these."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrganisationForm name={org.name} timezone={tz} timezones={timeZones(tz)} canEdit={isOwner} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Alerts</CardTitle>
            <CardDescription>What happens when a monitored site&apos;s re-scan differs from the previous one.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className={quiet}>Alert address</dt>
              <dd>
                <span className="font-mono break-all">{ownerEmail ?? "No owner email on file"}</span>
                <span className={cn("mt-1 block text-xs", quiet)}>
                  Alerts go to the organisation owner&apos;s sign-in email
                  {ownerEmail && ownerEmail === user.email ? " (you)" : ""}. A separate alert address is not
                  available in v1.
                </span>
              </dd>
              <dt className={quiet}>Email alerts</dt>
              <dd>
                {org.plan === "pro" ? (
                  "On (Pro). New, resolved and changed findings, with a link to the report."
                ) : (
                  <>
                    Off on Free: your monitored site is still re-scanned and changes are recorded below.{" "}
                    <Link href="/billing" className="font-medium text-primary underline underline-offset-2">
                      Upgrade for emails
                    </Link>
                  </>
                )}
              </dd>
            </dl>

            <section aria-labelledby="alert-log-heading">
              <SectionHeading id="alert-log-heading" title="Recent alerts" className="mb-2" />
              {alerts.length > 0 ? (
                <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
                  {alerts.map((alert) => {
                    const payload = alert.payload ?? {};
                    const publicId = typeof payload.publicId === "string" ? payload.publicId : null;
                    return (
                      <li key={alert.id} className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {ALERT_KIND[alert.kind] ?? alert.kind} · {hosts.get(alert.siteId) ?? "deleted site"}
                          </p>
                          <p className={cn("text-xs", quiet)}>
                            {formatDateTime(alert.createdAt, tz)}
                            {alertSummary(payload) ? ` · ${alertSummary(payload)}` : ""}
                            {alert.sentAt ? " · emailed" : " · not emailed"}
                          </p>
                        </div>
                        {publicId ? (
                          <Link href={`/r/${publicId}`} className="text-sm font-medium text-primary hover:underline">
                            Report
                          </Link>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={cn("text-sm", quiet)}>No alerts yet. They appear after a monitored site&apos;s re-scan.</p>
              )}
            </section>

            <section aria-labelledby="outbox-heading">
              <SectionHeading
                id="outbox-heading"
                title="Outbox"
                description="Alert emails as sent. In demo mode nothing leaves the app; messages are kept here."
                className="mb-2"
              />
              {messages.length > 0 ? (
                <ul className="grid gap-2">
                  {messages.map((m) => (
                    <li key={m.id} className="rounded-lg ring-1 ring-foreground/10">
                      <details className="group">
                        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                          <span className="min-w-0 font-medium">{m.subject}</span>
                          <span className={cn("font-mono text-xs", quiet)}>
                            {m.provider} · {m.status} · {formatDateTime(m.createdAt, tz)}
                          </span>
                        </summary>
                        <div className="border-t px-3 py-2.5">
                          <p className={cn("text-xs", quiet)}>
                            To <span className="font-mono">{m.toEmail}</span>
                            {m.deliveredTo && m.deliveredTo !== m.toEmail ? (
                              <>
                                {" "}
                                (delivered to <span className="font-mono">{m.deliveredTo}</span>)
                              </>
                            ) : null}
                          </p>
                          <pre className="mt-2 max-h-72 overflow-auto font-mono text-xs whitespace-pre-wrap">{m.text}</pre>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={cn("text-sm", quiet)}>No messages yet.</p>
              )}
            </section>
          </CardContent>
        </Card>

        <Card className="ring-destructive/30">
          <CardHeader>
            <CardTitle className="text-lg">Danger zone</CardTitle>
            <CardDescription>
              Deleting the organisation and all its sites, scans and notes is not available in the app yet. To remove
              a single site, open it from Sites.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" disabled aria-disabled>
              Delete organisation
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
