/**
 * green_claims (spec 3.2, LLM-assisted): generic environmental claims under
 * Directive (EU) 2024/825 (new points 2a, 4a and 4c of UCPD Annex I).
 *
 * 1. Pre-filter: every distinct sentence (first occurrence wins) that contains
 *    environmental vocabulary. English terms apply to every page; the terms of
 *    another language apply to pages in that language, or to all pages whose
 *    language is unknown (so French "durable" does not flag English "durable").
 * 2. Rules, no model needed: a neutrality claim ("klimaneutral",
 *    "carbon neutral") on a page that mentions offsetting/compensation, and
 *    self-made label phrases ("our eco label", "unser Öko-Siegel").
 * 3. The remaining candidates (max 40, page order) go to the ClaimClassifier;
 *    only `generic_unsubstantiated` verdicts become evidence. Malformed or
 *    out-of-range verdicts are ignored; the first verdict per index wins.
 *
 * Status: fail on any rule hit or generic verdict; pass when there are no
 * candidates or the classifier cleared them all; unknown when candidates could
 * not be classified (no classifier, or it threw).
 */
import { z } from "zod";
import { compileTerms, normalizeForMatch, type TermMatcher } from "@/lib/crawl/text";
import type { CrawledPage } from "@/lib/crawl/types";
import {
  absenceFinding,
  appliesPhrase,
  escapeHtml,
  makeFinding,
  quote,
  sentencesOf,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "./shared";
import type { Check, CheckContext, CheckDefinition, Evidence, Finding, Fix } from "./types";

export const definition: CheckDefinition = {
  code: "green_claims",
  title: "Generic environmental claims",
  severity: "high",
  citation: {
    law: "Directive 2005/29/EC (Unfair Commercial Practices) as amended by Directive (EU) 2024/825",
    article: "Annex I, points 2a, 4a and 4c",
    url: "https://eur-lex.europa.eu/eli/dir/2024/825/oj",
  },
};

export const APPLIES_FROM = new Date("2026-09-27T00:00:00Z");
export const MAX_CLASSIFIED_SENTENCES = 40;
const MAX_SENTENCE_CHARS = 400;

/* ------------------------------------------------------------------ */
/* Classifier contract                                                 */
/* ------------------------------------------------------------------ */

export const CLAIM_VERDICTS = ["generic_unsubstantiated", "specific_substantiated", "not_environmental"] as const;

export const ClaimVerdictSchema = z.object({
  index: z.int().nonnegative(),
  verdict: z.enum(CLAIM_VERDICTS),
  rewording: z.string().optional(),
  reason: z.string(),
});
/** Schema for the model's structured output (the LLM-backed classifier validates with it). */
export const ClaimClassificationSchema = z.array(ClaimVerdictSchema);

export interface ClaimInput {
  text: string;
  url: string;
}

export interface ClaimVerdict {
  index: number;
  verdict: (typeof CLAIM_VERDICTS)[number];
  rewording?: string;
  reason: string;
}

export interface ClaimClassifier {
  classify(sentences: ClaimInput[]): Promise<ClaimVerdict[]>;
}

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export const ENVIRONMENTAL_VOCABULARY: Readonly<Record<SupportedLocale, readonly string[]>> = {
  en: [
    "eco", "ecofriendly", "ecological*", "environmentally friendly", "environment friendly", "good for the planet",
    "planet friendly", "earth friendly", "green", "greener", "sustainab*", "climate neutral", "climate positive",
    "climate friendly", "carbon neutral", "carbon negative", "carbon free", "co2 neutral", "net zero", "zero emission*",
    "biodegradable", "compostable", "recycl*", "plastic free", "zero waste",
  ],
  de: [
    "oko", "okologisch*", "okostrom", "umweltfreundlich*", "umweltschonend*", "nachhaltig*", "klimaneutral*",
    "klimapositiv*", "klimafreundlich*", "co2 neutral*", "co2 frei*", "biologisch abbaubar*", "kompostierbar*",
    "recycel*", "plastikfrei*", "emissionsfrei*",
  ],
  fr: [
    "ecologique*", "eco responsable*", "ecoresponsable*", "eco concu*", "respectueu* de l'environnement",
    "respectueu* de la planete", "durable*", "neutre en carbone", "neutre pour le climat", "climatiquement neutre*",
    "neutralite carbone", "bas carbone", "biodegradable*", "compostable*", "recycl*", "zero dechet",
  ],
  it: [
    "ecologic*", "sostenibil*", "ecosostenibil*", "eco sostenibil*", "rispettos* dell'ambiente", "amic* dell'ambiente",
    "a impatto zero", "climaticamente neutr*", "biodegradabil*", "compostabil*", "riciclat*", "riciclabil*",
  ],
  es: [
    "ecologic*", "sostenible*", "sustentable*", "respetuos* con el medio ambiente", "neutro en carbono",
    "neutral en carbono", "climaticamente neutr*", "biodegradable*", "compostable*", "reciclad*", "reciclable*",
    "cero residuos",
  ],
  nl: [
    "duurzaam*", "duurzame", "milieuvriendelijk*", "klimaatneutra*", "co2 neutra*", "biologisch afbreekbaar*",
    "composteerbaar*", "gerecycl*", "recyclebaar*", "groen", "groene",
  ],
};

/** Climate-neutrality claims, all languages. */
export const NEUTRALITY_TERMS: readonly string[] = [
  "carbon neutral", "climate neutral", "co2 neutra*", "net zero", "climate positive", "carbon negative",
  "klimaneutral*", "klimapositiv*", "neutre en carbone", "neutre pour le climat", "climatiquement neutre*",
  "neutralite carbone", "a impatto zero", "climaticamente neutr*", "neutro en carbono", "neutral en carbono",
  "carbono neutral*", "klimaatneutra*",
];

/** Offsetting / compensation, all languages. */
export const OFFSET_TERMS: readonly string[] = [
  "offset*", "compensa*", "compense*", "gecompenseerd", "kompensation*", "kompensier*", "ausgleich*", "ausgeglichen",
  "carbon credit*", "co2 zertifikat*", "klimaschutzprojekt*", "climate project*", "projet* climat*", "credits carbone",
  "crediti di carbonio", "creditos de carbono",
];

/** A sustainability label the shop awards itself. */
export const SELF_LABEL_TERMS: readonly string[] = [
  "our eco label", "our own eco label", "our green label", "our sustainability label", "our sustainability seal",
  "our eco seal", "our own label", "our in house label",
  "unser* oko siegel", "unser* oko label", "unser* eigene* siegel", "unser* nachhaltigkeitssiegel", "unser* umweltsiegel",
  "unser* gutesiegel",
  "notre label eco*", "notre propre label", "notre label maison", "notre label durable",
  "il nostro marchio ecologico", "il nostro eco label", "il nostro marchio di sostenibilita",
  "nuestro sello ecologico", "nuestra etiqueta ecologica", "nuestro sello de sostenibilidad",
  "ons eigen keurmerk", "ons duurzaamheidskeurmerk", "ons eco keurmerk", "ons eco label", "ons milieukeurmerk",
];

const ENVIRONMENTAL: Readonly<Record<SupportedLocale, TermMatcher>> = {
  en: compileTerms(ENVIRONMENTAL_VOCABULARY.en),
  de: compileTerms(ENVIRONMENTAL_VOCABULARY.de),
  fr: compileTerms(ENVIRONMENTAL_VOCABULARY.fr),
  it: compileTerms(ENVIRONMENTAL_VOCABULARY.it),
  es: compileTerms(ENVIRONMENTAL_VOCABULARY.es),
  nl: compileTerms(ENVIRONMENTAL_VOCABULARY.nl),
};
const ALL_LOCALES: readonly SupportedLocale[] = SUPPORTED_LOCALES;
const NEUTRALITY = compileTerms(NEUTRALITY_TERMS);
const OFFSET = compileTerms(OFFSET_TERMS);
const SELF_LABEL = compileTerms(SELF_LABEL_TERMS);

function matchersFor(page: CrawledPage): TermMatcher[] {
  const primary = page.lang?.toLowerCase().split(/[-_]/)[0] ?? "";
  const locale = ALL_LOCALES.find((l) => l === primary);
  if (locale) return locale === "en" ? [ENVIRONMENTAL.en] : [ENVIRONMENTAL.en, ENVIRONMENTAL[locale]];
  return ALL_LOCALES.map((l) => ENVIRONMENTAL[l]);
}

/* ------------------------------------------------------------------ */
/* Check                                                               */
/* ------------------------------------------------------------------ */

type RuleKind = "offset_neutrality" | "self_made_label";

interface Claim {
  url: string;
  quote: string;
  source: "rule" | "classifier";
  rule?: RuleKind;
  verdict?: ClaimVerdict["verdict"];
  reason?: string;
  rewording?: string;
}

interface Scan {
  ruleClaims: Claim[];
  candidates: ClaimInput[];
}

function scan(pages: readonly CrawledPage[]): Scan {
  const seen = new Set<string>();
  const ruleClaims: Claim[] = [];
  const candidates: ClaimInput[] = [];
  for (const page of pages) {
    const matchers = matchersFor(page);
    const pageMentionsOffsets = OFFSET.test(page.text);
    for (const { text } of sentencesOf([page])) {
      const key = normalizeForMatch(text);
      if (seen.has(key)) continue;
      seen.add(key);
      const sentence = text.slice(0, MAX_SENTENCE_CHARS);
      const url = page.finalUrl;
      if (SELF_LABEL.test(sentence)) {
        ruleClaims.push({
          ...quote(url, sentence),
          source: "rule",
          rule: "self_made_label",
          reason: "A sustainability label that is not based on a certification scheme or set up by a public authority.",
        });
      } else if (NEUTRALITY.test(sentence) && pageMentionsOffsets) {
        ruleClaims.push({
          ...quote(url, sentence),
          source: "rule",
          rule: "offset_neutrality",
          reason: "A neutral or reduced climate impact claimed on the basis of greenhouse gas offsetting.",
        });
      } else if (matchers.some((m) => m.test(sentence))) {
        candidates.push({ text: sentence, url });
      }
    }
  }
  return { ruleClaims, candidates };
}

type ClassifierOutcome =
  | { state: "missing" }
  | { state: "error"; error: string }
  | { state: "used"; verdicts: Map<number, ClaimVerdict> };

async function classify(classifier: ClaimClassifier | undefined, sent: ClaimInput[]): Promise<ClassifierOutcome> {
  if (!classifier) return { state: "missing" };
  try {
    const raw: unknown = await classifier.classify(sent);
    const verdicts = new Map<number, ClaimVerdict>();
    for (const entry of Array.isArray(raw) ? raw : []) {
      const parsed = ClaimVerdictSchema.safeParse(entry);
      if (!parsed.success || parsed.data.index >= sent.length || verdicts.has(parsed.data.index)) continue;
      verdicts.set(parsed.data.index, parsed.data);
    }
    return { state: "used", verdicts };
  } catch (error) {
    return { state: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

const OFFSET_EXAMPLE =
  "<p>We fund certified climate projects to compensate for the emissions of our shipping. This does not make our products climate neutral.</p>";
const SPECIFIC_EXAMPLE = "<p>Our shipping boxes are made from 100 % recycled cardboard.</p>";

function buildFix(claims: readonly Claim[]): Fix {
  const lines: string[] = [];
  const rewording = claims.find((c) => c.rewording)?.rewording;
  if (rewording) lines.push(`<p>${escapeHtml(rewording)}</p>`);
  if (claims.some((c) => c.rule === "offset_neutrality")) lines.push(OFFSET_EXAMPLE);
  if (lines.length === 0) lines.push(SPECIFIC_EXAMPLE);
  return {
    summary:
      "Replace generic claims (eco-friendly, green, sustainable, climate neutral) with specific, verifiable facts about the product, or remove them. Drop product neutrality claims based on offsetting, and remove sustainability labels that are not certified by an independent scheme or set up by a public authority.",
    html: lines.join("\n"),
    shopify:
      "Search product descriptions, collection descriptions and theme text (Online Store > Themes > Edit default theme content) for the quoted phrases.",
  };
}

function toEvidence(claims: readonly Claim[]): Evidence[] {
  return claims.map((c) => ({ url: c.url, quote: c.quote }));
}

export function createGreenClaimsCheck(classifier?: ClaimClassifier): Check {
  return async (ctx: CheckContext): Promise<Finding> => {
    const applies = `The ban on generic environmental claims ${appliesPhrase(ctx.now, APPLIES_FROM)}.`;
    const { ruleClaims, candidates } = scan(ctx.pages);
    const sent = candidates.slice(0, MAX_CLASSIFIED_SENTENCES);
    const outcome = sent.length > 0 ? await classify(classifier, sent) : ({ state: "missing" } as const);

    const classifierClaims: Claim[] = [];
    if (outcome.state === "used") {
      sent.forEach((sentence, index) => {
        const verdict = outcome.verdicts.get(index);
        if (verdict?.verdict !== "generic_unsubstantiated") return;
        classifierClaims.push({
          ...quote(sentence.url, sentence.text),
          source: "classifier",
          verdict: verdict.verdict,
          reason: verdict.reason,
          ...(verdict.rewording ? { rewording: verdict.rewording } : {}),
        });
      });
    }

    const claims = [...ruleClaims, ...classifierClaims];
    const meta: Record<string, unknown> = {
      /** "missing": no classifier was injected; "not_needed": nothing to classify. */
      classifier: !classifier ? "missing" : sent.length === 0 ? "not_needed" : outcome.state,
      candidates: candidates.length,
      sent: outcome.state === "used" || outcome.state === "error" ? sent.length : 0,
      truncated: candidates.length > sent.length,
      claims,
    };
    if (outcome.state === "error") meta.error = outcome.error;
    const fix = buildFix(claims);
    const unreviewed = outcome.state === "used" ? 0 : sent.length;

    if (claims.length > 0) {
      const ruleNote = ruleClaims.length > 0 ? ` ${ruleClaims.length} flagged by rule (offset-based neutrality or self-made labels).` : "";
      const pendingNote = unreviewed > 0 ? ` ${unreviewed} further sentence(s) with environmental wording were not reviewed because AI classification was unavailable.` : "";
      return makeFinding(definition, {
        status: "fail",
        detail: `Found ${claims.length} environmental claim(s) that need substantiation or removal.${ruleNote}${pendingNote} ${applies}`,
        evidence: toEvidence(claims),
        fix,
        meta,
      });
    }
    if (unreviewed > 0) {
      return makeFinding(definition, {
        status: "unknown",
        detail: `${unreviewed} sentence(s) use environmental wording but could not be classified (AI classification unavailable). Review them by hand. ${applies}`,
        evidence: sent.slice(0, 10).map((s) => quote(s.url, s.text)),
        fix,
        meta,
      });
    }
    if (candidates.length > 0) {
      return makeFinding(definition, {
        status: "pass",
        detail: `${candidates.length} sentence(s) with environmental wording were reviewed; none is a generic, unsubstantiated claim. ${applies}`,
        fix,
        meta,
      });
    }
    return absenceFinding(ctx, definition, {
      status: "pass",
      detail: `No environmental claims were found on the crawled pages. ${applies}`,
      fix,
      meta,
    });
  };
}
