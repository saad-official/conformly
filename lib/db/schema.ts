/**
 * Database schema (spec section 4). Everything, including Better Auth's
 * tables, lives in the `conformly` Postgres schema so the database can be
 * dedicated or shared with other apps.
 *
 * Multi-tenancy is by `org_id` plus explicit `where` clauses in
 * `lib/db/repositories/*` (no row-level security). Anonymous scans have
 * `org_id null` and are purged after 30 days.
 *
 * `agent_events` is append-only: the repository layer has no update/delete
 * path and a trigger (drizzle/0001_agent_events_append_only.sql) rejects
 * UPDATE, DELETE and TRUNCATE at the database level.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { Citation, CheckCode, Evidence, Fix } from "../checks/types";
import { FINDING_STATUSES, SEVERITIES } from "../checks/types";
import { PAGE_KINDS } from "../crawl/types";
import type { ScanSummary } from "../report/summary";

export const conformly = pgSchema("conformly");

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const planEnum = conformly.enum("plan", ["free", "pro"]);
export const membershipRoleEnum = conformly.enum("membership_role", ["owner", "member"]);
export const scanStatusEnum = conformly.enum("scan_status", ["queued", "running", "done", "failed"]);
export const pageKindEnum = conformly.enum("page_kind", PAGE_KINDS);
export const findingStatusEnum = conformly.enum("finding_status", FINDING_STATUSES);
export const severityEnum = conformly.enum("severity", SEVERITIES);
export const noteStateEnum = conformly.enum("note_state", ["open", "fixed", "not_applicable"]);
export const emailProviderEnum = conformly.enum("email_provider", ["outbox", "resend"]);
export const outboxStatusEnum = conformly.enum("outbox_status", ["queued", "sent", "delivered", "failed"]);
export const actorEnum = conformly.enum("actor", ["agent", "user", "system", "cron", "webhook"]);

// ---------------------------------------------------------------------------
// Better Auth core schema (v1.7). JS keys are Better Auth's field names (the
// adapter looks columns up by them); column names are snake_case.
// ---------------------------------------------------------------------------

export const user = conformly.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** Additional field (lib/auth/server.ts): names the organization created on sign-up. */
  businessName: text("business_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = conformly.table(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = conformly.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = conformly.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const organizations = conformly.table("organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: planEnum("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: createdAt(),
});

export const memberships = conformly.table(
  "memberships",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("memberships_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Sites and scans
// ---------------------------------------------------------------------------

export const sites = conformly.table(
  "sites",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    hostname: text("hostname").notNull(),
    platformGuess: text("platform_guess"),
    monitorEnabled: boolean("monitor_enabled").notNull().default(false),
    monitorIntervalDays: integer("monitor_interval_days").notNull().default(30),
    lastScanId: uuid("last_scan_id").references((): AnyPgColumn => scans.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sites_org_hostname_key").on(t.orgId, t.hostname),
    index("sites_monitor_idx").on(t.monitorEnabled).where(sql`${t.monitorEnabled}`),
  ],
);

export type ScanLimitations = {
  jsRenderedSuspected?: boolean;
  robotsBlocked?: string[];
  errors?: Array<{ url: string; message: string }>;
};

export const scans = conformly.table(
  "scans",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /** null for anonymous scans (purged after 30 days). */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references((): AnyPgColumn => sites.id, { onDelete: "set null" }),
    /** Unguessable share id for /r/<public_id>: 12 url-safe random characters. */
    publicId: text("public_id").notNull().unique(),
    url: text("url").notNull(),
    hostname: text("hostname").notNull(),
    status: scanStatusEnum("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    pagesCrawled: integer("pages_crawled").notNull().default(0),
    summary: jsonb("summary").$type<ScanSummary>(),
    /** Crawl limitations shown in the report (robots-blocked URLs, JS-rendered shell, errors). */
    limitations: jsonb("limitations").$type<ScanLimitations>(),
    error: text("error"),
    /** Salted hash of the requester IP for anonymous rate limiting; never the raw IP. */
    requesterHash: text("requester_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    index("scans_org_created_idx").on(t.orgId, t.createdAt.desc()),
    index("scans_site_created_idx").on(t.siteId, t.createdAt.desc()),
    index("scans_anonymous_created_idx").on(t.createdAt).where(sql`${t.orgId} is null`),
    index("scans_requester_created_idx")
      .on(t.requesterHash, t.createdAt)
      .where(sql`${t.requesterHash} is not null`),
  ],
);

export const scanPages = conformly.table(
  "scan_pages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    finalUrl: text("final_url"),
    kind: pageKindEnum("kind").notNull().default("other"),
    statusCode: integer("status_code").notNull(),
    title: text("title").notNull().default(""),
    textExcerpt: text("text_excerpt").notNull().default(""),
    /** The structured document (CrawledPage without the full text), for the report and re-checks. */
    extracted: jsonb("extracted").$type<Record<string, unknown>>(),
    /** Crawl order: homepage first. */
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("scan_pages_scan_idx").on(t.scanId, t.position)],
);

export const findings = conformly.table(
  "findings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    checkCode: text("check_code").$type<CheckCode>().notNull(),
    /** Stable identity across scans, used to carry finding_notes over. */
    fingerprint: text("fingerprint").notNull(),
    status: findingStatusEnum("status").notNull(),
    severity: severityEnum("severity").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    evidence: jsonb("evidence").$type<Evidence[]>().notNull().default([]),
    citation: jsonb("citation").$type<Citation>().notNull(),
    fix: jsonb("fix").$type<Fix>().notNull(),
    llmMeta: jsonb("llm_meta").$type<Record<string, unknown>>(),
    /** Report order (spec 3.2 check order). */
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("findings_scan_idx").on(t.scanId, t.position),
    index("findings_scan_status_idx").on(t.scanId, t.status, t.severity),
  ],
);

export const findingNotes = conformly.table(
  "finding_notes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    checkCode: text("check_code").$type<CheckCode>().notNull(),
    fingerprint: text("fingerprint").notNull(),
    state: noteStateEnum("state").notNull().default("open"),
    note: text("note"),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("finding_notes_identity_key").on(t.orgId, t.siteId, t.checkCode, t.fingerprint)],
);

// ---------------------------------------------------------------------------
// Monitoring, email, audit
// ---------------------------------------------------------------------------

export const alerts = conformly.table(
  "alerts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id").references(() => scans.id, { onDelete: "cascade" }),
    /** e.g. "scan_diff" (new, resolved or changed findings), "scan_failed". */
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("alerts_org_created_idx").on(t.orgId, t.createdAt.desc())],
);

export const outbox = conformly.table(
  "outbox",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    alertId: uuid("alert_id").references(() => alerts.id, { onDelete: "set null" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    html: text("html"),
    text: text("text").notNull(),
    provider: emailProviderEnum("provider").notNull().default("outbox"),
    providerMessageId: text("provider_message_id"),
    /** Where the message actually went (differs from to_email in demo mode). */
    deliveredTo: text("delivered_to"),
    status: outboxStatusEnum("status").notNull().default("queued"),
    createdAt: createdAt(),
  },
  (t) => [index("outbox_org_created_idx").on(t.orgId, t.createdAt.desc())],
);

export const agentEvents = conformly.table(
  "agent_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /** null for events on anonymous scans. */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    actor: actorEnum("actor").notNull(),
    type: text("type").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    input: jsonb("input"),
    output: jsonb("output"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [
    index("agent_events_org_created_idx").on(t.orgId, t.createdAt.desc()),
    index("agent_events_entity_idx")
      .on(t.entityType, t.entityId, t.createdAt.desc())
      .where(sql`${t.entityId} is not null`),
  ],
);
