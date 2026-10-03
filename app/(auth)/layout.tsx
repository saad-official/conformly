import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const RULES = [
  { label: "Withdrawal function", date: "19 Jun 2026" },
  { label: "Green claims", date: "27 Sep 2026" },
  { label: "Accessibility Act", date: "28 Jun 2025" },
  { label: "AI Act Art. 50", date: "2 Aug 2026" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1 flex-col bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between bg-midnight p-12 text-chalk lg:flex">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-chalk outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span aria-hidden className="size-3 rounded-full bg-indigo" />
          Conformly
        </Link>
        <div className="max-w-md space-y-6">
          <p className="font-heading text-4xl leading-tight font-bold tracking-tight">
            EU storefront rules, checked and watched.
          </p>
          <p className="text-sm text-chalk/70">
            One URL in. A pass/fail matrix out, with the evidence we found, the legal citation and a
            fix you can paste. Conformly reports issues; it is not legal advice.
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-chalk/15 pt-5 font-mono text-xs">
            {RULES.map((rule) => (
              <div key={rule.label}>
                <dt className="tracking-wide text-chalk/50 uppercase">{rule.label}</dt>
                <dd className="text-chalk/85">{rule.date}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="font-mono text-xs text-chalk/50">For small online shops selling to EU consumers.</p>
      </aside>

      <div className="ruled flex flex-1 flex-col px-4 py-8 sm:px-8">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-heading text-xl font-bold tracking-tight lg:invisible"
          >
            <span aria-hidden className="size-2.5 rounded-full bg-primary" />
            Conformly
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to home
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}
