import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { repoPathToUrl, DOCS_BASE } from "./url.js";
import { generateNav, indexedPages } from "./nav.js";

// Strip the docs-site origin + base path so a repo path maps to the same
// site-root-relative link the nav emits (`/guide/getting-started`). Using
// `repoPathToUrl` (covered by url.test.js) as an independent oracle means this
// test cross-checks the nav's link format rather than trusting it.
const BASE_PATH = new URL(DOCS_BASE).pathname.replace(/\/$/, "");

function navLink(repoPath) {
  return new URL(repoPathToUrl(repoPath)).pathname.slice(BASE_PATH.length);
}

function allNavLinks() {
  const { nav, sidebar } = generateNav();
  const links = new Set();
  for (const entry of nav) {
    if (entry.link) links.add(entry.link);
  }
  for (const groups of Object.values(sidebar)) {
    for (const group of groups) {
      if (group.link) links.add(group.link);
      for (const item of group.items ?? []) {
        if (item.link) links.add(item.link);
      }
    }
  }
  return links;
}

// The nav must cover the indexed-page set: every indexed page is reachable from
// the generated nav or sidebar, and the nav surfaces nothing outside that set
// (so an artifact file or a `code-only` wrapper can never leak into the nav).
describe("generateNav matches the indexed-page set", () => {
  const expected = new Set(indexedPages().map(navLink));
  const actual = allNavLinks();

  test("the nav links every indexed page (coverage)", () => {
    const missing = [...expected].filter(link => !actual.has(link)).sort();
    assert.deepEqual(
      missing,
      [],
      `the nav is missing links for indexed pages:\n${missing.join("\n")}`,
    );
  });

  test("the nav links nothing outside the indexed set (no artifacts)", () => {
    const strays = [...actual].filter(link => !expected.has(link)).sort();
    assert.deepEqual(
      strays,
      [],
      `the nav links pages that are not indexed:\n${strays.join("\n")}`,
    );
  });
});
