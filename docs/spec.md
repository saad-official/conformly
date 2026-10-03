# Conformly — product and technical spec

Status: approved design (shortlist approved 2026-10-03); database choice pending, see section 9. App 3 of the [Vibe Build Series](https://github.com/saad-official/vibe-build-series).

## 1. Problem

Four EU consumer-protection rules landed on online shops within fifteen months, and small merchants (including non-EU Shopify stores that ship to EU consumers) mostly do not know:

| Rule | Mandatory from | What it requires of a shop |
|------|----------------|----------------------------|
| Withdrawal function, Directive (EU) 2023/2673 | 19 Jun 2026 | An on-site "withdraw from the contract" function for distance contracts with a 14-day withdrawal right, reachable during the whole period, with a two-step confirmation and an automatic confirmation message. A PDF form or "email us" does not comply. |
| Empowering Consumers (green claims), Directive (EU) 2024/825 | 27 Sep 2026 | Ban on generic environmental claims ("eco-friendly", "green", "climate neutral") without recognised excellent performance, on offset-based carbon-neutral product claims, and on self-made sustainability labels. |
| European Accessibility Act | 28 Jun 2025 | Consumer e-commerce must meet EN 301 549 / WCAG 2.1 AA, publish an accessibility statement and offer a complaint channel (micro-enterprises exempt for services). |
| AI Act Article 50 | 2 Aug 2026 | People interacting with an AI system (a chatbot) must be told so, unless obvious. |

Plus two older duties that scanners rarely bundle: cookie consent where rejecting is as easy as accepting (national DPAs since 2022–2023), and the e-Commerce Directive legal notice (identity, address, email, registration and VAT details).

Enforcement is warning-letter led (Germany, France) and NGO complaints (Sweden, Netherlands), which hits small shops first. Accessibility-only scanners are crowded; nobody bundles the storefront rules. Conformly scans one URL and returns a pass/fail matrix with evidence, legal citations and copy-paste fixes, then re-scans monthly.

**Legal posture:** Conformly reports "issues found" with citations. It never says "compliant". Not legal advice.

## 2. Users and plans

- **Anonymous:** one free scan from the landing page (rate limited per IP), result page shareable by unguessable link, no account.
- **Free account:** 5 scans a month, history, one monitored site.
- **Pro (€19/month, Stripe test mode):** unlimited scans, 10 monitored sites, monthly re-scan with change alerts, PDF report, team notes.

## 3. Core flows

### 3.1 Scan
Input: a storefront URL. The crawler (server-side `fetch`, 10 s per page, 12 pages max, custom user agent, honours robots.txt, no JavaScript execution) collects:
- the homepage;
- up to 4 product pages (links matching /product, /products/, /p/, /item, /shop/ patterns or schema.org Product markup);
- cart and checkout entry pages if linked (/cart, /checkout, /basket, /panier, /warenkorb);
- legal pages by link text or URL in EN/DE/FR/IT/ES/NL (imprint/legal notice, terms, privacy, returns/withdrawal, accessibility statement, cookie policy);
- the account/order area link if present (for the withdrawal function).
Pages are stored as text (HTML stripped to a structured document: title, headings, links with text and href, buttons, forms, scripts' src, images with alt, meta tags, body text).

### 3.2 Checks (deterministic unless marked LLM)
Each check returns `status: pass | fail | warn | unknown`, `severity: high | medium | low`, `evidence[]` (page URL + quote), `citation`, `fix` (generic HTML and a Shopify note).

| Code | Check | Logic |
|------|-------|-------|
| `withdrawal_function` | On-site withdrawal function exists | Link/button whose text or href matches withdrawal vocabulary in EU languages on footer, legal, account or order pages; `fail` if none; `warn` if only a downloadable form or email instruction. |
| `withdrawal_policy` | Withdrawal policy page states 14 days | Policy page found and mentions 14 days / fourteen / 14 Tage / 14 jours. |
| `green_claims` (LLM) | Generic environmental claims | Keyword pre-filter (multilingual) selects sentences; the model classifies each as generic-unsubstantiated / specific-substantiated / not-environmental, with a suggested rewording. Only generic-unsubstantiated become findings. Offsets-based "carbon neutral" and self-made labels flagged by rule. |
| `accessibility_statement` | Statement and complaint channel | Link text matches accessibility vocabulary; the page contains statement language and an email/form; notes the micro-enterprise exemption. |
| `a11y_sample` | Sample technical checks | `lang` attribute, exactly one `h1`, images missing `alt`, inputs without labels, links with empty text. Clearly labelled as a sample, not a WCAG audit. |
| `ai_disclosure` | Chatbot disclosure | Detect chat widgets from script hosts (Intercom, Drift, Crisp, Tidio, Zendesk, Gorgias, HubSpot, Freshchat, LiveChat, Tawk, Shopify Inbox). If found, look for disclosure vocabulary (AI, automated, virtual assistant, chatbot) in the page or privacy page; `warn` when absent. |
| `cookie_parity` | Reject as easy as accept | Detect CMP; find accept-like and reject-like buttons in the banner markup; `warn` when accept exists without reject; `unknown` when the banner is injected by JavaScript. |
| `legal_notice` | Legal notice completeness | Imprint/legal page with postal address, email, and registration or VAT pattern (`DE123456789`, `FR`, `IT`, `NL`…). |
| `eu_targeting` | Informational | EUR prices, EU shipping, EU languages. Explains why the EU rules apply. |

A scan's `score` is informational only: high fails weigh 3, medium 2, low 1; shown as "N issues, M warnings", never as a percentage of compliance.

### 3.3 Report
Report page `/r/<public_id>`: summary strip, matrix by check, each finding with evidence quotes, citation and fix snippet, pages crawled, limitations box. PDF export (Pro) via `@react-pdf/renderer`. Owners can add notes and mark findings "fixed" or "not applicable" (with reason), which carries over to the next scan.

### 3.4 Monitor (Pro)
Monthly re-scan per monitored site (cron). Diff against the last scan: new findings, resolved findings, changed evidence. Alert email (demo provider: Outbox/Resend to owner). Dashboard shows sites, last scan, open issues, trend.

### 3.5 Billing and jobs
Stripe Checkout and Customer Portal (test mode). Cron: daily tick checks which monitors are due (every 30 days since last scan), runs up to N scans per tick. Scans run inside route handlers with `maxDuration = 300`.

## 4. Data model

```
organizations(id, name, slug, plan, stripe_customer_id, stripe_subscription_id, timezone, created_at)
memberships(org_id, user_id, role)
sites(id, org_id, url, hostname, platform_guess, monitor_enabled, monitor_interval_days, last_scan_id, created_at)
scans(id, org_id nullable (anonymous), site_id nullable, public_id, url, status: queued|running|done|failed,
      started_at, finished_at, pages_crawled, summary jsonb {issues, warnings, unknowns}, created_at)
scan_pages(id, scan_id, url, kind: home|product|cart|checkout|legal|account|other, status_code, title, text_excerpt, extracted jsonb)
findings(id, scan_id, check_code, status, severity, title, detail, evidence jsonb, citation, fix jsonb, llm_meta jsonb)
finding_notes(id, org_id, site_id, check_code, fingerprint, state: open|fixed|not_applicable, note, updated_by, updated_at)
alerts(id, org_id, site_id, scan_id, kind, payload jsonb, sent_at)
outbox(...), agent_events(...)  -- as the other apps
```
Anonymous scans have `org_id null` and are purged after 30 days.

## 5. Architecture

Next.js 16 App Router. `lib/crawl/*` (fetcher with robots and timeouts, HTML → document extraction via `cheerio`), `lib/checks/*` (one module per check, pure functions over the crawled documents; LLM only in green_claims via the shared AI factory), `lib/report/*` (summaries, PDF), `lib/services/*`, API routes for scan start/status, cron, Stripe webhook. Vitest fixtures: saved HTML of synthetic storefronts (compliant Shopify-like, German shop with imprint and Widerruf, a store with green claims and a chat widget) so every check is tested offline.

## 6. Design identity

Regulatory clarity without the "legal grey" look. Type: Söhne-like grotesk via "Manrope" (headings) + "Inter" (body) + "JetBrains Mono" (codes, citations). Palette: midnight `#101828`, chalk `#F7F7F5`, EU-adjacent indigo `#3538CD` as primary, signal red `#B42318` for fails, ochre `#B54708` for warnings, green `#067647` for passes, neutral `#667085`. Report pages use a document-like layout with a left matrix rail and findings as numbered sections; the landing page leads with the live scan form and a real example report.

## 7. Testing

Unit tests per check against fixture storefronts; crawler unit tests with mocked fetch (robots, redirects, timeouts, page caps); report summary math; snapshot tests of fix snippets. Playwright smoke for the anonymous scan flow.

## 8. Out of scope for v1

Full WCAG audits (axe needs a browser), JavaScript-rendered SPAs (reported as a limitation), non-EU regimes (UK DMCC flagged as "coming spring 2027"), legal review.

## 9. Database decision (pending)

Supabase Free allows 2 active projects per user; Dunnit and CertChase use them. Options:
1. **Neon Free (Postgres) + Drizzle + Better Auth** — separate database, zero cost, a deliberate stack variation worth learning; needs a Neon account sign-in.
2. **Shared schema in an existing Supabase project** — zero setup, but Conformly users would share Supabase Auth with that app.
3. **Pause Dunnit's Supabase project** while building — not acceptable, Dunnit is live.

Recommendation: option 1.
