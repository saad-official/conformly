CREATE SCHEMA IF NOT EXISTS "conformly";
--> statement-breakpoint
CREATE TYPE "conformly"."actor" AS ENUM('agent', 'user', 'system', 'cron', 'webhook');--> statement-breakpoint
CREATE TYPE "conformly"."email_provider" AS ENUM('outbox', 'resend');--> statement-breakpoint
CREATE TYPE "conformly"."finding_status" AS ENUM('pass', 'fail', 'warn', 'unknown');--> statement-breakpoint
CREATE TYPE "conformly"."membership_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "conformly"."note_state" AS ENUM('open', 'fixed', 'not_applicable');--> statement-breakpoint
CREATE TYPE "conformly"."outbox_status" AS ENUM('queued', 'sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "conformly"."page_kind" AS ENUM('home', 'product', 'cart', 'checkout', 'legal', 'account', 'other');--> statement-breakpoint
CREATE TYPE "conformly"."plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "conformly"."scan_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "conformly"."severity" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TABLE "conformly"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conformly"."agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"actor" "conformly"."actor" NOT NULL,
	"type" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"input" jsonb,
	"output" jsonb,
	"model" text,
	"prompt_version" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conformly"."alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"scan_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conformly"."finding_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"check_code" text NOT NULL,
	"fingerprint" text NOT NULL,
	"state" "conformly"."note_state" DEFAULT 'open' NOT NULL,
	"note" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conformly"."findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"check_code" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "conformly"."finding_status" NOT NULL,
	"severity" "conformly"."severity" NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"citation" jsonb NOT NULL,
	"fix" jsonb NOT NULL,
	"llm_meta" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conformly"."memberships" (
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "conformly"."membership_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conformly"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" "conformly"."plan" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "organizations_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "conformly"."outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"alert_id" uuid,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"html" text,
	"text" text NOT NULL,
	"provider" "conformly"."email_provider" DEFAULT 'outbox' NOT NULL,
	"provider_message_id" text,
	"delivered_to" text,
	"status" "conformly"."outbox_status" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conformly"."scan_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"kind" "conformly"."page_kind" DEFAULT 'other' NOT NULL,
	"status_code" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"text_excerpt" text DEFAULT '' NOT NULL,
	"extracted" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conformly"."scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"site_id" uuid,
	"public_id" text NOT NULL,
	"url" text NOT NULL,
	"hostname" text NOT NULL,
	"status" "conformly"."scan_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"summary" jsonb,
	"limitations" jsonb,
	"error" text,
	"requester_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scans_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "conformly"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "conformly"."sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"url" text NOT NULL,
	"hostname" text NOT NULL,
	"platform_guess" text,
	"monitor_enabled" boolean DEFAULT false NOT NULL,
	"monitor_interval_days" integer DEFAULT 30 NOT NULL,
	"last_scan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conformly"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"business_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "conformly"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conformly"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "conformly"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."agent_events" ADD CONSTRAINT "agent_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "conformly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."alerts" ADD CONSTRAINT "alerts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "conformly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."alerts" ADD CONSTRAINT "alerts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "conformly"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."alerts" ADD CONSTRAINT "alerts_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "conformly"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."finding_notes" ADD CONSTRAINT "finding_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "conformly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."finding_notes" ADD CONSTRAINT "finding_notes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "conformly"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."finding_notes" ADD CONSTRAINT "finding_notes_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "conformly"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."findings" ADD CONSTRAINT "findings_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "conformly"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "conformly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "conformly"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."outbox" ADD CONSTRAINT "outbox_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "conformly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."outbox" ADD CONSTRAINT "outbox_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "conformly"."alerts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."scan_pages" ADD CONSTRAINT "scan_pages_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "conformly"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."scans" ADD CONSTRAINT "scans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "conformly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."scans" ADD CONSTRAINT "scans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "conformly"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "conformly"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."sites" ADD CONSTRAINT "sites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "conformly"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformly"."sites" ADD CONSTRAINT "sites_last_scan_id_scans_id_fk" FOREIGN KEY ("last_scan_id") REFERENCES "conformly"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "conformly"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_events_org_created_idx" ON "conformly"."agent_events" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_events_entity_idx" ON "conformly"."agent_events" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST) WHERE "conformly"."agent_events"."entity_id" is not null;--> statement-breakpoint
CREATE INDEX "alerts_org_created_idx" ON "conformly"."alerts" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "finding_notes_identity_key" ON "conformly"."finding_notes" USING btree ("org_id","site_id","check_code","fingerprint");--> statement-breakpoint
CREATE INDEX "findings_scan_idx" ON "conformly"."findings" USING btree ("scan_id","position");--> statement-breakpoint
CREATE INDEX "findings_scan_status_idx" ON "conformly"."findings" USING btree ("scan_id","status","severity");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "conformly"."memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outbox_org_created_idx" ON "conformly"."outbox" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scan_pages_scan_idx" ON "conformly"."scan_pages" USING btree ("scan_id","position");--> statement-breakpoint
CREATE INDEX "scans_org_created_idx" ON "conformly"."scans" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scans_site_created_idx" ON "conformly"."scans" USING btree ("site_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scans_anonymous_created_idx" ON "conformly"."scans" USING btree ("created_at") WHERE "conformly"."scans"."org_id" is null;--> statement-breakpoint
CREATE INDEX "scans_requester_created_idx" ON "conformly"."scans" USING btree ("requester_hash","created_at") WHERE "conformly"."scans"."requester_hash" is not null;--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "conformly"."session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_org_hostname_key" ON "conformly"."sites" USING btree ("org_id","hostname");--> statement-breakpoint
CREATE INDEX "sites_monitor_idx" ON "conformly"."sites" USING btree ("monitor_enabled") WHERE "conformly"."sites"."monitor_enabled";--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "conformly"."verification" USING btree ("identifier");