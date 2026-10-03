import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How the Conformly demo handles data: public storefront pages only, anonymous scans purged after 30 days, logged model calls and no real payments.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage label="Policy" title="Privacy" updated="2026-10-03">
      <h2>The short version</h2>
      <p>
        Conformly is a portfolio demo built in public. It reads public storefront pages, stores what it found, and
        keeps as little about you as the features need. Do not rely on it for anything that matters to your business.
      </p>

      <h2>What a scan collects</h2>
      <ul>
        <li>The URL you submit, and the public pages of that store that Conformly fetched (up to 12).</li>
        <li>
          Those pages stored as text: titles, headings, links, buttons, form labels, script sources, image alt text,
          meta tags and body text. No cookies are set on the store and no forms are submitted.
        </li>
        <li>The findings: verdicts, evidence quotes, citations and suggested fixes.</li>
        <li>
          For anonymous scans, your IP address is used to limit how many free scans can be started from one address.
        </li>
      </ul>

      <h2>How long it is kept</h2>
      <ul>
        <li>
          <strong>Anonymous scans</strong>, with their crawled pages and findings, are deleted 30 days after the scan.
          Until then anyone with the private link can open the report, so share it with care.
        </li>
        <li>
          <strong>Scans made from an account</strong> are kept as history until you delete them or close the account.
        </li>
      </ul>

      <h2>What an account stores</h2>
      <ul>
        <li>Your email address and sign-in details, held by the authentication provider.</li>
        <li>Your organisation, its members, monitored sites, notes on findings and plan.</li>
        <li>Change alerts sent for monitored sites.</li>
      </ul>

      <h2>Who processes it</h2>
      <ul>
        <li>
          <strong>Vercel</strong> hosts the site and records anonymous page-view analytics.
        </li>
        <li>
          <strong>A hosted Postgres database</strong> and its authentication service store accounts, scans and findings.
        </li>
        <li>
          <strong>Groq</strong>, with <strong>Google Gemini</strong> as a fallback, classifies sentences that look like
          environmental claims. Only those sentences are sent, never your account details. Free-tier model providers may
          use inputs to improve their products.
        </li>
        <li>
          <strong>Stripe</strong> runs checkout in test mode. No real card is charged and no real payment is taken.
        </li>
        <li>
          <strong>Resend</strong> delivers alert emails only when demo delivery is switched on. Otherwise email lands in
          an in-app outbox and is not sent.
        </li>
      </ul>

      <h2>Model calls</h2>
      <p>
        Every model call is logged with the model, the prompt version and the token counts, so it can be reviewed. No
        model is involved in any verdict other than the green-claims check.
      </p>

      <h2>Your choices</h2>
      <p>
        To have your account or scans deleted, or an anonymous report removed before the 30 days are up, contact the
        maintainer through the project&rsquo;s GitHub repository. Do not post a report link in a public issue: anyone
        with the link can open the report.
      </p>
    </LegalPage>
  );
}
