/**
 * Link and page classification from URL and text vocabularies.
 *
 * Link precedence: link text beats URL (footer text such as "Widerrufsbelehrung"
 * is more reliable than an opaque "/pages/info-3"). Within text, legal
 * categories win over account/cart/checkout; within URLs the order is account,
 * checkout, cart, legal, product. Legal categories are tried in
 * LEGAL_CATEGORIES order, so each link lands in exactly one slot.
 */
import { compileTerms, type TermMatcher } from "./text";
import type { PageHeading } from "./types";
import {
  ACCOUNT_VOCABULARY,
  CART_VOCABULARY,
  CHECKOUT_VOCABULARY,
  LEGAL_CATEGORIES,
  LEGAL_VOCABULARY,
  PRODUCT_PATH_SEGMENTS,
  type LegalCategory,
  type Vocabulary,
} from "./vocabulary";

export type LinkTarget =
  | { kind: "legal"; category: LegalCategory }
  | { kind: "product" }
  | { kind: "cart" }
  | { kind: "checkout" }
  | { kind: "account" };

interface CompiledVocabulary {
  text: TermMatcher;
  slugs: TermMatcher;
}

function compileVocabulary(vocabulary: Vocabulary): CompiledVocabulary {
  return { text: compileTerms(vocabulary.text), slugs: compileTerms(vocabulary.slugs) };
}

const LEGAL = LEGAL_CATEGORIES.map((category) => ({ category, ...compileVocabulary(LEGAL_VOCABULARY[category]) }));
const ACCOUNT = compileVocabulary(ACCOUNT_VOCABULARY);
const CART = compileVocabulary(CART_VOCABULARY);
const CHECKOUT = compileVocabulary(CHECKOUT_VOCABULARY);
const PRODUCT_SEGMENTS: ReadonlySet<string> = new Set(PRODUCT_PATH_SEGMENTS);

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function safeDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

/** The decoded path with "/" and "." as spaces, ready for slug matching. */
export function pathText(url: string): string {
  const parsed = safeUrl(url);
  if (!parsed) return "";
  return safeDecode(parsed.pathname).replace(/[/.]+/g, " ").trim();
}

/** A product segment followed by a non-empty slug, e.g. "/products/linen-shirt" or "/fr/produits/bougie". */
export function isProductPath(pathname: string): boolean {
  const segments = pathname.toLowerCase().split("/");
  return segments.some(
    (segment, i) => PRODUCT_SEGMENTS.has(segment) && i + 1 < segments.length && segments[i + 1].length > 0,
  );
}

function legalCategoryOfText(text: string): LegalCategory | null {
  if (!text) return null;
  return LEGAL.find((entry) => entry.text.test(text))?.category ?? null;
}

export function classifyLink(text: string, absUrl: string): LinkTarget | null {
  const textCategory = legalCategoryOfText(text);
  if (textCategory) return { kind: "legal", category: textCategory };
  if (text) {
    if (ACCOUNT.text.test(text)) return { kind: "account" };
    if (CHECKOUT.text.test(text)) return { kind: "checkout" };
    if (CART.text.test(text)) return { kind: "cart" };
  }

  const path = pathText(absUrl);
  if (!path) return null;
  if (ACCOUNT.slugs.test(path)) return { kind: "account" };
  if (CHECKOUT.slugs.test(path)) return { kind: "checkout" };
  if (CART.slugs.test(path)) return { kind: "cart" };
  const slugCategory = LEGAL.find((entry) => entry.slugs.test(path))?.category;
  if (slugCategory) return { kind: "legal", category: slugCategory };
  const parsed = safeUrl(absUrl);
  if (parsed && isProductPath(parsed.pathname)) return { kind: "product" };
  return null;
}

export interface LegalSignals {
  url: string;
  title: string;
  headings: readonly PageHeading[];
}

/** Legal categories a page belongs to by its URL path, title and h1 headings, in LEGAL_CATEGORIES order. */
export function legalCategoriesOf(page: LegalSignals): LegalCategory[] {
  const path = pathText(page.url);
  const texts = [page.title, ...page.headings.filter((h) => h.level === 1).map((h) => h.text)];
  return LEGAL.filter((entry) => (path && entry.slugs.test(path)) || texts.some((t) => t && entry.text.test(t))).map(
    (entry) => entry.category,
  );
}

/** Page-kind URL tests, exposed for extract.ts. */
export const urlKind = {
  isAccount: (url: string) => ACCOUNT.slugs.test(pathText(url)),
  isCheckout: (url: string) => CHECKOUT.slugs.test(pathText(url)),
  isCart: (url: string) => CART.slugs.test(pathText(url)),
};
