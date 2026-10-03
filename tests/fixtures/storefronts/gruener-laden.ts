/**
 * (b) gruener-laden.example — German drugstore. Widerrufsbelehrung only as PDF,
 * Impressum complete, "klimaneutral durch Kompensation" and a self-made
 * "Öko-Siegel", Tidio chat without AI disclosure, Usercentrics banner with only
 * "Alle akzeptieren". Crawl traps: robots.txt blocks /kasse, a discontinued
 * product returns 404, /agb redirects twice, an off-site Facebook link.
 */
import { redirect } from "./fake-fetch";
import { page, productJsonLd, type StorefrontFixture } from "./types";

const B = "https://gruener-laden.example";

const header = `<header>
  <a href="/">Grüner Laden</a>
  <nav>
    <a href="/produkte/bambus-zahnbuerste">Bambus-Zahnbürste</a>
    <a href="/produkte/seife-lavendel">Lavendelseife</a>
    <a href="/produkte/sonnencreme-bio">Sonnencreme</a>
    <a href="/warenkorb">Warenkorb</a>
    <a href="/kasse">Zur Kasse</a>
    <a href="/mein-konto">Mein Konto</a>
  </nav>
</header>`;

const footer = `<footer>
  <a href="/impressum">Impressum</a>
  <a href="/datenschutz">Datenschutz</a>
  <a href="/agb">AGB</a>
  <a href="/media/widerrufsbelehrung.pdf">Widerrufsbelehrung (PDF)</a>
  <a href="/media/widerrufsformular.pdf">Widerrufsformular (PDF)</a>
  <a href="https://facebook.example/gruenerladen">Facebook</a>
  <p>© 2026 Grüner Laden GmbH</p>
</footer>
<div id="usercentrics-root">
  <div class="uc-banner" role="dialog">
    <p>Wir verwenden Cookies, um unseren Shop zu verbessern.</p>
    <button type="button">Einstellungen</button>
    <button type="button">Alle akzeptieren</button>
  </div>
</div>`;

const scripts = `<script id="usercentrics-cmp" src="https://app.usercentrics.eu/browser-ui/latest/loader.js" data-settings-id="k2PqX" async></script>
<script src="//code.tidio.co/gruenerladen123.js" async></script>`;

const shell = (title: string, main: string, head = "") =>
  page({ lang: "de", title: `${title} – Grüner Laden`, head: `${head}${scripts}`, body: `${header}\n<main>\n${main}\n</main>\n${footer}` });

export const gruenerLaden: StorefrontFixture = {
  startUrl: "https://gruener-laden.example/",
  routes: {
    [`${B}/robots.txt`]: "User-agent: *\nDisallow: /kasse\n",

    [`${B}/`]: shell(
      "Drogerie",
      `<h1>Nachhaltige Drogerie aus Berlin</h1>
<p>Alle unsere Produkte sind klimaneutral durch Kompensation über zertifizierte Klimaschutzprojekte.</p>
<p>Kostenloser Versand in alle EU-Länder ab 39 €.</p>
<img src="/bilder/laden.jpg">
<form action="/newsletter" method="post">
  <input type="email" name="email" placeholder="Ihre E-Mail-Adresse">
  <button type="submit">Anmelden</button>
</form>`,
    ),

    [`${B}/produkte/bambus-zahnbuerste`]: shell(
      "Bambus-Zahnbürste",
      `<h1>Bambus-Zahnbürste</h1>
<img src="/bilder/zahnbuerste.jpg" alt="Zahnbürste mit Bambusgriff">
<p>Unsere Zahnbürste ist umweltfreundlich und nachhaltig.</p>
<p>Ausgezeichnet mit unserem Öko-Siegel „Grüne Wahl“.</p>
<p>Preis: 3,90 €</p>
<button type="button">In den Warenkorb</button>`,
      productJsonLd("Bambus-Zahnbürste", "3.90"),
    ),

    [`${B}/produkte/seife-lavendel`]: shell(
      "Lavendelseife",
      `<h1>Lavendelseife</h1>
<img src="/bilder/seife.jpg" alt="Lavendelseife auf Holzbrett">
<p>Handgemacht in Brandenburg mit Lavendelöl.</p>
<p>Verpackung aus 100 % recyceltem Papier.</p>
<p>Preis: 4,90 €</p>
<button type="button">In den Warenkorb</button>`,
      productJsonLd("Lavendelseife", "4.90"),
    ),

    [`${B}/warenkorb`]: shell("Warenkorb", `<h1>Ihr Warenkorb</h1>\n<p>Ihr Warenkorb ist leer.</p>`),

    [`${B}/mein-konto`]: shell(
      "Mein Konto",
      `<h1>Mein Konto</h1>
<form action="/mein-konto/login" method="post">
  <input type="email" name="email" placeholder="E-Mail">
  <input type="password" name="passwort" placeholder="Passwort">
  <button type="submit">Einloggen</button>
</form>`,
    ),

    [`${B}/impressum`]: shell(
      "Impressum",
      `<h1>Impressum</h1>
<p>Grüner Laden GmbH<br>Lindenstraße 12<br>10115 Berlin</p>
<p>Telefon: +49 30 1234567<br>E-Mail: kontakt@gruener-laden.example</p>
<p>Registergericht: Amtsgericht Berlin-Charlottenburg, HRB 123456</p>
<p>USt-IdNr.: DE123456789</p>`,
    ),

    [`${B}/datenschutz`]: shell(
      "Datenschutzerklärung",
      `<h1>Datenschutzerklärung</h1>
<p>Für den Live-Chat nutzen wir Tidio.</p>
<p>Cookies setzen wir nur mit Ihrer Einwilligung über Usercentrics.</p>
<p>Eine automatisierte Entscheidungsfindung findet nicht statt.</p>`,
    ),

    [`${B}/agb`]: redirect("/agb/"),
    [`${B}/agb/`]: redirect(`${B}/rechtliches/agb`, 301),
    [`${B}/rechtliches/agb`]: shell(
      "AGB",
      `<h1>Allgemeine Geschäftsbedingungen</h1>
<h2>§ 1 Geltungsbereich</h2>
<p>Diese AGB gelten für alle Bestellungen bei der Grüner Laden GmbH.</p>
<h2>§ 4 Lieferung</h2>
<p>Wir liefern innerhalb Deutschlands und in die EU.</p>
<p>Informationen zu Ihrem Widerrufsrecht finden Sie in unserer <a href="/media/widerrufsbelehrung.pdf">Widerrufsbelehrung (PDF)</a>.</p>`,
    ),

    // /produkte/sonnencreme-bio is not routed: the fake fetch answers 404.
  },
};
