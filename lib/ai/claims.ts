import "server-only";
import { generateStructured, type CallMeta } from "@/lib/ai/generate";
import { ClaimClassificationSchema, type ClaimClassifier, type ClaimInput, type ClaimVerdict } from "@/lib/checks/green_claims";

export const CLAIMS_PROMPT_VERSION = "green-claims/v1";

const INSTRUCTIONS = `You classify environmental marketing sentences from online shops under the EU Empowering Consumers Directive (2024/825), applicable from 27 September 2026.
For each numbered sentence return exactly one verdict:
- generic_unsubstantiated: a generic environmental claim ("eco-friendly", "green", "sustainable", "climate friendly", "environmentally conscious", "natural", "better for the planet") made without a specific, verifiable statement on the same sentence (a percentage, a certification scheme with a name, a measured figure, a defined scope). Also use this for "carbon/climate neutral" claims that rest on offsetting, and for self-made sustainability labels.
- specific_substantiated: the sentence states a concrete, checkable fact ("made from 70% recycled polyester", "certified by EU Ecolabel", "packaging is FSC-certified", "ships in paper mailers").
- not_environmental: the sentence is not an environmental claim (another sense of "green", "natural" as a colour or flavour, a durability claim meaning long-lasting, navigation text).
Rules:
- Judge only the sentence given; do not assume evidence elsewhere.
- rewording: for generic_unsubstantiated only, a specific rewording the shop could use IF it can substantiate it, phrased as a template with explicit placeholders in angle brackets like <percentage> or <certification>; otherwise omit.
- reason: one short sentence.
- Return one entry per input index, in the same order. Never invent indexes.`;

/** Model-backed classifier for the green_claims check. Groq primary, Gemini fallback (text only). */
export function createLlmClaimClassifier(onMeta?: (meta: CallMeta) => void): ClaimClassifier {
  return {
    async classify(sentences: ClaimInput[]): Promise<ClaimVerdict[]> {
      if (sentences.length === 0) return [];
      const prompt = sentences
        .map((s, i) => `${i}. [${new URL(s.url).pathname}] ${s.text.slice(0, 400)}`)
        .join("\n");
      const { object, meta } = await generateStructured({
        name: "green_claims_classifier",
        promptVersion: CLAIMS_PROMPT_VERSION,
        schema: ClaimClassificationSchema,
        instructions: INSTRUCTIONS,
        prompt,
        temperature: 0,
      });
      onMeta?.(meta);
      // Keep only verdicts for indexes we sent, one per index (first wins).
      const seen = new Set<number>();
      const out: ClaimVerdict[] = [];
      for (const v of object) {
        if (v.index < 0 || v.index >= sentences.length || seen.has(v.index)) continue;
        seen.add(v.index);
        out.push(v);
      }
      return out;
    },
  };
}
