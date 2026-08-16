#!/usr/bin/env node
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {import("node:path").ParsedPath} PathDescriptor */

export const DOCS_BASE = "https://chriscalo.github.io/sh-cmd-tag/";

/**
 * Translate a repo-relative markdown path into its absolute docs-site URL,
 * matching VitePress `base` + `cleanUrls` (drop `.md`; `SKILL.md`/`index.md`
 * render at the directory). Any `#anchor` or `?query` is preserved.
 *
 * @param {string} relPath e.g. `skills/git/worktrees.md`
 * @returns {string} absolute URL on the published docs site
 */
export function repoPathToUrl(relPath) {
  // new URL peels #anchor/?query into url.hash/url.search so the transforms
  // only see the path; url.href reassembles them afterward.
  const url = new URL(relPath, DOCS_BASE);
  url.pathname = transformPath(url.pathname);
  return url.href;
}

/**
 * Parse a pathname to a descriptor, run it through each transform, then format
 * back to a string.
 *
 * @type {(pathname: string) => string}
 */
const transformPath = pipe(
  parse,
  skillToDirectory,
  indexToDirectory,
  dropMarkdownExtension,
  format,
);

/**
 * @param {string} path
 * @returns {PathDescriptor}
 */
function parse(path) {
  return posix.parse(path);
}

/**
 * A `SKILL.md` file renders at its bare directory URL (trailing slash).
 *
 * @param {PathDescriptor} pathDescriptor
 * @returns {PathDescriptor}
 */
function skillToDirectory(pathDescriptor) {
  if (pathDescriptor.base === "SKILL.md") {
    return {
      ...pathDescriptor,
      base: "",
      name: "",
      ext: "",
    };
  } else {
    return pathDescriptor;
  }
}

/**
 * An `index.md` file renders at its bare directory URL (trailing slash).
 *
 * @param {PathDescriptor} pathDescriptor
 * @returns {PathDescriptor}
 */
function indexToDirectory(pathDescriptor) {
  if (pathDescriptor.base === "index.md") {
    return {
      ...pathDescriptor,
      base: "",
      name: "",
      ext: "",
    };
  } else {
    return pathDescriptor;
  }
}

/**
 * Every other `.md` page renders at its path without the extension.
 *
 * @param {PathDescriptor} pathDescriptor
 * @returns {PathDescriptor}
 */
function dropMarkdownExtension(pathDescriptor) {
  if (pathDescriptor.ext === ".md") {
    return {
      ...pathDescriptor,
      base: pathDescriptor.name,
    };
  } else {
    return pathDescriptor;
  }
}

/**
 * @param {PathDescriptor} pathDescriptor
 * @returns {string}
 */
function format(pathDescriptor) {
  return posix.format(pathDescriptor);
}

const [, scriptPath, input] = process.argv;
const __filename = fileURLToPath(import.meta.url);

if (scriptPath === __filename) {
  main(input);
}

/**
 * CLI entry: print the docs-site URL for the given repo-relative path.
 *
 * @param {string} input
 */
function main(input) {
  if (!input) {
    console.error(
      "Usage: node .vitepress/url.js <repo-relative-path.md>[#anchor]",
    );
    process.exit(1);
  }
  console.log(repoPathToUrl(input));
}

/**
 * Compose transforms left to right. Each receives the running value; a
 * transform that returns `undefined` leaves the value unchanged.
 *
 * @param {...(value: any) => any} transforms
 * @returns {(value: any) => any}
 */
function pipe(...transforms) {
  return function (value) {
    for (const transform of transforms) {
      const result = transform(value);
      if (result !== undefined) {
        value = result;
      }
    }
    return value;
  };
}
