#!/usr/bin/env node
// Reports where design/Process.md and the implementation disagree.
//
// Not wired into `npm test` yet: it currently finds real divergence, and a
// gate that is red on arrival cannot be adopted. Run it, fix what it names,
// then make it a test.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), "utf-8");

// ---- claims -------------------------------------------------------------

// A claim is a numbered line under "## Behaviors". An anchor is the line
// under it, "→ <the exact title of the test that proves this>".
function claimsFrom(markdown) {
  const section = markdown.slice(markdown.indexOf("## Behaviors"));
  const lines = section.split("\n");
  const claims = [];
  lines.forEach((line, i) => {
    const m = /^(\d+)\.\s+(.+)$/.exec(line);
    if (!m) return;
    const anchor = /^\s+→\s+(.+?)\s*$/.exec(lines[i + 1] ?? "");
    claims.push({
      n: Number(m[1]),
      claim: m[2].replace(/`/g, ""),
      anchor: anchor ? anchor[1] : null,
    });
  });
  return claims;
}

// ---- test titles --------------------------------------------------------

function titlesFrom(files) {
  const titles = new Set();
  for (const file of files) {
    const src = read(file);
    for (const m of src.matchAll(/\btest\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      titles.add(m[1].replace(/\\"/g, '"'));
    }
  }
  return titles;
}

// ---- near-match hint ----------------------------------------------------

const STOP = new Set(["the","a","an","is","are","and","or","of","to","in","on",
  "it","its","that","this","with","for","as","be","not","no","by","from",
  "when","does","do","has","have","before","after","than","rather","was"]);
const bag = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

function nearest(text, titles) {
  const want = bag(text);
  let best = { score: 0, title: null };
  for (const title of titles) {
    const got = bag(title);
    let shared = 0;
    for (const w of want) if (got.has(w)) shared++;
    const score = shared / Math.max(1, want.size);
    if (score > best.score) best = { score, title };
  }
  return best;
}

// ---- structural invariants ---------------------------------------------

async function structural() {
  const pkg = JSON.parse(read("package.json"));
  const mod = await import(join(here, "index.js"));
  const surface = Object.getOwnPropertyNames(mod.Process.prototype)
    .filter((n) => n !== "constructor").sort();

  const design = read("design/Process.md");
  const block = design.slice(design.indexOf("## Class surface"));
  const declared = [...block.slice(0, block.indexOf("```", 20))
    .matchAll(/^\s*(?:get\s+)?(\w+)\s*\(/gm)].map((m) => m[1])
    .filter((n) => n !== "class" && n !== "constructor").sort();

  return [
    ["zero runtime dependencies",
      Object.keys(pkg.dependencies ?? {}).length === 0,
      `${Object.keys(pkg.dependencies ?? {}).length} found`],
    ["ES modules only", pkg.type === "module", `type=${pkg.type}`],
    ["POSIX only", JSON.stringify(pkg.os) === '["darwin","linux"]',
      JSON.stringify(pkg.os)],
    ["Node 22 or newer", /(>=\s*22|\^22|22\.)/.test(pkg.engines?.node ?? ""),
      pkg.engines?.node],
    ["documented class surface matches the class",
      declared.every((d) => surface.includes(d)),
      `documented but absent: ${declared.filter((d) => !surface.includes(d)).join(", ") || "none"}`],
  ];
}

// ---- report -------------------------------------------------------------

const claims = claimsFrom(read("design/Process.md"));
const titles = titlesFrom(["index.test.js", "readme.test.js"]);

const anchored = claims.filter((c) => c.anchor);
const broken = anchored.filter((c) => !titles.has(c.anchor));
const unanchored = claims.filter((c) => !c.anchor);

console.log(`design/Process.md — ${claims.length} claims, ${titles.size} tests\n`);

console.log(`ANCHORED   ${anchored.length - broken.length} resolve, ${broken.length} broken`);
for (const c of broken) {
  const hint = nearest(c.anchor, titles);
  console.log(`  ✖ #${c.n} ${c.claim}`);
  console.log(`      anchor: "${c.anchor}" — no test with that title`);
  if (hint.score > 0.4) console.log(`      did you mean: "${hint.title}"?`);
}

console.log(`\nUNANCHORED ${unanchored.length} claims name no test`);
const weak = [];
for (const c of unanchored) {
  const hint = nearest(c.claim, titles);
  if (hint.score < 0.34) weak.push({ c, hint });
}
console.log(`  of those, ${weak.length} have no plausible test at all:\n`);
for (const { c, hint } of weak) {
  console.log(`  ? #${c.n} ${c.claim.slice(0, 84)}`);
  console.log(`      closest: "${(hint.title ?? "none").slice(0, 72)}" (${(hint.score * 100).toFixed(0)}%)`);
}

console.log(`\nSTRUCTURAL`);
let bad = 0;
for (const [name, ok, detail] of await structural()) {
  console.log(`  ${ok ? "✔" : "✖"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) bad++;
}

console.log(`\nSUMMARY  ${broken.length} broken anchors, ${unanchored.length} unanchored claims, ${bad} structural failures`);
