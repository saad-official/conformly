import type { FakeRoutes } from "./fake-fetch";

/** A synthetic storefront: HTML (and robots.txt, redirects, failures) keyed by URL. */
export interface StorefrontFixture {
  startUrl: string;
  routes: FakeRoutes;
}

export interface PageOptions {
  /** null omits the lang attribute. */
  lang: string | null;
  title: string;
  head?: string;
  body: string;
}

export function page({ lang, title, head = "", body }: PageOptions): string {
  const langAttr = lang === null ? "" : ` lang="${lang}"`;
  return `<!doctype html>
<html${langAttr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${head}
</head>
<body>
${body}
</body>
</html>`;
}

export function productJsonLd(name: string, price: string): string {
  return `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    offers: { "@type": "Offer", price, priceCurrency: "EUR" },
  })}</script>`;
}
