/**
 * Shared PGlite setup for database tests. Each test file calls `vi.mock("server-only")`
 * itself (vi.mock is hoisted per file), then `startTestDb()` in beforeAll.
 */
import type { Finding } from "@/lib/checks/types";
import type { CrawledPage } from "@/lib/crawl/types";
import { createPgliteDb, setDbHandle, type DbHandle } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import type { Organization } from "@/lib/db/types";

/** Fresh in-memory PGlite with every migration in drizzle/ applied, wired into getDb(). */
export async function startTestDb(): Promise<DbHandle> {
  const handle = await createPgliteDb(undefined);
  setDbHandle(handle);
  return handle;
}

export async function stopTestDb(handle: DbHandle | undefined): Promise<void> {
  setDbHandle(null);
  await handle?.close();
}

let orgCounter = 0;

export async function insertOrg(handle: DbHandle, name = "Test Shop"): Promise<Organization> {
  orgCounter += 1;
  const [org] = await handle.db
    .insert(organizations)
    .values({ name, slug: `test-shop-${orgCounter}-${Math.random().toString(36).slice(2, 8)}` })
    .returning();
  return org;
}

export function page(url: string, overrides: Partial<CrawledPage> = {}): CrawledPage {
  return {
    url,
    finalUrl: url,
    kind: "home",
    statusCode: 200,
    title: "Shop",
    lang: "de",
    headings: [{ level: 1, text: "Willkommen" }],
    links: [],
    buttons: [],
    forms: [],
    scripts: [],
    images: [],
    meta: {},
    text: "Willkommen im Shop. ".repeat(200),
    ...overrides,
  };
}

export function finding(overrides: Partial<Finding> & Pick<Finding, "code">): Finding {
  return {
    status: "fail",
    severity: "high",
    title: `Finding ${overrides.code}`,
    detail: "Detail",
    evidence: [{ url: "https://shop.example/", quote: "quote" }],
    citation: { law: "Directive (EU) 2023/2673", article: "Art. 11a", url: "https://eur-lex.europa.eu/" },
    fix: { summary: "Add a withdrawal button.", html: "<a href=\"/withdraw\">Withdraw from contract</a>" },
    ...overrides,
  };
}
