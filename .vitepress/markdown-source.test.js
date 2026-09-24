import { test } from "node:test";
import { strict as assert } from "node:assert";

import { encodeBase64Utf8, decodeBase64Utf8 } from "./markdown-source.js";

test("round-trips ASCII text", () => {
  const expected = "# Guide\n\nRun `sh` commands.\n";
  const actual = decodeBase64Utf8(encodeBase64Utf8(expected));
  assert.equal(actual, expected);
});

test("round-trips the non-ASCII punctuation used across these docs", () => {
  const expected = "Awaiting `sh` buffers output — all of it… “really”.";
  const actual = decodeBase64Utf8(encodeBase64Utf8(expected));
  assert.equal(actual, expected);
});

test("round-trips characters outside the basic multilingual plane", () => {
  const expected = "Build passed \u{1F389} 日本語";
  const actual = decodeBase64Utf8(encodeBase64Utf8(expected));
  assert.equal(actual, expected);
});

test("decodes base64 produced by Node's Buffer", () => {
  const expected = "an em dash — and an ellipsis…";
  const base64 = Buffer.from(expected, "utf-8").toString("base64");
  const actual = decodeBase64Utf8(base64);
  assert.equal(actual, expected);
});
