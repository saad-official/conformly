/** Shared links and class strings for the public marketing pages. */

export const links = {
  home: "/",
  scan: "/#scan",
  checks: "/#checks",
  pricing: "/pricing",
  privacy: "/privacy",
  terms: "/terms",
  signIn: "/sign-in",
  repo: "https://github.com/saad-official/conformly",
  series: "https://github.com/saad-official/vibe-build-series",
  /** Form target for the anonymous scan. The route handler is built separately. */
  scanAction: "/api/scan",
} as const;

/** Page container: 16px gutters on phones, wider on large screens. */
export const container = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

/** Visible, solid focus outline for every interactive element on these pages. */
export const focusRing =
  "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-primary";

export const textLink =
  "font-medium text-primary underline decoration-primary/40 underline-offset-[3px] hover:decoration-primary " +
  focusRing;

/** Secondary text colour. `text-muted-foreground` sits just under 4.5:1 on chalk, so this is used instead. */
export const quiet = "text-foreground/72";
