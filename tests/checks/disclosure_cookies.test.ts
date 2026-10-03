import { describe, expect, it } from "vitest";
import { aiDisclosureCheck } from "@/lib/checks/ai_disclosure";
import { cookieParityCheck } from "@/lib/checks/cookie_parity";
import { ctxFrom, doc, expectNoPlaceholders } from "./helpers";

const H = "https://shop.example";
const script = (src: string) => `<script src="${src}" async></script>`;

describe("ai_disclosure", () => {
  it("passes when no chat widget is present", () => {
    const finding = aiDisclosureCheck(ctxFrom({ [`${H}/`]: doc("<h1>Shop</h1>") }));
    expect(finding).toMatchObject({ code: "ai_disclosure", status: "pass", severity: "medium", meta: { widgets: [] } });
  });

  it("warns on a widget without disclosure, ignoring GDPR 'automated decision' wording", () => {
    const finding = aiDisclosureCheck(
      ctxFrom({
        [`${H}/`]: doc(`<h1>Laden</h1>${script("//code.tidio.co/abc123.js")}`, { lang: "de" }),
        [`${H}/datenschutz`]: doc("<h1>Datenschutz</h1><p>Eine automatisierte Entscheidungsfindung findet nicht statt.</p>", {
          lang: "de",
        }),
      }),
    );
    expect(finding.status).toBe("warn");
    expect(finding.meta).toEqual({ widgets: ["Tidio"] });
    expect(finding.evidence).toEqual([{ url: `${H}/`, quote: "Tidio chat widget: https://code.tidio.co/abc123.js" }]);
  });

  it("detects widgets loaded by inline snippets and passes with a disclosure", () => {
    const finding = aiDisclosureCheck(
      ctxFrom({
        [`${H}/`]: doc(
          `<p>Notre assistant virtuel répond à vos questions.</p><script>var s=document.createElement('script');s.src='https://client.crisp.chat/l.js';</script>`,
          { lang: "fr" },
        ),
      }),
    );
    expect(finding.status).toBe("pass");
    expect(finding.meta).toEqual({ widgets: ["Crisp"] });
    expect(finding.evidence).toContainEqual({ url: `${H}/`, quote: "Notre assistant virtuel répond à vos questions." });
  });

  it("accepts acronyms only next to chat wording and case-sensitively", () => {
    const widget = script("https://widget.intercom.io/widget/x");
    const yes = aiDisclosureCheck(ctxFrom({ [`${H}/`]: doc(`<p>Unser Chat wird von einer KI beantwortet.</p>${widget}`, { lang: "de" }) }));
    expect(yes.status).toBe("pass");
    const no = aiDisclosureCheck(ctxFrom({ [`${H}/`]: doc(`<p>Grazie ai clienti della chat.</p>${widget}`, { lang: "it" }) }));
    expect(no.status).toBe("warn");
  });

  it("is unknown on a shell", () => {
    expect(aiDisclosureCheck(ctxFrom({ [`${H}/`]: doc("<div id='root'></div>") })).status).toBe("unknown");
  });

  it("suggests a disclosure line without placeholders", () => {
    const finding = aiDisclosureCheck(ctxFrom({ [`${H}/`]: doc(script("https://embed.tawk.to/1/default")) }));
    expect(finding.fix.html).toMatch(/AI/);
    expectNoPlaceholders(finding);
  });
});

describe("cookie_parity", () => {
  it("passes when the banner offers accept and reject", () => {
    const finding = cookieParityCheck(
      ctxFrom({
        [`${H}/`]: doc(
          `${script("https://consent.cookiebot.com/uc.js")}<div id="CybotCookiebotDialog"><p>We use cookies.</p><button>Reject all</button><button>Customise</button><button>Accept all</button></div>`,
        ),
      }),
    );
    expect(finding).toMatchObject({ code: "cookie_parity", status: "pass", severity: "medium", meta: { cmp: "Cookiebot" } });
    expect(finding.evidence).toEqual([
      { url: `${H}/`, quote: "Accept all" },
      { url: `${H}/`, quote: "Reject all" },
    ]);
  });

  it("warns when only accept is offered on the first layer", () => {
    const finding = cookieParityCheck(
      ctxFrom({
        [`${H}/`]: doc(
          `${script("https://app.usercentrics.eu/browser-ui/latest/loader.js")}<div id="uc-banner"><p>Wir verwenden Cookies.</p><button>Einstellungen</button><button>Alle akzeptieren</button></div><button>In den Warenkorb</button>`,
          { lang: "de" },
        ),
      }),
    );
    expect(finding).toMatchObject({ status: "warn", meta: { cmp: "Usercentrics" } });
    expect(finding.evidence).toEqual([{ url: `${H}/`, quote: "Alle akzeptieren" }]);
    expect(finding.fix.summary).toContain("Usercentrics");
  });

  it("detects a custom banner without a known CMP", () => {
    const finding = cookieParityCheck(
      ctxFrom({
        [`${H}/`]: doc(`<p>Nous utilisons des cookies.</p><button>Continuer sans accepter</button><button>Tout accepter</button>`, {
          lang: "fr",
        }),
      }),
    );
    expect(finding).toMatchObject({ status: "pass", meta: { cmp: null } });
  });

  it("ignores accept-like buttons when nothing mentions cookies", () => {
    const finding = cookieParityCheck(ctxFrom({ [`${H}/`]: doc(`<button>Accept</button>`) }));
    expect(finding.status).toBe("unknown");
  });

  it("is unknown when the CMP injects the banner with JavaScript", () => {
    const finding = cookieParityCheck(ctxFrom({ [`${H}/`]: doc(`<h1>Shop</h1>${script("https://cdn.cookielaw.org/scripttemplates/otSDKStub.js")}`) }));
    expect(finding).toMatchObject({ status: "unknown", meta: { cmp: "OneTrust" } });
    expect(finding.detail).toMatch(/JavaScript/);
  });

  it("is unknown on a shell even with buttons", () => {
    expect(cookieParityCheck(ctxFrom({ [`${H}/`]: doc("<p>cookies</p><button>Accept</button>") }, { jsRenderedSuspected: true })).status).toBe(
      "unknown",
    );
  });

  it("offers a banner with a first-layer reject button, without placeholders", () => {
    const finding = cookieParityCheck(ctxFrom({ [`${H}/`]: doc("<h1>Shop</h1>") }));
    expect(finding.fix.html).toContain("Reject all");
    expectNoPlaceholders(finding);
  });
});
