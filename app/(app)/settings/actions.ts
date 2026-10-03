"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAgentEvent } from "@/lib/ai/log";
import { requireOrgContext } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import * as organizationsRepo from "@/lib/db/repositories/organizations";
import type { SettingsActionState } from "./form-state";

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const organisationSchema = z.object({
  name: z
    .string({ error: "Enter a name." })
    .trim()
    .min(1, "Enter a name.")
    .max(120, "Keep the name under 120 characters."),
  timezone: z
    .string({ error: "Choose a time zone." })
    .trim()
    .min(1, "Choose a time zone.")
    .max(64)
    .refine(isTimeZone, "Choose a time zone from the list."),
});

/** Organisation name and time zone. Owner only. */
export async function updateOrganisation(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const ctx = await requireOrgContext();
  if (ctx.role !== "owner") return { error: "Only the organisation owner can change these settings." };

  const parsed = organisationSchema.safeParse({ name: formData.get("name"), timezone: formData.get("timezone") });
  if (!parsed.success) {
    const fieldErrors: NonNullable<SettingsActionState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === "name" || key === "timezone") && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Check the highlighted fields.", fieldErrors };
  }

  try {
    await organizationsRepo.updateSettings(ctx.org.id, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The settings could not be saved." };
  }
  await logAgentEvent(await getDb(), {
    orgId: ctx.org.id,
    actor: "user",
    type: "organization.settings_updated",
    entityType: "organization",
    entityId: ctx.org.id,
    input: { userId: ctx.user.id, name: parsed.data.name, timezone: parsed.data.timezone },
  });

  // The organisation name is in the app shell, and dates on every page use the time zone.
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}
