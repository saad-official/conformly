import { ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Scan route (built separately): accepts a form POST with `url` and an optional `siteId`, then redirects to the report. */
export const SCAN_ACTION = "/api/scan";

/**
 * Signed-in scan form: a plain POST to the scan route, so it works without
 * JavaScript. Accepts a bare host ("yourstore.com") as well as a full URL.
 */
export function UrlScanForm({ id, note, className }: { id: string; note?: React.ReactNode; className?: string }) {
  const inputId = `${id}-url`;
  const noteId = `${id}-note`;
  return (
    <form method="post" action={SCAN_ACTION} className={cn("w-full max-w-xl text-left", className)}>
      <label htmlFor={inputId} className="block text-sm font-semibold">
        Store URL
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={2048}
          pattern="\s*(https?://)?[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+(:[0-9]+)?(/\S*)?\s*"
          title="A web address such as yourstore.com or https://yourstore.com"
          placeholder="https://yourstore.example"
          aria-describedby={note ? noteId : undefined}
          className={cn(
            "h-11 w-full min-w-0 rounded-lg border border-foreground/25 bg-card px-3 font-mono text-base sm:flex-1",
            "placeholder:text-foreground/55 hover:border-foreground/45 user-invalid:border-fail",
            "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        />
        <Button type="submit" className="h-11 px-5 text-base">
          <ScanSearch aria-hidden />
          Scan
        </Button>
      </div>
      {note ? (
        <p id={noteId} className="mt-2 text-sm text-foreground/72">
          {note}
        </p>
      ) : null}
    </form>
  );
}

/**
 * "Scan now" for a known site: hidden `url` and `siteId`, so the scan is
 * recorded against the site. Disabled (with the reason shown) when the
 * month's scans are used up.
 */
export function SiteScanForm({
  url,
  siteId,
  label = "Scan now",
  disabledReason,
  size = "default",
  className,
}: {
  url: string;
  siteId: string;
  label?: string;
  disabledReason?: string | null;
  size?: "default" | "lg";
  className?: string;
}) {
  const disabled = Boolean(disabledReason);
  const reasonId = `scan-${siteId}-reason`;
  return (
    <form method="post" action={SCAN_ACTION} className={cn("grid justify-items-start gap-1.5", className)}>
      <input type="hidden" name="url" value={url} />
      <input type="hidden" name="siteId" value={siteId} />
      <Button
        type="submit"
        size={size}
        disabled={disabled}
        aria-describedby={disabled ? reasonId : undefined}
        className={size === "lg" ? "h-10 px-4" : undefined}
      >
        <ScanSearch aria-hidden />
        {label}
      </Button>
      {disabled ? (
        <p id={reasonId} className="max-w-xs text-xs text-foreground/72">
          {disabledReason}
        </p>
      ) : null}
    </form>
  );
}
