import type { CheckCode } from "@/lib/checks/types";
import type { ScanLimitations } from "@/lib/db/types";
import { anchorFor, displayPath, fieldLabel } from "./format";

const MAX_LISTED = 8;

/**
 * What this scan could not see (spec 3.3, 8): JavaScript-rendered content,
 * pages robots.txt kept us out of, fetch errors, checks left unknown, and the
 * standing limits of the method.
 */
export function LimitationsBox({
  limitations,
  unknownChecks,
  hostname,
  showMethodLimits = true,
}: {
  limitations: ScanLimitations | null;
  unknownChecks: ReadonlyArray<{ code: CheckCode; title: string }>;
  hostname: string;
  /** The standing limits of the method; off for a failed scan, where no check ran. */
  showMethodLimits?: boolean;
}) {
  const robots = limitations?.robotsBlocked ?? [];
  const errors = limitations?.errors ?? [];
  return (
    <section aria-labelledby="limitations" className="rounded-lg border border-dashed border-foreground/35 bg-card px-4 py-4 sm:px-6">
      <h2 id="limitations" className={fieldLabel}>
        Limitations
      </h2>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        {limitations?.jsRenderedSuspected ? (
          <li>
            The homepage looks like a JavaScript-rendered shell. Conformly does not run JavaScript, so content added in the
            browser was not seen and missing evidence is reported as unknown rather than as an issue.
          </li>
        ) : null}
        {robots.length > 0 ? (
          <li>
            robots.txt asked ConformlyBot not to fetch {robots.length} {robots.length === 1 ? "page" : "pages"}, so{" "}
            {robots.length === 1 ? "it was" : "they were"} skipped:{" "}
            <span className="font-mono text-xs break-all">
              {robots
                .slice(0, MAX_LISTED)
                .map((url) => displayPath(url, hostname))
                .join(", ")}
              {robots.length > MAX_LISTED ? `, and ${robots.length - MAX_LISTED} more` : ""}
            </span>
            .
          </li>
        ) : null}
        {errors.length > 0 ? (
          <li>
            {errors.length} {errors.length === 1 ? "request" : "requests"} failed:
            <ul className="mt-1 space-y-1 pl-1">
              {errors.slice(0, MAX_LISTED).map((error, i) => (
                <li key={`${error.url}-${i}`} className="font-mono text-xs break-all">
                  {displayPath(error.url, hostname)} — {error.message}
                </li>
              ))}
              {errors.length > MAX_LISTED ? (
                <li className="font-mono text-xs">and {errors.length - MAX_LISTED} more</li>
              ) : null}
            </ul>
          </li>
        ) : null}
        {unknownChecks.length > 0 ? (
          <li>
            {unknownChecks.length === 1 ? "One check" : `${unknownChecks.length} checks`} could not reach a verdict and{" "}
            {unknownChecks.length === 1 ? "needs" : "need"} a manual look:{" "}
            {unknownChecks.map((check, i) => (
              <span key={check.code}>
                {i > 0 ? ", " : ""}
                <a href={`#${anchorFor(check.code)}`} className="font-mono text-xs text-primary underline underline-offset-4">
                  {check.code}
                </a>
              </span>
            ))}
            .
          </li>
        ) : null}
        {showMethodLimits ? (
          <>
            <li>
              At most 12 pages are read per scan (homepage, up to 4 products, cart, checkout, legal pages and the account
              area), so issues on other pages are not covered.
            </li>
            <li>a11y_sample is a sample of five technical checks, not a WCAG audit.</li>
          </>
        ) : null}
      </ul>
    </section>
  );
}
