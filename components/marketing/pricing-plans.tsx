import { cn } from "@/lib/utils";
import { CtaLink } from "./cta-link";
import { links, quiet } from "./site";

type Plan = {
  name: string;
  price: string;
  period: string;
  summary: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
};

export const plans: Plan[] = [
  {
    name: "Free",
    price: "€0",
    period: "no card needed",
    summary: "For checking your own shop before the warning letters arrive.",
    features: ["5 scans a month", "Scan history", "1 monitored site"],
    cta: { label: "Create a free account", href: links.signIn },
  },
  {
    name: "Pro",
    price: "€19",
    period: "per month",
    summary: "For agencies and shops that change their storefront often.",
    features: [
      "Unlimited scans",
      "10 monitored sites",
      "Monthly re-scan with change alerts",
      "PDF report",
      "Team notes on findings",
    ],
    cta: { label: "Choose Pro", href: links.signIn },
    featured: true,
  },
];

/**
 * The two plans side by side. `headingLevel` keeps the outline correct: h3
 * under the landing page's Pricing section, h2 on the pricing page.
 */
export function PricingPlans({ headingLevel = 3, className }: { headingLevel?: 2 | 3; className?: string }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={className}>
      <ul className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <li
            key={plan.name}
            className={cn(
              "flex flex-col rounded-lg border bg-card p-6",
              plan.featured ? "border-2 border-primary" : "border-foreground/20",
            )}
          >
            <div className="flex items-baseline justify-between gap-4">
              <Heading className="text-xl">{plan.name}</Heading>
              {plan.featured ? (
                <span className="font-mono text-xs tracking-wide text-primary uppercase">Monitoring</span>
              ) : null}
            </div>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="font-heading text-4xl font-bold tabular">{plan.price}</span>
              <span className="text-sm text-foreground/75">{plan.period}</span>
            </p>
            <p className={cn("mt-3 text-sm leading-relaxed", quiet)}>{plan.summary}</p>
            <ul className="mt-5 flex-1 space-y-2.5 border-t border-foreground/15 pt-5 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-primary" />
                  {feature}
                </li>
              ))}
            </ul>
            <CtaLink
              href={plan.cta.href}
              variant={plan.featured ? "primary" : "outline"}
              size="md"
              className="mt-6 h-11 w-full"
            >
              {plan.cta.label}
            </CtaLink>
          </li>
        ))}
      </ul>
      <p className={cn("mt-4 max-w-2xl text-sm leading-relaxed", quiet)}>
        Stripe runs in test mode on this demo. Checkout accepts Stripe&rsquo;s published test cards only, and no real
        payment is taken.
      </p>
    </div>
  );
}
