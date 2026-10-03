import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type Stripe from "stripe";
import type { Finding } from "@/lib/checks/types";
import type { DbHandle } from "@/lib/db/client";
import * as alertsRepo from "@/lib/db/repositories/alerts";
import * as findingsRepo from "@/lib/db/repositories/findings";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import * as outboxRepo from "@/lib/db/repositories/outbox";
import * as scansRepo from "@/lib/db/repositories/scans";
import * as sitesRepo from "@/lib/db/repositories/sites";
import * as sitesExtra from "@/lib/db/repositories/sites-extra";
import { memberships, user } from "@/lib/db/schema";
import type { Organization } from "@/lib/db/types";
import type { EmailProvider, OutgoingEmail } from "@/lib/email/provider";
import { summarize } from "@/lib/report/summary";
import {
  canStartScan,
  checkCanEnableMonitor,
  eligibleMonitoredSiteIds,
  nextMonitorRun,
} from "@/lib/services/billing-limits";
import { diffFindings, runMonitorTick, type DiffableFinding, type StartScanFn } from "@/lib/services/monitor";
import { syncSubscriptionToOrg } from "@/lib/stripe/billing";
import { finding, insertOrg, startTestDb, stopTestDb } from "../db/helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

const DAY = 24 * 60 * 60 * 1000;

function row(checkCode: DiffableFinding["checkCode"], status: DiffableFinding["status"], fingerprint = `${checkCode}-${status}`): DiffableFinding {
  return { checkCode, status, fingerprint, severity: "high", title: `Title ${checkCode}` };
}

describe("diffFindings", () => {
  it("sorts changes into new, resolved and changed by status and fingerprint", () => {
    const before = [
      row("withdrawal_function", "pass"),
      row("withdrawal_policy", "fail"),
      row("green_claims", "warn", "a"),
      row("accessibility_statement", "fail"),
      row("a11y_sample", "warn"),
      row("legal_notice", "pass"),
    ];
    const after = [
      row("withdrawal_function", "fail"),
      row("withdrawal_policy", "pass"),
      row("green_claims", "warn", "b"),
      row("accessibility_statement", "warn"),
      row("a11y_sample", "warn"),
      row("legal_notice", "pass"),
      row("ai_disclosure", "warn"),
    ];
    const diff = diffFindings(before, after);
    expect(diff.new.map((c) => c.checkCode)).toEqual(["withdrawal_function", "ai_disclosure"]);
    expect(diff.resolved.map((c) => c.checkCode)).toEqual(["withdrawal_policy"]);
    expect(diff.changed.map((c) => c.checkCode)).toEqual(["green_claims", "accessibility_statement"]);
    expect(diff.changed[1]).toMatchObject({ before: "fail", after: "warn" });
    expect(diff.unchanged).toBe(2);
  });

  it("reports nothing for identical scans", () => {
    const scan = [row("withdrawal_function", "fail"), row("legal_notice", "pass")];
    const diff = diffFindings(scan, scan);
    expect(diff.new.length + diff.resolved.length + diff.changed.length).toBe(0);
    expect(diff.unchanged).toBe(2);
  });
});

describe("billing limits", () => {
  it("schedules the next cron run at 06:00 UTC on or after the due date", () => {
    const last = new Date("2026-09-01T10:00:00Z");
    expect(nextMonitorRun(last, 30, new Date("2026-09-15T00:00:00Z")).toISOString()).toBe("2026-10-02T06:00:00.000Z");
    expect(nextMonitorRun(null, 30, new Date("2026-10-03T05:00:00Z")).toISOString()).toBe("2026-10-03T06:00:00.000Z");
    expect(nextMonitorRun(null, 30, new Date("2026-10-03T07:00:00Z")).toISOString()).toBe("2026-10-04T06:00:00.000Z");
    // Overdue: the next run from now.
    expect(nextMonitorRun(last, 30, new Date("2026-11-20T12:00:00Z")).toISOString()).toBe("2026-11-21T06:00:00.000Z");
  });

  it("keeps the oldest monitored sites within the plan limit", () => {
    const sites = [
      { id: "b", createdAt: new Date("2026-02-01") },
      { id: "a", createdAt: new Date("2026-01-01") },
      { id: "c", createdAt: new Date("2026-03-01") },
    ];
    expect([...eligibleMonitoredSiteIds(sites, "free")]).toEqual(["a"]);
    expect([...eligibleMonitoredSiteIds(sites, "pro")]).toEqual(["a", "b", "c"]);
  });

  it("enforces the monthly scan quota and the monitored-site limit on Free", async () => {
    const org = await insertOrg(handle, "Quota Shop");
    for (let i = 0; i < 5; i++) await scansRepo.create(org.id, { url: `https://quota${i}.example/` });
    const verdict = await canStartScan(org.id, "free", new Date());
    expect(verdict.ok).toBe(false);
    expect((await canStartScan(org.id, "pro", new Date())).ok).toBe(true);

    const one = await sitesRepo.create(org.id, { url: "one.example" });
    const two = await sitesRepo.create(org.id, { url: "two.example" });
    expect(await checkCanEnableMonitor(org.id, "free", one.id)).toBeNull();
    await sitesRepo.setMonitor(org.id, one.id, true);
    expect(await checkCanEnableMonitor(org.id, "free", one.id)).toBeNull();
    expect(await checkCanEnableMonitor(org.id, "free", two.id)).toMatch(/Free plan monitors 1 site/);
    expect(await checkCanEnableMonitor(org.id, "pro", two.id)).toBeNull();
  });
});

async function addOwner(org: Organization, email: string) {
  const id = `user_${Math.random().toString(36).slice(2, 10)}`;
  await handle.db.insert(user).values({ id, name: "Owner", email });
  await handle.db.insert(memberships).values({ orgId: org.id, userId: id, role: "owner" });
}

/** A scan service stand-in: creates a finished scan with the next queued findings for the URL's host. */
function fakeScanService(plan: Map<string, Finding[][]>): StartScanFn {
  return async (input) => {
    const orgId = input.requester.orgId ?? null;
    const scan = await scansRepo.create(orgId, { url: input.url, siteId: input.requester.siteId ?? null });
    const queue = plan.get(scan.hostname) ?? [];
    const findings = queue.shift() ?? [];
    await findingsRepo.bulkInsert(orgId, scan.id, findings);
    await scansRepo.finish(orgId, scan.id, { status: "done", summary: summarize(findings), pagesCrawled: 3 });
    return { publicId: scan.publicId, scanId: scan.id, status: "done" };
  };
}

class FakeEmail implements EmailProvider {
  readonly name = "outbox" as const;
  sent: OutgoingEmail[] = [];
  async send(email: OutgoingEmail) {
    this.sent.push(email);
    return { provider: "outbox" as const, providerMessageId: null, deliveredTo: email.to, demo: true };
  }
}

describe("runMonitorTick", () => {
  it("re-scans due sites within plan limits, diffs, alerts, emails Pro owners and purges old anonymous scans", async () => {
    const pro = await insertOrg(handle, "Pro Shop");
    await organizationsRepo.setPlan(pro.id, { plan: "pro" });
    await addOwner(pro, "owner@pro.example");
    const free = await insertOrg(handle, "Free Shop");
    await addOwner(free, "owner@free.example");

    const proSite = await sitesRepo.create(pro.id, { url: "pro-shop.example", monitorEnabled: true });
    const freeSite = await sitesRepo.create(free.id, { url: "free-shop.example", monitorEnabled: true });
    const freeExtra = await sitesRepo.create(free.id, { url: "free-extra.example", monitorEnabled: true });
    const unmonitored = await sitesRepo.create(pro.id, { url: "quiet.example" });

    const plan = new Map<string, Finding[][]>([
      [
        "pro-shop.example",
        [
          [finding({ code: "withdrawal_function", status: "fail" }), finding({ code: "legal_notice", status: "pass", evidence: [] })],
          [finding({ code: "withdrawal_function", status: "pass", evidence: [] }), finding({ code: "legal_notice", status: "fail" })],
        ],
      ],
      [
        "free-shop.example",
        [[finding({ code: "green_claims", status: "pass", evidence: [] })], [finding({ code: "green_claims", status: "warn" })]],
      ],
    ]);
    const startScan = fakeScanService(plan);
    // Baseline scans, as if run by the users.
    for (const site of [proSite, freeSite]) {
      await startScan({ url: site.url, requester: { ip: "test", orgId: site.orgId, siteId: site.id } });
    }
    const anonymous = await scansRepo.create(null, { url: "https://anon.example/" });

    const email = new FakeEmail();
    const now = new Date(Date.now() + 31 * DAY);
    const summary = await runMonitorTick(now, { startScan, emailProvider: email, appUrl: "https://app.example" });

    expect(summary.errors).toEqual([]);
    expect(summary.started.map((s) => s.siteId)).toEqual(expect.arrayContaining([proSite.id, freeSite.id]));
    expect(summary.skipped).toContainEqual({ siteId: freeExtra.id, reason: "over_plan_limit" });
    expect(summary.started.some((s) => s.siteId === unmonitored.id)).toBe(false);
    expect(summary.purgedAnonymousScans).toBeGreaterThanOrEqual(1);
    expect(await scansRepo.getById(null, anonymous.id)).toBeNull();

    const byOutcome = Object.fromEntries(summary.processed.map((p) => [p.siteId, p]));
    expect(byOutcome[proSite.id]).toMatchObject({ outcome: "alerted", emailed: true });
    expect(byOutcome[freeSite.id]).toMatchObject({ outcome: "alerted_no_email", emailed: false });

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("owner@pro.example");
    expect(email.sent[0].subject).toMatch(/pro-shop\.example: 1 new, 1 resolved/);
    expect(email.sent[0].text).toContain("https://app.example/r/");
    expect(email.sent[0].text).toContain("Not legal advice");

    const [proAlert] = await alertsRepo.listForOrg(pro.id);
    expect(proAlert).toMatchObject({ kind: "scan_diff", siteId: proSite.id });
    expect(proAlert.sentAt).toBeInstanceOf(Date);
    expect(proAlert.payload).toMatchObject({ counts: { new: 1, resolved: 1, changed: 0 } });
    const [message] = await outboxRepo.listForOrg(pro.id);
    expect(message).toMatchObject({ alertId: proAlert.id, toEmail: "owner@pro.example", status: "sent" });

    const [freeAlert] = await alertsRepo.listForOrg(free.id);
    expect(freeAlert).toMatchObject({ kind: "scan_diff", sentAt: null });
    expect(freeAlert.payload).toMatchObject({ email: "free_plan" });
    expect(await outboxRepo.listForOrg(free.id)).toHaveLength(0);

    // A later tick does not process the same scans again.
    const again = await runMonitorTick(now, { startScan, emailProvider: email, startBudgetMs: -1 });
    expect(again.processed).toEqual([]);
    expect(again.started).toEqual([]);
    expect(email.sent).toHaveLength(1);
  });

  it("records a baseline without alerting when there is no earlier finished scan", async () => {
    const org = await insertOrg(handle, "New Shop");
    await organizationsRepo.setPlan(org.id, { plan: "pro" });
    const site = await sitesRepo.create(org.id, { url: "new-shop.example", monitorEnabled: true });
    const startScan = fakeScanService(new Map([["new-shop.example", [[finding({ code: "withdrawal_function" })]]]]));
    const summary = await runMonitorTick(new Date(), { startScan, emailProvider: new FakeEmail() });
    expect(summary.processed).toContainEqual(expect.objectContaining({ siteId: site.id, outcome: "baseline" }));
    expect(await alertsRepo.listForOrg(org.id)).toHaveLength(0);
  });
});

describe("site deletion", () => {
  it("keeps the site's scans", async () => {
    const org = await insertOrg(handle, "Delete Shop");
    const site = await sitesRepo.create(org.id, { url: "gone.example" });
    const scan = await scansRepo.create(org.id, { url: site.url, siteId: site.id });
    const other = await insertOrg(handle, "Other");
    expect(await sitesExtra.deleteSite(other.id, site.id)).toBe(false);
    expect(await sitesExtra.deleteSite(org.id, site.id)).toBe(true);
    expect(await sitesRepo.getById(org.id, site.id)).toBeNull();
    expect((await scansRepo.getById(org.id, scan.id))?.siteId).toBeNull();
  });
});

describe("syncSubscriptionToOrg", () => {
  function subscription(id: string, status: Stripe.Subscription.Status, orgId?: string): Stripe.Subscription {
    return { id, customer: "cus_sync", status, metadata: orgId ? { org_id: orgId } : {} } as unknown as Stripe.Subscription;
  }

  it("sets the plan idempotently and ignores stale subscriptions", async () => {
    const org = await insertOrg(handle, "Billing Shop");
    const first = await syncSubscriptionToOrg(subscription("sub_sync_1", "active", org.id));
    expect(first).toEqual({ kind: "synced", orgId: org.id, plan: "pro", changed: true });
    expect(await organizationsRepo.getById(org.id)).toMatchObject({
      plan: "pro",
      stripeCustomerId: "cus_sync",
      stripeSubscriptionId: "sub_sync_1",
    });

    const repeat = await syncSubscriptionToOrg(subscription("sub_sync_1", "active"));
    expect(repeat).toMatchObject({ kind: "synced", plan: "pro", changed: false });

    const stale = await syncSubscriptionToOrg(subscription("sub_sync_0", "canceled"));
    expect(stale.kind).toBe("ignored");
    expect((await organizationsRepo.getById(org.id))?.plan).toBe("pro");

    const cancelled = await syncSubscriptionToOrg(subscription("sub_sync_1", "canceled"));
    expect(cancelled).toMatchObject({ kind: "synced", plan: "free", changed: true });

    expect((await syncSubscriptionToOrg({ ...subscription("sub_nobody", "active"), customer: "cus_nobody" } as Stripe.Subscription)).kind).toBe(
      "ignored",
    );
  });
});
