/**
 * Crawl output (spec 3.1). A crawled page is a structured document extracted
 * from HTML; the raw HTML is deliberately not kept (`html?: never`) so checks
 * stay pure functions over the structured fields.
 */

export const PAGE_KINDS = ["home", "product", "cart", "checkout", "legal", "account", "other"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export interface PageHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export interface PageLink {
  /** Accessible name: aria-label, else visible text, else alt of contained images, else title. */
  text: string;
  /** The raw href attribute. */
  href: string;
  /** Absolute URL resolved against the page (and any <base>), fragment kept; "" when unparseable. */
  abs: string;
}

export interface FormInput {
  /** Lower-cased input type; "select" and "textarea" for those elements. */
  type: string;
  name: string;
  id: string;
  /** Has a <label> (wrapping or for=id), aria-label, aria-labelledby or title. Placeholders do not count. */
  labelled: boolean;
}

export interface PageForm {
  /** Absolute action URL, or "" when the form has no action (or for the synthetic group of inputs outside any form). */
  action: string;
  inputs: FormInput[];
}

export interface PageImage {
  /** null when the alt attribute is missing; "" is a valid decorative alt. */
  alt: string | null;
  src: string;
}

export interface CrawledPage {
  /** URL that was requested (normalised). */
  url: string;
  /** URL after redirects. */
  finalUrl: string;
  kind: PageKind;
  statusCode: number;
  title: string;
  /** The <html lang> attribute, or null when missing/empty. */
  lang: string | null;
  headings: PageHeading[];
  links: PageLink[];
  buttons: string[];
  forms: PageForm[];
  /** External script URLs plus absolute URLs referenced inside inline scripts (loader snippets). */
  scripts: string[];
  images: PageImage[];
  /** <meta> name/property/http-equiv (lower-cased) -> content; first occurrence wins. */
  meta: Record<string, string>;
  /**
   * Visible body text without script/style/noscript/svg/template. Runs of white
   * space collapse to one space, or to one "\n" where they cross a block
   * boundary, so sentences from different blocks never merge. Max 60,000 chars.
   */
  text: string;
  html?: never;
}

export interface CrawlError {
  url: string;
  message: string;
}

export interface CrawlResult {
  startUrl: string;
  hostname: string;
  /** In fetch order: homepage first, then candidates in selection order. Non-2xx responses are kept with their status. */
  pages: CrawledPage[];
  /** Normalised URLs skipped because robots.txt disallows them. */
  robotsBlocked: string[];
  errors: CrawlError[];
  /** The homepage looks like a client-rendered shell (see extract.ts). */
  jsRenderedSuspected: boolean;
  durationMs: number;
}
