/**
 * Language-agnostic text helpers shared by the crawler and the checks.
 *
 * Vocabulary terms are matched on a normalised form of both term and text:
 * NFKD with accents stripped, "ß" folded to "ss", typographic apostrophes
 * folded to "'", hyphens/underscores/dashes turned into spaces and whitespace
 * collapsed. Matching is lower-case unless `caseSensitive` is set (acronyms
 * such as "AI" or "KI" that collide with ordinary words when lower-cased).
 *
 * Term syntax: words separated by spaces match across any run of whitespace;
 * a word ending in `*` is a prefix ("widerruf*" matches "Widerrufsbelehrung").
 * Terms are anchored on letter/digit boundaries, so "eco" matches
 * "eco-friendly" but not "economy".
 */

const LETTER_OR_DIGIT = "[\\p{L}\\p{N}]";
const LEADING_BOUNDARY = `(?<!${LETTER_OR_DIGIT})`;
const TRAILING_BOUNDARY = `(?!${LETTER_OR_DIGIT})`;

export interface NormalizeOptions {
  keepCase?: boolean;
}

export function normalizeForMatch(input: string, options: NormalizeOptions = {}): string {
  const folded = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[-‐-―_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return options.keepCase ? folded : folded.toLowerCase();
}

export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function termPattern(normalizedTerm: string): string {
  const words = normalizedTerm.split(" ").filter((w) => w.length > 0);
  const body = words
    .map((word) => (word.endsWith("*") ? `${escapeRegExp(word.slice(0, -1))}${LETTER_OR_DIGIT}*` : escapeRegExp(word)))
    .join("\\s+");
  const last = words[words.length - 1] ?? "";
  return `${LEADING_BOUNDARY}${body}${last.endsWith("*") ? "" : TRAILING_BOUNDARY}`;
}

export interface CompileOptions {
  caseSensitive?: boolean;
}

export interface TermMatcher {
  /** True when any term occurs in `text`. */
  test(text: string): boolean;
  /** The first term in table order that occurs in `text`, or null. */
  find(text: string): string | null;
}

export function compileTerms(terms: readonly string[], options: CompileOptions = {}): TermMatcher {
  const normalizeOptions: NormalizeOptions = { keepCase: options.caseSensitive === true };
  const compiled = terms.map((term) => ({
    term,
    regex: new RegExp(termPattern(normalizeForMatch(term, normalizeOptions)), "u"),
  }));
  const find = (text: string): string | null => {
    const haystack = normalizeForMatch(text, normalizeOptions);
    for (const { term, regex } of compiled) {
      if (regex.test(haystack)) return term;
    }
    return null;
  };
  return { find, test: (text) => find(text) !== null };
}

const SENTENCE_BREAK = new RegExp("(?<=[.!?…])\\s+(?=[^\\p{Ll}])", "u");

/**
 * Sentences in reading order. Line breaks always end a sentence (extracted page
 * text keeps one "\n" per block boundary); within a line, ".", "!", "?" or "…"
 * followed by white space ends a sentence unless the next word starts lower-case.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    for (const part of line.split(SENTENCE_BREAK)) {
      const sentence = collapseWhitespace(part);
      if (sentence.length > 0) out.push(sentence);
    }
  }
  return out;
}

/** `text` cut to at most `max` characters on a word boundary, with "…" appended when cut. */
export function excerpt(text: string, max = 200): string {
  const clean = collapseWhitespace(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
