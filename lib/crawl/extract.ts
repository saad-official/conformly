/**
 * HTML -> structured document (spec 3.1) with cheerio. No JavaScript runs, so
 * what we see is the server-rendered HTML; `analyzeDocument` also reports
 * whether the page looks like a client-rendered shell, which the checks use to
 * turn absence-based verdicts into `unknown`.
 *
 * Page kind precedence: home (root or language-root path) -> account, checkout,
 * cart (URL) -> legal (URL) -> product (JSON-LD Product, og:type product,
 * product path, or exactly one add-to-cart button) -> legal (title/h1) ->
 * cart/checkout (title/h1) -> other. Product signals beat title-based legal
 * matches so a product named "Cookies" stays a product.
 */
import { load, type Cheerio, type CheerioAPI } from "cheerio";
import { isProductPath, legalCategoriesOf, urlKind } from "./classify";
import { collapseWhitespace, compileTerms } from "./text";
import type { CrawledPage, FormInput, PageForm, PageHeading, PageImage, PageKind, PageLink } from "./types";
import { ADD_TO_CART_TERMS, CART_HEADINGS, CHECKOUT_HEADINGS } from "./vocabulary";

export const MAX_TEXT_CHARS = 60_000;
const MAX_SCRIPTS = 100;
/** Fewer visible characters than this, with more than MAX_SHELL_SCRIPTS scripts, suggests a JS shell. */
const SHELL_TEXT_CHARS = 200;
const MAX_SHELL_SCRIPTS = 5;
const ROOT_CONTAINERS = "#root, #app, #__next, #__nuxt, #svelte, [data-reactroot]";

const NON_VISIBLE = "script, style, noscript, svg, template";
const BLOCK_ELEMENTS = [
  "address", "article", "aside", "blockquote", "button", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hr", "label", "legend", "li", "main", "nav", "ol", "option", "p", "pre", "section", "summary",
  "table", "td", "th", "tr", "ul",
].join(", ");
const SKIPPED_INPUT_TYPES: ReadonlySet<string> = new Set(["hidden", "submit", "button", "reset", "image"]);
const EXECUTABLE_SCRIPT_TYPES: ReadonlySet<string> = new Set([
  "", "text/javascript", "application/javascript", "module", "text/ecmascript", "application/ecmascript",
]);
const INLINE_URL = /https?:\/\/[^\s"'`<>()\\]+/g;

const ADD_TO_CART = compileTerms(ADD_TO_CART_TERMS);
const CART_HEADING = compileTerms(CART_HEADINGS);
const CHECKOUT_HEADING = compileTerms(CHECKOUT_HEADINGS);

type DomNode = ReturnType<ReturnType<CheerioAPI["root"]>["contents"]> extends Cheerio<infer N> ? N : never;

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

function attr($el: Cheerio<DomNode>, name: string): string {
  return ($el.attr(name) ?? "").trim();
}

/** Collapsed text of an element without its non-visible descendants. */
function visibleText($: CheerioAPI, el: DomNode): string {
  const clone = $(el).clone();
  clone.find(NON_VISIBLE).remove();
  return collapseWhitespace(clone.text());
}

function accessibleName($: CheerioAPI, el: DomNode): string {
  const $el = $(el);
  const label = attr($el, "aria-label");
  if (label) return label;
  const text = visibleText($, el);
  if (text) return text;
  const alts = $el
    .find("img[alt]")
    .map((_, img) => attr($(img), "alt"))
    .get()
    .filter((alt) => alt.length > 0)
    .join(" ");
  if (alts) return alts;
  return attr($el, "value") || attr($el, "title");
}

function extractHeadings($: CheerioAPI): PageHeading[] {
  return $("h1, h2, h3, h4, h5, h6")
    .map((_, el) => {
      const tag = "tagName" in el ? el.tagName.toLowerCase() : "h6";
      const level = Number(tag.slice(1)) as PageHeading["level"];
      return { level, text: visibleText($, el) };
    })
    .get();
}

function extractLinks($: CheerioAPI, base: string): PageLink[] {
  return $("a[href], area[href]")
    .map((_, el) => {
      const href = attr($(el), "href");
      return { text: accessibleName($, el), href, abs: resolveUrl(href, base) };
    })
    .get();
}

function extractButtons($: CheerioAPI): string[] {
  return $('button, input[type="submit"], input[type="button"], input[type="reset"], [role="button"]')
    .map((_, el) => accessibleName($, el))
    .get()
    .filter((name) => name.length > 0);
}

function isLabelled($: CheerioAPI, el: DomNode): boolean {
  const $el = $(el);
  if (attr($el, "aria-label") || attr($el, "aria-labelledby") || attr($el, "title")) return true;
  if ($el.closest("label").length > 0) return true;
  const id = attr($el, "id");
  return id.length > 0 && $("label").filter((_, label) => attr($(label), "for") === id).length > 0;
}

function toFormInput($: CheerioAPI, el: DomNode): FormInput | null {
  const $el = $(el);
  const tag = "tagName" in el ? el.tagName.toLowerCase() : "";
  const type = tag === "input" ? (attr($el, "type").toLowerCase() || "text") : tag;
  if (SKIPPED_INPUT_TYPES.has(type)) return null;
  return { type, name: attr($el, "name"), id: attr($el, "id"), labelled: isLabelled($, el) };
}

function collectInputs($: CheerioAPI, $fields: Cheerio<DomNode>): FormInput[] {
  return $fields
    .map((_, el) => toFormInput($, el))
    .get()
    .filter((input): input is FormInput => input !== null);
}

function extractForms($: CheerioAPI, base: string): PageForm[] {
  const forms: PageForm[] = $("form")
    .map((_, form) => {
      const action = attr($(form), "action");
      return { action: action ? resolveUrl(action, base) : "", inputs: collectInputs($, $(form).find("input, select, textarea")) };
    })
    .get();
  const stray = collectInputs(
    $,
    $("input, select, textarea").filter((_, el) => $(el).closest("form").length === 0),
  );
  if (stray.length > 0) forms.push({ action: "", inputs: stray });
  return forms;
}

interface ScriptScan {
  scripts: string[];
  executableCount: number;
  jsonLd: string[];
}

function scanScripts($: CheerioAPI, base: string): ScriptScan {
  const seen = new Set<string>();
  const scripts: string[] = [];
  const jsonLd: string[] = [];
  let executableCount = 0;
  const add = (url: string) => {
    if (url && !seen.has(url) && scripts.length < MAX_SCRIPTS) {
      seen.add(url);
      scripts.push(url);
    }
  };
  $("script").each((_, el) => {
    const $el = $(el);
    const type = attr($el, "type").toLowerCase();
    if (type === "application/ld+json") {
      jsonLd.push($el.text());
      return;
    }
    if (!EXECUTABLE_SCRIPT_TYPES.has(type)) return;
    executableCount += 1;
    const src = attr($el, "src");
    if (src) {
      add(resolveUrl(src, base));
      return;
    }
    for (const match of $el.text().match(INLINE_URL) ?? []) add(match.replace(/[;,.]+$/, ""));
  });
  return { scripts, executableCount, jsonLd };
}

function extractImages($: CheerioAPI, base: string): PageImage[] {
  return $("img")
    .map((_, el) => {
      const $el = $(el);
      const alt = $el.attr("alt");
      const src = attr($el, "src") || attr($el, "data-src");
      return { alt: alt === undefined ? null : alt.trim(), src: src ? resolveUrl(src, base) || src : "" };
    })
    .get();
}

function extractMeta($: CheerioAPI): Record<string, string> {
  const meta: Record<string, string> = {};
  $("meta").each((_, el) => {
    const $el = $(el);
    const key = (attr($el, "name") || attr($el, "property") || attr($el, "http-equiv")).toLowerCase();
    const content = $el.attr("content");
    if (key && content !== undefined && !(key in meta)) meta[key] = content.trim();
  });
  return meta;
}

/** Destructive: rewrites the document, so it runs after every other extractor. */
function extractText($: CheerioAPI): string {
  const root = $("body");
  root.find(NON_VISIBLE).remove();
  root.find("br").replaceWith("\n");
  root.find(BLOCK_ELEMENTS).each((_, el) => {
    $(el).prepend("\n").append("\n");
  });
  const text = root
    .text()
    .replace(/\s*\n\s*/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
  return text.slice(0, MAX_TEXT_CHARS);
}

function hasProductType(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasProductType(item, depth + 1));
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === "string" && /(^|[/:])product(group)?$/i.test(t))) return true;
  return Object.values(record).some((child) => hasProductType(child, depth + 1));
}

function jsonLdHasProduct(blocks: readonly string[]): boolean {
  return blocks.some((block) => {
    try {
      return hasProductType(JSON.parse(block));
    } catch {
      return false;
    }
  });
}

function isHomePath(url: string): boolean {
  try {
    return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/?)?$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

interface KindSignals {
  url: string;
  title: string;
  headings: PageHeading[];
  buttons: string[];
  meta: Record<string, string>;
  jsonLd: string[];
}

function detectKind(s: KindSignals): PageKind {
  if (isHomePath(s.url)) return "home";
  if (urlKind.isAccount(s.url)) return "account";
  if (urlKind.isCheckout(s.url)) return "checkout";
  if (urlKind.isCart(s.url)) return "cart";
  if (legalCategoriesOf({ url: s.url, title: "", headings: [] }).length > 0) return "legal";

  const addToCart = s.buttons.filter((name) => ADD_TO_CART.test(name)).length;
  let pathname = "";
  try {
    pathname = new URL(s.url).pathname;
  } catch {
    pathname = "";
  }
  const ogType = (s.meta["og:type"] ?? "").toLowerCase();
  if (jsonLdHasProduct(s.jsonLd) || ogType.startsWith("product") || isProductPath(pathname) || addToCart === 1) {
    return "product";
  }

  if (legalCategoriesOf({ url: "", title: s.title, headings: s.headings }).length > 0) return "legal";
  const titles = [s.title, ...s.headings.filter((h) => h.level === 1).map((h) => h.text)];
  if (titles.some((t) => CHECKOUT_HEADING.test(t))) return "checkout";
  if (titles.some((t) => CART_HEADING.test(t))) return "cart";
  return "other";
}

function isEmptyRootContainer($: CheerioAPI): boolean {
  return $(ROOT_CONTAINERS)
    .toArray()
    .some((el) => $(el).children().length === 0 && $(el).text().trim().length === 0);
}

export interface AnalyzedDocument {
  page: CrawledPage;
  jsRenderedSuspected: boolean;
}

export function analyzeDocument(html: string, url: string): AnalyzedDocument {
  const $ = load(html);
  const baseHref = $("base[href]").first().attr("href");
  const base = (baseHref && resolveUrl(baseHref, url)) || url;

  const langAttr = ($("html").attr("lang") ?? "").trim();
  const title = collapseWhitespace($("title").first().text());
  const headings = extractHeadings($);
  const links = extractLinks($, base);
  const buttons = extractButtons($);
  const forms = extractForms($, base);
  const { scripts, executableCount, jsonLd } = scanScripts($, base);
  const images = extractImages($, base);
  const meta = extractMeta($);
  const emptyRoot = isEmptyRootContainer($);
  const text = extractText($);

  const page: CrawledPage = {
    url,
    finalUrl: url,
    kind: detectKind({ url, title, headings, buttons, meta, jsonLd }),
    statusCode: 200,
    title,
    lang: langAttr || null,
    headings,
    links,
    buttons,
    forms,
    scripts,
    images,
    meta,
    text,
  };
  const jsRenderedSuspected = emptyRoot || (text.length < SHELL_TEXT_CHARS && executableCount > MAX_SHELL_SCRIPTS);
  return { page, jsRenderedSuspected };
}

export function extractDocument(html: string, url: string): CrawledPage {
  return analyzeDocument(html, url).page;
}
