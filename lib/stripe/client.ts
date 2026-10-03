import "server-only";
import Stripe from "stripe";
import { requireEnv } from "@/lib/env";

let cached: Stripe | undefined;

/** Server-side Stripe client. Test-mode (sandbox) keys only in this project. */
export function stripe(): Stripe {
  if (!cached) {
    cached = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      appInfo: { name: "Conformly", url: "https://github.com/saad-official/conformly" },
    });
  }
  return cached;
}
