/**
 * cookie_parity (spec 3.2): rejecting cookies must be as easy as accepting
 * (ePrivacy Art. 5(3) with GDPR consent rules; EDPB cookie banner taskforce).
 *
 * A banner is present on a page when a known CMP script is loaded there or the
 * page text mentions cookies; its buttons are then classified (reject wording
 * is checked first, so "Continuer sans accepter" is a reject).
 * pass: accept and reject buttons on the same page. warn: accept without
 * reject. unknown: a CMP but no buttons in the HTML (injected by JavaScript),
 * no banner at all, or a JavaScript shell.
 * Only button-like elements count, as in the banner's first layer.
 */
import { compileTerms } from "@/lib/crawl/text";
import { matchScripts, type ScriptSignature } from "./ai_disclosure";
import { JS_SHELL_NOTE, makeFinding, quote } from "./shared";
import type { CheckContext, CheckDefinition, Finding, Fix } from "./types";

export const definition: CheckDefinition = {
  code: "cookie_parity",
  title: "Reject cookies as easily as accept",
  severity: "medium",
  citation: {
    law: "Directive 2002/58/EC (ePrivacy), read with Regulation (EU) 2016/679 (GDPR) Art. 4(11) and Art. 7",
    article: "Art. 5(3)",
    url: "https://eur-lex.europa.eu/eli/dir/2002/58/oj",
  },
};

export const CMPS: readonly ScriptSignature[] = [
  { name: "Cookiebot", patterns: ["cookiebot.com"] },
  { name: "Usercentrics", patterns: ["usercentrics.eu", "usercentrics.com"] },
  { name: "OneTrust", patterns: ["cdn.cookielaw.org", "onetrust.com", "optanon"] },
  { name: "Didomi", patterns: ["privacy-center.org", "didomi"] },
  { name: "iubenda", patterns: ["iubenda.com"] },
  { name: "CookieYes", patterns: ["cookieyes"] },
  { name: "Complianz", patterns: ["complianz"] },
  { name: "Quantcast Choice", patterns: ["quantcast.mgr.consensu.org", "cmp.quantcast.com"] },
  { name: "TrustArc", patterns: ["trustarc.com"] },
  { name: "Axeptio", patterns: ["axept.io"] },
  { name: "Klaro", patterns: ["klaro"] },
  { name: "Borlabs Cookie", patterns: ["borlabs-cookie"] },
  { name: "Termly", patterns: ["termly.io"] },
  { name: "Osano", patterns: ["osano.com"] },
  { name: "Sourcepoint", patterns: ["sourcepoint", "sp-prod.net"] },
  { name: "Cookie Script", patterns: ["cookie-script.com"] },
  { name: "CookieFirst", patterns: ["cookiefirst.com"] },
  { name: "consentmanager", patterns: ["consentmanager.net"] },
];

export const ACCEPT_TERMS: readonly string[] = [
  "accept all", "accept", "accept cookies", "allow all", "allow cookies", "i agree", "agree", "ok", "got it",
  "alle akzeptieren", "akzeptieren", "alle cookies akzeptieren", "zustimmen", "alle zulassen", "einverstanden", "annehmen",
  "tout accepter", "accepter", "j'accepte", "accepter et fermer",
  "accetta tutti", "accetta", "accetto",
  "aceptar todo", "aceptar todas", "aceptar", "acepto",
  "alles accepteren", "accepteren", "akkoord", "alle cookies accepteren",
];

export const REJECT_TERMS: readonly string[] = [
  "reject all", "reject", "decline", "decline all", "deny", "refuse", "necessary only", "only necessary",
  "necessary cookies only", "essential only", "only essential",
  "alle ablehnen", "ablehnen", "nur notwendige*", "nur essenzielle*", "nur erforderliche*", "verweigern",
  "tout refuser", "refuser", "refuser tout", "continuer sans accepter",
  "rifiuta tutti", "rifiuta", "solo necessari", "continua senza accettare",
  "rechazar todo", "rechazar todas", "rechazar", "solo necesarias",
  "alles weigeren", "weigeren", "afwijzen", "alles afwijzen", "alleen noodzakelijke",
];

export const COOKIE_WORDS: readonly string[] = ["cookie*", "tracking", "consent", "einwilligung", "consentement", "consenso", "consentimiento", "toestemming"];

const ACCEPT = compileTerms(ACCEPT_TERMS);
const REJECT = compileTerms(REJECT_TERMS);
const COOKIE_WORD = compileTerms(COOKIE_WORDS);

function buildFix(cmp: string | null): Fix {
  const cmpNote = cmp ? ` In ${cmp}, enable the deny/reject button on the first layer of the banner.` : "";
  return {
    summary: `Offer a "Reject all" button on the first layer of the cookie banner, as visible and as easy to click as "Accept all".${cmpNote}`,
    html: [
      '<div role="dialog" aria-labelledby="cookie-banner-title">',
      '  <p id="cookie-banner-title">We use cookies for statistics and marketing only with your consent.</p>',
      '  <button type="button" data-consent="reject">Reject all</button>',
      '  <button type="button" data-consent="settings">Settings</button>',
      '  <button type="button" data-consent="accept">Accept all</button>',
      "</div>",
    ].join("\n"),
    shopify:
      "In Settings > Customer privacy > Cookie banner, keep the Decline button on the banner; with a third-party consent app, enable its first-layer reject button.",
  };
}

export function cookieParityCheck(ctx: CheckContext): Finding {
  const cmps = ctx.pages.flatMap((page) => matchScripts(page.scripts, CMPS).map((hit) => ({ ...hit, page: page.finalUrl })));
  const cmp = cmps[0]?.name ?? null;
  const fix = buildFix(cmp);
  const meta = { cmp };

  if (ctx.jsRenderedSuspected) {
    return makeFinding(definition, { status: "unknown", detail: JS_SHELL_NOTE, fix, meta: { ...meta, jsRenderedSuspected: true } });
  }

  for (const page of ctx.pages) {
    const pageHasCmp = matchScripts(page.scripts, CMPS).length > 0;
    if (!pageHasCmp && !COOKIE_WORD.test(page.text)) continue;
    const rejects = page.buttons.filter((b) => REJECT.test(b));
    const accepts = page.buttons.filter((b) => !REJECT.test(b) && ACCEPT.test(b));
    if (accepts.length === 0) continue;
    if (rejects.length > 0) {
      return makeFinding(definition, {
        status: "pass",
        detail: "The cookie banner offers a reject button next to the accept button. Check by hand that both are equally prominent.",
        evidence: [quote(page.finalUrl, accepts[0]), quote(page.finalUrl, rejects[0])],
        fix,
        meta,
      });
    }
    return makeFinding(definition, {
      status: "warn",
      detail: `The cookie banner${cmp ? ` (${cmp})` : ""} offers an accept button but no reject button on its first layer.`,
      evidence: [quote(page.finalUrl, accepts[0])],
      fix,
      meta,
    });
  }

  if (cmp) {
    return makeFinding(definition, {
      status: "unknown",
      detail: `${cmp} is installed, but its banner is injected by JavaScript, which Conformly does not execute. Check by hand that the first layer offers "Reject all".`,
      evidence: [quote(cmps[0].page, `${cmp} script: ${cmps[0].url}`)],
      fix,
      meta,
    });
  }
  return makeFinding(definition, {
    status: "unknown",
    detail:
      "No cookie banner was found in the HTML. If the shop sets analytics or marketing cookies, its banner is probably injected by JavaScript; check by hand that rejecting is as easy as accepting.",
    fix,
    meta,
  });
}
