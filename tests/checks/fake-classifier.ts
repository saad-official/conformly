import type { ClaimClassifier, ClaimInput, ClaimVerdict } from "@/lib/checks/green_claims";

export interface FakeRule {
  /** Case-insensitive substring of the sentence. */
  includes: string;
  verdict: ClaimVerdict["verdict"];
  rewording?: string;
}

export interface FakeClassifier extends ClaimClassifier {
  calls: ClaimInput[][];
}

/**
 * Deterministic stand-in for the LLM: the first rule whose `includes` occurs in
 * a sentence decides its verdict; other sentences are not environmental.
 */
export function fakeClassifier(rules: readonly FakeRule[]): FakeClassifier {
  const calls: ClaimInput[][] = [];
  return {
    calls,
    async classify(sentences) {
      calls.push(sentences);
      return sentences.map((sentence, index) => {
        const rule = rules.find((r) => sentence.text.toLowerCase().includes(r.includes.toLowerCase()));
        if (!rule) return { index, verdict: "not_environmental" as const, reason: "No environmental claim." };
        return {
          index,
          verdict: rule.verdict,
          reason: rule.verdict === "generic_unsubstantiated" ? "Generic claim without proof." : "Specific and verifiable.",
          ...(rule.rewording ? { rewording: rule.rewording } : {}),
        };
      });
    },
  };
}

export const failingClassifier: ClaimClassifier = {
  async classify() {
    throw new Error("rate limited");
  },
};
