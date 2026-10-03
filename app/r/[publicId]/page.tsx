import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { container, links } from "@/components/marketing/site";
import { FindingSection } from "@/components/report/finding-section";
import { LimitationsBox } from "@/components/report/limitations-box";
import { MatrixRail, type MatrixRow } from "@/components/report/matrix-rail";
import { NoteControl } from "@/components/report/note-control";
import { PagesTable } from "@/components/report/pages-table";
import { SaveScanCta } from "@/components/report/report-cta";
import { ScanFailure } from "@/components/report/scan-failure";
import { SummaryStrip } from "@/components/report/summary-strip";
import { getOrgContext } from "@/lib/auth/session";
import { CHECK_DEFINITIONS } from "@/lib/checks";
import { CHECK_CODES } from "@/lib/checks/types";
import { getByPublicId } from "@/lib/db/repositories/scans";
import type { FindingNote } from "@/lib/db/types";
import { summarize } from "@/lib/report/summary";
import { cn } from "@/lib/utils";
import { noteKey, notesBySiteKey } from "@/lib/services/notes";
import { expireIfStale } from "@/lib/services/scan";
import { saveNoteAction } from "./actions";

/** One database read per request, shared by generateMetadata and the page. */
const loadReport = cache(async (publicId: string) => {
  const report = await getByPublicId(publicId);
  if (!report) return null;
  return { ...report, scan: await expireIfStale(report.scan) };
});

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export async function generateMetadata({ params }: PageProps<"/r/[publicId]">): Promise<Metadata> {
  const { publicId } = await params;
  const report = await loadReport(publicId);
  const base: Metadata = { robots: { index: false, follow: false }, referrer: "same-origin" };
  if (!report) return { ...base, title: "Report not found" };
  const { scan } = report;
  const title = `Report: ${scan.hostname}`;
  const description =
    scan.status === "done" && scan.summary
      ? `${count(scan.summary.issues, "issue")}, ${count(scan.summary.warnings, "warning")}, ${scan.summary.unknowns} unknown. EU storefront rules checked by Conformly. Not legal advice.`
      : scan.status === "failed"
        ? "This scan did not complete."
        : "Scan in progress.";
  return { ...base, title, description, openGraph: { title: `${title} · Conformly`, description, type: "article" } };
}

/**
 * Public report (spec 3.3): anyone with the unguessable link can read it.
 * Owners (members of the scan's organization, scan linked to a site) also
 * get a note control per finding.
 */
export default async function ReportPage({ params }: PageProps<"/r/[publicId]">) {
  const { publicId } = await params;
  const report = await loadReport(publicId);
  if (!report) notFound();
  const { scan, pages, findings } = report;
  if (scan.status === "queued" || scan.status === "running") redirect(`/scan/${scan.publicId}`);

  const viewer = await getOrgContext();
  const isOwner = Boolean(viewer && scan.orgId && viewer.org.id === scan.orgId);

  if (scan.status === "failed") {
    return (
      <div className={cn(container, "py-10 sm:py-14")}>
        <ScanFailure
          scan={scan}
          scanAction={links.scanAction}
          siteId={isOwner ? scan.siteId : null}
          details={pages.length > 0 || scan.limitations ? (
            <>
              {pages.length > 0 ? <PagesTable pages={pages} hostname={scan.hostname} /> : null}
              <LimitationsBox limitations={scan.limitations} unknownChecks={[]} hostname={scan.hostname} showMethodLimits={false} />
            </>
          ) : null}
        />
      </div>
    );
  }

  const notes: Map<string, FindingNote> =
    isOwner && viewer && scan.siteId ? await notesBySiteKey(viewer.org.id, scan.siteId) : new Map();
  const summary = scan.summary ?? summarize(findings);
  const byCode = new Map(findings.map((f) => [f.checkCode, f]));
  const rows: MatrixRow[] = CHECK_CODES.map((code) => ({
    code,
    title: byCode.get(code)?.title ?? CHECK_DEFINITIONS[code].title,
    status: byCode.get(code)?.status ?? null,
  }));
  const unknownChecks = rows.filter((r) => r.status === "unknown" || r.status === null).map((r) => ({ code: r.code, title: r.title }));

  return (
    <div className={cn(container, "py-10 sm:py-14")}>
      <SummaryStrip
        url={scan.url}
        hostname={scan.hostname}
        scannedAt={scan.finishedAt ?? scan.createdAt}
        pagesCrawled={scan.pagesCrawled}
        summary={summary}
      />

      {isOwner && !scan.siteId ? (
        <p className="mt-4 rounded-md border border-foreground/20 bg-card px-4 py-3 text-sm">
          Add <span className="font-mono">{scan.hostname}</span> as a site in your dashboard to mark findings fixed or not
          applicable on its next scans.
        </p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <MatrixRail rows={rows} />
        <div className="min-w-0 space-y-6">
          {CHECK_CODES.map((code, index) => {
            const finding = byCode.get(code);
            if (!finding) return null;
            const note = notes.get(noteKey(finding.checkCode, finding.fingerprint)) ?? null;
            const canNote = isOwner && Boolean(scan.siteId) && finding.status !== "pass";
            return (
              <FindingSection
                key={finding.id}
                index={index}
                finding={finding}
                hostname={scan.hostname}
                notes={
                  canNote ? (
                    <NoteControl
                      action={saveNoteAction}
                      publicId={scan.publicId}
                      findingId={finding.id}
                      current={note ? { state: note.state, note: note.note, updatedAt: note.updatedAt.toISOString() } : null}
                    />
                  ) : null
                }
              />
            );
          })}

          <PagesTable pages={pages} hostname={scan.hostname} />
          <LimitationsBox limitations={scan.limitations} unknownChecks={unknownChecks} hostname={scan.hostname} />
          {!viewer ? <SaveScanCta publicId={scan.publicId} /> : null}
        </div>
      </div>
    </div>
  );
}
