import { describe, expect, it } from "vitest";
import {
  ClaimClassificationSchema,
  createGreenClaimsCheck,
  MAX_CLASSIFIED_SENTENCES,
  type ClaimClassifier,
} from "@/lib/checks/green_claims";
import { ctxFrom, doc, expectNoPlaceholders } from "./helpers";
import { failingClassifier, fakeClassifier } from "./fake-classifier";

const H = "https://laden.example";

const run = (pages: Record<string, string>, classifier?: ClaimClassifier) => createGreenClaimsCheck(classifier)(ctxFrom(pages));

describe("green_claims: rules without a classifier", () => {
  it("passes when no sentence uses environmental vocabulary, without calling the classifier", async () => {
    const classifier = fakeClassifier([]);
    const finding = await run({ [`${H}/`]: doc("<h1>Linen shirts</h1><p>Durable stitching? No: tailored fit.</p>") }, classifier);
    expect(finding).toMatchObject({ code: "green_claims", status: "pass", severity: "high", evidence: [] });
    expect(classifier.calls).toEqual([]);
  });

  it("flags offset-based climate neutrality in the same sentence", async () => {
    const finding = await run({
      [`${H}/`]: doc("<h1>Laden</h1><p>Alle Produkte sind klimaneutral durch Kompensation.</p>", { lang: "de" }),
    });
    expect(finding.status).toBe("fail");
    expect(finding.evidence).toEqual([{ url: `${H}/`, quote: "Alle Produkte sind klimaneutral durch Kompensation." }]);
    expect(finding.meta).toMatchObject({
      classifier: "missing",
      claims: [{ url: `${H}/`, quote: "Alle Produkte sind klimaneutral durch Kompensation.", source: "rule", rule: "offset_neutrality" }],
    });
  });

  it("flags a neutrality claim when offsetting is explained elsewhere on the same page", async () => {
    const finding = await run({
      [`${H}/`]: doc("<p>Our candles are carbon-neutral.</p><p>We offset all emissions through a forest project in Peru.</p>"),
    });
    expect(finding.status).toBe("fail");
    expect(finding.evidence[0].quote).toBe("Our candles are carbon-neutral.");
  });

  it("flags self-made labels in any language", async () => {
    const de = await run({ [`${H}/`]: doc("<p>Ausgezeichnet mit unserem Öko-Siegel „Grüne Wahl“.</p>", { lang: "de" }) });
    expect(de).toMatchObject({ status: "fail", meta: { claims: [{ rule: "self_made_label" }] } });
    const en = await run({ [`${H}/`]: doc("<p>Look for our eco label on every product.</p>") });
    expect(en.status).toBe("fail");
  });

  it("is unknown when vocabulary matches but no classifier is available", async () => {
    const finding = await run({ [`${H}/`]: doc("<p>Nos bougies sont 100 % écologiques.</p>", { lang: "fr" }) });
    expect(finding.status).toBe("unknown");
    expect(finding.meta).toMatchObject({ classifier: "missing", candidates: 1 });
    expect(finding.detail).toMatch(/1 sentence/);
  });
});

describe("green_claims: with a classifier", () => {
  const pages = {
    [`${H}/`]: doc(
      [
        "<h1>Boutique</h1>",
        "<p>Nos bougies sont 100 % écologiques.</p>",
        "<p>Emballage en carton recyclé à 80 %, certifié FSC.</p>",
        "<p>Le vert sapin est notre couleur durable préférée.</p>",
      ].join(""),
      { lang: "fr" },
    ),
  };

  it("reports only generic unsubstantiated claims, with rewordings in meta and the fix", async () => {
    const classifier = fakeClassifier([
      { includes: "100 % écologiques", verdict: "generic_unsubstantiated", rewording: "Bougies en cire de soja <certifiée>" },
      { includes: "recyclé", verdict: "specific_substantiated" },
    ]);
    const finding = await run(pages, classifier);
    expect(finding.status).toBe("fail");
    expect(finding.evidence).toEqual([{ url: `${H}/`, quote: "Nos bougies sont 100 % écologiques." }]);
    expect(finding.meta).toMatchObject({
      classifier: "used",
      candidates: 3,
      sent: 3,
      claims: [
        {
          quote: "Nos bougies sont 100 % écologiques.",
          source: "classifier",
          verdict: "generic_unsubstantiated",
          rewording: "Bougies en cire de soja <certifiée>",
        },
      ],
    });
    expect(finding.fix.html).toContain("Bougies en cire de soja &lt;certifiée&gt;");
    expectNoPlaceholders(finding);
  });

  it("passes when every claim is specific or not environmental", async () => {
    const finding = await run(pages, fakeClassifier([{ includes: "recyclé", verdict: "specific_substantiated" }]));
    expect(finding.status).toBe("pass");
    expect(finding.evidence).toEqual([]);
  });

  it("does not send rule-flagged sentences to the classifier", async () => {
    const classifier = fakeClassifier([]);
    await run(
      { [`${H}/`]: doc("<p>Klimaneutral dank CO2-Kompensation.</p><p>Nachhaltige Seife.</p>", { lang: "de" }) },
      classifier,
    );
    expect(classifier.calls).toEqual([[{ text: "Nachhaltige Seife.", url: `${H}/` }]]);
  });

  it(`sends at most ${MAX_CLASSIFIED_SENTENCES} distinct sentences`, async () => {
    const many = Array.from({ length: 50 }, (_, i) => `<p>Product ${i} is sustainable.</p>`).join("");
    const footer = "<footer><p>Sustainable since 2010.</p></footer>";
    const classifier = fakeClassifier([]);
    const finding = await run({ [`${H}/`]: doc(footer + many), [`${H}/about`]: doc(footer) }, classifier);
    expect(classifier.calls[0]).toHaveLength(MAX_CLASSIFIED_SENTENCES);
    expect(classifier.calls[0].filter((s) => s.text === "Sustainable since 2010.")).toHaveLength(1);
    expect(finding.meta).toMatchObject({ candidates: 51, sent: 40, truncated: true });
  });

  it("ignores malformed classifier output", async () => {
    const classifier: ClaimClassifier = {
      async classify() {
        return [
          { index: 7, verdict: "generic_unsubstantiated", reason: "out of range" },
          { index: 0, verdict: "specific_substantiated", reason: "first wins" },
          { index: 0, verdict: "generic_unsubstantiated", reason: "duplicate" },
        ];
      },
    };
    const finding = await run({ [`${H}/`]: doc("<p>Nachhaltige Seife.</p>", { lang: "de" }) }, classifier);
    expect(finding.status).toBe("pass");
  });

  it("is unknown when the classifier fails and nothing was flagged by rule", async () => {
    const finding = await run({ [`${H}/`]: doc("<p>Nachhaltige Seife.</p>", { lang: "de" }) }, failingClassifier);
    expect(finding).toMatchObject({ status: "unknown", meta: { classifier: "error", error: "rate limited" } });
  });

  it("still fails on rule findings when the classifier fails", async () => {
    const finding = await run(
      { [`${H}/`]: doc("<p>Klimaneutral durch Kompensation.</p><p>Nachhaltige Seife.</p>", { lang: "de" }) },
      failingClassifier,
    );
    expect(finding.status).toBe("fail");
  });

  it("validates classifier output with the exported schema", () => {
    expect(ClaimClassificationSchema.safeParse([{ index: 0, verdict: "not_environmental", reason: "x" }]).success).toBe(true);
    expect(ClaimClassificationSchema.safeParse([{ index: -1, verdict: "maybe", reason: "x" }]).success).toBe(false);
  });
});

describe("green_claims: JavaScript shell", () => {
  it("is unknown when nothing is visible", async () => {
    const finding = await run({ [`${H}/`]: doc("<div id='root'></div>") });
    expect(finding.status).toBe("unknown");
  });
});
