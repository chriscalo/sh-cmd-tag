import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  recursiveWatchSupported, touch, watchTargets,
} from "./dev.js";

test("recursive watch is requested only where Node supports it", () => {
  const actual = ["darwin", "win32", "linux", "freebsd"]
    .map(recursiveWatchSupported);
  const expected = [true, true, false, false];
  assert.deepEqual(actual, expected);
});

test("touch() updates the mtime of an existing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-touch-"));
  const file = join(dir, "config.js");
  writeFileSync(file, "export default {};\n");
  const mtimeBefore = statSync(file).mtimeMs;
  const past = new Date(Date.now() - 60_000);

  {
    const actual = touch(file, past);
    const expected = true;
    assert.equal(actual, expected);
  }

  {
    const actual = statSync(file).mtimeMs;
    const unexpected = mtimeBefore;
    assert.notEqual(actual, unexpected);
  }

  rmSync(dir, { recursive: true, force: true });
});

test("touch() reports failure instead of throwing for a missing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-touch-"));
  const missing = join(dir, "does-not-exist.js");

  const actual = touch(missing);
  const expected = false;
  assert.equal(actual, expected);

  rmSync(dir, { recursive: true, force: true });
});

test("watchTargets() watches one directory when recursion is available", () => {
  const root = makeNestedContentTree();

  const actual = watchTargets(root, { recursive: true });
  const expected = [root];
  assert.deepEqual(actual, expected);

  rmSync(root, { recursive: true, force: true });
});

test("watchTargets() enumerates nested dirs without recursion", () => {
  const root = makeNestedContentTree();

  const actual = watchTargets(root, { recursive: false }).sort();
  const expected = [
    root,
    join(root, "advanced"),
    join(root, "advanced", "deeper"),
  ].sort();
  assert.deepEqual(actual, expected);

  rmSync(root, { recursive: true, force: true });
});

test("watchTargets() returns nothing for a directory that is absent", () => {
  const parent = mkdtempSync(join(tmpdir(), "dev-watch-"));
  const missing = join(parent, "reference");

  const actual = watchTargets(missing, { recursive: false });
  const expected = [];
  assert.deepEqual(actual, expected);

  rmSync(parent, { recursive: true, force: true });
});

/**
 * Builds a content directory with nested subdirectories, the shape that a
 * non-recursive watcher would otherwise miss.
 * @returns {string} Path to the temporary root directory
 */
function makeNestedContentTree() {
  const root = mkdtempSync(join(tmpdir(), "dev-watch-"));
  mkdirSync(join(root, "advanced", "deeper"), { recursive: true });
  writeFileSync(join(root, "index.md"), "# Guide\n");
  writeFileSync(join(root, "advanced", "index.md"), "# Advanced\n");
  writeFileSync(join(root, "advanced", "deeper", "index.md"), "# Deeper\n");
  return root;
}
