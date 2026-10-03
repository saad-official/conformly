import { getOrgContext } from "@/lib/auth/session";
import { clientIp, ScanInputError, ScanLimitError, startScan } from "@/lib/services/scan";
import { messagePage } from "./_lib/message-page";

/**
 * POST /api/scan — starts a scan and runs it inside this request (spec 3.5).
 *
 * Accepts the landing form (`application/x-www-form-urlencoded` or
 * multipart, field `url`) or JSON `{ url, siteId? }`. Signed-in requests scan
 * for the user's organization; everyone else scans anonymously.
 *
 * Answers:
 * - form: 303 to /r/<public_id> (done or failed, the report shows which);
 *   JSON: 201 `{ publicId, status, reportUrl }`.
 * - bad input: 400 (HTML page for the form, JSON otherwise).
 * - anonymous over 3 a day: 429 with Retry-After (HTML or JSON).
 * - Free plan over 5 a month: form 303 to /billing?reason=scan_limit;
 *   JSON 429 `{ error, upgradeUrl }`.
 */
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "cache-control": "no-store" } as const;
const BILLING_LIMIT_PATH = "/billing?reason=scan_limit";

type ScanRequest = { url: unknown; siteId: unknown; json: boolean };

async function readScanRequest(request: Request): Promise<ScanRequest | null> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (type.includes("application/json")) {
      const body: unknown = await request.json();
      if (!body || typeof body !== "object") return { url: undefined, siteId: undefined, json: true };
      const { url, siteId } = body as Record<string, unknown>;
      return { url, siteId, json: true };
    }
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const form = await request.formData();
      return { url: form.get("url"), siteId: form.get("siteId"), json: false };
    }
  } catch {
    return null;
  }
  return null;
}

function seeOther(location: string): Response {
  // A relative Location is valid (RFC 9110) and stays on whatever host the visitor used.
  return new Response(null, { status: 303, headers: { location: location, ...NO_STORE } });
}

function html(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE, ...headers } });
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function badRequest(message: string, asJson: boolean): Response {
  if (asJson) return json(400, { error: message });
  return html(
    400,
    messagePage({
      title: "That address cannot be scanned",
      message,
      actions: [{ href: "/#scan", label: "Try another address", primary: true }],
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  const accept = request.headers.get("accept") ?? "";
  const parsed = await readScanRequest(request);
  const asJson = parsed?.json ?? (accept.includes("application/json") && !accept.includes("text/html"));
  if (!parsed) return badRequest("Send the store URL as a form field `url` or as JSON { \"url\": \"…\" }.", asJson);
  if (typeof parsed.url !== "string" || parsed.url.trim() === "") return badRequest("Enter the address of an online shop.", asJson);

  const siteId = typeof parsed.siteId === "string" && parsed.siteId.trim() !== "" ? parsed.siteId.trim() : null;
  if (siteId && !UUID.test(siteId)) return badRequest("Unknown site.", asJson);

  const ctx = await getOrgContext();
  if (siteId && !ctx) return badRequest("Sign in to scan one of your sites.", asJson);

  try {
    const result = await startScan({
      url: parsed.url,
      requester: { ip: clientIp(request.headers), orgId: ctx?.org.id ?? null, siteId, userId: ctx?.user.id ?? null },
      now: new Date(),
    });
    const reportUrl = `/r/${result.publicId}`;
    if (asJson) return json(201, { publicId: result.publicId, status: result.status, reportUrl });
    return seeOther(reportUrl);
  } catch (error) {
    if (error instanceof ScanInputError) return badRequest(error.message, asJson);
    if (error instanceof ScanLimitError) {
      if (error.kind === "plan_monthly") {
        if (asJson) return json(429, { error: error.message, upgradeUrl: BILLING_LIMIT_PATH });
        return seeOther(BILLING_LIMIT_PATH);
      }
      const retryAfter = String(Math.max(1, Math.ceil((error.resetsAt.getTime() - Date.now()) / 1000)));
      if (asJson) return json(429, { error: error.message, retryAt: error.resetsAt.toISOString() }, { "retry-after": retryAfter });
      return html(
        429,
        messagePage({
          title: "That's today's free scans",
          message: error.message,
          actions: [
            { href: "/sign-up", label: "Create a free account", primary: true },
            { href: "/", label: "Back to Conformly" },
          ],
        }),
        { "retry-after": retryAfter },
      );
    }
    console.error("[api/scan] could not start a scan", error);
    const message = "The scan could not be started. Try again in a minute.";
    if (asJson) return json(500, { error: message });
    return html(
      500,
      messagePage({ title: "Something went wrong", message, actions: [{ href: "/#scan", label: "Back to the scan form", primary: true }] }),
    );
  }
}
