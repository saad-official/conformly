import { describe, expect, it } from "vitest";
import { classifyLink, isProductPath, legalCategoriesOf } from "@/lib/crawl/classify";

const base = "https://shop.example";

describe("classifyLink", () => {
  it.each([
    ["Impressum", "/impressum", { kind: "legal", category: "imprint" }],
    ["Mentions légales", "/pages/ml", { kind: "legal", category: "imprint" }],
    ["Note legali", "/note", { kind: "legal", category: "imprint" }],
    ["Widerrufsbelehrung", "/pages/info-3", { kind: "legal", category: "withdrawal" }],
    ["", "/policies/refund-policy", { kind: "legal", category: "withdrawal" }],
    ["Derecho de desistimiento", "/legal/d", { kind: "legal", category: "withdrawal" }],
    ["Herroepingsrecht", "/h", { kind: "legal", category: "withdrawal" }],
    ["Déclaration d’accessibilité", "/pages/a11y", { kind: "legal", category: "accessibility" }],
    ["Toegankelijkheidsverklaring", "/t", { kind: "legal", category: "accessibility" }],
    ["Cookie policy", "/pages/c", { kind: "legal", category: "cookies" }],
    ["Privacy policy", "/policies/privacy-policy", { kind: "legal", category: "privacy" }],
    ["Datenschutzerklärung", "/ds", { kind: "legal", category: "privacy" }],
    ["AGB", "/agb", { kind: "legal", category: "terms" }],
    ["Termini e condizioni", "/tc", { kind: "legal", category: "terms" }],
    ["Mein Konto", "/mein-konto", { kind: "account" }],
    ["", "/account/login", { kind: "account" }],
    ["Mon compte", "/client", { kind: "account" }],
    ["Warenkorb", "/warenkorb", { kind: "cart" }],
    ["", "/panier", { kind: "cart" }],
    ["Checkout", "/checkout", { kind: "checkout" }],
    ["Linen shirt", "/products/linen-shirt", { kind: "product" }],
    ["Bougie", "/fr/produits/bougie-soja", { kind: "product" }],
    ["Lamp", "/collections/lamps/products/aurora", { kind: "product" }],
    ["Item", "/p/12345", { kind: "product" }],
  ])("%s -> %s", (text, path, expected) => {
    expect(classifyLink(text, `${base}${path}`)).toEqual(expected);
  });

  it("returns null for listing pages and unrelated links", () => {
    expect(classifyLink("All products", `${base}/products`)).toBeNull();
    expect(classifyLink("About us", `${base}/pages/about`)).toBeNull();
    expect(classifyLink("Economy shipping", `${base}/pages/shipping`)).toBeNull();
  });

  it("prefers the link text over the URL", () => {
    expect(classifyLink("Widerrufsrecht", `${base}/pages/agb-und-mehr`)).toEqual({
      kind: "legal",
      category: "withdrawal",
    });
  });
});

describe("isProductPath", () => {
  it("needs a product segment followed by a slug", () => {
    expect(isProductPath("/products/linen-shirt")).toBe(true);
    expect(isProductPath("/shop/wool-scarf")).toBe(true);
    expect(isProductPath("/item/77")).toBe(true);
    expect(isProductPath("/products/")).toBe(false);
    expect(isProductPath("/shop")).toBe(false);
  });
});

describe("legalCategoriesOf", () => {
  it("reads the URL, the title and the h1, not lower headings", () => {
    expect(
      legalCategoriesOf({
        url: `${base}/pages/info`,
        title: "Erklärung zur Barrierefreiheit – Shop",
        headings: [{ level: 2, text: "Impressum" }],
      }),
    ).toEqual(["accessibility"]);
    expect(
      legalCategoriesOf({
        url: `${base}/impressum`,
        title: "Shop",
        headings: [{ level: 1, text: "Impressum und Datenschutz" }],
      }),
    ).toEqual(["imprint", "privacy"]);
    expect(legalCategoriesOf({ url: `${base}/`, title: "Home", headings: [] })).toEqual([]);
  });
});
