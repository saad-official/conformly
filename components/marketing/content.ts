/**
 * Marketing copy that more than one section uses. The nine checks mirror
 * docs/spec.md section 3.2; the rule dates mirror section 1.
 */

export type CheckEntry = {
  code: string;
  name: string;
  looksFor: string;
  decides: "rule" | "rule + model";
  citation: string;
  note?: string;
};

export const checks: CheckEntry[] = [
  {
    code: "withdrawal_function",
    name: "On-site withdrawal function",
    looksFor:
      "A link or button labelled as a withdrawal function, in any EU language, on the footer, legal, account or order pages. Fails when there is none; warns when the only route is a downloadable form or an email address.",
    decides: "rule",
    citation: "Directive (EU) 2023/2673, Art. 11a",
  },
  {
    code: "withdrawal_policy",
    name: "Withdrawal policy states 14 days",
    looksFor:
      "A returns or withdrawal policy page that states the 14-day period: 14 days, fourteen, 14 Tage, 14 jours and equivalents.",
    decides: "rule",
    citation: "Directive 2011/83/EU, Art. 6(1)(h) and Art. 9",
  },
  {
    code: "green_claims",
    name: "Generic environmental claims",
    looksFor:
      "Sentences that a multilingual keyword filter marks as environmental. A model sorts each into generic and unsubstantiated, specific and substantiated, or not environmental, and suggests a rewording. Offset-based “carbon neutral” claims and self-made labels are flagged by rule.",
    decides: "rule + model",
    citation: "Directive (EU) 2024/825, Annex I, points 2a, 4a, 4c",
  },
  {
    code: "accessibility_statement",
    name: "Accessibility statement and complaint channel",
    looksFor:
      "A link to an accessibility statement, statement language on that page, and an email address or form for complaints. The report notes the exemption for micro-enterprises providing services.",
    decides: "rule",
    citation: "Directive (EU) 2019/882, Art. 13(2) and Annex V",
  },
  {
    code: "a11y_sample",
    name: "Accessibility sample",
    looksFor:
      "Five technical checks: a lang attribute, exactly one h1, images without alt text, inputs without labels and links with no text.",
    decides: "rule",
    citation: "EN 301 549 / WCAG 2.1 SC 1.1.1, 1.3.1, 2.4.4, 3.1.1",
    note: "A sample, not a WCAG audit. A full audit needs a browser and a person; Conformly does neither.",
  },
  {
    code: "ai_disclosure",
    name: "Chatbot disclosure",
    looksFor:
      "Chat widgets loaded from known hosts such as Intercom, Tidio, Gorgias or Shopify Inbox. When one is present, it looks for words that tell people they are talking to an AI system, on the page or in the privacy policy.",
    decides: "rule",
    citation: "Regulation (EU) 2024/1689, Art. 50(1)",
  },
  {
    code: "cookie_parity",
    name: "Reject as easy as accept",
    looksFor:
      "A consent banner in the page markup with an accept button and a reject button at the same level. Warns when only accept is offered.",
    decides: "rule",
    citation: "Directive 2002/58/EC, Art. 5(3); Regulation (EU) 2016/679, Art. 7",
    note: "Banners injected by JavaScript are not visible to the crawler and are reported as unknown.",
  },
  {
    code: "legal_notice",
    name: "Legal notice completeness",
    looksFor:
      "An imprint or legal notice page with a postal address, an email address, and a company registration or VAT number.",
    decides: "rule",
    citation: "Directive 2000/31/EC, Art. 5(1)",
  },
  {
    code: "eu_targeting",
    name: "EU targeting (informational)",
    looksFor:
      "Prices in euro, shipping to EU countries and EU-language pages. It explains why the rules above apply to the store; it is never counted as an issue.",
    decides: "rule",
    citation: "CJEU, Joined Cases C-585/08 and C-144/09 (Pammer)",
  },
];

export type Rule = {
  date: string;
  iso: string;
  name: string;
  instrument: string;
  duty: string;
};

export const rules: Rule[] = [
  {
    date: "28 Jun 2025",
    iso: "2025-06-28",
    name: "European Accessibility Act",
    instrument: "Directive (EU) 2019/882",
    duty: "Shops must meet EN 301 549, publish an accessibility statement and offer a way to complain.",
  },
  {
    date: "19 Jun 2026",
    iso: "2026-06-19",
    name: "Withdrawal function",
    instrument: "Directive (EU) 2023/2673",
    duty: "Shops must offer an on-site “withdraw from contract” function with two-step confirmation; an email address is not enough.",
  },
  {
    date: "2 Aug 2026",
    iso: "2026-08-02",
    name: "AI Act, Article 50",
    instrument: "Regulation (EU) 2024/1689",
    duty: "A chatbot must tell people they are talking to an AI system, unless that is obvious.",
  },
  {
    date: "27 Sep 2026",
    iso: "2026-09-27",
    name: "Green claims",
    instrument: "Directive (EU) 2024/825",
    duty: "Generic claims such as “eco-friendly” need recognised proof; offset-based neutrality claims and self-made labels are banned.",
  },
];
