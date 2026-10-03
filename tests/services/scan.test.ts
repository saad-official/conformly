import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { CHECK_CODES } from "@/lib/checks/types";
import type { DbHandle } from "@/lib/db/client";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import * as scansRepo from "@/lib/db/repositories/scans";
import * as sitesRepo from "@/lib/db/repositories/sites";
import { agentEvents, scans } from "@/lib/db/schema";
import { summarize } from "@/lib/report/summary";
import { NoteError, saveFindingNote } from "@/lib/services/notes";
import {
  ANONYMOUS_DAILY_LIMIT,
  assertScanAllowed,
  expireIfStale,
  fingerprintFor,
  getScanStatus,
  requesterHash,
  ScanInputError,
  ScanLimitError,
  STALE_SCAN_MESSAGE,
  STALE_SCAN_MS,
  startScan,
  validateTargetUrl,
} from "@/lib/services/scan";
import { createSafeFetch, isPrivateAddress } from "@/lib/services/target";
import { fakeClassifier } from "../checks/fake-classifier";
import { insertOrg, startTestDb, stopTestDb } from "../db/helpers";
import { compliantShop, createFakeFetch, gruenerLaden, redirect } from "../fixtures/storefronts";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;
let ipCounter = 0;
/** A fresh documentation-range IP per test, so anonymous quotas never collide. */
const nextIp = () => `203.0.113.${++ipCounter}`;

/* ------------------------------------------------------------------ */
/* validateTargetUrl                                                   */
/* ------------------------------------------------------------------ */

describe("validateTargetUrl", () => {
  it.each([
    ["shop.example", "https://shop.example/"],
    ["  https://Shop.Example/de?ref=x  ", "https://shop.example/de?ref=x"],
    ["http://shop.example:8080/", "http://shop.example:8080/"],
    ["https://shop.example./", "https://shop.example/"],
    ["https://shop.example/#top", "https://shop.example/"],
    ["https://8.8.8.8/", "https://8.8.8.8/"],
    ["https://172.32.0.1/", "https://172.32.0.1/"],
    ["https://[2606:4700:4700::1111]/", "https://[2606:4700:4700::1111]/"],
  ])("accepts %s", (input, url) => {
    expect(validateTargetUrl(input)).toMatchObject({ ok: true, url });
  });

  it.each([
    "ftp://shop.example/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,hello",
    "gopher://shop.example/",
    "mailto:owner@shop.example",
    "https://user:secret@shop.example/",
    "https://shop.example:22/",
    "",
    "   ",
    "not a url",
    "intranet",
  ])("rejects the scheme, credentials, port or shape of %j", (input) => {
    expect(validateTargetUrl(input).ok).toBe(false);
  });

  it.each([
    "localhost",
    "http://localhost:3000/",
    "https://LOCALHOST./",
    "https://app.localhost/",
    "https://printer.local/",
    "https://api.internal/",
    "https://router.home.arpa/",
    "http://127.0.0.1/",
    "http://127.42.0.9/",
    "http://0.0.0.0/",
    "http://10.0.0.1/",
    "http://10.255.255.255/",
    "http://172.16.0.1/",
    "http://172.31.255.254/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://017700000001/",
    "http://[::1]/",
    "http://[::]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:a9fe:a9fe]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://[64:ff9b::10.0.0.1]/",
  ])("blocks the private or local host %s", (input) => {
    const result = validateTargetUrl(input);
    expect(result.ok).toBe(false);
  });

  it("explains refusals in words for the person who typed the address", () => {
    expect(validateTargetUrl("ftp://shop.example/")).toEqual({ ok: false, reason: "Only http and https addresses can be scanned." });
    expect(validateTargetUrl("http://192.168.0.10/")).toMatchObject({ ok: false, reason: expect.stringMatching(/private/i) });
  });

  it("classifies resolved addresses", () => {
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("::ffff:192.168.0.1")).toBe(true);
    expect(isPrivateAddress("fc00::5")).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2a00:1450:4001:80b::200e")).toBe(false);
  });
});

describe("createSafeFetch", () => {
  const init = { method: "GET" as const, headers: {}, redirect: "manual" as const, signal: new AbortController().signal };

  it("refuses a public name that resolves to a private address", async () => {
    const inner = vi.fn(createFakeFetch({ "https://rebind.example/": "<html></html>" }).fetch);
    const guarded = createSafeFetch(inner, { resolveHost: async () => ["93.184.216.34", "10.0.0.5"] });
    await expect(guarded("https://rebind.example/", init)).rejects.toThrow(/private or reserved/);
    expect(inner).not.toHaveBeenCalled();
  });

  it("passes public targets through and stops reading the body at the cap", async () => {
    const inner = vi.fn(async () => new Response("x".repeat(5000), { headers: { "content-type": "text/html" } }));
    const guarded = createSafeFetch(inner, { resolveHost: async () => ["93.184.216.34"], maxBodyBytes: 1000 });
    const response = await guarded("https://shop.example/", init);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html");
    expect(await response.text()).toBe("x".repeat(1000));
    expect(inner).toHaveBeenCalledWith("https://shop.example/", init);
  });
});

/* ------------------------------------------------------------------ */
/* Rate limits                                                         */
/* ------------------------------------------------------------------ */

describe("scan limits", () => {
  it("allows 3 anonymous scans per IP and UTC day, then refuses", async () => {
    const ip = nextIp();
    const hash = requesterHash(ip, NOW);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(ip);
    for (let i = 0; i < ANONYMOUS_DAILY_LIMIT; i++) {
      await expect(assertScanAllowed({ ip }, NOW)).resolves.toEqual({ requesterHash: hash });
      await scansRepo.create(null, { url: "https://shop.example/", requesterHash: hash });
    }
    const refusal = await assertScanAllowed({ ip }, NOW).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(ScanLimitError);
    expect(refusal).toMatchObject({ kind: "anonymous_daily", limit: 3 });
    expect((refusal as ScanLimitError).resetsAt.getTime()).toBeGreaterThan(NOW.getTime());

    // Another IP, or the same IP tomorrow, starts from zero.
    await expect(assertScanAllowed({ ip: nextIp() }, NOW)).resolves.toBeDefined();
    await expect(assertScanAllowed({ ip }, new Date(NOW.getTime() + DAY))).resolves.toBeDefined();
  });

  it("refuses before creating anything when over the anonymous limit", async () => {
    const ip = nextIp();
    const hash = requesterHash(ip, NOW);
    for (let i = 0; i < ANONYMOUS_DAILY_LIMIT; i++) await scansRepo.create(null, { url: "https://shop.example/", requesterHash: hash });
    const fake = createFakeFetch(compliantShop.routes);
    await expect(
      startScan({ url: compliantShop.startUrl, requester: { ip }, now: NOW, fetchImpl: fake.fetch, classifier: null }),
    ).rejects.toBeInstanceOf(ScanLimitError);
    expect(fake.requests).toHaveLength(0);
    const rows = await handle.db.select().from(scans).where(eq(scans.requesterHash, hash));
    expect(rows).toHaveLength(ANONYMOUS_DAILY_LIMIT);
  });

  it("gives Free organizations 5 scans per calendar month; failed and last month's scans do not count", async () => {
    const org = await insertOrg(handle, "Free Shop");
    for (let i = 0; i < 5; i++) await scansRepo.create(org.id, { url: "https://free-shop.example/" });
    await expect(assertScanAllowed({ orgId: org.id, ip: nextIp() }, NOW)).rejects.toMatchObject({ kind: "plan_monthly", limit: 5 });

    const [latest] = await scansRepo.listForOrg(org.id, { limit: 1 });
    await scansRepo.finish(org.id, latest.id, { status: "failed", error: "boom" });
    await expect(assertScanAllowed({ orgId: org.id }, NOW)).resolves.toEqual({ requesterHash: null });

    await scansRepo.create(org.id, { url: "https://free-shop.example/" });
    await expect(assertScanAllowed({ orgId: org.id }, NOW)).rejects.toBeInstanceOf(ScanLimitError);

    const lastMonth = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1) - DAY);
    const other = await insertOrg(handle, "Old Shop");
    await handle.db.insert(scans).values(
      Array.from({ length: 6 }, (_, i) => ({
        orgId: other.id,
        publicId: `oldmonth${String(i).padStart(4, "0")}`,
        url: "https://old-shop.example/",
        hostname: "old-shop.example",
        status: "done" as const,
        createdAt: lastMonth,
      })),
    );
    await expect(assertScanAllowed({ orgId: other.id }, NOW)).resolves.toBeDefined();
  });

  it("does not limit Pro organizations", async () => {
    const org = await insertOrg(handle, "Pro Shop");
    await organizationsRepo.setPlan(org.id, { plan: "pro" });
    for (let i = 0; i < 7; i++) await scansRepo.create(org.id, { url: "https://pro-shop.example/" });
    await expect(assertScanAllowed({ orgId: org.id }, NOW)).resolves.toEqual({ requesterHash: null });
  });
});

/* ------------------------------------------------------------------ */
/* startScan                                                           */
/* ------------------------------------------------------------------ */

describe("startScan", () => {
  it("scans the compliant fixture end to end and persists pages, findings, summary and limitations", async () => {
    const fake = createFakeFetch(compliantShop.routes);
    const classifier = fakeClassifier([]);
    const ip = nextIp();
    const result = await startScan({ url: compliantShop.startUrl, requester: { ip }, now: NOW, fetchImpl: fake.fetch, classifier });
    expect(result.status).toBe("done");
    expect(result.publicId).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(fake.requests.every((r) => r.userAgent?.startsWith("ConformlyBot/"))).toBe(true);

    const report = await scansRepo.getByPublicId(result.publicId);
    expect(report).not.toBeNull();
    const { scan, pages, findings } = report!;
    expect(scan).toMatchObject({
      orgId: null,
      siteId: null,
      status: "done",
      url: "https://compliant-shop.example/",
      hostname: "compliant-shop.example",
      pagesCrawled: 8,
      error: null,
      requesterHash: requesterHash(ip, NOW),
    });
    expect(scan.startedAt).toBeInstanceOf(Date);
    expect(scan.finishedAt).toBeInstanceOf(Date);
    expect(scan.limitations).toEqual({
      jsRenderedSuspected: false,
      robotsBlocked: ["https://compliant-shop.example/cart", "https://compliant-shop.example/checkout"],
      errors: [],
    });

    expect(pages.map((p) => [p.url.replace("https://compliant-shop.example", ""), p.kind, p.statusCode, p.position])).toEqual([
      ["/", "home", 200, 0],
      ["/pages/legal-notice", "legal", 200, 1],
      ["/policies/withdrawal", "legal", 200, 2],
      ["/policies/privacy-policy", "legal", 200, 3],
      ["/pages/accessibility", "legal", 200, 4],
      ["/account", "account", 200, 5],
      ["/products/linen-shirt", "product", 200, 6],
      ["/products/wool-scarf", "product", 200, 7],
    ]);

    expect(findings.map((f) => f.checkCode)).toEqual([...CHECK_CODES]);
    expect(findings.map((f) => f.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(findings.map((f) => f.status))).toEqual(new Set(["pass"]));
    for (const row of findings) {
      expect(row.fingerprint).toBe(fingerprintFor({ code: row.checkCode, status: row.status, evidence: row.evidence }));
    }
    expect(scan.summary).toEqual(summarize(findings));
    expect(scan.summary).toMatchObject({ issues: 0, warnings: 0, unknowns: 0, passes: 9 });

    const events = await handle.db.select().from(agentEvents).where(eq(agentEvents.entityId, scan.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "scan.completed", entityType: "scan", orgId: null, actor: "agent" });
    expect(events[0].output).toMatchObject({ summary: { issues: 0, passes: 9 }, pagesCrawled: 8 });
  });

  it("persists classifier-backed green-claims fails and crawl limitations, and attaches the org's site", async () => {
    const org = await insertOrg(handle, "Grüner Laden");
    const site = await sitesRepo.create(org.id, { url: "https://gruener-laden.example/" });
    const fake = createFakeFetch(gruenerLaden.routes);
    const classifier = fakeClassifier([{ includes: "umweltfreundlich", verdict: "generic_unsubstantiated" }]);
    const result = await startScan({
      url: gruenerLaden.startUrl,
      requester: { ip: nextIp(), orgId: org.id },
      now: NOW,
      fetchImpl: fake.fetch,
      classifier,
    });
    expect(result.status).toBe("done");
    expect(classifier.calls.length).toBe(1);

    const { scan, findings } = (await scansRepo.getByPublicId(result.publicId))!;
    expect(scan).toMatchObject({ orgId: org.id, siteId: site.id, requesterHash: null, status: "done" });
    expect(scan.limitations?.robotsBlocked).toEqual(["https://gruener-laden.example/kasse"]);
    expect(scan.limitations?.errors).toEqual([{ url: "https://gruener-laden.example/produkte/sonnencreme-bio", message: "HTTP 404" }]);
    const green = findings.find((f) => f.checkCode === "green_claims")!;
    expect(green.status).toBe("fail");
    expect(green.evidence.some((e) => /umweltfreundlich/i.test(e.quote))).toBe(true);
    expect(scan.summary).toEqual(summarize(findings));
    expect(scan.summary!.issues).toBeGreaterThan(0);

    expect((await sitesRepo.getById(org.id, site.id))?.lastScanId).toBe(scan.id);

    // Owner notes: allowed for the owning org, refused for anyone else.
    const note = await saveFindingNote({
      orgId: org.id,
      userId: null,
      publicId: scan.publicId,
      findingId: green.id,
      state: "not_applicable",
      note: "We removed the claim yesterday.",
    });
    expect(note).toMatchObject({ siteId: site.id, checkCode: "green_claims", fingerprint: green.fingerprint, state: "not_applicable" });
    const stranger = await insertOrg(handle, "Someone else");
    await expect(
      saveFindingNote({ orgId: stranger.id, userId: null, publicId: scan.publicId, findingId: green.id, state: "fixed" }),
    ).rejects.toBeInstanceOf(NoteError);
    await expect(
      saveFindingNote({ orgId: org.id, userId: null, publicId: scan.publicId, findingId: green.id, state: "not_applicable", note: " " }),
    ).rejects.toThrow(/why/);
  });

  it("rejects bad targets before creating a scan", async () => {
    const fake = createFakeFetch({});
    await expect(
      startScan({ url: "http://169.254.169.254/", requester: { ip: nextIp() }, now: NOW, fetchImpl: fake.fetch }),
    ).rejects.toBeInstanceOf(ScanInputError);
    await expect(
      startScan({ url: "https://shop.example/", requester: { ip: nextIp(), siteId: crypto.randomUUID() }, now: NOW, fetchImpl: fake.fetch }),
    ).rejects.toBeInstanceOf(ScanInputError);
    expect(fake.requests).toHaveLength(0);
  });

  it("refuses a site from another host", async () => {
    const org = await insertOrg(handle);
    const site = await sitesRepo.create(org.id, { url: "https://mine.example/" });
    await expect(
      startScan({
        url: "https://someone-else.example/",
        requester: { orgId: org.id, siteId: site.id },
        now: NOW,
        fetchImpl: createFakeFetch({}).fetch,
      }),
    ).rejects.toThrow(/not on mine\.example/);
  });

  it("fails honestly when the homepage cannot be loaded", async () => {
    const fake = createFakeFetch({ "https://down-shop.example/": { status: 503, body: "<html><body>Down</body></html>" } });
    const result = await startScan({ url: "down-shop.example", requester: { ip: nextIp() }, now: NOW, fetchImpl: fake.fetch, classifier: null });
    expect(result.status).toBe("failed");
    const { scan, findings, pages } = (await scansRepo.getByPublicId(result.publicId))!;
    expect(scan.status).toBe("failed");
    expect(scan.error).toMatch(/HTTP 503/);
    expect(scan.summary).toBeNull();
    expect(findings).toEqual([]);
    expect(pages.map((p) => p.statusCode)).toEqual([503]);
    const [event] = await handle.db.select().from(agentEvents).where(eq(agentEvents.entityId, scan.id));
    expect(event.type).toBe("scan.failed");
  });

  it("refuses redirects into private networks", async () => {
    const fake = createFakeFetch({ "https://sneaky-shop.example/": redirect("http://127.0.0.1/admin") });
    const result = await startScan({ url: "https://sneaky-shop.example/", requester: { ip: nextIp() }, now: NOW, fetchImpl: fake.fetch, classifier: null });
    expect(result.status).toBe("failed");
    expect(fake.requests.map((r) => r.url)).not.toContain("http://127.0.0.1/admin");
    const { scan } = (await scansRepo.getByPublicId(result.publicId))!;
    expect(scan.error).toMatch(/could not be loaded: Refused to fetch http:\/\/127\.0\.0\.1\/admin/);
  });

  it("marks a scan that never finished as failed once it is stale", async () => {
    const created = await scansRepo.create(null, { url: "https://slow-shop.example/" });
    const running = (await scansRepo.setStatus(null, created.id, "running"))!;
    expect(await expireIfStale(running, new Date(Date.now() + 60_000))).toMatchObject({ status: "running" });
    expect(await getScanStatus(created.publicId)).toMatchObject({ status: "running", hostname: "slow-shop.example" });
    const expired = await expireIfStale(running, new Date(Date.now() + STALE_SCAN_MS + 1000));
    expect(expired).toMatchObject({ status: "failed", error: STALE_SCAN_MESSAGE });
    expect(await getScanStatus(created.publicId)).toMatchObject({ status: "failed" });
    expect(await getScanStatus("doesnotexist")).toBeNull();
  });
});
