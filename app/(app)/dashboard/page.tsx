import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { MetricTile } from "@/components/app/metric-tile";
import { PageHeader } from "@/components/app/page-header";
import { getOpenIssueCount, requireOrgContext } from "@/lib/auth/session";
import { listForOrg as listSites } from "@/lib/db/repositories/sites";

export const metadata: Metadata = {
  title: "Dashboard",
};

/** Placeholder until the scan flow lands: proves the shell, session and tenancy wiring render. */
export default async function DashboardPage() {
  const { org } = await requireOrgContext();
  const [sites, openIssues] = await Promise.all([listSites(org.id), getOpenIssueCount(org.id)]);
  const monitored = sites.filter((s) => s.monitorEnabled).length;

  return (
    <>
      <PageHeader title="Dashboard" description={`Storefronts watched by ${org.name}.`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricTile label="Sites" value={String(sites.length)} />
        <MetricTile label="Monitored" value={String(monitored)} caption="Re-scanned every 30 days" />
        <MetricTile
          label="Open high-severity issues"
          value={String(openIssues)}
          tone={openIssues > 0 ? "attention" : "default"}
        />
      </div>
      {sites.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No storefronts yet"
          description="Add your shop's URL to run the first scan: withdrawal function, green claims, accessibility statement, AI-chatbot disclosure, cookie consent and legal notice."
        />
      ) : null}
    </>
  );
}
