import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { recursiveWatchSupported, touch } from "./dev.js";

test("recursive watch is only requested on platforms that support it", () => {
  assert.equal(recursiveWatchSupported("darwin"), true);
  assert.equal(recursiveWatchSupported("win32"), true);
  assert.equal(recursiveWatchSupported("linux"), false);
  assert.equal(recursiveWatchSupported("freebsd"), false);
});

test("touch() updates the mtime of an existing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-touch-"));
  const file = join(dir, "config.js");
  writeFileSync(file, "export default {};\n");
  const past = new Date(Date.now() - 60_000);
  const before = statSync(file).mtimeMs;

  assert.equal(touch(file, past), true);
  assert.notEqual(statSync(file).mtimeMs, before);

  rmSync(dir, { recursive: true, force: true });
});

test("touch() reports failure instead of throwing for a missing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-touch-"));
  const missing = join(dir, "does-not-exist.js");

  assert.equal(touch(missing), false);

  rmSync(dir, { recursive: true, force: true });
});
