"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAgentEvent } from "@/lib/ai/log";
import { requireOrgContext } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/repositories/shared";
import * as sitesRepo from "@/lib/db/repositories/sites";
import * as sitesExtra from "@/lib/db/repositories/sites-extra";
import { MONITOR_INTERVAL_DAYS, checkCanEnableMonitor } from "@/lib/services/billing-limits";
import type { SiteActionState } from "./form-state";

/*
 * Site Server Actions. Each one: requireOrgContext() first, Zod-validates its
 * input, passes ctx.org.id to every repository call, and revalidates the
 * screens that show sites.
 */

const urlSchema = z
  .string({ error: "Enter your store's web address." })
  .trim()
  .min(1, "Enter your store's web address.")
  .max(2048, "That address is too long.")
  .refine((value) => {
    try {
      const { hostname } = sitesRepo.normaliseSiteUrl(value);
      return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(hostname);
    } catch {
      return false;
    }
  }, "Enter a web address such as yourstore.com or https://yourstore.com.");

const addSiteSchema = z.object({ url: urlSchema });
const siteIdSchema = z.uuid({ error: "Unknown site." });
const monitorSchema = z.object({
  siteId: siteIdSchema,
  enabled: z.enum(["true", "false"]).transform((v) => v === "true"),
});
const deleteSchema = z.object({ siteId: siteIdSchema });

function revalidateSites(siteId?: string) {
  revalidatePath("/sites");
  revalidatePath("/dashboard");
  revalidatePath("/scans");
  if (siteId) revalidatePath(`/sites/${siteId}`);
}

/** Creates the site, then sends the user to its page to run the first scan (a plain POST to /api/scan). */
export async function addSite(_prev: SiteActionState, formData: FormData): Promise<SiteActionState> {
  const ctx = await requireOrgContext();
  const raw = formData.get("url");
  const parsed = addSiteSchema.safeParse({ url: raw });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the address.", url: typeof raw === "string" ? raw : "" };
  }

  let siteId: string;
  try {
    const site = await sitesRepo.create(ctx.org.id, { url: parsed.data.url });
    siteId = site.id;
    await logAgentEvent(await getDb(), {
      orgId: ctx.org.id,
      actor: "user",
      type: "site.created",
      entityType: "site",
      entityId: site.id,
      input: { url: site.url, userId: ctx.user.id },
    });
  } catch (error) {
    if (isUniqueViolation(error, "sites_org_hostname_key")) {
      const { hostname } = sitesRepo.normaliseSiteUrl(parsed.data.url);
      const existing = (await sitesRepo.listForOrg(ctx.org.id)).find((s) => s.hostname === hostname);
      return { error: `${hostname} is already one of your sites.`, existingSiteId: existing?.id, url: parsed.data.url };
    }
    console.error("[sites] create failed", error instanceof Error ? error.message : error);
    return { error: "The site could not be added. Try again.", url: parsed.data.url };
  }

  revalidateSites(siteId);
  redirect(`/sites/${siteId}?added=1`);
}

/** Monitoring on/off. Turning it on checks the plan's monitored-site limit (Free 1, Pro 10). Interval fixed at 30 days in v1. */
export async function setMonitoring(_prev: SiteActionState, formData: FormData): Promise<SiteActionState> {
  const ctx = await requireOrgContext();
  const parsed = monitorSchema.safeParse({ siteId: formData.get("siteId"), enabled: formData.get("enabled") });
  if (!parsed.success) return { error: "That request was not valid. Reload the page and try again." };
  const { siteId, enabled } = parsed.data;

  const site = await sitesRepo.getById(ctx.org.id, siteId);
  if (!site) return { error: "That site no longer exists." };

  if (enabled) {
    const limitError = await checkCanEnableMonitor(ctx.org.id, ctx.org.plan, siteId);
    if (limitError) return { error: limitError };
  }

  await sitesRepo.setMonitor(ctx.org.id, siteId, enabled, MONITOR_INTERVAL_DAYS);
  await logAgentEvent(await getDb(), {
    orgId: ctx.org.id,
    actor: "user",
    type: enabled ? "site.monitor_enabled" : "site.monitor_disabled",
    entityType: "site",
    entityId: siteId,
    input: { userId: ctx.user.id },
  });
  revalidateSites(siteId);
  return { ok: enabled ? "Monitoring on. Re-scanned every 30 days." : "Monitoring off." };
}

/** Owner only. Scans are kept (their reports stay reachable); notes and alerts for the site are removed. */
export async function deleteSite(_prev: SiteActionState, formData: FormData): Promise<SiteActionState> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "owner") return { error: "Only the organisation owner can delete a site." };
  const parsed = deleteSchema.safeParse({ siteId: formData.get("siteId") });
  if (!parsed.success) return { error: "That request was not valid. Reload the page and try again." };

  const deleted = await sitesExtra.deleteSite(ctx.org.id, parsed.data.siteId);
  if (!deleted) return { error: "That site no longer exists." };
  await logAgentEvent(await getDb(), {
    orgId: ctx.org.id,
    actor: "user",
    type: "site.deleted",
    entityType: "site",
    entityId: parsed.data.siteId,
    input: { userId: ctx.user.id },
  });

  revalidateSites(parsed.data.siteId);
  redirect("/sites?deleted=1");
}
