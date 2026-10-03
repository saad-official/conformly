import type { Metadata } from "next";
import { Check, CircleCheck, Info } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { formatDate } from "@/components/dashboard/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/session";
import { PLAN_LIMITS, getMonitorCapacity, getScanQuota } from "@/lib/services/billing-limits";
import { isBillingConfigured, isPortalConfigured } from "@/lib/stripe/billing";
import { cn } from "@/lib/utils";
import { ManageButton, UpgradeButton } from "./billing-buttons";

export const metadata: Metadata = { title: "Billing" };

/** Plans from spec 2. Pro runs in Stripe test mode only. */
const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "€0",
    period: "forever",
    features: [
      `${PLAN_LIMITS.free.scansPerMonth} scans a month`,
      "Scan history",
      `${PLAN_LIMITS.free.monitoredSites} monitored site, re-scanned monthly`,
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "€19",
    period: "per month",
    features: [
      "Unlimited scans",
      `${PLAN_LIMITS.pro.monitoredSites} monitored sites`,
      "Monthly re-scan with change alerts by email",
      "PDF report",
      "Team notes on findings",
    ],
  },
] as const;

function requestTime(): Date {
  return new Date();
}

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const { org, role } = await requireOrgContext();
  const { checkout } = await searchParams;
  const [quota, monitors] = await Promise.all([
    getScanQuota(org.id, org.plan, requestTime()),
    getMonitorCapacity(org.id, org.plan),
  ]);
  const isPro = org.plan === "pro";
  const configured = isBillingConfigured();
  const portalAvailable = Boolean(isPortalConfigured() && org.stripeCustomerId);
  const isOwner = role === "owner";

  return (
    <>
      <PageHeader
        title="Billing"
        description={
          <>
            {quota.limit === null ? (
              <>
                <span className="tabular font-mono text-foreground">{quota.used}</span> scans this month, no limit.
              </>
            ) : (
              <>
                <span className="tabular font-mono text-foreground">{quota.used}</span> of{" "}
                <span className="tabular font-mono text-foreground">{quota.limit}</span> scans used this month (resets{" "}
                {formatDate(quota.resetsAt, "UTC")}).
              </>
            )}{" "}
            <span className="tabular font-mono text-foreground">{Math.min(monitors.used, monitors.limit)}</span> of{" "}
            <span className="tabular font-mono text-foreground">{monitors.limit}</span> monitored{" "}
            {monitors.limit === 1 ? "site" : "sites"}.
          </>
        }
      />

      {checkout === "success" ? (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-lg bg-pass/10 px-4 py-3 text-sm">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-pass" aria-hidden />
          {isPro
            ? "Payment received. You're on Pro."
            : "Payment received. Your plan switches to Pro as soon as Stripe confirms it, usually within a few seconds. Refresh to check."}
        </p>
      ) : checkout === "cancelled" ? (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-foreground/80">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Checkout cancelled. Nothing was charged.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => {
          const current = plan.id === org.plan;
          return (
            <Card key={plan.id} className={cn(current && "ring-2 ring-primary")}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-bold">
                  {plan.name}
                  {current ? (
                    <Badge variant="secondary" className="font-mono tracking-wide uppercase">
                      Current plan
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  <span className="tabular font-heading text-3xl font-bold text-foreground">{plan.price}</span>{" "}
                  <span>{plan.period}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="grid gap-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-pass" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              {plan.id === "pro" ? (
                <CardFooter className="flex-col items-stretch gap-3">
                  {isPro ? (
                    <ManageButton disabled={!portalAvailable || !isOwner} />
                  ) : (
                    <UpgradeButton disabled={!configured || !isOwner} />
                  )}
                  {!isPro && org.stripeCustomerId ? <ManageButton disabled={!portalAvailable || !isOwner} /> : null}
                </CardFooter>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-2 text-sm text-foreground/72">
        <p className="ruled rounded-lg border border-dashed bg-card px-4 py-3">
          <span className="font-medium text-foreground">Test mode:</span> pay with card{" "}
          <span className="font-mono text-foreground">4242 4242 4242 4242</span>, any future expiry date, any CVC and
          postcode. No real charge is made.
        </p>
        <p>
          Cancelling or a failed renewal moves the organisation back to Free: the oldest monitored site keeps being
          re-scanned, the others pause, and change emails stop. Scans and notes are kept.
        </p>
        {!configured ? (
          <p>
            Billing is not set up on this deployment: <span className="code">STRIPE_SECRET_KEY</span> and{" "}
            <span className="code">STRIPE_PRICE_PRO_MONTHLY</span> are missing, so the buttons are disabled.
          </p>
        ) : null}
        {!isOwner ? <p>Only the organisation owner can change the plan.</p> : null}
        {isPro && !portalAvailable && configured ? (
          <p>Subscription management opens once Stripe has linked a customer to this organisation.</p>
        ) : null}
      </div>
    </>
  );
}
