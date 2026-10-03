/**
 * withdrawal_function (spec 3.2): an on-site "withdraw from contract" function
 * (Directive 2011/83/EU Art. 11a, inserted by Directive (EU) 2023/2673).
 *
 * pass: a link, button or form whose text or URL is a withdrawal *action*
 *       ("Withdraw from contract here", "Vertrag widerrufen", /account/withdraw).
 *       Links to the withdrawal *policy* ("Right of withdrawal") do not count.
 * warn: no function, but a downloadable withdrawal form (PDF/DOC) or an
 *       instruction to withdraw by e-mail.
 * fail: none of these (unknown on a JavaScript shell).
 * The two-step confirmation and the automatic acknowledgement cannot be seen
 * without submitting the form; the detail asks the merchant to verify them.
 */
import { compileTerms } from "@/lib/crawl/text";
import { LEGAL_VOCABULARY } from "@/lib/crawl/vocabulary";
import { pathText } from "@/lib/crawl/classify";
import {
  absenceFinding,
  appliesPhrase,
  EMAIL_PATTERN,
  firstPerTarget,
  isDocumentUrl,
  makeFinding,
  pickLocale,
  quote,
  sentencesOf,
  uniqueEvidence,
  type SupportedLocale,
} from "./shared";
import type { CheckContext, CheckDefinition, Evidence, Finding, Fix } from "./types";

export const definition: CheckDefinition = {
  code: "withdrawal_function",
  title: "On-site withdrawal function",
  severity: "high",
  citation: {
    law: "Directive 2011/83/EU (Consumer Rights Directive) as amended by Directive (EU) 2023/2673",
    article: "Art. 11a",
    url: "https://eur-lex.europa.eu/eli/dir/2023/2673/oj",
  },
};

export const APPLIES_FROM = new Date("2026-06-19T00:00:00Z");

/** Action wording of a withdrawal function (link or button text). */
export const FUNCTION_TEXT: readonly string[] = [
  // EN
  "withdraw from contract", "withdraw from the contract", "withdraw from your contract", "withdraw from purchase",
  "withdraw from the purchase", "withdraw from order", "withdraw from the order", "withdraw now", "withdraw here",
  "exercise right of withdrawal", "exercise your right of withdrawal", "exercise my right of withdrawal",
  "submit withdrawal", "declare withdrawal", "online withdrawal",
  // DE
  "vertrag widerrufen", "vertrag hier widerrufen", "hier widerrufen", "jetzt widerrufen", "online widerrufen",
  "widerruf erklaren", "widerruf hier erklaren", "widerruf absenden", "widerrufen",
  // FR
  "se retracter", "me retracter", "se retracter du contrat", "retracter le contrat",
  "exercer mon droit de retractation", "exercer votre droit de retractation", "envoyer ma retractation",
  // IT
  "recedi dal contratto", "recedere dal contratto", "recedi qui", "esercita il diritto di recesso",
  "esercitare il diritto di recesso", "invia recesso",
  // ES
  "desistir del contrato", "desistir aqui", "ejercer el derecho de desistimiento", "ejercer mi derecho de desistimiento",
  // NL
  "overeenkomst herroepen", "herroep de overeenkomst", "overeenkomst hier herroepen", "herroep hier", "herroepen",
];

/** URL path wording of a withdrawal function endpoint. */
export const FUNCTION_SLUGS: readonly string[] = [
  "withdraw", "withdraw from contract", "withdrawal request", "withdrawal form online",
  "widerrufen", "widerruf erklaren", "widerruf erklaeren", "widerruf online", "online widerruf",
  "retracter", "retractation en ligne", "recedere", "recesso online", "desistir", "herroepen",
];

/** Downloadable withdrawal forms, on top of the withdrawal-policy vocabulary. */
export const FORM_TEXT: readonly string[] = [
  ...LEGAL_VOCABULARY.withdrawal.text,
  "withdrawal form", "widerrufsformular", "formulaire de retractation", "modulo di recesso", "modulo recesso",
  "formulario de desistimiento", "modelformulier voor herroeping", "herroepingsformulier",
];

/** A sentence that tells consumers to withdraw (with an address or the word e-mail). */
export const EMAIL_WITHDRAWAL_TERMS: readonly string[] = [
  "withdraw*", "cancel your order", "widerruf*", "retract*", "recesso", "recedere", "desist*", "herroep*",
];
export const EMAIL_WORDS: readonly string[] = ["email", "e mail", "mail", "courriel", "correo", "posta elettronica"];

const FUNCTION = compileTerms(FUNCTION_TEXT);
const FUNCTION_PATH = compileTerms(FUNCTION_SLUGS);
const FORM = compileTerms(FORM_TEXT);
const EMAIL_WITHDRAWAL = compileTerms(EMAIL_WITHDRAWAL_TERMS);
const EMAIL_WORD = compileTerms(EMAIL_WORDS);

interface FixCopy {
  button: string;
  heading: string;
  order: string;
  email: string;
  confirm: string;
}

/** Labels follow the wording of Art. 11a in each language version, or an equally unambiguous phrase. */
export const FIX_COPY: Readonly<Record<SupportedLocale, FixCopy>> = {
  en: { button: "Withdraw from contract here", heading: "Withdraw from your contract", order: "Order number", email: "Email address for the confirmation", confirm: "Confirm withdrawal" },
  de: { button: "Vertrag hier widerrufen", heading: "Vertrag widerrufen", order: "Bestellnummer", email: "E-Mail-Adresse für die Bestätigung", confirm: "Widerruf bestätigen" },
  fr: { button: "Se rétracter du contrat ici", heading: "Se rétracter du contrat", order: "Numéro de commande", email: "Adresse e-mail pour la confirmation", confirm: "Confirmer la rétractation" },
  it: { button: "Recedi dal contratto qui", heading: "Recedi dal contratto", order: "Numero d'ordine", email: "Indirizzo e-mail per la conferma", confirm: "Conferma il recesso" },
  es: { button: "Desistir del contrato aquí", heading: "Desistir del contrato", order: "Número de pedido", email: "Correo electrónico para la confirmación", confirm: "Confirmar el desistimiento" },
  nl: { button: "Overeenkomst hier herroepen", heading: "Overeenkomst herroepen", order: "Bestelnummer", email: "E-mailadres voor de bevestiging", confirm: "Herroeping bevestigen" },
};

function buildFix(locale: SupportedLocale): Fix {
  const copy = FIX_COPY[locale];
  return {
    summary:
      "Add a clearly labelled withdrawal button in the footer and the customer account, leading to a short form that asks for the order and an e-mail address, then a second confirmation step; send an automatic acknowledgement by e-mail.",
    html: [
      `<a class="button" href="/pages/withdraw">${copy.button}</a>`,
      "",
      "<!-- /pages/withdraw: step 1 collects the details, step 2 confirms -->",
      `<h1>${copy.heading}</h1>`,
      '<form method="post" action="/pages/withdraw">',
      `  <label for="withdraw-order">${copy.order}</label>`,
      '  <input id="withdraw-order" name="order" required>',
      `  <label for="withdraw-email">${copy.email}</label>`,
      '  <input id="withdraw-email" name="email" type="email" autocomplete="email" required>',
      `  <button type="submit">${copy.confirm}</button>`,
      "</form>",
    ].join("\n"),
    shopify:
      "Shopify has no built-in withdrawal button: add a withdrawal app or a page with this form, and link it from the footer menu and the customer account page.",
  };
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function functionEvidence(ctx: CheckContext): Evidence[] {
  const out: Evidence[] = [];
  const seen = new Set<string>();
  for (const page of ctx.pages) {
    for (const link of firstPerTarget(seen, page.links)) {
      if (link.abs.toLowerCase().startsWith("mailto:") || isDocumentUrl(link.abs)) continue;
      if (link.text && FUNCTION.test(link.text)) out.push(quote(page.finalUrl, link.text));
      else if (FUNCTION_PATH.test(pathText(link.abs))) out.push(quote(page.finalUrl, `${link.text} (${pathOf(link.abs)})`.trim()));
    }
    for (const button of page.buttons) {
      if (FUNCTION.test(button)) out.push(quote(page.finalUrl, button));
    }
    for (const form of page.forms) {
      if (form.action && FUNCTION_PATH.test(pathText(form.action))) out.push(quote(page.finalUrl, `Form posting to ${form.action}`));
    }
  }
  return uniqueEvidence(out);
}

function downloadEvidence(ctx: CheckContext): Evidence[] {
  const seen = new Set<string>();
  return uniqueEvidence(
    ctx.pages.flatMap((page) =>
      firstPerTarget(seen, page.links)
        .filter((link) => isDocumentUrl(link.abs) && (FORM.test(link.text) || FORM.test(pathText(link.abs))))
        .map((link) => quote(page.finalUrl, link.text || pathOf(link.abs))),
    ),
  );
}

function emailEvidence(ctx: CheckContext): Evidence[] {
  return uniqueEvidence(
    sentencesOf(ctx.pages)
      .filter((s) => EMAIL_WITHDRAWAL.test(s.text) && (EMAIL_PATTERN.test(s.text) || EMAIL_WORD.test(s.text)))
      .map((s) => quote(s.url, s.text)),
  );
}

export function withdrawalFunctionCheck(ctx: CheckContext): Finding {
  const fix = buildFix(pickLocale(ctx));
  const applies = `The on-site withdrawal function ${appliesPhrase(ctx.now, APPLIES_FROM)}.`;

  const found = functionEvidence(ctx);
  if (found.length > 0) {
    return makeFinding(definition, {
      status: "pass",
      detail: `Found what looks like an on-site withdrawal function. Check by hand that it asks for confirmation in a second step and sends an automatic acknowledgement. ${applies}`,
      evidence: found,
      fix,
    });
  }

  const downloads = downloadEvidence(ctx);
  const emails = emailEvidence(ctx);
  if (downloads.length > 0 || emails.length > 0) {
    const routes = [downloads.length > 0 ? "a downloadable (PDF) withdrawal form" : "", emails.length > 0 ? "an instruction to withdraw by e-mail" : ""]
      .filter(Boolean)
      .join(" and ");
    return makeFinding(definition, {
      status: "warn",
      detail: `The shop offers only ${routes}. A download or "email us" does not meet the requirement for an on-site withdrawal function with a two-step confirmation. ${applies}`,
      evidence: uniqueEvidence([...downloads, ...emails]),
      fix,
    });
  }

  return absenceFinding(ctx, definition, {
    status: "fail",
    detail: `No on-site withdrawal function, withdrawal form or withdrawal instructions were found on the crawled pages. ${applies}`,
    fix,
  });
}
