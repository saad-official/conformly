/**
 * (c) boutique-verte.example — French candle shop. No withdrawal information at
 * all, "100 % écologiques" / "écoresponsable" claims, no accessibility
 * statement, "Livraison en Europe", mentions légales without SIRET/VAT, a
 * Crisp chat that discloses its virtual assistant, a home-made cookie banner
 * with "Continuer sans accepter". The account page hangs (timeout) and the
 * cart page has no lang attribute.
 */
import type { StorefrontFixture } from "./types";
import { page } from "./types";

const C = "https://boutique-verte.example";

const header = `<header>
  <a href="/">Boutique Verte</a>
  <nav>
    <a href="/produits/bougie-soja">Bougies</a>
    <a href="/produits/savon-lavande">Savons</a>
    <a href="/panier">Panier</a>
    <a href="/mon-compte">Mon compte</a>
  </nav>
</header>`;

const footer = `<footer>
  <a href="/mentions-legales">Mentions légales</a>
  <a href="/cgv">CGV</a>
  <a href="/confidentialite">Confidentialité</a>
  <p>Notre assistant virtuel répond à vos questions 24 h/24.</p>
</footer>
<div class="cookie-banner" role="dialog">
  <p>Nous utilisons des cookies pour mesurer l'audience.</p>
  <button type="button">Continuer sans accepter</button>
  <button type="button">Tout accepter</button>
</div>`;

const scripts = `<script>window.$crisp=[];window.CRISP_WEBSITE_ID="b2f1";(function(){var s=document.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;document.head.appendChild(s);})();</script>`;

const shell = (title: string, main: string, options: { lang?: string | null; head?: string } = {}) =>
  page({
    lang: options.lang === undefined ? "fr" : options.lang,
    title: `${title} – Boutique Verte`,
    head: `${options.head ?? ""}${scripts}`,
    body: `${header}\n<main>\n${main}\n</main>\n${footer}`,
  });

export const boutiqueVerte: StorefrontFixture = {
  startUrl: "https://boutique-verte.example",
  routes: {
    [`${C}/robots.txt`]: "User-agent: *\nAllow: /\n",

    [`${C}/`]: shell(
      "Accueil",
      `<h1>Bougies et savons écologiques</h1>
<p>Une boutique écoresponsable et durable.</p>
<p>Nos bougies sont 100 % écologiques.</p>
<p>Bougie au soja 18,00 €</p>
<p>Livraison en Europe sous 5 jours.</p>
<img src="/images/bougies.jpg" alt="Trois bougies allumées">`,
    ),

    [`${C}/produits/bougie-soja`]: shell(
      "Bougie au soja",
      `<h1>Bougie au soja</h1>
<img src="/images/bougie.jpg" alt="Bougie au soja dans un pot en verre">
<p>Cire de soja, mèche en coton. Fabriquée à Lyon.</p>
<p>Emballage biodégradable.</p>
<p>18,00 €</p>
<button type="button">Ajouter au panier</button>`,
      { head: '<meta property="og:type" content="product">' },
    ),

    [`${C}/produits/savon-lavande`]: shell(
      "Savon à la lavande",
      `<h1>Savon à la lavande</h1>
<img src="/images/savon.jpg" alt="Savon à la lavande emballé">
<p>Saponifié à froid en Provence.</p>
<p>6,50 €</p>
<button type="button">Ajouter au panier</button>`,
      { head: '<meta property="og:type" content="product">' },
    ),

    [`${C}/panier`]: shell("Panier", `<h1>Votre panier</h1>\n<p>Votre panier est vide.</p>`, { lang: null }),

    [`${C}/mon-compte`]: { hang: true },

    [`${C}/mentions-legales`]: shell(
      "Mentions légales",
      `<h1>Mentions légales</h1>
<p>Boutique Verte SAS</p>
<p>12 rue des Lilas, 69003 Lyon</p>
<p>Contact : bonjour@boutique-verte.example</p>
<p>Directrice de la publication : Claire Martin</p>`,
    ),

    [`${C}/cgv`]: shell(
      "Conditions générales de vente",
      `<h1>Conditions générales de vente</h1>
<h2>Article 1 – Objet</h2>
<p>Les présentes conditions s'appliquent à toutes les commandes passées sur la boutique.</p>
<h2>Article 3 – Prix</h2>
<p>Les prix sont indiqués en euros toutes taxes comprises.</p>
<h2>Article 5 – Livraison</h2>
<p>Nous livrons en France et dans toute l'Union européenne.</p>`,
    ),

    [`${C}/confidentialite`]: shell(
      "Politique de confidentialité",
      `<h1>Politique de confidentialité</h1>
<p>Nous utilisons Crisp pour la messagerie instantanée.</p>
<p>Vos données ne sont jamais vendues.</p>`,
    ),
  },
};
