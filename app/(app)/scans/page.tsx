import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { plural } from "@/components/dashboard/format";
import { LegalNote } from "@/components/dashboard/legal-note";
import { ScanList } from "@/components/dashboard/scan-list";
import { requireOrgContext } from "@/lib/auth/session";
import * as scansRepo from "@/lib/db/repositories/scans";
import * as sitesRepo from "@/lib/db/repositories/sites";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Scans" };

const siteFilter = z.uuid();
const LIMIT = 200;

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 max-w-full items-center truncate rounded-full border px-3 text-sm outline-none transition-colors",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground/80 hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export default async function ScansPage({ searchParams }: PageProps<"/scans">) {
  const { org } = await requireOrgContext();
  const { site: siteParam } = await searchParams;
  const sites = await sitesRepo.listForOrg(org.id);
  const parsed = siteFilter.safeParse(Array.isArray(siteParam) ? siteParam[0] : siteParam);
  const activeSite = parsed.success ? sites.find((s) => s.id === parsed.data) : undefined;

  const scans = activeSite
    ? await scansRepo.listForSite(org.id, activeSite.id, { limit: LIMIT })
    : await scansRepo.listForOrg(org.id, { limit: LIMIT });

  return (
    <>
      <PageHeader
        title="Scans"
        description={
          activeSite
            ? `Every scan of ${activeSite.hostname}, newest first.`
            : "Every scan run by your organisation, newest first. Reports open on their private link."
        }
      />

      {sites.length > 0 ? (
        <nav aria-label="Filter by site" className="mb-5 flex flex-wrap gap-2">
          <FilterChip href="/scans" active={!activeSite}>
            All sites
          </FilterChip>
          {sites.map((s) => (
            <FilterChip key={s.id} href={`/scans?site=${s.id}`} active={activeSite?.id === s.id}>
              {s.hostname}
            </FilterChip>
          ))}
        </nav>
      ) : null}

      {scans.length > 0 ? (
        <>
          <p className="mb-2 text-sm text-foreground/72">
            {plural(scans.length, "scan")}
            {scans.length === LIMIT ? ` (the latest ${LIMIT})` : ""}
          </p>
          <ScanList scans={scans} timeZone={org.timezone} siteLinks />
        </>
      ) : (
        <EmptyState
          title={activeSite ? `No scans of ${activeSite.hostname} yet` : "No scans yet"}
          description="Scans you run while signed in, and monitor re-scans, are listed here."
          action={
            <Link href={activeSite ? `/sites/${activeSite.id}` : "/dashboard"} className="text-sm font-medium text-primary hover:underline">
              {activeSite ? "Open the site to scan it" : "Run a scan from the dashboard"}
            </Link>
          }
        />
      )}

      <LegalNote className="mt-8" />
    </>
  );
}
