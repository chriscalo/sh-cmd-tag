import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { repoPathToUrl } from "./url.js";

const BASE = "https://chriscalo.github.io/sh-cmd-tag/";

describe("repoPathToUrl", () => {
  test("topic page drops the .md extension", () => {
    const actual = repoPathToUrl("guide/getting-started.md");
    const expected = `${BASE}guide/getting-started`;
    assert.equal(actual, expected);
  });

  test("index.md renders at the directory URL with a trailing slash", () => {
    const actual = repoPathToUrl("guide/index.md");
    const expected = `${BASE}guide/`;
    assert.equal(actual, expected);
  });

  test("the root index.md renders at the site root", () => {
    const actual = repoPathToUrl("index.md");
    const expected = BASE;
    assert.equal(actual, expected);
  });

  test("a #anchor is preserved", () => {
    const actual = repoPathToUrl("reference/sh.md#safe-mode");
    const expected = `${BASE}reference/sh#safe-mode`;
    assert.equal(actual, expected);
  });

  test("a ?query is preserved", () => {
    const actual = repoPathToUrl("reference/process.md?plain=1");
    const expected = `${BASE}reference/process?plain=1`;
    assert.equal(actual, expected);
  });

  test("a leading ./ is stripped", () => {
    const actual = repoPathToUrl("./guide/interpolation.md");
    const expected = `${BASE}guide/interpolation`;
    assert.equal(actual, expected);
  });

  test("a deeply nested topic page keeps its path", () => {
    const actual = repoPathToUrl("reference/errors/process-error.md");
    const expected = `${BASE}reference/errors/process-error`;
    assert.equal(actual, expected);
  });
});
