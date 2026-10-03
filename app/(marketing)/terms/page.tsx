import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { links, textLink } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms for the Conformly demo: what a scan is and is not, acceptable use of the crawler, test-mode billing and no warranty. Not legal advice.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage label="Policy" title="Terms" updated="2026-10-03">
      <h2>What Conformly is</h2>
      <p>
        Conformly is a demo project, built in public as part of the{" "}
        <a href={links.series} className={textLink}>
          Vibe Build Series
        </a>
        . It scans the public pages of an online shop and reports issues found against nine checks, each with evidence
        and the provision it relates to.
      </p>

      <h2>What a report is not</h2>
      <ul>
        <li>
          <strong>Not legal advice.</strong> A report points to issues and cites the rule they relate to. It does not
          interpret the law for your situation.
        </li>
        <li>
          <strong>Not a statement of compliance.</strong> Conformly never says a store is compliant. A report with no
          issues means the checks found nothing on the pages they could read.
        </li>
        <li>
          <strong>Not a full accessibility audit.</strong> The accessibility check is a sample of five technical tests.
        </li>
        <li>
          <strong>Not complete.</strong> The crawler reads at most 12 pages, does not run JavaScript and skips what
          robots.txt disallows. Each report lists its limitations.
        </li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Scan stores you own, run, or have been asked to review.</li>
        <li>Do not use Conformly to send automated traffic to a site, or to work around its rate limits.</li>
        <li>Do not present a report as a legal opinion or as certification.</li>
      </ul>

      <h2>Accounts and billing</h2>
      <p>
        The Free plan includes 5 scans a month, history and one monitored site. Pro is listed at €19 a month. Stripe
        runs in test mode on this demo: checkout accepts test cards only and no real payment is taken.
      </p>

      <h2>No warranty</h2>
      <p>
        Conformly is provided as is, without warranty of any kind. Verdicts can be wrong, rules change, and the demo may
        be reset or taken offline. To the extent the law allows, the project accepts no liability for decisions made on
        the basis of a report.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may change as the project develops. The date at the top shows the last update, and the history is
        in the public repository.
      </p>
    </LegalPage>
  );
}
