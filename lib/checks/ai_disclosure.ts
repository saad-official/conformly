/**
 * ai_disclosure (spec 3.2): AI Act Art. 50(1) requires telling people when
 * they interact with an AI system such as a chatbot, unless it is obvious.
 *
 * Chat widgets are detected from script URLs (external src or URLs loaded by
 * inline snippets). With a widget present, any crawled page must contain a
 * disclosure sentence: explicit wording ("chatbot", "virtual assistant",
 * "künstliche Intelligenz"), or "AI"/"KI"/"IA" (case-sensitive) or
 * "automated" together with chat wording. GDPR boilerplate such as
 * "automated decision-making" alone does not count.
 * pass: no widget, or widget plus disclosure. warn: widget without disclosure
 * (it may be human-staffed: then no disclosure is needed). unknown: JS shell.
 */
import { compileTerms } from "@/lib/crawl/text";
import { absenceFinding, appliesPhrase, makeFinding, pickLocale, quote, sentencesOf, uniqueEvidence, type SupportedLocale } from "./shared";
import type { CheckContext, CheckDefinition, Evidence, Finding, Fix } from "./types";

export const definition: CheckDefinition = {
  code: "ai_disclosure",
  title: "Chatbot AI disclosure",
  severity: "medium",
  citation: {
    law: "Regulation (EU) 2024/1689 (AI Act)",
    article: "Art. 50(1)",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
  },
};

export const APPLIES_FROM = new Date("2026-08-02T00:00:00Z");

export interface ScriptSignature {
  name: string;
  /** Lower-case substrings of the script URL. */
  patterns: readonly string[];
}

export const CHAT_WIDGETS: readonly ScriptSignature[] = [
  { name: "Intercom", patterns: ["widget.intercom.io", "js.intercomcdn.com"] },
  { name: "Drift", patterns: ["js.driftt.com", "js.drift.com"] },
  { name: "Crisp", patterns: ["client.crisp.chat"] },
  { name: "Tidio", patterns: ["code.tidio.co", "tidiochat"] },
  { name: "Zendesk", patterns: ["static.zdassets.com", "ekr.zdassets.com", "zopim.com"] },
  { name: "Gorgias", patterns: ["gorgias.chat", "gorgias.io"] },
  { name: "HubSpot", patterns: ["js.usemessages.com", "js.hs-scripts.com"] },
  { name: "Freshchat", patterns: ["freshchat.com"] },
  { name: "LiveChat", patterns: ["cdn.livechatinc.com"] },
  { name: "Tawk", patterns: ["embed.tawk.to"] },
  { name: "Shopify Inbox", patterns: ["shopifychat", "shopify-chat", "shopify_chat"] },
];

/** Wording that discloses an AI chat on its own. */
export const DISCLOSURE_TERMS: readonly string[] = [
  "chatbot*", "chat bot", "virtual assistant", "ai assistant", "ai powered", "artificial intelligence", "automated assistant",
  "virtuelle* assistent*", "virtueller assistent*", "kunstliche* intelligenz", "ki assistent*", "ki chat*", "digitale* assistent*",
  "assistant virtuel", "intelligence artificielle", "agent conversationnel",
  "assistente virtuale", "intelligenza artificiale",
  "asistente virtual", "inteligencia artificial",
  "virtuele assistent", "kunstmatige intelligentie",
];
/** Acronyms, matched case-sensitively and only next to chat wording. */
export const AI_ACRONYMS: readonly string[] = ["AI", "KI", "IA"];
export const AUTOMATED_TERMS: readonly string[] = ["automated", "automatisiert*", "automatise*", "automatizzat*", "automatizad*", "geautomatiseerd*"];
export const CHAT_CONTEXT_TERMS: readonly string[] = [
  "chat*", "assistant*", "assistent*", "assistente*", "asistente*", "conversation*", "conversazion*", "conversacion*",
  "gesprek*", "messag*", "nachricht*", "replies", "answers", "antwort*", "repond*", "rispond*", "respond*", "beantwort*",
];

const DISCLOSURE = compileTerms(DISCLOSURE_TERMS);
const ACRONYM = compileTerms(AI_ACRONYMS, { caseSensitive: true });
const AUTOMATED = compileTerms(AUTOMATED_TERMS);
const CHAT_CONTEXT = compileTerms(CHAT_CONTEXT_TERMS);

export function isDisclosure(sentence: string): boolean {
  return DISCLOSURE.test(sentence) || ((ACRONYM.test(sentence) || AUTOMATED.test(sentence)) && CHAT_CONTEXT.test(sentence));
}

export function matchScripts(scripts: readonly string[], signatures: readonly ScriptSignature[]): Array<{ name: string; url: string }> {
  const out: Array<{ name: string; url: string }> = [];
  for (const url of scripts) {
    const lower = url.toLowerCase();
    const signature = signatures.find((s) => s.patterns.some((p) => lower.includes(p)));
    if (signature) out.push({ name: signature.name, url });
  }
  return out;
}

const DISCLOSURE_COPY: Readonly<Record<SupportedLocale, string>> = {
  en: "You are chatting with an AI assistant. Ask for a member of our team at any time.",
  de: "Sie chatten mit einem KI-Assistenten. Sie können jederzeit eine Person aus unserem Team verlangen.",
  fr: "Vous discutez avec un assistant IA. Vous pouvez demander à parler à un membre de notre équipe à tout moment.",
  it: "Stai chattando con un assistente IA. Puoi chiedere in qualsiasi momento di parlare con una persona del nostro team.",
  es: "Estás chateando con un asistente de IA. Puedes pedir hablar con una persona de nuestro equipo en cualquier momento.",
  nl: "Je chat met een AI-assistent. Je kunt op elk moment vragen om iemand van ons team.",
};

function buildFix(ctx: CheckContext): Fix {
  return {
    summary:
      "If the chat answers automatically, say so at the start of every conversation (the widget's greeting) and in your privacy policy. A chat staffed only by people needs no AI notice.",
    html: `<p class="chat-disclosure">${DISCLOSURE_COPY[pickLocale(ctx)]}</p>`,
    shopify: "Put the sentence in the chat app's greeting or welcome message setting, and mention the AI assistant in Settings > Policies > Privacy policy.",
  };
}

export function aiDisclosureCheck(ctx: CheckContext): Finding {
  const fix = buildFix(ctx);
  const applies = `The AI Act transparency duty ${appliesPhrase(ctx.now, APPLIES_FROM)}.`;
  const seen = new Set<string>();
  const widgets: Evidence[] = [];
  const names: string[] = [];
  for (const page of ctx.pages) {
    for (const hit of matchScripts(page.scripts, CHAT_WIDGETS)) {
      if (!names.includes(hit.name)) names.push(hit.name);
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      widgets.push(quote(page.finalUrl, `${hit.name} chat widget: ${hit.url}`));
    }
  }

  if (names.length === 0) {
    return absenceFinding(ctx, definition, {
      status: "pass",
      detail: `No chat widget was detected, so no AI disclosure is needed on the crawled pages. ${applies}`,
      fix,
      meta: { widgets: [] },
    });
  }

  // The first disclosure is enough; footer wording repeats on every page.
  const disclosure = sentencesOf(ctx.pages).find((s) => isDisclosure(s.text));
  if (disclosure) {
    return makeFinding(definition, {
      status: "pass",
      detail: `Chat widget (${names.join(", ")}) found together with wording that discloses an AI or automated assistant. ${applies}`,
      evidence: uniqueEvidence([...widgets, quote(disclosure.url, disclosure.text)]),
      fix,
      meta: { widgets: names },
    });
  }
  return absenceFinding(ctx, definition, {
    status: "warn",
    detail: `A chat widget (${names.join(", ")}) is installed but no page says that replies may come from an AI. Conformly cannot see the widget's own greeting. If the chat is staffed only by people, no notice is needed. ${applies}`,
    evidence: uniqueEvidence(widgets),
    fix,
    meta: { widgets: names },
  });
}
