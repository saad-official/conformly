/**
 * eu_targeting (spec 3.2, informational): signals that the shop directs its
 * activity to EU consumers, which is why the EU rules apply even to shops
 * based outside the EU (Brussels Ia Art. 17(1)(c); CJEU Pammer/Alpenhof).
 *
 * Signals, in this order: EUR prices (text or price-currency meta), shipping
 * to the EU/Europe (any language), a non-English EU language in <html lang>,
 * an EU country-code domain. English alone is not a signal.
 * pass: at least one signal (the rules apply). unknown: none.
 */
import { compileTerms } from "@/lib/crawl/text";
import { absenceFinding, makeFinding, quote, sentencesOf } from "./shared";
import type { CheckContext, CheckDefinition, Evidence, Finding, Fix } from "./types";

export const definition: CheckDefinition = {
  code: "eu_targeting",
  title: "EU targeting signals",
  severity: "low",
  citation: {
    law: "Regulation (EU) No 1215/2012 (Brussels Ia)",
    article: "Art. 17(1)(c)",
    url: "https://eur-lex.europa.eu/eli/reg/2012/1215/oj",
  },
};

export const EU_SIGNALS = ["eur_prices", "eu_shipping", "eu_language", "eu_domain"] as const;
export type EuSignal = (typeof EU_SIGNALS)[number];

const EUR_PRICE = /€\s?\d|\d[\d.,]*\s?€|\bEUR\s?\d|\d[\d.,]*\s?EUR\b/;
const CURRENCY_META_KEYS = ["og:price:currency", "product:price:currency"] as const;

export const SHIPPING_TERMS: readonly string[] = [
  "ship*", "deliver*", "versand*", "versend*", "liefer*", "livraison*", "livrons", "expedi*", "spedizion*", "spediamo",
  "consegn*", "envio*", "enviamos", "entrega*", "verzend*", "levering*", "leveren", "bezorg*",
];
export const EUROPE_TERMS: readonly string[] = [
  "eu", "e u", "europe", "european union", "europa", "europaweit*", "eu weit*", "ue", "union europeenne", "unione europea",
  "union europea", "europese unie",
];
const SHIPPING = compileTerms(SHIPPING_TERMS);
const EUROPE = compileTerms(EUROPE_TERMS);

/** Official EU languages other than English. */
export const EU_LANGUAGES: ReadonlySet<string> = new Set([
  "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr", "ga", "hr", "hu", "it", "lt", "lv", "mt", "nl", "pl", "pt",
  "ro", "sk", "sl", "sv",
]);
export const EU_TLDS: ReadonlySet<string> = new Set([
  "at", "be", "bg", "cy", "cz", "de", "dk", "ee", "es", "eu", "fi", "fr", "gr", "hr", "hu", "ie", "it", "lt", "lu",
  "lv", "mt", "nl", "pl", "pt", "ro", "se", "si", "sk",
]);

const FIX: Fix = {
  summary:
    "No change needed: this explains why the EU rules apply to the shop. If you do not sell to EU consumers, say so before checkout and do not deliver to EU addresses.",
};

export function euTargetingCheck(ctx: CheckContext): Finding {
  const found = new Map<EuSignal, Evidence>();
  const sentences = sentencesOf(ctx.pages);

  const price = sentences.find((s) => EUR_PRICE.test(s.text));
  if (price) found.set("eur_prices", quote(price.url, price.text));
  else {
    for (const page of ctx.pages) {
      const key = CURRENCY_META_KEYS.find((k) => page.meta[k]?.toUpperCase() === "EUR");
      if (key) {
        found.set("eur_prices", quote(page.finalUrl, `${key} = EUR`));
        break;
      }
    }
  }

  const shipping = sentences.find((s) => SHIPPING.test(s.text) && EUROPE.test(s.text));
  if (shipping) found.set("eu_shipping", quote(shipping.url, shipping.text));

  const euLangPage = ctx.pages.find((p) => EU_LANGUAGES.has(p.lang?.toLowerCase().split(/[-_]/)[0] ?? ""));
  if (euLangPage) found.set("eu_language", quote(euLangPage.finalUrl, `lang="${euLangPage.lang}"`));

  const tld = ctx.hostname.toLowerCase().split(".").pop() ?? "";
  if (EU_TLDS.has(tld)) found.set("eu_domain", quote(ctx.pages[0]?.finalUrl ?? `https://${ctx.hostname}/`, `Domain ends in .${tld}`));

  const signals = EU_SIGNALS.filter((s) => found.has(s));
  const evidence = signals.map((s) => found.get(s)).filter((e): e is Evidence => e !== undefined);
  if (signals.length > 0) {
    return makeFinding(definition, {
      status: "pass",
      detail:
        "The shop shows signs of selling to EU consumers, so the EU consumer rules in this report apply to it, wherever the business is based. This check is informational.",
      evidence,
      fix: FIX,
      meta: { signals },
    });
  }
  return absenceFinding(ctx, definition, {
    status: "unknown",
    detail:
      "No EUR prices, EU shipping, EU language or EU domain was found. The rules in this report still apply if the shop sells to consumers in the EU. This check is informational.",
    fix: FIX,
    meta: { signals },
  });
}
