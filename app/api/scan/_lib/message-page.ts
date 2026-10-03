/**
 * Small standalone HTML page for the scan route's non-redirect answers to
 * the landing form (over the limit, bad URL). Route handlers do not render
 * the app's layout, so this carries its own minimal styles in the brand
 * colours (docs/spec.md section 6).
 */

const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export type MessageAction = { href: string; label: string; primary?: boolean };

export function messagePage(input: { title: string; message: string; actions: MessageAction[] }): string {
  const actions = input.actions
    .map((a) => `<a class="${a.primary ? "btn primary" : "btn"}" href="${escapeHtml(a.href)}">${escapeHtml(a.label)}</a>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(input.title)} · Conformly</title>
<style>
  :root { color-scheme: light dark; --fg: #101828; --bg: #F7F7F5; --card: #fff; --primary: #3538CD; --muted: #475467; --line: rgba(16,24,40,.15); }
  @media (prefers-color-scheme: dark) { :root { --fg: #F2F2EF; --bg: #111827; --card: #1A2233; --primary: #9EA0FF; --muted: #B0B7C3; --line: rgba(255,255,255,.12); } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--fg);
    font: 16px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: 100%; max-width: 34rem; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 28px 24px; }
  .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: var(--fg); text-decoration: none; }
  .brand::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--primary); }
  h1 { font-size: 1.5rem; line-height: 1.25; letter-spacing: -0.02em; margin: 20px 0 8px; }
  p { margin: 0; color: var(--muted); }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
  .btn { display: inline-flex; align-items: center; height: 40px; padding: 0 16px; border-radius: 6px; border: 1px solid var(--line);
    color: var(--fg); text-decoration: none; font-weight: 600; font-size: .95rem; }
  .btn.primary { background: var(--primary); border-color: var(--primary); color: #fff; }
  @media (prefers-color-scheme: dark) { .btn.primary { color: #12133A; } }
  a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
</style>
</head>
<body>
<main>
  <a class="brand" href="/">Conformly</a>
  <h1>${escapeHtml(input.title)}</h1>
  <p>${escapeHtml(input.message)}</p>
  <div class="actions">${actions}</div>
</main>
</body>
</html>`;
}
