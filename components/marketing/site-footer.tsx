import Link from "next/link";
import { cn } from "@/lib/utils";
import { container, focusRing, links, quiet, textLink } from "./site";
import { Wordmark } from "./wordmark";

const footLink = cn("text-sm text-foreground/80 hover:text-foreground hover:underline underline-offset-4", focusRing);
const groupLabel = "font-mono text-xs tracking-wide text-foreground/70 uppercase";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t-2 border-foreground bg-background">
      <div className={cn(container, "grid gap-10 py-12 md:grid-cols-12")}>
        <div className="md:col-span-5">
          <Wordmark />
          <p className={cn("mt-4 max-w-sm text-sm leading-relaxed", quiet)}>
            Built in public as part of the{" "}
            <a href={links.series} className={textLink}>
              Vibe Build Series
            </a>
            .
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
          <div>
            <p className={groupLabel}>Product</p>
            <ul className="mt-3 space-y-2.5">
              <li>
                <Link href={links.scan} className={footLink}>
                  Scan a store
                </Link>
              </li>
              <li>
                <Link href={links.checks} className={footLink}>
                  Checks
                </Link>
              </li>
              <li>
                <Link href={links.pricing} className={footLink}>
                  Pricing
                </Link>
              </li>
              <li>
                <Link href={links.signIn} className={footLink}>
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className={groupLabel}>Project</p>
            <ul className="mt-3 space-y-2.5">
              <li>
                <a href={links.repo} className={footLink}>
                  GitHub
                </a>
              </li>
              <li>
                <a href={links.series} className={footLink}>
                  Vibe Build Series
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className={groupLabel}>Policies</p>
            <ul className="mt-3 space-y-2.5">
              <li>
                <Link href={links.privacy} className={footLink}>
                  Privacy
                </Link>
              </li>
              <li>
                <Link href={links.terms} className={footLink}>
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="border-t border-foreground/15">
        <p className={cn(container, "py-6 text-sm leading-relaxed", quiet)}>
          Demo project: Stripe runs in test mode and no real payments are taken. Conformly reports issues with
          citations; it is not legal advice.
        </p>
      </div>
    </footer>
  );
}
