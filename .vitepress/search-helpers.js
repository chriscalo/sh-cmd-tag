// Headings we flatten into paragraphs at index time (see renderForIndex).
const COLLAPSED_HEADINGS = new Set(["h2", "h3", "h4"]);

// VitePress's local-search indexer starts a brand-new search entry at every
// H2–H4 heading, so a single page can show up as a handful of near-duplicate
// hits. We stop that by flattening those headings into ordinary paragraphs
// before the page is indexed — then the whole page indexes as one entry.
//
// We do the flattening on markdown-it's *token stream* rather than by
// find-and-replacing tags in the rendered HTML string. markdown-it first
// turns the markdown into a list of tokens (one per element — heading, list,
// paragraph, …) and then walks that list to produce HTML. `md.parse` hands
// us that list; we relabel each heading token's tag as "p"; `md.renderer`
// turns the adjusted list back into HTML. No HTML is ever parsed with a
// regex, and any attributes on a heading (like an anchor `id`) ride along
// untouched because we only change the tag name. This is the same
// token-level technique `skillLinkPlugin` uses in config.js.
export function renderForIndex(src, env, md) {
  const tokens = md.parse(src, env);
  for (const token of tokens) {
    const isHeading =
      token.type === "heading_open" || token.type === "heading_close";
    if (isHeading && COLLAPSED_HEADINGS.has(token.tag)) {
      token.tag = "p";
    }
  }
  return md.renderer.render(tokens, md.options, env);
}

// CRITICAL: `tokenize` and `processTerm` are handed to MiniSearch through
// `search.options.miniSearch.options`, and VitePress ships those to the browser
// by serializing each one with `Function.prototype.toString()` and rebuilding
// it on the client. Only the function's *own source* survives that round-trip —
// any reference to a module-scope helper, constant, or import becomes a
// ReferenceError the moment the rebuilt function runs in the browser. MiniSearch
// swallows that error and every query silently returns zero results (the bug
// fixed in #569). So both functions MUST be fully self-contained: inline every
// regex and every helper inside the function body, no outside references.
export function tokenize(text) {
  // Split at whitespace and the punctuation that separates words inside
  // identifiers, paths, and filenames: hyphens, underscores, dots, and
  // slashes. So `my-func` → ["my", "func"] and `scripts/skills.sh` →
  // ["scripts", "skills", "sh"]. Splitting on `.` and `/` is what lets a
  // query like `skills.sh` find a page that only mentions
  // `./scripts/skills.sh` — without it, the whole path indexes as one token
  // that a sub-path query can't prefix-match (the bug fixed in #581).
  const WORD_SEPARATORS = /[\s\-_./]+/;
  // camelCase boundaries: a lowercase letter or digit before an uppercase one
  // (`getHTTP` → ["get", "HTTP"]), and an uppercase letter before an
  // uppercase+lowercase pair (`HTTPResponse` → ["HTTP", "Response"]).
  const CAMELCASE_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;
  return text
    .split(WORD_SEPARATORS)
    .filter(Boolean)
    .flatMap((word) => {
      const parts = word.split(CAMELCASE_BOUNDARY).filter(Boolean);
      // Keep the original token alongside its parts so a whole-identifier query
      // like "httpresponse" still prefix-matches `HTTPResponse` in the index.
      return parts.length > 1 ? [...parts, word] : parts;
    });
}

export function processTerm(term) {
  return term.toLowerCase();
}
