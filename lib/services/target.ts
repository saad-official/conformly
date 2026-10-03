/**
 * Target-site safety for the scanner. Conformly fetches URLs that strangers
 * type in, so every request the crawler makes (the start URL, robots.txt and
 * each redirect hop) must point at a public web server:
 *
 * - http or https only, no credentials in the URL, standard web ports only;
 * - no loopback, private, link-local or otherwise reserved IP literals
 *   (IPv4, IPv6 and IPv4-mapped IPv6);
 * - no local-only names (localhost, *.local, *.internal, …) and no
 *   single-label hosts;
 * - with a resolver (production), the host name must not resolve to such an
 *   address either. This narrows DNS rebinding but cannot rule it out: the
 *   HTTP client resolves again on connect.
 *
 * Pure apart from the optional resolver, so it is unit-testable.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { FetchInitLike, FetchLike, FetchResponseLike } from "@/lib/crawl/fetcher";

export type TargetCheck = { ok: true; url: string; hostname: string } | { ok: false; reason: string };

export const MAX_URL_LENGTH = 2048;
/** Ports a storefront plausibly uses. Anything else is refused, which also stops port scanning through the crawler. */
export const ALLOWED_PORTS: ReadonlySet<string> = new Set(["", "80", "443", "8080", "8443"]);

const BLOCKED_NAMES: ReadonlySet<string> = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"]);
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".lan", ".home.arpa", ".intranet", ".corp"];

/* ------------------------------------------------------------------ */
/* IP addresses                                                        */
/* ------------------------------------------------------------------ */

function ipv4Octets(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255) ? octets : null;
}

function isPrivateIPv4(octets: readonly number[]): boolean {
  const [a, b, c] = octets;
  return (
    a === 0 || // "this network"
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a === 127 ||
    (a === 169 && b === 254) || // link-local, cloud metadata endpoints
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Eight 16-bit groups, or null when the text is not an IPv6 address. Accepts a trailing dotted quad. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  const tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  if (lastColon >= 0 && text.slice(lastColon + 1).includes(".")) {
    const octets = ipv4Octets(text.slice(lastColon + 1));
    if (!octets) return null;
    tail.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
    text = `${text.slice(0, lastColon + 1)}0`; // placeholder group, dropped below
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":"));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if (tail.length > 0) (rest.length > 0 ? rest : head).pop();
  const groups = [...head, ...rest].map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  if (groups.some((g) => Number.isNaN(g))) return null;
  const explicit = groups.length + tail.length;
  if (halves.length === 1 && explicit !== 8) return null;
  if (halves.length === 2 && explicit > 7) return null;
  const fill = new Array<number>(8 - explicit).fill(0);
  const headGroups = head.map((g) => parseInt(g, 16));
  const restGroups = rest.map((g) => parseInt(g, 16));
  return halves.length === 2 ? [...headGroups, ...fill, ...restGroups, ...tail] : [...headGroups, ...tail];
}

function isPrivateIPv6(groups: readonly number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const embeddedV4 = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff];
  if (groups.slice(0, 7).every((g) => g === 0) && (g7 === 0 || g7 === 1)) return true; // :: and ::1
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0xffff || g5 === 0)) {
    return isPrivateIPv4(embeddedV4); // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d)
  }
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isPrivateIPv4(embeddedV4); // NAT64
  if ((g0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g0 & 0xffc0) === 0xfec0) return true; // site-local (deprecated)
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  return false;
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses (IPv4 or IPv6). */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, "");
  const kind = isIP(bare.split("%")[0]);
  if (kind === 4) {
    const octets = ipv4Octets(bare);
    return octets === null || isPrivateIPv4(octets);
  }
  if (kind === 6) {
    const groups = ipv6Groups(bare);
    return groups === null || isPrivateIPv6(groups);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* URLs                                                                */
/* ------------------------------------------------------------------ */

/**
 * Accepts what people type ("shop.example", "https://shop.example/de") and
 * returns the URL to crawl, or a reason written for the person who typed it.
 */
export function validateTargetUrl(input: unknown): TargetCheck {
  if (typeof input !== "string" || input.trim() === "") return { ok: false, reason: "Enter the address of an online shop." };
  const raw = input.trim();
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: "That address is too long." };

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: "That does not look like a web address. Try something like yourstore.com." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http and https addresses can be scanned." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Remove the user name or password from the address." };
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (isPrivateAddress(bare)) return { ok: false, reason: "Private, local and reserved network addresses cannot be scanned." };
  } else {
    if (BLOCKED_NAMES.has(hostname) || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
      return { ok: false, reason: "Local network addresses cannot be scanned." };
    }
    if (!hostname.includes(".")) {
      return { ok: false, reason: "Enter a full domain name, such as yourstore.com." };
    }
  }
  if (!ALLOWED_PORTS.has(parsed.port)) {
    return { ok: false, reason: "Only standard web ports (80, 443, 8080, 8443) can be scanned." };
  }

  parsed.hash = "";
  if (hostname !== parsed.hostname) parsed.hostname = hostname;
  return { ok: true, url: parsed.href, hostname: bare };
}

/* ------------------------------------------------------------------ */
/* Guarded fetch                                                       */
/* ------------------------------------------------------------------ */

export class BlockedTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedTargetError";
  }
}

/** Resolves a host name to its IP addresses (all families). */
export type HostResolver = (hostname: string) => Promise<string[]>;

export const dnsResolver: HostResolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

/** Response bodies are read up to this many bytes; the crawler keeps at most 3,000,000 characters anyway. */
export const MAX_BODY_BYTES = 5_000_000;

type StreamingResponse = FetchResponseLike & { body?: ReadableStream<Uint8Array> | null };

async function readCapped(response: StreamingResponse, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body || typeof body.getReader !== "function") return response.text();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let out = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - received;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      received += chunk.byteLength;
      out += decoder.decode(chunk, { stream: true });
      if (received >= maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return out + decoder.decode();
}

export interface SafeFetchOptions {
  /** Checks where each host name resolves; omit to check URLs syntactically only (tests with a fake fetch). */
  resolveHost?: HostResolver;
  maxBodyBytes?: number;
}

/**
 * Wraps a fetch so that every request (each redirect hop is a separate call,
 * because the crawler follows redirects manually) is validated first, and
 * bodies are read with a size cap. A refused request rejects, which the
 * crawler records as a page error.
 */
export function createSafeFetch(inner: FetchLike, options: SafeFetchOptions = {}): FetchLike {
  const maxBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;
  return async (url: string, init: FetchInitLike) => {
    const check = validateTargetUrl(url);
    if (!check.ok) throw new BlockedTargetError(`Refused to fetch ${url}: ${check.reason}`);
    if (options.resolveHost && !isIP(check.hostname)) {
      let addresses: string[];
      try {
        addresses = await options.resolveHost(check.hostname);
      } catch {
        throw new BlockedTargetError(`Could not resolve ${check.hostname}`);
      }
      if (addresses.length === 0) throw new BlockedTargetError(`Could not resolve ${check.hostname}`);
      if (addresses.some(isPrivateAddress)) {
        throw new BlockedTargetError(`Refused to fetch ${check.hostname}: it resolves to a private or reserved network address`);
      }
    }
    const response = (await inner(url, init)) as StreamingResponse;
    return {
      status: response.status,
      headers: response.headers,
      text: () => readCapped(response, maxBytes),
    };
  };
}

/** The platform fetch in the shape the crawler expects, never cached. */
export const platformFetch: FetchLike = (url, init) => globalThis.fetch(url, { ...init, cache: "no-store" });
