import type { Metadata } from "next";
import Link from "next/link";
import { AnatomyMock, CalloutMarker } from "@/components/marketing/anatomy-mock";
import { ChecksList } from "@/components/marketing/checks-list";
import { ContentsRail, type ContentsEntry } from "@/components/marketing/contents-rail";
import { CtaLink } from "@/components/marketing/cta-link";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { MethodList } from "@/components/marketing/method-list";
import { MonitorMock } from "@/components/marketing/monitor-mock";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { ReportMock } from "@/components/marketing/report-mock";
import { RulesTimeline } from "@/components/marketing/rules-timeline";
import { ScanForm } from "@/components/marketing/scan-form";
import { SectionHeading } from "@/components/marketing/section-heading";
import { container, links, quiet, textLink } from "@/components/marketing/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Conformly — EU storefront compliance, checked and watched" },
  description:
    "Paste a store URL and get a pass/fail matrix for the EU rules that reached online shops in 2025 and 2026, with evidence, the legal citation and a fix for each issue found. Not legal advice.",
  alternates: { canonical: "/" },
};

const contents: ContentsEntry[] = [
  { id: "rules", number: "1", label: "The rules" },
  { id: "checks", number: "2", label: "The checks" },
  { id: "report", number: "3", label: "The report" },
  { id: "monitoring", number: "4", label: "Monitoring" },
  { id: "method", number: "5", label: "Method and limits" },
  { id: "pricing", number: "6", label: "Pricing" },
  { id: "faq", number: "7", label: "Questions" },
];

const anatomy: { letter: string; title: string; body: string }[] = [
  {
    letter: "A",
    title: "Summary strip",
    body: "The store, the scan date, how many pages were read, and the count of issues, warnings and unknowns. Never a percentage, never a pass mark.",
  },
  {
    letter: "B",
    title: "Matrix",
    body: "One verdict per check, in the same order and numbering as the list above. On the full page it runs down the left side and links to each finding.",
  },
  {
    letter: "C",
    title: "Findings",
    body: "Each issue as a numbered section: the quote and page it came from, the provision it relates to, and a fix as generic HTML with a Shopify note.",
  },
  {
    letter: "D",
    title: "Pages crawled",
    body: "Every URL that was read and what kind of page Conformly took it for, so you can see what the verdicts rest on.",
  },
  {
    letter: "E",
    title: "Limitations",
    body: "What the scan could not see: banners injected by JavaScript, pages blocked by robots.txt, checks that are samples. Stated on every report.",
  },
];

const faq: FaqItem[] = [
  {
    question: "Is this legal advice?",
    answer: (
      <>
        <p>
          No. Conformly reports issues found, with the evidence it read and the provision each one relates to. It never
          says a store is compliant: a report with no issues means these nine checks found nothing on the pages they
          could read.
        </p>
        <p>For a decision about your shop, ask a lawyer qualified in the countries you sell to.</p>
      </>
    ),
  },
  {
    question: "Which countries does it cover?",
    answer: (
      <>
        <p>
          The checks follow EU directives and regulations, which apply to shops selling to consumers in any member
          state, wherever the shop itself is based. It reads pages in English, German, French, Italian, Spanish and
          Dutch.
        </p>
        <p>
          The UK&rsquo;s Digital Markets, Competition and Consumers Act brings its own consumer rules in spring 2027.
          Reports flag it as upcoming; it is not checked yet.
        </p>
      </>
    ),
  },
  {
    question: "Does it run JavaScript?",
    answer: (
      <p>
        No. Pages are fetched server-side and read as HTML, the way a search engine&rsquo;s first pass would. That keeps
        the scan safe for your store, but anything a script adds after load, such as many cookie banners and chat
        widgets, may not be visible. When that happens the check is reported as unknown and the limitation is listed,
        rather than guessed.
      </p>
    ),
  },
  {
    question: "Does it use AI?",
    answer: (
      <p>
        Only to classify environmental claims. A keyword filter picks out candidate sentences and a model sorts them into
        generic, specific or not environmental, with a suggested rewording. The verdicts for every other check are rules
        you can read in the source code, and every model call is logged.
      </p>
    ),
  },
  {
    question: "Can it scan Shopify or WooCommerce stores?",
    answer: (
      <p>
        Yes. Standard Shopify and WooCommerce themes render their pages on the server, so the crawler sees what a
        customer sees. Fixes come as generic HTML with a Shopify note. Headless storefronts built as JavaScript apps
        often return little HTML; the report says so instead of reporting false issues.
      </p>
    ),
  },
];

export default function HomePage() {
  return (
    <>
      {/* Cover: the scan form and an example report. */}
      <section aria-labelledby="hero-title" className="ruled border-b border-foreground/15">
        <div
          className={cn(
            container,
            "grid items-start gap-12 py-12 sm:py-16 lg:py-20 xl:grid-cols-[minmax(0,1fr)_minmax(0,40rem)] xl:gap-14",
          )}
        >
          <div className="min-w-0">
            <p className="font-mono text-xs font-medium tracking-wide text-primary">
              Storefront scan · 9 checks · 12 pages
            </p>
            <h1 id="hero-title" className="mt-5 text-4xl leading-[1.08] text-balance sm:text-5xl lg:text-[3.4rem]">
              EU storefront compliance, checked and watched.
            </h1>
            <p className={cn("mt-6 max-w-xl text-lg leading-relaxed text-pretty", quiet)}>
              Four EU rules landed on online shops in fifteen months. Paste a store URL and get a pass/fail matrix with
              evidence, the legal citation and a fix for each.
            </p>
            <div id="scan" className="mt-8 max-w-[38rem] scroll-mt-8 rounded-lg border border-foreground/20 bg-card p-4 sm:p-5">
              <ScanForm id="hero-scan" />
            </div>
            <p className="mt-5 text-sm text-foreground/75">
              Conformly reports issues found with citations. It is not legal advice.
            </p>
          </div>
          <ReportMock className="max-w-3xl" />
        </div>
      </section>

      <div className={cn(container, "grid gap-12 pt-16 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-14 lg:pt-20")}>
        <ContentsRail entries={contents} className="hidden lg:block" />

        <div className="min-w-0 space-y-24">
          <section id="rules" aria-labelledby="rules-title" className="scroll-mt-8">
            <SectionHeading
              number="1"
              id="rules-title"
              title="Four rules in fifteen months"
              lead="Each one changes what a shop has to show on its own pages. Enforcement starts with warning letters from competitors and complaints from consumer groups, which reach small shops first."
            />
            <RulesTimeline className="mt-10" />
            <p className={cn("mt-10 max-w-2xl text-sm leading-relaxed", quiet)}>
              Conformly also checks two older duties that scanners rarely bundle: a cookie banner where rejecting is as
              easy as accepting, and a complete legal notice.
            </p>
          </section>

          <section id="checks" aria-labelledby="checks-title" className="scroll-mt-8">
            <SectionHeading
              number="2"
              id="checks-title"
              title="Nine checks, each with its citation"
              lead="Every check returns pass, warn, fail or unknown, with the page and quote it rests on. Eight decide by rule alone. One uses a model, and says so."
            />
            <ChecksList className="mt-10" />
            <p className={cn("mt-6 max-w-2xl text-sm leading-relaxed", quiet)}>
              Stores that render their pages with JavaScript are reported as a limitation of the scan, not as issues.
            </p>
          </section>

          <section id="report" aria-labelledby="report-title" className="scroll-mt-8">
            <SectionHeading
              number="3"
              id="report-title"
              title="A report you can forward"
              lead="Each scan produces one page on a private link. It reads like a short audit document, so it can go straight to whoever maintains the store."
            />
            <div className="mt-10 grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <AnatomyMock />
              <ol className="space-y-6">
                {anatomy.map((part) => (
                  <li key={part.letter} className="flex gap-4">
                    <CalloutMarker letter={part.letter} className="mt-0.5" />
                    <div className="min-w-0">
                      <h3 className="text-lg leading-snug">
                        <span className="sr-only">{part.letter}. </span>
                        {part.title}
                      </h3>
                      <p className={cn("mt-1.5 text-sm leading-relaxed text-pretty", quiet)}>{part.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section id="monitoring" aria-labelledby="monitoring-title" className="scroll-mt-8">
            <SectionHeading
              number="4"
              id="monitoring-title"
              title="Re-scanned every month"
              lead="Storefronts change: a new theme drops the withdrawal link, an app adds a chat widget. Pro re-scans each monitored site every 30 days and compares the result with the last scan."
            />
            <div className="mt-10 grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <ul className={cn("space-y-4 text-[0.9375rem] leading-relaxed", quiet)}>
                <li>
                  <span className="font-semibold text-foreground">New findings</span> since the last scan, with the
                  evidence that triggered them.
                </li>
                <li>
                  <span className="font-semibold text-foreground">Resolved findings</span>, so a fix is on record.
                </li>
                <li>
                  <span className="font-semibold text-foreground">Changed evidence</span> on findings that are still
                  open.
                </li>
                <li>
                  An email to the site owner when the findings change. Findings marked fixed or not applicable carry
                  over to the next scan, with the reason.
                </li>
              </ul>
              <MonitorMock />
            </div>
          </section>

          <section id="method" aria-labelledby="method-title" className="scroll-mt-8">
            <SectionHeading
              number="5"
              id="method-title"
              title="Method and limits"
              lead="A scanner that reads other people's shops should be predictable about how it does it."
            />
            <MethodList className="mt-10" />
          </section>

          <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-8">
            <SectionHeading
              number="6"
              id="pricing-title"
              title="Pricing"
              lead="The first scan needs no account. An account keeps your history; Pro watches your sites."
            />
            <PricingPlans className="mt-10" />
            <p className="mt-4 text-sm">
              <Link href={links.pricing} className={textLink}>
                Compare the plans in full
              </Link>
            </p>
          </section>

          <section id="faq" aria-labelledby="faq-title" className="scroll-mt-8">
            <SectionHeading number="7" id="faq-title" title="Questions" />
            <Faq items={faq} className="mt-8" />
          </section>

          <section
            aria-labelledby="cta-title"
            className="rounded-lg border-2 border-foreground bg-card px-5 py-10 sm:px-10 sm:py-12"
          >
            <p className="font-mono text-xs font-medium tracking-wide text-primary">End of document</p>
            <h2 id="cta-title" className="mt-4 max-w-xl text-3xl leading-tight text-balance sm:text-4xl">
              Start with one URL.
            </h2>
            <p className={cn("mt-4 max-w-xl leading-relaxed", quiet)}>
              One free scan, no account. The report stays on a private link for 30 days.
            </p>
            <CtaLink href="#scan" className="mt-8">
              Scan a store
            </CtaLink>
          </section>
        </div>
      </div>
    </>
  );
}
