import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq, sql, type SQL } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { logAgentEvent } from "@/lib/ai/log";
import { MIGRATIONS_CONFIG, migrationsFolder, type DbHandle } from "@/lib/db/client";
import * as alertsRepo from "@/lib/db/repositories/alerts";
import * as findingNotesRepo from "@/lib/db/repositories/findingNotes";
import * as findingsRepo from "@/lib/db/repositories/findings";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import * as outboxRepo from "@/lib/db/repositories/outbox";
import * as scansRepo from "@/lib/db/repositories/scans";
import * as sitesRepo from "@/lib/db/repositories/sites";
import { agentEvents, findings, organizations, scanPages, scans, sites } from "@/lib/db/schema";
import { summarize } from "@/lib/report/summary";
import { finding, insertOrg, page, startTestDb, stopTestDb } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

const DAY = 24 * 60 * 60 * 1000;

/** Raw SQL through the PGlite client (the driver-agnostic Db type leaves execute() results untyped). */
async function queryRows<T>(query: SQL): Promise<T[]> {
  const result = (await handle.db.execute(query)) as { rows: T[] };
  return result.rows;
}

/** The Postgres error message behind a rejected query (Drizzle wraps it in `cause`). */
async function dbErrorMessage(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    return cause instanceof Error ? cause.message : String(error);
  }
  throw new Error("expected the query to be rejected");
}

describe("migrations", () => {
  it("creates every table in the conformly schema and nothing in public", async () => {
    const rows = await queryRows<{ table_schema: string; table_name: string }>(
      sql`select table_schema, table_name from information_schema.tables
          where table_schema in ('conformly', 'public', 'drizzle') order by table_name`,
    );
    expect(rows.every((r) => r.table_schema === "conformly")).toBe(true);
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        "__drizzle_migrations",
        "account",
        "agent_events",
        "alerts",
        "finding_notes",
        "findings",
        "memberships",
        "organizations",
        "outbox",
        "scan_pages",
        "scans",
        "session",
        "sites",
        "user",
        "verification",
      ]),
    );
  });

  it("is idempotent", async () => {
    await expect(
      migrate(handle.db as never, { migrationsFolder: migrationsFolder(), ...MIGRATIONS_CONFIG }),
    ).resolves.toBeUndefined();
    const applied = await queryRows<{ n: number }>(sql`select count(*)::int as n from conformly.__drizzle_migrations`);
    expect(applied[0].n).toBe(2);
  });
});

describe("organizations", () => {
  it("reads, updates settings and sets the plan", async () => {
    const org = await insertOrg(handle, "Grüner Laden");
    expect(org.plan).toBe("free");
    expect(org.timezone).toBe("UTC");

    const updated = await organizationsRepo.updateSettings(org.id, { name: "  Grüner Laden GmbH ", timezone: "Europe/Berlin" });
    expect(updated?.name).toBe("Grüner Laden GmbH");
    expect(updated?.timezone).toBe("Europe/Berlin");
    await expect(organizationsRepo.updateSettings(org.id, { timezone: "Mars/Olympus" })).rejects.toThrow(/time zone/);

    const pro = await organizationsRepo.setPlan(org.id, { plan: "pro", stripeCustomerId: "cus_test", stripeSubscriptionId: "sub_test" });
    expect(pro).toMatchObject({ plan: "pro", stripeCustomerId: "cus_test", stripeSubscriptionId: "sub_test" });
    expect((await organizationsRepo.getById(org.id))?.plan).toBe("pro");
  });
});

describe("a scan with findings, through the repositories", () => {
  it("stores pages and findings and returns them by public id", async () => {
    const org = await insertOrg(handle);
    const other = await insertOrg(handle, "Someone Else");
    const site = await sitesRepo.create(org.id, { url: "WWW.Shop.Example/", monitorEnabled: true });
    expect(site).toMatchObject({ hostname: "shop.example", url: "https://www.shop.example/", monitorEnabled: true });

    const scan = await scansRepo.create(org.id, { url: site.url, siteId: site.id });
    expect(scan.status).toBe("queued");
    expect(scan.publicId).toMatch(/^[A-Za-z0-9_-]{12}$/);
    await expect(scansRepo.create(other.id, { url: site.url, siteId: site.id })).rejects.toThrow(/Site not found/);

    const running = await scansRepo.setStatus(org.id, scan.id, "running");
    expect(running?.startedAt).toBeInstanceOf(Date);

    const pages = [
      page("https://www.shop.example/"),
      page("https://www.shop.example/impressum", { kind: "legal", title: "Impressum" }),
    ];
    expect(await scansRepo.addPages(org.id, scan.id, pages)).toBe(2);

    const checkFindings = [
      finding({ code: "withdrawal_function", status: "fail", severity: "high" }),
      finding({ code: "green_claims", status: "warn", severity: "medium", meta: { model: "test-model" } }),
      finding({ code: "legal_notice", status: "pass", severity: "medium", evidence: [] }),
    ];
    await expect(findingsRepo.bulkInsert(other.id, scan.id, checkFindings)).rejects.toThrow(/Scan not found/);
    const inserted = await findingsRepo.bulkInsert(org.id, scan.id, checkFindings);
    expect(inserted).toHaveLength(3);
    expect(inserted[1].llmMeta).toEqual({ model: "test-model" });
    expect(inserted[0].fingerprint).toBe(findingsRepo.findingFingerprint(checkFindings[0]));

    const finished = await scansRepo.finish(org.id, scan.id, {
      status: "done",
      summary: summarize(checkFindings),
      pagesCrawled: pages.length,
      limitations: { jsRenderedSuspected: false, robotsBlocked: [] },
    });
    expect(finished?.finishedAt).toBeInstanceOf(Date);
    expect((await sitesRepo.getById(org.id, site.id))?.lastScanId).toBe(scan.id);

    const report = await scansRepo.getByPublicId(scan.publicId);
    expect(report).not.toBeNull();
    expect(report!.scan).toMatchObject({ id: scan.id, status: "done", pagesCrawled: 2 });
    expect(report!.scan.summary).toMatchObject({ issues: 1, warnings: 1, passes: 1 });
    expect(report!.pages.map((p) => p.url)).toEqual(pages.map((p) => p.url));
    expect(report!.pages[0].textExcerpt.length).toBe(scansRepo.TEXT_EXCERPT_LENGTH);
    expect(report!.pages[1]).toMatchObject({ kind: "legal", title: "Impressum", statusCode: 200 });
    expect(report!.pages[1].extracted).toMatchObject({ lang: "de", headings: [{ level: 1, text: "Willkommen" }] });
    expect(report!.pages[1].extracted).not.toHaveProperty("text");
    expect(report!.findings.map((f) => f.checkCode)).toEqual(["withdrawal_function", "green_claims", "legal_notice"]);
    expect(report!.findings[0]).toMatchObject({
      status: "fail",
      severity: "high",
      evidence: checkFindings[0].evidence,
      citation: checkFindings[0].citation,
      fix: checkFindings[0].fix,
    });

    expect(await scansRepo.getByPublicId("not-a-real-id")).toBeNull();
    expect(await scansRepo.getByPublicId("AAAAAAAAAAAA")).toBeNull();

    // Tenancy: the other org sees nothing of it.
    expect(await scansRepo.getById(other.id, scan.id)).toBeNull();
    expect(await findingsRepo.listForScan(other.id, scan.id)).toEqual([]);
    expect(await scansRepo.listForOrg(other.id)).toEqual([]);
    expect(await sitesRepo.getById(other.id, site.id)).toBeNull();
    expect(await scansRepo.setStatus(other.id, scan.id, "failed")).toBeNull();

    expect((await findingsRepo.listForScan(org.id, scan.id)).map((f) => f.position)).toEqual([0, 1, 2]);
    expect((await scansRepo.listForOrg(org.id)).map((s) => s.id)).toEqual([scan.id]);
    expect((await scansRepo.listForSite(org.id, site.id)).map((s) => s.id)).toEqual([scan.id]);
  });

  it("counts open high-severity fails in each site's latest scan, minus noted ones", async () => {
    const org = await insertOrg(handle);
    const siteA = await sitesRepo.create(org.id, { url: "https://a.example" });
    const siteB = await sitesRepo.create(org.id, { url: "https://b.example" });

    async function finishedScan(siteId: string, list: ReturnType<typeof finding>[]) {
      const scan = await scansRepo.create(org.id, { url: "https://x.example", siteId });
      await findingsRepo.bulkInsert(org.id, scan.id, list);
      await scansRepo.finish(org.id, scan.id, { status: "done", summary: summarize(list) });
      return scan;
    }

    // Older scan of A with two high fails, superseded by a newer one with one.
    await finishedScan(siteA.id, [finding({ code: "withdrawal_function" }), finding({ code: "withdrawal_policy" })]);
    await new Promise((r) => setTimeout(r, 5));
    await finishedScan(siteA.id, [
      finding({ code: "withdrawal_function" }),
      finding({ code: "withdrawal_policy", status: "pass" }),
      finding({ code: "green_claims", severity: "medium" }),
    ]);
    const bLatest = await finishedScan(siteB.id, [finding({ code: "legal_notice" }), finding({ code: "cookie_parity", status: "warn" })]);
    // A queued scan never counts.
    const queued = await scansRepo.create(org.id, { url: "https://b.example", siteId: siteB.id });
    await findingsRepo.bulkInsert(org.id, queued.id, [finding({ code: "a11y_sample" })]);

    expect(await findingsRepo.countOpenFails(org.id)).toBe(2);
    expect(await findingsRepo.countOpenFails(org.id, { severities: ["high", "medium"] })).toBe(3);

    const [bFinding] = await findingsRepo.listForScan(org.id, bLatest.id);
    const note = await findingNotesRepo.upsert(org.id, {
      siteId: siteB.id,
      checkCode: bFinding.checkCode,
      fingerprint: bFinding.fingerprint,
      state: "fixed",
      note: "Added the address",
    });
    expect(await findingsRepo.countOpenFails(org.id)).toBe(1);

    // Upsert updates the same row; reopening counts it again.
    const reopened = await findingNotesRepo.upsert(org.id, {
      siteId: siteB.id,
      checkCode: bFinding.checkCode,
      fingerprint: bFinding.fingerprint,
      state: "open",
    });
    expect(reopened.id).toBe(note.id);
    expect(reopened.note).toBeNull();
    expect(await findingsRepo.countOpenFails(org.id)).toBe(2);
    expect(await findingNotesRepo.listForSite(org.id, siteB.id)).toHaveLength(1);

    await expect(
      findingNotesRepo.upsert(org.id, { siteId: siteB.id, checkCode: "legal_notice", fingerprint: "x", state: "not_applicable" }),
    ).rejects.toThrow(/why/);
    const stranger = await insertOrg(handle);
    await expect(
      findingNotesRepo.upsert(stranger.id, { siteId: siteB.id, checkCode: "legal_notice", fingerprint: "x", state: "fixed" }),
    ).rejects.toThrow(/Site not found/);
    expect(await findingsRepo.countOpenFails(stranger.id)).toBe(0);
  });

  it("lists monitored sites that are due", async () => {
    const org = await insertOrg(handle);
    const now = new Date("2026-10-03T12:00:00Z");
    const never = await sitesRepo.create(org.id, { url: "https://never.example", monitorEnabled: true });
    const recent = await sitesRepo.create(org.id, { url: "https://recent.example", monitorEnabled: true });
    const old = await sitesRepo.create(org.id, { url: "https://old.example", monitorEnabled: true });
    const off = await sitesRepo.create(org.id, { url: "https://off.example" });

    for (const [site, finishedAt] of [
      [recent, new Date(now.getTime() - 3 * DAY)],
      [old, new Date(now.getTime() - 31 * DAY)],
      [off, new Date(now.getTime() - 90 * DAY)],
    ] as const) {
      const scan = await scansRepo.create(org.id, { url: site.url, siteId: site.id });
      await scansRepo.finish(org.id, scan.id, { status: "done" });
      await handle.db.update(scans).set({ finishedAt, createdAt: finishedAt }).where(eq(scans.id, scan.id));
    }

    const due = (await sitesRepo.listDueForMonitoring(now)).filter((s) => s.orgId === org.id);
    expect(due.map((s) => s.hostname)).toEqual([never.hostname, old.hostname]);

    await sitesRepo.setMonitor(org.id, old.id, true, 60);
    const later = (await sitesRepo.listDueForMonitoring(now)).filter((s) => s.orgId === org.id);
    expect(later.map((s) => s.hostname)).toEqual([never.hostname]);
    await expect(sitesRepo.setMonitor(org.id, old.id, true, 0)).rejects.toThrow(/interval/);
  });

  it("stores alerts and outbox messages per organization", async () => {
    const org = await insertOrg(handle);
    const other = await insertOrg(handle);
    const site = await sitesRepo.create(org.id, { url: "https://alerts.example" });
    const alert = await alertsRepo.insert(org.id, { siteId: site.id, kind: "scan_diff", payload: { newFindings: 2 } });
    await expect(alertsRepo.insert(other.id, { siteId: site.id, kind: "scan_diff" })).rejects.toThrow(/Site not found/);
    const message = await outboxRepo.insert(org.id, {
      alertId: alert.id,
      toEmail: "owner@alerts.example",
      subject: "2 new issues on alerts.example",
      text: "Two new issues.",
    });
    expect(message).toMatchObject({ provider: "outbox", status: "queued", alertId: alert.id });
    await expect(
      outboxRepo.insert(other.id, { alertId: alert.id, toEmail: "x@y.z", subject: "s", text: "t" }),
    ).rejects.toThrow(/Alert not found/);

    expect((await alertsRepo.listForOrg(org.id)).map((a) => a.id)).toEqual([alert.id]);
    expect((await outboxRepo.listForOrg(org.id)).map((m) => m.id)).toEqual([message.id]);
    expect(await alertsRepo.listForOrg(other.id)).toEqual([]);
    expect(await outboxRepo.listForOrg(other.id)).toEqual([]);
  });
});

describe("agent_events is append-only", () => {
  it("accepts inserts and rejects UPDATE, DELETE and TRUNCATE", async () => {
    const org = await insertOrg(handle);
    await logAgentEvent(handle.db, {
      orgId: org.id,
      actor: "agent",
      type: "claims.classified",
      entityType: "scan",
      input: { sentences: 3 },
      meta: { model: "test-model", promptVersion: "green-claims/v1", tokensIn: 10, tokensOut: 5, latencyMs: 42, attempts: 1 },
    });
    await logAgentEvent(handle.db, { orgId: null, actor: "system", type: "scan.anonymous" });

    const [event] = await handle.db.select().from(agentEvents).where(eq(agentEvents.orgId, org.id));
    expect(event).toMatchObject({ type: "claims.classified", model: "test-model", tokensIn: 10, latencyMs: 42 });

    expect(
      await dbErrorMessage(handle.db.update(agentEvents).set({ type: "tampered" }).where(eq(agentEvents.id, event.id))),
    ).toMatch(/agent_events is append-only \(UPDATE rejected\)/);
    expect(await dbErrorMessage(handle.db.delete(agentEvents).where(eq(agentEvents.id, event.id)))).toMatch(
      /agent_events is append-only \(DELETE rejected\)/,
    );
    expect(await dbErrorMessage(handle.db.execute(sql`truncate conformly.agent_events`))).toMatch(
      /agent_events is append-only \(TRUNCATE rejected\)/,
    );
    const [still] = await handle.db.select().from(agentEvents).where(eq(agentEvents.id, event.id));
    expect(still.type).toBe("claims.classified");
  });

  it("still lets an organization be deleted (cascade)", async () => {
    const org = await insertOrg(handle);
    await logAgentEvent(handle.db, { orgId: org.id, actor: "user", type: "site.created" });
    await handle.db.delete(organizations).where(eq(organizations.id, org.id));
    expect(await handle.db.select().from(agentEvents).where(eq(agentEvents.orgId, org.id))).toEqual([]);
  });

  it("logging never throws into the caller", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      logAgentEvent(handle.db, { orgId: "00000000-0000-0000-0000-000000000000", actor: "agent", type: "orphan" }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("purgeAnonymousOlderThan", () => {
  it("deletes only anonymous scans older than the cutoff, with their pages and findings", async () => {
    const org = await insertOrg(handle);
    const now = new Date();
    const oldAnon = await scansRepo.create(null, { url: "https://old-anon.example", requesterHash: "h1" });
    const freshAnon = await scansRepo.create(null, { url: "https://fresh-anon.example" });
    const oldOwned = await scansRepo.create(org.id, { url: "https://owned.example" });
    await scansRepo.addPages(null, oldAnon.id, [page("https://old-anon.example/")]);
    await findingsRepo.bulkInsert(null, oldAnon.id, [finding({ code: "withdrawal_function" })]);
    await expect(scansRepo.create(null, { url: "https://x.example", siteId: crypto.randomUUID() })).rejects.toThrow(
      /Anonymous/,
    );

    const old = new Date(now.getTime() - 31 * DAY);
    await handle.db.update(scans).set({ createdAt: old }).where(eq(scans.id, oldAnon.id));
    await handle.db.update(scans).set({ createdAt: old }).where(eq(scans.id, oldOwned.id));
    await handle.db
      .update(scans)
      .set({ createdAt: new Date(now.getTime() - 29 * DAY) })
      .where(eq(scans.id, freshAnon.id));

    expect(await scansRepo.purgeAnonymousOlderThan(30, now)).toBe(1);

    expect(await scansRepo.getByPublicId(oldAnon.publicId)).toBeNull();
    expect(await scansRepo.getByPublicId(freshAnon.publicId)).not.toBeNull();
    expect(await scansRepo.getById(org.id, oldOwned.id)).not.toBeNull();
    expect(await handle.db.select().from(scanPages).where(eq(scanPages.scanId, oldAnon.id))).toEqual([]);
    expect(await handle.db.select().from(findings).where(eq(findings.scanId, oldAnon.id))).toEqual([]);
    expect(await scansRepo.purgeAnonymousOlderThan(30, now)).toBe(0);
  });
});

describe("site deletion", () => {
  it("keeps the scans (site_id set null) so shared report links survive", async () => {
    const org = await insertOrg(handle);
    const site = await sitesRepo.create(org.id, { url: "https://gone.example" });
    const scan = await scansRepo.create(org.id, { url: site.url, siteId: site.id });
    await scansRepo.finish(org.id, scan.id, { status: "done" });
    await handle.db.delete(sites).where(eq(sites.id, site.id));
    const kept = await scansRepo.getById(org.id, scan.id);
    expect(kept?.siteId).toBeNull();
  });
});
