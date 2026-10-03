import type { Metadata } from "next";
import { CtaLink } from "@/components/marketing/cta-link";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { container, links, quiet } from "@/components/marketing/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free: 5 scans a month, history and one monitored site. Pro, €19 a month: unlimited scans, 10 monitored sites, monthly re-scans with change alerts, PDF reports and team notes. Stripe test mode.",
  alternates: { canonical: "/pricing" },
};

type Cell = string | boolean;

const rows: { feature: string; anonymous: Cell; free: Cell; pro: Cell }[] = [
  { feature: "Scans", anonymous: "1", free: "5 a month", pro: "Unlimited" },
  { feature: "Report on a private link", anonymous: "30 days", free: true, pro: true },
  { feature: "Scan history", anonymous: false, free: true, pro: true },
  { feature: "Monitored sites", anonymous: false, free: "1", pro: "10" },
  { feature: "Monthly re-scan with change alerts", anonymous: false, free: false, pro: true },
  { feature: "PDF report", anonymous: false, free: false, pro: true },
  { feature: "Team notes on findings", anonymous: false, free: false, pro: true },
];

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <>
        <span aria-hidden="true" className="font-mono text-primary">
          ●
        </span>
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <span aria-hidden="true" className="font-mono text-foreground/60">
          –
        </span>
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="tabular">{value}</span>;
}

export default function PricingPage() {
  return (
    <div className={cn(container, "py-14 md:py-20")}>
      <header className="max-w-2xl">
        <p className="font-mono text-xs font-medium tracking-wide text-primary">Plans</p>
        <h1 className="mt-4 text-4xl leading-tight text-balance sm:text-5xl">Pricing</h1>
        <p className={cn("mt-5 text-lg leading-relaxed text-pretty", quiet)}>
          The first scan needs no account. An account keeps your history and watches one site; Pro watches ten and tells
          you when something changes.
        </p>
      </header>

      <PricingPlans headingLevel={2} className="mt-12" />

      <section aria-labelledby="compare-title" className="mt-20">
        <div className="border-t-2 border-foreground pt-4">
          <h2 id="compare-title" className="text-2xl sm:text-3xl">
            Compare plans
          </h2>
        </div>
        <div className="mt-6 rounded-lg border border-foreground/20 bg-card">
          <table className="w-full table-fixed text-left text-xs sm:text-sm">
            <caption className="sr-only">Plan features compared</caption>
            <colgroup>
              <col className="w-[34%]" />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="border-b border-foreground/20">
                <th scope="col" className="px-2 py-3 sm:px-4 font-mono text-xs font-medium tracking-wide uppercase">
                  Feature
                </th>
                <th scope="col" className="px-2 py-3 sm:px-4 font-heading font-bold">
                  No account
                </th>
                <th scope="col" className="px-2 py-3 sm:px-4 font-heading font-bold">
                  Free
                </th>
                <th scope="col" className="px-2 py-3 sm:px-4 font-heading font-bold text-primary">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {rows.map((row) => (
                <tr key={row.feature}>
                  <th scope="row" className="px-2 py-3 sm:px-4 font-medium">
                    {row.feature}
                  </th>
                  <td className="px-2 py-3 sm:px-4">
                    <CellValue value={row.anonymous} />
                  </td>
                  <td className="px-2 py-3 sm:px-4">
                    <CellValue value={row.free} />
                  </td>
                  <td className="px-2 py-3 sm:px-4">
                    <CellValue value={row.pro} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="billing-title" className="mt-20 grid gap-8 md:grid-cols-12">
        <div className="border-t-2 border-foreground pt-4 md:col-span-4">
          <h2 id="billing-title" className="text-2xl sm:text-3xl">
            Billing
          </h2>
        </div>
        <ul className={cn("space-y-4 text-[0.9375rem] leading-relaxed md:col-span-7 md:col-start-6 md:pt-5", quiet)}>
          <li>
            <span className="font-semibold text-foreground">Test mode.</span> Stripe runs in test mode on this demo.
            Checkout accepts Stripe&rsquo;s published test cards only; no real card is charged.
          </li>
          <li>
            <span className="font-semibold text-foreground">Monthly, cancel any time.</span> Pro is billed monthly
            through Stripe Checkout and managed in the Stripe customer portal.
          </li>
          <li>
            <span className="font-semibold text-foreground">Same checks on every plan.</span> Plans differ in volume
            and monitoring, not in what a scan looks for.
          </li>
          <li>
            <span className="font-semibold text-foreground">Not legal advice on any plan.</span> Reports list issues
            found with citations; they are not a certificate.
          </li>
        </ul>
      </section>

      <div className="mt-20 flex flex-col items-start gap-4 rounded-lg border-2 border-foreground bg-card px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="font-heading text-xl font-bold">Try it on your store first, without an account.</p>
        <CtaLink href={links.scan}>Scan a store</CtaLink>
      </div>
    </div>
  );
}
