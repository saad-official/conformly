import { describe, expect, it } from "vitest";
import { analyzeDocument, extractDocument, MAX_TEXT_CHARS } from "@/lib/crawl/extract";

const URL_BASE = "https://shop.example";

const RICH_PAGE = `<!doctype html>
<html lang="de-DE">
<head>
  <title>  Bambus-Zahnbürste
    – Grüner Laden </title>
  <meta charset="utf-8">
  <meta name="description" content="Zahnbürste aus Bambus">
  <meta property="og:type" content="website">
  <meta property="OG:Title" content="Ignored duplicate key casing">
  <meta name="description" content="second description is ignored">
  <style>.hidden{display:none}</style>
  <script src="/assets/app.js"></script>
</head>
<body>
  <header>
    <a href="/"><img src="/logo.png" alt="Grüner Laden"></a>
    <a href="/warenkorb" aria-label="Warenkorb öffnen"><svg><title>cart icon</title></svg></a>
    <a href="#main">Zum Inhalt</a>
    <a href="mailto:kontakt@shop.example">E-Mail</a>
    <a>no href is skipped</a>
  </header>
  <main id="main">
    <h1>Bambus-Zahnbürste</h1>
    <p>Unsere Zahnbürste ist <b>umwelt</b>freundlich.</p><p>Zweiter Absatz.</p>
    <h2>Details</h2>
    <img src="produkt.jpg">
    <img src="deko.png" alt="">
    <button type="button">  In den
      Warenkorb </button>
    <button aria-label="Schließen">×</button>
    <div role="button">Mehr anzeigen</div>
    <form action="/newsletter" method="post">
      <label for="nl-email">E-Mail</label><input id="nl-email" type="email" name="email">
      <input type="text" name="name" placeholder="Name">
      <label>Land <select name="country"><option>DE</option></select></label>
      <textarea name="msg" aria-label="Nachricht"></textarea>
      <input type="hidden" name="token" value="x">
      <input type="submit" value="Abonnieren">
    </form>
    <input type="search" name="q" title="Suche">
    <noscript>Bitte JavaScript aktivieren</noscript>
    <script>window.x = 1; s.src = 'https://widget.intercom.io/widget/abc123';</script>
    <script type="application/ld+json">{"@type":"Organization","url":"https://ignored.example/"}</script>
  </main>
</body>
</html>`;

describe("extractDocument: structure", () => {
  const page = extractDocument(RICH_PAGE, `${URL_BASE}/pages/zahnbuerste`);

  it("records url, title, lang and a 200 status by default", () => {
    expect(page.url).toBe(`${URL_BASE}/pages/zahnbuerste`);
    expect(page.finalUrl).toBe(`${URL_BASE}/pages/zahnbuerste`);
    expect(page.statusCode).toBe(200);
    expect(page.title).toBe("Bambus-Zahnbürste – Grüner Laden");
    expect(page.lang).toBe("de-DE");
  });

  it("lists headings in document order", () => {
    expect(page.headings).toEqual([
      { level: 1, text: "Bambus-Zahnbürste" },
      { level: 2, text: "Details" },
    ]);
  });

  it("lists links with accessible names and absolute URLs, skipping anchors without href", () => {
    expect(page.links).toEqual([
      { text: "Grüner Laden", href: "/", abs: `${URL_BASE}/` },
      { text: "Warenkorb öffnen", href: "/warenkorb", abs: `${URL_BASE}/warenkorb` },
      { text: "Zum Inhalt", href: "#main", abs: `${URL_BASE}/pages/zahnbuerste#main` },
      { text: "E-Mail", href: "mailto:kontakt@shop.example", abs: "mailto:kontakt@shop.example" },
    ]);
  });

  it("lists button names from buttons, role=button and submit inputs", () => {
    expect(page.buttons).toEqual(["In den Warenkorb", "Schließen", "Mehr anzeigen", "Abonnieren"]);
  });

  it("lists forms with inputs and whether each is labelled, grouping stray inputs last", () => {
    expect(page.forms).toEqual([
      {
        action: `${URL_BASE}/newsletter`,
        inputs: [
          { type: "email", name: "email", id: "nl-email", labelled: true },
          { type: "text", name: "name", id: "", labelled: false },
          { type: "select", name: "country", id: "", labelled: true },
          { type: "textarea", name: "msg", id: "", labelled: true },
        ],
      },
      { action: "", inputs: [{ type: "search", name: "q", id: "", labelled: true }] },
    ]);
  });

  it("lists external scripts and URLs loaded by inline snippets, not JSON-LD", () => {
    expect(page.scripts).toEqual([`${URL_BASE}/assets/app.js`, "https://widget.intercom.io/widget/abc123"]);
  });

  it("lists images with alt null when the attribute is missing", () => {
    expect(page.images).toEqual([
      { alt: "Grüner Laden", src: `${URL_BASE}/logo.png` },
      { alt: null, src: `${URL_BASE}/pages/produkt.jpg` },
      { alt: "", src: `${URL_BASE}/pages/deko.png` },
    ]);
  });

  it("keeps the first meta value per lower-cased key", () => {
    expect(page.meta).toEqual({
      description: "Zahnbürste aus Bambus",
      "og:type": "website",
      "og:title": "Ignored duplicate key casing",
    });
  });

  it("extracts visible text with one newline per block boundary, without script/style/noscript/svg", () => {
    expect(page.text).toContain("Unsere Zahnbürste ist umweltfreundlich.\nZweiter Absatz.");
    expect(page.text).not.toMatch(/cart icon|window\.x|display:none|JavaScript aktivieren|ignored\.example/);
    expect(page.text).not.toMatch(/ {2}|\n\n| \n|\n /);
  });

  it("never carries raw html", () => {
    expect("html" in page).toBe(false);
  });
});

describe("extractDocument: text limits and base href", () => {
  it(`truncates text to ${MAX_TEXT_CHARS} characters`, () => {
    const long = `<html><body><p>${"wort ".repeat(20_000)}</p></body></html>`;
    expect(extractDocument(long, `${URL_BASE}/`).text.length).toBe(MAX_TEXT_CHARS);
  });

  it("resolves links against <base href>", () => {
    const page = extractDocument(
      `<html><head><base href="https://cdn.shop.example/de/"></head><body><a href="impressum">Impressum</a></body></html>`,
      `${URL_BASE}/`,
    );
    expect(page.links[0].abs).toBe("https://cdn.shop.example/de/impressum");
  });

  it("returns lang null and empty title when missing", () => {
    const page = extractDocument("<p>hi</p>", `${URL_BASE}/x`);
    expect(page.lang).toBeNull();
    expect(page.title).toBe("");
    expect(page.text).toBe("hi");
  });
});

describe("extractDocument: kind", () => {
  const doc = (body: string, head = "") => `<html lang="en"><head>${head}</head><body>${body}</body></html>`;
  const kindOf = (html: string, path: string) => extractDocument(html, `${URL_BASE}${path}`).kind;

  it("classifies the root path as home even with add-to-cart buttons", () => {
    expect(kindOf(doc("<button>Add to cart</button><button>Add to cart</button>"), "/")).toBe("home");
  });

  it("classifies product pages by JSON-LD Product, og:type or a single add-to-cart button", () => {
    const jsonLd = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},{"@type":["Product","Thing"],"name":"Lamp"}]}</script>`;
    expect(kindOf(doc("<h1>Lamp</h1>", jsonLd), "/lamp-aurora")).toBe("product");
    expect(kindOf(doc("<h1>Lamp</h1>", `<meta property="og:type" content="product">`), "/x")).toBe("product");
    expect(kindOf(doc("<h1>Lamp</h1><button>Ajouter au panier</button>"), "/lampe")).toBe("product");
    expect(kindOf(doc("<h1>Lamp</h1>"), "/products/lamp")).toBe("product");
  });

  it("does not treat a collection grid with many add-to-cart buttons as a product", () => {
    expect(kindOf(doc("<h1>Lamps</h1><button>Add to cart</button><button>Add to cart</button>"), "/collections/lamps")).toBe(
      "other",
    );
  });

  it("tolerates malformed JSON-LD", () => {
    expect(kindOf(doc("<h1>x</h1>", `<script type="application/ld+json">{not json</script>`), "/x")).toBe("other");
  });

  it("classifies cart, checkout, account and legal pages by URL", () => {
    expect(kindOf(doc("<h1>Cart</h1>"), "/cart")).toBe("cart");
    expect(kindOf(doc("<h1>x</h1>"), "/checkouts/c/abc")).toBe("checkout");
    expect(kindOf(doc("<h1>x</h1>"), "/mon-compte")).toBe("account");
    expect(kindOf(doc("<h1>x</h1>"), "/account/login")).toBe("account");
    expect(kindOf(doc("<h1>x</h1>"), "/impressum")).toBe("legal");
  });

  it("classifies legal, cart and checkout pages under opaque URLs by title or h1", () => {
    expect(kindOf(doc("<h1>Widerrufsbelehrung</h1>"), "/pages/info-3")).toBe("legal");
    expect(kindOf(doc("<h1>Ihr Warenkorb</h1>"), "/s/42")).toBe("cart");
    expect(kindOf(doc("<h1>Finaliser la commande</h1>"), "/s/43")).toBe("checkout");
  });
});

describe("analyzeDocument: client-rendered shells", () => {
  const scripts = (n: number) => Array.from({ length: n }, (_, i) => `<script src="/static/chunk-${i}.js"></script>`).join("");

  it("flags an empty #root", () => {
    const html = `<html lang="en"><body><div id="root"></div>${scripts(2)}</body></html>`;
    expect(analyzeDocument(html, `${URL_BASE}/`).jsRenderedSuspected).toBe(true);
  });

  it("flags an empty #__next and short text with more than five scripts", () => {
    expect(
      analyzeDocument(`<html><body><div id="__next">  </div></body></html>`, `${URL_BASE}/`).jsRenderedSuspected,
    ).toBe(true);
    expect(
      analyzeDocument(`<html><body><p>Loading…</p>${scripts(6)}</body></html>`, `${URL_BASE}/`).jsRenderedSuspected,
    ).toBe(true);
  });

  it("does not flag server-rendered pages", () => {
    const text = "Real content. ".repeat(20);
    expect(
      analyzeDocument(`<html><body><div id="__next"><p>${text}</p></div>${scripts(8)}</body></html>`, `${URL_BASE}/`)
        .jsRenderedSuspected,
    ).toBe(false);
    expect(
      analyzeDocument(`<html><body><p>Short page</p>${scripts(5)}</body></html>`, `${URL_BASE}/`).jsRenderedSuspected,
    ).toBe(false);
  });

  it("ignores JSON-LD scripts when counting", () => {
    const ld = Array.from({ length: 6 }, () => `<script type="application/ld+json">{}</script>`).join("");
    expect(analyzeDocument(`<html><body><p>Short</p>${ld}</body></html>`, `${URL_BASE}/`).jsRenderedSuspected).toBe(false);
  });
});
