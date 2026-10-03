/**
 * legal_notice (spec 3.2): e-Commerce Directive Art. 5(1) identity details:
 * geographic address, e-mail, trade register number and VAT ID.
 *
 * Pages: the "imprint" legal category; when there is none, every legal page
 * (shops often put company details in the terms). Three elements are looked
 * for, each quoted as evidence:
 * - address: a street with a house number on a line, with a postcode on the
 *   same or the next line (a lone "© 2026 Shop" is not an address);
 * - e-mail: a mailto link or an address in the text ("[at]" spellings too);
 * - registration: an EU VAT ID by country format, or register wording (HRB,
 *   RCS, KvK, REA…) followed by a number of at least five digits.
 * pass: all three; warn: one or two; fail: none, or no legal page at all.
 */
import { compileTerms } from "@/lib/crawl/text";
import type { CrawledPage } from "@/lib/crawl/types";
import { absenceFinding, findEmail, makeFinding, pagesInCategory, pickLocale, quote, type SupportedLocale } from "./shared";
import type { CheckContext, CheckDefinition, Evidence, Finding, Fix } from "./types";

export const definition: CheckDefinition = {
  code: "legal_notice",
  title: "Legal notice completeness",
  severity: "high",
  citation: {
    law: "Directive 2000/31/EC (e-Commerce Directive)",
    article: "Art. 5(1)",
    url: "https://eur-lex.europa.eu/eli/dir/2000/31/oj",
  },
};

/** Street with house number, by language family. */
export const STREET_PATTERNS: readonly RegExp[] = [
  // DE/NL compounds: Lindenstraße 12, Keizersgracht 123
  /[\p{L}-]*(?:straße|strasse|str\.|weg|gasse|platz|allee|damm|ufer|gracht|straat|laan|plein|kade|singel|steeg|dijk)\s*\d+/iu,
  // FR: 12 rue de la Paix
  /\d+\s*(?:bis|ter)?,?\s+(?:rue|avenue|av\.|boulevard|bd|chemin|place|quai|impasse|allée|route|cours)(?!\p{L})/iu,
  // IT/ES/PT: Via Roma 5, Calle Mayor 10
  /(?<!\p{L})(?:via|viale|piazza|piazzale|corso|largo|vicolo|calle|avenida|avda\.|plaza|paseo|carrer|camino|rua)\s+[\p{L}'. ]{2,40}?,?\s*\d+/iu,
  // EN: 22 Harbour Street
  /\d+[a-z]?\s+[\p{L}'. ]{2,40}?\s(?:street|st\.|road|rd\.|lane|avenue|ave\.|way|square|place|drive|quay)(?!\p{L})/iu,
];

/** Postcode (+ city) patterns. */
export const POSTCODE_PATTERNS: readonly RegExp[] = [
  /(?<!\d)\d{5}\s+\p{Lu}/u, // DE, FR, IT, ES, FI…
  /(?<!\d)\d{4}\s?[A-Z]{2}\s+\p{Lu}/u, // NL
  /(?<!\d)\d{4}\s+\p{Lu}\p{Ll}+/u, // AT, BE, DK, LU…
  /(?<![A-Z0-9])[AC-FHKNPRTV-Y]\d{2}\s?[0-9AC-FHKNPRTV-Y]{4}(?![A-Z0-9])/u, // IE Eircode
];

/** EU VAT ID formats, tested on the compacted candidate (spaces, dots and hyphens removed). */
export const VAT_FORMATS: Readonly<Record<string, RegExp>> = {
  ATU: /^ATU\d{8}(?!\d)/, BE: /^BE[01]\d{9}(?!\d)/, BG: /^BG\d{9,10}(?!\d)/, CY: /^CY\d{8}[A-Z]/,
  CZ: /^CZ\d{8,10}(?!\d)/, DE: /^DE\d{9}(?!\d)/, DK: /^DK\d{8}(?!\d)/, EE: /^EE\d{9}(?!\d)/,
  EL: /^EL\d{9}(?!\d)/, ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]/, FI: /^FI\d{8}(?!\d)/, FR: /^FR[0-9A-HJ-NP-Z]{2}\d{9}(?!\d)/,
  HR: /^HR\d{11}(?!\d)/, HU: /^HU\d{8}(?!\d)/, IE: /^IE\d[0-9A-Z+*]\d{5}[A-Z]{1,2}/, IT: /^IT\d{11}(?!\d)/,
  LT: /^LT(?:\d{12}|\d{9})(?!\d)/, LU: /^LU\d{8}(?!\d)/, LV: /^LV\d{11}(?!\d)/, MT: /^MT\d{8}(?!\d)/,
  NL: /^NL\d{9}B\d{2}/, PL: /^PL\d{10}(?!\d)/, PT: /^PT\d{9}(?!\d)/, RO: /^RO\d{2,10}(?!\d)/,
  SE: /^SE\d{12}(?!\d)/, SI: /^SI\d{8}(?!\d)/, SK: /^SK\d{10}(?!\d)/, XI: /^XI\d{9}(?!\d)/,
};
const VAT_CANDIDATE = new RegExp(`(?<![A-Za-z0-9])(${Object.keys(VAT_FORMATS).join("|")})[\\s.-]?((?:[0-9A-Z+*][\\s.-]?){7,14})`, "g");

export const REGISTRATION_TERMS: readonly string[] = [
  "hrb", "hra", "handelsregister", "registergericht", "amtsgericht", "firmenbuch*", "steuernummer", "ust idnr", "ust id",
  "umsatzsteuer*", "vat", "vat number", "vat id", "company number", "company registration*", "registration number",
  "registered in", "companies house", "trade register", "commercial register", "chamber of commerce", "cro",
  "rcs", "siren", "siret", "registre du commerce*", "tva", "numero d'entreprise",
  "rea", "registro delle imprese", "partita iva", "p iva", "codice fiscale",
  "registro mercantil", "cif", "nif",
  "kvk", "kamer van koophandel", "kbo", "ondernemingsnummer", "btw*",
];
const REGISTRATION = compileTerms(REGISTRATION_TERMS);
const LONG_NUMBER = /\d(?:[\s./-]?\d){4,}/;

const FOOTER_LINK: Readonly<Record<SupportedLocale, { label: string; path: string }>> = {
  en: { label: "Legal notice", path: "/pages/legal-notice" },
  de: { label: "Impressum", path: "/impressum" },
  fr: { label: "Mentions légales", path: "/mentions-legales" },
  it: { label: "Note legali", path: "/note-legali" },
  es: { label: "Aviso legal", path: "/aviso-legal" },
  nl: { label: "Bedrijfsgegevens", path: "/bedrijfsgegevens" },
};

function hasVatId(line: string): boolean {
  for (const match of line.matchAll(VAT_CANDIDATE)) {
    const compact = `${match[1]}${match[2].replace(/[\s.-]/g, "")}`;
    if (VAT_FORMATS[match[1]].test(compact)) return true;
  }
  return false;
}

function findAddress(page: CrawledPage): Evidence | null {
  const lines = page.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!STREET_PATTERNS.some((re) => re.test(line))) continue;
    if (POSTCODE_PATTERNS.some((re) => re.test(line))) return quote(page.finalUrl, line);
    const next = lines[i + 1];
    if (next !== undefined && POSTCODE_PATTERNS.some((re) => re.test(next))) return quote(page.finalUrl, `${line} ${next}`);
  }
  return null;
}

function findRegistration(page: CrawledPage): Evidence | null {
  const line = page.text.split("\n").find((l) => hasVatId(l) || (REGISTRATION.test(l) && LONG_NUMBER.test(l)));
  return line === undefined ? null : quote(page.finalUrl, line);
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function buildFix(ctx: CheckContext, imprint: CrawledPage | undefined): Fix {
  const link = FOOTER_LINK[pickLocale(ctx)];
  const path = imprint ? pathOf(imprint.finalUrl) : link.path;
  return {
    summary:
      "Publish a legal notice, linked from the footer of every page, with the registered company name and legal form, a postal address, an e-mail address, the trade register and registration number, and the VAT ID.",
    html: `<footer>\n  <a href="${path}">${link.label}</a>\n</footer>`,
    shopify: "Create it under Online Store > Pages and add it to the footer menu under Online Store > Navigation.",
  };
}

export function legalNoticeCheck(ctx: CheckContext): Finding {
  const imprints = pagesInCategory(ctx, "imprint");
  const fix = buildFix(ctx, imprints[0]);
  const source = imprints.length > 0 ? "imprint" : "other_legal";
  const pages = imprints.length > 0 ? imprints : ctx.pages.filter((p) => p.kind === "legal");
  if (pages.length === 0) {
    return absenceFinding(ctx, definition, {
      status: "fail",
      detail: "No legal notice (imprint) or other legal page was found on the crawled pages.",
      fix,
    });
  }

  let address: Evidence | null = null;
  let email: Evidence | null = null;
  let registration: Evidence | null = null;
  for (const page of pages) {
    address ??= findAddress(page);
    email ??= findEmail(page);
    registration ??= findRegistration(page);
  }
  const meta = { address: address !== null, email: email !== null, registration: registration !== null, source };
  const evidence = [address, email, registration].filter((e): e is Evidence => e !== null);
  const missing = [
    address ? "" : "a postal address",
    email ? "" : "an e-mail address",
    registration ? "" : "a registration or VAT number",
  ].filter(Boolean);
  const where = source === "imprint" ? "The legal notice" : "No dedicated legal notice was found; the other legal pages";

  if (missing.length === 0) {
    return makeFinding(definition, {
      status: "pass",
      detail: `${where} show${source === "imprint" ? "s" : ""} a postal address, an e-mail address and a registration or VAT number. Check the company name, legal form and representatives by hand.`,
      evidence,
      fix,
      meta,
    });
  }
  if (evidence.length === 0) {
    return absenceFinding(ctx, definition, {
      status: "fail",
      detail: `${where} show${source === "imprint" ? "s" : ""} none of the required details: ${missing.join(", ")}.`,
      fix,
      meta,
    });
  }
  return makeFinding(definition, {
    status: "warn",
    detail: `${where} lack${source === "imprint" ? "s" : ""} ${missing.join(" and ")}.`,
    evidence,
    fix,
    meta,
  });
}
