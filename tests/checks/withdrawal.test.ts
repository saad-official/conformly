import { describe, expect, it } from "vitest";
import { withdrawalFunctionCheck } from "@/lib/checks/withdrawal_function";
import { withdrawalPolicyCheck } from "@/lib/checks/withdrawal_policy";
import { ctxFrom, doc, expectNoPlaceholders } from "./helpers";

const H = "https://shop.example";
const home = (links = "") => doc(`<h1>Shop</h1><footer>${links}<a href="/policies/withdrawal">Right of withdrawal</a></footer>`);
const policy = (text: string) => doc(`<h1>Right of withdrawal</h1><p>${text}</p>`);

describe("withdrawal_function", () => {
  it("passes on a withdrawal link in the account area and quotes it", () => {
    const ctx = ctxFrom({
      [`${H}/`]: home(`<a href="/account">My account</a>`),
      [`${H}/account`]: doc(`<h1>Account</h1><a class="button" href="/account/withdraw">Withdraw from contract here</a>`),
    });
    const finding = withdrawalFunctionCheck(ctx);
    expect(finding).toMatchObject({ code: "withdrawal_function", status: "pass", severity: "high" });
    expect(finding.evidence).toEqual([{ url: `${H}/account`, quote: "Withdraw from contract here" }]);
    expect(finding.detail).toMatch(/two-step|second step/);
  });

  it("passes on a German button and on an href-only match", () => {
    const de = ctxFrom({
      [`${H}/`]: doc(`<h1>Laden</h1>`, { lang: "de" }),
      [`${H}/mein-konto`]: doc(`<h1>Konto</h1><form action="/x"><button>Vertrag hier widerrufen</button></form>`, { lang: "de" }),
    });
    expect(withdrawalFunctionCheck(de).evidence).toEqual([{ url: `${H}/mein-konto`, quote: "Vertrag hier widerrufen" }]);

    const href = ctxFrom({ [`${H}/`]: doc(`<h1>Shop</h1><a href="/account/withdraw">Start</a>`) });
    expect(withdrawalFunctionCheck(href)).toMatchObject({
      status: "pass",
      evidence: [{ url: `${H}/`, quote: "Start (/account/withdraw)" }],
    });
  });

  it("passes on a form posting to a withdrawal endpoint", () => {
    const ctx = ctxFrom({
      [`${H}/`]: doc(`<h1>Shop</h1><form action="/widerruf-erklaeren"><label>Bestellnummer <input name="o"></label></form>`),
    });
    expect(withdrawalFunctionCheck(ctx)).toMatchObject({
      status: "pass",
      evidence: [{ url: `${H}/`, quote: `Form posting to ${H}/widerruf-erklaeren` }],
    });
  });

  it("does not mistake the policy link for the function", () => {
    const ctx = ctxFrom({ [`${H}/`]: home(), [`${H}/policies/withdrawal`]: policy("You have 14 days.") });
    expect(withdrawalFunctionCheck(ctx).status).toBe("fail");
  });

  it("warns when only a downloadable form exists", () => {
    const ctx = ctxFrom({
      [`${H}/`]: doc(`<h1>Laden</h1><a href="/media/widerrufsformular.pdf">Widerrufsformular (PDF)</a>`, { lang: "de" }),
    });
    const finding = withdrawalFunctionCheck(ctx);
    expect(finding.status).toBe("warn");
    expect(finding.evidence).toEqual([{ url: `${H}/`, quote: "Widerrufsformular (PDF)" }]);
    expect(finding.detail).toMatch(/PDF|download/i);
  });

  it("warns when withdrawal is only possible by e-mail", () => {
    const ctx = ctxFrom({
      [`${H}/`]: home(),
      [`${H}/policies/withdrawal`]: policy("To withdraw, send an email to returns@shop.example. We refund within 14 days."),
    });
    const finding = withdrawalFunctionCheck(ctx);
    expect(finding.status).toBe("warn");
    expect(finding.evidence).toEqual([
      { url: `${H}/policies/withdrawal`, quote: "To withdraw, send an email to returns@shop.example." },
    ]);
  });

  it("fails without any function, form or e-mail route and says since when the rule applies", () => {
    const finding = withdrawalFunctionCheck(ctxFrom({ [`${H}/`]: doc("<h1>Shop</h1>") }));
    expect(finding.status).toBe("fail");
    expect(finding.evidence).toEqual([]);
    expect(finding.detail).toContain("has applied since 19 June 2026");
    expect(
      withdrawalFunctionCheck(ctxFrom({ [`${H}/`]: doc("<h1>Shop</h1>") }, { now: new Date("2026-05-01T00:00:00Z") })).detail,
    ).toContain("applies from 19 June 2026");
  });

  it("is unknown on a JavaScript shell", () => {
    const finding = withdrawalFunctionCheck(ctxFrom({ [`${H}/`]: doc("<div id='root'></div>") }));
    expect(finding.status).toBe("unknown");
  });

  it("offers a two-step form labelled in the shop's language, without placeholders", () => {
    const de = withdrawalFunctionCheck(ctxFrom({ [`${H}/`]: doc("<h1>Laden</h1>", { lang: "de" }) }));
    expect(de.fix.html).toContain("Vertrag hier widerrufen");
    expect(de.fix.html).toContain("Widerruf bestätigen");
    expect(de.fix.shopify).toBeTruthy();
    expectNoPlaceholders(de);
    const fr = withdrawalFunctionCheck(ctxFrom({ [`${H}/`]: doc("<h1>Boutique</h1>", { lang: "fr" }) }));
    expect(fr.fix.html).toContain("Se rétracter du contrat ici");
    expectNoPlaceholders(fr);
  });
});

describe("withdrawal_policy", () => {
  it("passes when the policy states 14 days and quotes the sentence", () => {
    const ctx = ctxFrom({
      [`${H}/`]: home(),
      [`${H}/policies/withdrawal`]: policy(
        "Our policy. You have the right to withdraw from this contract within 14 days without giving any reason.",
      ),
    });
    const finding = withdrawalPolicyCheck(ctx);
    expect(finding).toMatchObject({ code: "withdrawal_policy", status: "pass", severity: "medium" });
    expect(finding.evidence).toEqual([
      {
        url: `${H}/policies/withdrawal`,
        quote: "You have the right to withdraw from this contract within 14 days without giving any reason.",
      },
    ]);
  });

  it("finds the policy through link text and German wording", () => {
    const ctx = ctxFrom({
      [`${H}/`]: doc(`<a href="/seite/7">Widerrufsbelehrung</a>`, { lang: "de" }),
      [`${H}/seite/7`]: doc("<h1>Info</h1><p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.</p>", { lang: "de" }),
    });
    expect(withdrawalPolicyCheck(ctx).status).toBe("pass");
  });

  it("finds a withdrawal section inside the terms", () => {
    const ctx = ctxFrom({
      [`${H}/`]: doc(`<a href="/agb">AGB</a>`, { lang: "de" }),
      [`${H}/agb`]: doc("<h1>AGB</h1><h2>§ 6 Widerrufsrecht</h2><p>Die Widerrufsfrist beträgt 14 Tage.</p>", { lang: "de" }),
    });
    expect(withdrawalPolicyCheck(ctx)).toMatchObject({
      status: "pass",
      evidence: [{ url: `${H}/agb`, quote: "Die Widerrufsfrist beträgt 14 Tage." }],
    });
  });

  it("passes a longer period and fails a shorter one", () => {
    const longer = withdrawalPolicyCheck(
      ctxFrom({ [`${H}/`]: home(), [`${H}/policies/withdrawal`]: policy("Return any item within 30 days for a refund.") }),
    );
    expect(longer).toMatchObject({ status: "pass", meta: { periodDays: 30 } });
    const shorter = withdrawalPolicyCheck(
      ctxFrom({ [`${H}/`]: home(), [`${H}/policies/withdrawal`]: policy("Returns are accepted within 7 days of delivery.") }),
    );
    expect(shorter).toMatchObject({
      status: "fail",
      meta: { periodDays: 7 },
      evidence: [{ url: `${H}/policies/withdrawal`, quote: "Returns are accepted within 7 days of delivery." }],
    });
  });

  it("warns when the policy page states no period", () => {
    const finding = withdrawalPolicyCheck(
      ctxFrom({ [`${H}/`]: home(), [`${H}/policies/withdrawal`]: policy("Contact us about returns.") }),
    );
    expect(finding.status).toBe("warn");
  });

  it("warns when the policy is only a PDF", () => {
    const finding = withdrawalPolicyCheck(
      ctxFrom({ [`${H}/`]: doc(`<a href="/media/widerrufsbelehrung.pdf">Widerrufsbelehrung (PDF)</a>`, { lang: "de" }) }),
    );
    expect(finding).toMatchObject({
      status: "warn",
      evidence: [{ url: `${H}/`, quote: "Widerrufsbelehrung (PDF)" }],
    });
  });

  it("fails without any policy and is unknown on a shell", () => {
    expect(withdrawalPolicyCheck(ctxFrom({ [`${H}/`]: doc("<h1>Shop</h1>") })).status).toBe("fail");
    expect(withdrawalPolicyCheck(ctxFrom({ [`${H}/`]: doc("<div id='root'></div>") })).status).toBe("unknown");
  });

  it("offers the model withdrawal text without placeholders", () => {
    const finding = withdrawalPolicyCheck(ctxFrom({ [`${H}/`]: doc("<h1>Shop</h1>") }));
    expect(finding.fix.html).toContain("within 14 days");
    expectNoPlaceholders(finding);
  });
});
