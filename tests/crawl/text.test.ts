import { describe, expect, it } from "vitest";
import { compileTerms, excerpt, normalizeForMatch, splitSentences } from "@/lib/crawl/text";

describe("normalizeForMatch", () => {
  it("lower-cases, strips accents, folds ß, hyphens and typographic apostrophes", () => {
    expect(normalizeForMatch("Écologique  Öko-Siegel Straße l’été CO₂–neutral")).toBe(
      "ecologique oko siegel strasse l'ete co2 neutral",
    );
  });

  it("keeps case when asked", () => {
    expect(normalizeForMatch("KI-Assistent", { keepCase: true })).toBe("KI Assistent");
  });
});

describe("compileTerms", () => {
  it("matches whole words only, ignoring case and accents", () => {
    const m = compileTerms(["eco", "rétractation"]);
    expect(m.test("Our ECO range")).toBe(true);
    expect(m.test("eco-friendly packaging")).toBe(true);
    expect(m.test("The economy is slow")).toBe(false);
    expect(m.test("Droit de retractation")).toBe(true);
  });

  it("supports a trailing * on any word as a prefix wildcard", () => {
    const m = compileTerms(["widerruf*", "unser* oko siegel"]);
    expect(m.test("Widerrufsbelehrung")).toBe(true);
    expect(m.test("Ausgezeichnet mit unserem Öko-Siegel")).toBe(true);
    expect(m.test("Ihr Öko-Siegel")).toBe(false);
  });

  it("matches multi-word terms across any whitespace or hyphen", () => {
    const m = compileTerms(["carbon neutral", "co2 neutral"]);
    expect(m.test("100% carbon-neutral shipping")).toBe(true);
    expect(m.test("CO2-neutral")).toBe(true);
    expect(m.test("carbon\nneutral")).toBe(true);
  });

  it("returns the first table term that matches", () => {
    const m = compileTerms(["accept all", "accept"]);
    expect(m.find("Accept all cookies")).toBe("accept all");
    expect(m.find("Accept")).toBe("accept");
    expect(m.find("Decline")).toBeNull();
  });

  it("can match case-sensitively for acronyms", () => {
    const m = compileTerms(["AI", "KI"], { caseSensitive: true });
    expect(m.test("Our AI assistant")).toBe(true);
    expect(m.test("KI-Assistent")).toBe(true);
    expect(m.test("Grazie ai clienti")).toBe(false);
  });

  it("matches terms containing punctuation and digits", () => {
    const m = compileTerms(["100 %", "d'accessibilite"]);
    expect(m.test("Savon 100 % naturel")).toBe(true);
    expect(m.test("Déclaration d’accessibilité")).toBe(true);
  });
});

describe("splitSentences", () => {
  it("splits on line breaks and sentence punctuation followed by a non-lower-case start", () => {
    expect(splitSentences("Free shipping. Our lamps are eco-friendly! Ask us?\nContact z.B. unser Team")).toEqual([
      "Free shipping.",
      "Our lamps are eco-friendly!",
      "Ask us?",
      "Contact z.B. unser Team",
    ]);
  });

  it("does not split decimals or lower-case continuations and drops empty lines", () => {
    expect(splitSentences("Price 4.99 EUR. see terms.\n\n  \nDone")).toEqual(["Price 4.99 EUR. see terms.", "Done"]);
  });
});

describe("excerpt", () => {
  it("returns short strings unchanged and cuts long ones on a word with an ellipsis", () => {
    expect(excerpt("short", 10)).toBe("short");
    expect(excerpt("one two three four five", 12)).toBe("one two…");
  });
});
