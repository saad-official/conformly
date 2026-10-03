import type { Scan } from "@/lib/db/types";
import { formatStamp, safeHref } from "./format";

/**
 * A failed scan, reported honestly: what was attempted, why it stopped, and
 * a form to run it again (a new scan, counted against the usual limits).
 */
export function ScanFailure({
  scan,
  scanAction,
  siteId,
  details,
}: {
  scan: Pick<Scan, "url" | "hostname" | "error" | "createdAt" | "finishedAt">;
  /** The scan route the retry form posts to. */
  scanAction: string;
  /** Only for the owner: keeps the retry attached to their site. */
  siteId?: string | null;
  details?: React.ReactNode;
}) {
  const href = safeHref(scan.url);
  const when = scan.finishedAt ?? scan.createdAt;
  return (
    <div className="space-y-8">
      <header className="overflow-hidden rounded-lg border border-foreground/20 bg-card shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-foreground/15 px-4 py-3 sm:px-6">
          <p className="font-mono text-xs tracking-wide text-foreground/70 uppercase">Storefront report</p>
          <p className="font-mono text-xs text-foreground/72 tabular">
            <time dateTime={when.toISOString()}>{formatStamp(when)}</time>
          </p>
        </div>
        <div className="px-4 py-5 sm:px-6">
          <p className="verdict bg-card text-fail">scan failed</p>
          <h1 className="mt-3 text-2xl leading-tight sm:text-3xl">
            The scan of <span className="break-all">{scan.hostname}</span> did not complete
          </h1>
          {href ? (
            <p className="mt-1 font-mono text-xs break-all text-foreground/72">{scan.url}</p>
          ) : null}
          <p className="mt-4 max-w-prose leading-relaxed" role="alert">
            {scan.error ?? "The scan stopped before any check could run."}
          </p>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-foreground/75">
            No checks ran, so this report says nothing about the store either way.
          </p>
        </div>
      </header>

      {details}

      <section aria-labelledby="retry" className="rounded-lg border border-foreground/20 bg-card px-4 py-5 sm:px-6">
        <h2 id="retry" className="text-lg">
          Try again
        </h2>
        <p className="mt-1 text-sm text-foreground/75">Check the address, then run a new scan.</p>
        <form method="post" action={scanAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="retry-url" className="sr-only">
            Store URL
          </label>
          <input
            id="retry-url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
            maxLength={2048}
            defaultValue={scan.url}
            className="h-11 w-full min-w-0 rounded-md border border-foreground/30 bg-background px-3 font-mono text-sm focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-primary sm:flex-1"
          />
          {siteId ? <input type="hidden" name="siteId" value={siteId} /> : null}
          <button
            type="submit"
            className="h-11 shrink-0 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/88 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-primary"
          >
            Scan again
          </button>
        </form>
      </section>
    </div>
  );
}
