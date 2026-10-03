import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { loadOverview } from "@/app/(app)/_lib/overview";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { plural, textLink } from "@/components/dashboard/format";
import { LegalNote, SectionHeading } from "@/components/dashboard/legal-note";
import { SiteRows } from "@/components/dashboard/site-rows";
import { AddSiteForm } from "@/components/sites/add-site-form";
import { requireOrgContext } from "@/lib/auth/session";
import { PLAN_LIMITS } from "@/lib/services/billing-limits";

export const metadata: Metadata = { title: "Sites" };

function requestTime(): Date {
  return new Date();
}

export default async function SitesPage({ searchParams }: PageProps<"/sites">) {
  const { org } = await requireOrgContext();
  const { deleted } = await searchParams;
  const overview = await loadOverview(org, requestTime());
  const isFree = org.plan === "free";

  return (
    <>
      <PageHeader
        title="Sites"
        description={
          <>
            Storefronts you scan and monitor. Monitoring {overview.activeMonitors} of {overview.monitorLimit}{" "}
            {overview.monitorLimit === 1 ? "site" : "sites"} on {isFree ? "Free" : "Pro"}, re-scanned every 30 days.
            {isFree ? (
              <>
                {" "}
                <Link href="/billing" className={textLink}>
                  Pro monitors {PLAN_LIMITS.pro.monitoredSites}
                </Link>{" "}
                and emails you when something changes.
              </>
            ) : null}
          </>
        }
      />

      {deleted === "1" ? (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-pass" aria-hidden />
          Site deleted. Its past scans are still listed under Scans.
        </p>
      ) : null}

      <div className="rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10 sm:p-5">
        <AddSiteForm />
        <p className="mt-2 text-sm text-foreground/72">
          You can run the first scan straight after adding it. One site per domain.
        </p>
      </div>

      <section aria-labelledby="site-list-heading" className="mt-10">
        <SectionHeading id="site-list-heading" title="Your sites" description={plural(overview.sites.length, "site")} />
        {overview.rows.length > 0 ? (
          <SiteRows rows={overview.rows} timeZone={org.timezone} />
        ) : (
          <EmptyState
            title="No sites yet"
            description="Add your shop's address above. Conformly checks the withdrawal function, green claims, accessibility statement, chatbot disclosure, cookie consent and legal notice."
          />
        )}
      </section>

      <LegalNote className="mt-8" />
    </>
  );
}
