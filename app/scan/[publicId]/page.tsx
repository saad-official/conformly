import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { StatusPoller } from "@/components/scan/status-poller";
import { getScanStatus } from "@/lib/services/scan";

export const metadata: Metadata = {
  title: "Scanning…",
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

/**
 * Shown only while a scan is still queued or running (a reload, or a shared
 * link opened mid-scan); the scan form itself waits for the finished report.
 */
export default async function ScanProgressPage({ params }: PageProps<"/scan/[publicId]">) {
  const { publicId } = await params;
  await connection();
  const view = await getScanStatus(publicId);
  if (!view) notFound();
  if (view.status === "done" || view.status === "failed") redirect(`/r/${view.publicId}`);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="font-mono text-xs tracking-wide text-foreground/70 uppercase">Scan in progress</p>
      <h1 className="mt-3 text-3xl leading-tight sm:text-4xl">
        Scanning <span className="break-all">{view.hostname}</span>…
      </h1>
      <p className="mt-4 max-w-prose leading-relaxed text-foreground/80">
        Conformly is reading up to 12 pages of the store (homepage, products, cart, legal pages and the account area) and
        running nine checks. This usually takes under a minute.
      </p>
      <div
        aria-hidden="true"
        className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10 motion-safe:[&>span]:animate-pulse"
      >
        <span className="block h-full w-1/3 rounded-full bg-primary" />
      </div>
      <div className="mt-4">
        <StatusPoller publicId={view.publicId} />
      </div>
      <noscript>
        <p className="mt-4 text-sm">
          <a href={`/r/${view.publicId}`} className="font-medium text-primary underline underline-offset-4">
            Open the report
          </a>{" "}
          when the scan has finished.
        </p>
      </noscript>
    </div>
  );
}
