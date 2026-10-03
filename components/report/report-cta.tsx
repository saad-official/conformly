import { CtaLink } from "@/components/marketing/cta-link";

/** Footer call to action for anonymous viewers: sign up and come back to this report. */
export function SaveScanCta({ publicId }: { publicId: string }) {
  const next = `/r/${publicId}`;
  return (
    <section
      aria-labelledby="save-scan"
      className="flex flex-col gap-4 rounded-lg border-2 border-foreground bg-card px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <div className="max-w-prose">
        <h2 id="save-scan" className="text-lg">
          Save this scan and monitor the store
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-foreground/75">
          A free account keeps your scan history and runs 5 scans a month. Pro re-scans monthly and emails you when a
          finding changes. Anonymous reports are deleted after 30 days.
        </p>
      </div>
      <CtaLink href={`/sign-up?next=${encodeURIComponent(next)}`} size="md">
        Save this scan and monitor the store
      </CtaLink>
    </section>
  );
}
