/**
 * (a) compliant-shop.example — English, Shopify-like. Withdrawal button in the
 * account area, 14-day policy, accessibility statement with complaint e-mail,
 * imprint with address + e-mail + KvK/VAT, Cookiebot banner with Accept and
 * Reject, no chat widget, no environmental claims. robots.txt blocks /cart and
 * /checkout (as Shopify does); an off-site Instagram link must be ignored.
 */
import { page, productJsonLd, type StorefrontFixture } from "./types";

const A = "https://compliant-shop.example";

const header = `<header>
  <a href="/">Compliant Shop</a>
  <nav>
    <a href="/products/linen-shirt">Linen shirt</a>
    <a href="/products/wool-scarf">Wool scarf</a>
    <a href="/cart">Cart</a>
    <a href="/checkout">Checkout</a>
    <a href="/account">My account</a>
  </nav>
</header>`;

const footer = `<footer>
  <a href="/pages/legal-notice">Legal notice</a>
  <a href="/policies/withdrawal">Right of withdrawal</a>
  <a href="/policies/privacy-policy">Privacy policy</a>
  <a href="/pages/accessibility">Accessibility statement</a>
  <a href="https://instagram.example/compliantshop">Instagram</a>
  <a href="mailto:info@compliant-shop.example">info@compliant-shop.example</a>
  <a href="tel:+31201234567">+31 20 123 4567</a>
  <a href="#top">Back to top</a>
</footer>
<div id="CybotCookiebotDialog" role="dialog" aria-label="Cookie consent">
  <p>We use cookies to measure visits and improve the shop.</p>
  <button type="button">Reject all</button>
  <button type="button">Customise</button>
  <button type="button">Accept all</button>
</div>`;

const scripts = `<script id="Cookiebot" src="https://consent.cookiebot.com/uc.js" data-cbid="5d1c0c38" async></script>
<script src="/assets/theme.js" defer></script>`;

const shell = (title: string, main: string, head = "") =>
  page({ lang: "en", title: `${title} – Compliant Shop`, head: `${head}${scripts}`, body: `${header}\n<main>\n${main}\n</main>\n${footer}` });

export const compliantShop: StorefrontFixture = {
  startUrl: "compliant-shop.example",
  routes: {
    [`${A}/robots.txt`]: "User-agent: *\nDisallow: /cart\nDisallow: /checkout\nDisallow: /admin\n",

    [`${A}/`]: shell(
      "Linen and wool basics",
      `<h1>Linen and wool basics</h1>
<p>Linen shirt €49.00. Wool scarf €35.00.</p>
<p>We ship to all EU countries within 3 working days.</p>
<img src="/media/linen-shirt.jpg" alt="White linen shirt on a hanger">
<form action="/contact#newsletter" method="post">
  <label for="newsletter-email">Email address</label>
  <input id="newsletter-email" type="email" name="email" autocomplete="email">
  <button type="submit">Subscribe</button>
</form>`,
    ),

    [`${A}/products/linen-shirt`]: shell(
      "Linen shirt",
      `<h1>Linen shirt</h1>
<img src="/media/linen-shirt.jpg" alt="White linen shirt on a hanger">
<p>Pre-washed linen for a soft feel. Regular fit, mother-of-pearl buttons.</p>
<p>€49.00</p>
<form action="/cart/add" method="post">
  <label for="size">Size</label>
  <select id="size" name="size"><option>S</option><option>M</option><option>L</option></select>
  <button type="submit">Add to cart</button>
</form>`,
      productJsonLd("Linen shirt", "49.00"),
    ),

    [`${A}/products/wool-scarf`]: shell(
      "Wool scarf",
      `<h1>Wool scarf</h1>
<img src="/media/wool-scarf.jpg" alt="Grey wool scarf, folded">
<p>Merino wool, 180 by 30 centimetres.</p>
<p>€35.00</p>
<form action="/cart/add" method="post"><button type="submit">Add to cart</button></form>`,
      productJsonLd("Wool scarf", "35.00"),
    ),

    [`${A}/account`]: shell(
      "My account",
      `<h1>My account</h1>
<h2>Orders</h2>
<p>Order 1001, delivered on 12 September 2026.</p>
<a class="button" href="/account/withdraw">Withdraw from contract here</a>`,
    ),

    [`${A}/pages/legal-notice`]: shell(
      "Legal notice",
      `<h1>Legal notice</h1>
<p>Compliant Shop B.V.<br>Keizersgracht 123<br>1015 CJ Amsterdam, Netherlands</p>
<p>Email: <a href="mailto:info@compliant-shop.example">info@compliant-shop.example</a></p>
<p>Chamber of Commerce (KvK): 12345678</p>
<p>VAT: NL123456789B01</p>`,
    ),

    [`${A}/policies/withdrawal`]: shell(
      "Right of withdrawal",
      `<h1>Right of withdrawal</h1>
<p>You have the right to withdraw from this contract within 14 days without giving any reason.</p>
<p>The withdrawal period will expire after 14 days from the day on which you acquire physical possession of the goods.</p>
<p>To exercise the right of withdrawal, use the "Withdraw from contract here" button in your account.</p>`,
    ),

    [`${A}/policies/privacy-policy`]: shell(
      "Privacy policy",
      `<h1>Privacy policy</h1>
<p>We process your name, address and order history to deliver your orders.</p>
<p>Statistics cookies are set only after you accept them in the cookie banner.</p>`,
    ),

    [`${A}/pages/accessibility`]: shell(
      "Accessibility statement",
      `<h1>Accessibility statement</h1>
<p>Compliant Shop aims to conform to WCAG 2.1 level AA (EN 301 549).</p>
<p>This shop is partially compliant: some older product videos have no captions.</p>
<p>Report accessibility barriers to <a href="mailto:accessibility@compliant-shop.example">accessibility@compliant-shop.example</a>.</p>`,
    ),
  },
};
