/**
 * (d) spa-store.example — a client-rendered shop: every page is an empty
 * <div id="root"> plus eight script bundles (one loads Intercom) and a small
 * static footer. Without JavaScript nothing can be verified, so the checks
 * must answer `unknown` rather than `fail`.
 */
import type { StorefrontFixture } from "./types";
import { page } from "./types";

const D = "https://spa-store.example";

const bundles = [
  "/static/js/runtime.4f1c.js",
  "/static/js/vendor.91aa.js",
  "/static/js/react.0b2e.js",
  "/static/js/router.77d0.js",
  "/static/js/store.5c3f.js",
  "/static/js/i18n.e21a.js",
  "/static/js/main.c0de.js",
]
  .map((src) => `<script src="${src}" defer></script>`)
  .join("\n");

const intercom = `<script>window.intercomSettings={app_id:"spa123"};(function(){var s=document.createElement("script");s.src="https://widget.intercom.io/widget/spa123";document.body.appendChild(s);})();</script>`;

const shell = (title: string) =>
  page({
    lang: "en",
    title: `${title} | SPA Store`,
    head: bundles,
    body: `<div id="root"></div>
<footer class="static-footer">
  <a href="/products/aurora-lamp">Aurora lamp</a>
  <a href="/cart">Cart</a>
  <a href="/pages/legal-notice">Legal notice</a>
  <a href="/pages/privacy">Privacy</a>
</footer>
${intercom}`,
  });

export const spaStore: StorefrontFixture = {
  startUrl: "spa-store.example",
  routes: {
    [`${D}/robots.txt`]: "User-agent: *\nDisallow:\n",
    [`${D}/`]: shell("Home"),
    [`${D}/products/aurora-lamp`]: shell("Aurora lamp"),
    [`${D}/cart`]: shell("Cart"),
    [`${D}/pages/legal-notice`]: shell("Legal notice"),
    [`${D}/pages/privacy`]: shell("Privacy"),
  },
};
