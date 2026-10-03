/**
 * Crawl vocabularies (EN, DE, FR, IT, ES, NL) as data. Terms use the syntax of
 * `compileTerms` (lib/crawl/text.ts): case- and accent-insensitive whole words,
 * a trailing `*` makes a word a prefix. `slugs` are matched against the URL
 * path with "/", ".", "-" and "_" read as spaces.
 */

export const LEGAL_CATEGORIES = ["imprint", "withdrawal", "terms", "privacy", "accessibility", "cookies"] as const;
export type LegalCategory = (typeof LEGAL_CATEGORIES)[number];

export interface Vocabulary {
  /** Matched against link text, page titles and h1 headings. */
  text: readonly string[];
  /** Matched against URL paths. */
  slugs: readonly string[];
}

export const LEGAL_VOCABULARY: Record<LegalCategory, Vocabulary> = {
  imprint: {
    text: [
      "imprint", "legal notice", "legal information", "company information", "site notice",
      "impressum", "anbieterkennzeichnung",
      "mentions legales", "informations legales",
      "note legali", "informazioni legali",
      "aviso legal", "informacion legal",
      "colofon", "juridische informatie", "wettelijke informatie",
    ],
    slugs: [
      "imprint", "legal notice", "legal info*", "impressum", "mentions legales",
      "note legali", "informazioni legali", "aviso legal", "colofon",
    ],
  },
  withdrawal: {
    text: [
      "right of withdrawal", "withdrawal", "withdrawal policy", "cancellation policy", "returns", "return policy",
      "refund policy", "returns and refunds",
      "widerruf*", "rucksendung*", "retoure*",
      "droit de retractation", "retractation", "retours", "politique de retour",
      "recesso", "diritto di recesso", "resi", "politica di reso",
      "desistimiento", "derecho de desistimiento", "devoluciones", "politica de devoluciones",
      "herroeping*", "retourneren", "retourbeleid", "retouren",
    ],
    slugs: [
      "withdraw*", "return*", "refund*", "cancellation policy",
      "widerruf*", "rucksendung*", "retoure*",
      "retractation", "retours", "recesso", "resi", "desistimiento", "devolucion*",
      "herroeping*", "retourneren", "retourbeleid",
    ],
  },
  terms: {
    text: [
      "terms", "terms and conditions", "terms of service", "terms of sale", "general terms",
      "agb", "allgemeine geschaftsbedingungen",
      "cgv", "cgu", "conditions generales*",
      "termini e condizioni", "condizioni generali*", "condizioni di vendita",
      "terminos y condiciones", "condiciones generales*",
      "algemene voorwaarden", "voorwaarden",
    ],
    slugs: [
      "terms*", "agb", "cgv", "cgu", "conditions generales*", "termini*", "condizioni*", "terminos*",
      "condiciones*", "algemene voorwaarden", "voorwaarden",
    ],
  },
  privacy: {
    text: [
      "privacy", "privacy policy", "privacy notice", "data protection",
      "datenschutz*",
      "confidentialite", "politique de confidentialite", "donnees personnelles",
      "informativa sulla privacy", "informativa privacy",
      "privacidad", "politica de privacidad", "proteccion de datos",
      "privacybeleid", "privacyverklaring",
    ],
    slugs: ["privacy*", "datenschutz*", "confidentialite", "privacidad", "privacybeleid", "privacyverklaring"],
  },
  accessibility: {
    text: [
      "accessibility", "accessibility statement",
      "barrierefreiheit*", "erklarung zur barrierefreiheit",
      "accessibilite", "declaration d'accessibilite",
      "accessibilita", "dichiarazione di accessibilita",
      "accesibilidad", "declaracion de accesibilidad",
      "toegankelijkheid*",
    ],
    slugs: ["accessibility*", "a11y", "barrierefreiheit*", "accessibilite", "accessibilita", "accesibilidad", "toegankelijkheid*"],
  },
  cookies: {
    text: [
      "cookie policy", "cookies policy", "cookie notice", "cookies",
      "cookie richtlinie*", "cookie hinweis*",
      "politique de cookies", "politique relative aux cookies",
      "informativa sui cookie",
      "politica de cookies",
      "cookiebeleid", "cookieverklaring",
    ],
    slugs: ["cookie policy", "cookies", "cookie richtlinie*", "cookiebeleid", "cookieverklaring"],
  },
};

export const ACCOUNT_VOCABULARY: Vocabulary = {
  text: [
    "my account", "account", "log in", "login", "sign in", "my orders",
    "mein konto", "kundenkonto", "anmelden", "meine bestellungen",
    "mon compte", "connexion", "se connecter", "mes commandes",
    "il mio account", "accedi", "i miei ordini",
    "mi cuenta", "iniciar sesion", "mis pedidos",
    "mijn account", "inloggen", "mijn bestellingen",
  ],
  slugs: [
    "account*", "login", "signin", "sign in", "mein konto", "kundenkonto", "konto",
    "mon compte", "il mio account", "mi cuenta", "mijn account", "orders",
  ],
};

export const CART_VOCABULARY: Vocabulary = {
  text: [
    "cart", "shopping cart", "basket", "shopping bag",
    "warenkorb", "panier", "carrello", "carrito", "cesta", "winkelwagen", "winkelmand",
  ],
  slugs: ["cart", "carts", "basket", "warenkorb", "panier", "carrello", "carrito", "cesta", "winkelwagen", "winkelmand"],
};

export const CHECKOUT_VOCABULARY: Vocabulary = {
  text: [
    "checkout", "check out", "zur kasse", "kasse", "passer commande", "paiement",
    "cassa", "procedi all'acquisto", "finalizar compra", "tramitar pedido", "afrekenen",
  ],
  slugs: ["checkout*", "kasse", "cassa", "finalizar compra", "afrekenen"],
};

/** Path segments that, followed by a slug, mark a product page ("/products/linen-shirt"). */
export const PRODUCT_PATH_SEGMENTS: readonly string[] = [
  "product", "products", "p", "item", "items", "shop",
  "produkt", "produkte", "artikel",
  "produit", "produits", "article",
  "prodotto", "prodotti",
  "producto", "productos",
  "producten",
];

export const ADD_TO_CART_TERMS: readonly string[] = [
  "add to cart", "add to bag", "add to basket", "buy now",
  "in den warenkorb", "jetzt kaufen",
  "ajouter au panier", "acheter maintenant",
  "aggiungi al carrello", "acquista ora",
  "anadir al carrito", "anadir a la cesta", "comprar ahora",
  "in winkelwagen", "in winkelmand", "toevoegen aan winkelwagen", "nu kopen",
];

/** Page headings that identify a cart or checkout page reached under an opaque URL. */
export const CART_HEADINGS: readonly string[] = [
  "your cart", "shopping cart", "your basket", "your bag",
  "warenkorb", "ihr warenkorb", "votre panier", "panier", "il tuo carrello", "carrello",
  "tu carrito", "carrito", "cesta", "winkelwagen", "je winkelwagen",
];
export const CHECKOUT_HEADINGS: readonly string[] = [
  "checkout", "kasse", "bestellung abschliessen", "paiement", "finaliser la commande",
  "cassa", "pagamento", "finalizar compra", "pago", "afrekenen",
];

/** Links with these extensions are never fetched as pages (they are still visible to the checks as links). */
export const NON_HTML_EXTENSIONS: readonly string[] = [
  "pdf", "doc", "docx", "odt", "rtf", "txt", "xls", "xlsx", "csv", "zip",
  "jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "ico", "mp4", "webm", "mp3",
  "css", "js", "json", "xml",
];
