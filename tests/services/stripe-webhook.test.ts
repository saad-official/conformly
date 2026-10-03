import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import Stripe from "stripe";

const SECRET = "whsec_test_conformly";
const saved = { key: process.env.STRIPE_SECRET_KEY, hook: process.env.STRIPE_WEBHOOK_SECRET };

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_not_a_real_key";
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
});

afterAll(() => {
  // Assigning undefined to process.env stores the string "undefined".
  if (saved.key === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = saved.key;
  if (saved.hook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = saved.hook;
});

function signedRequest(payload: string, secret = SECRET): Request {
  const header = new Stripe("sk_test_not_a_real_key").webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
}

describe("POST /api/webhooks/stripe", () => {
  it("rejects a missing or wrong signature", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: {} } });

    const unsigned = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: payload }));
    expect(unsigned.status).toBe(400);

    const forged = await POST(signedRequest(payload, "whsec_someone_else"));
    expect(forged.status).toBe(400);
  });

  it("acknowledges correctly signed events it does not act on", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const unhandled = JSON.stringify({ id: "evt_2", object: "event", type: "invoice.paid", data: { object: {} } });
    expect((await POST(signedRequest(unhandled))).status).toBe(200);

    const oneOff = JSON.stringify({
      id: "evt_3",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", object: "checkout.session", mode: "payment", subscription: null } },
    });
    const response = await POST(signedRequest(oneOff));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });
});
