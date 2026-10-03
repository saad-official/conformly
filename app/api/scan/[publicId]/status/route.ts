import type { NextRequest } from "next/server";
import { getScanStatus } from "@/lib/services/scan";

const NO_STORE = { "cache-control": "no-store" } as const;

/** GET /api/scan/<public_id>/status — `{ status }` for the progress page's polling. The share id is the capability. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/scan/[publicId]/status">): Promise<Response> {
  const { publicId } = await ctx.params;
  const view = await getScanStatus(publicId);
  if (!view) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  return Response.json({ status: view.status }, { headers: NO_STORE });
}
