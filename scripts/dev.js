#!/usr/bin/env node
/**
 * =============================================================================
 * dev.js — VitePress dev server with nav hot-reload
 * =============================================================================
 *
 * DESCRIPTION
 *   Starts the VitePress development server and watches the documentation
 *   content directories (guide/, reference/). When a content file changes, it
 *   touches the VitePress config file, which makes VitePress regenerate the
 *   nav and sidebar so new or removed pages show up without a restart.
 *
 * USAGE
 *   node scripts/dev.js
 *   # Or via npm:
 *   npm run docs:dev
 *
 * BEHAVIOR
 *   - Spawns the VitePress dev server as a child process (no shell)
 *   - Watches guide/ and reference/ for file changes, recursively where the
 *     platform supports it (macOS and Windows only)
 *   - On change, touches .vitepress/config.js to trigger nav regeneration
 *   - Handles SIGINT (Ctrl+C) gracefully, cleaning up watchers and the child
 *
 * REQUIREMENTS
 *   - Node.js with ES modules support
 *   - VitePress installed in the project
 *
 * =============================================================================
 */
import { spawn } from "node:child_process";
import { readdirSync, watch, utimesSync, existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** Path to VitePress config file — touched to trigger hot reload */
const CONFIG_PATH = ".vitepress/config.js";

/** Content directories whose changes should regenerate the nav */
const WATCH_DIRS = ["guide", "reference"];

/**
 * Whether `fs.watch(..., { recursive: true })` is supported on a platform.
 * Node only implements recursive watching on macOS and Windows; asking for it
 * on Linux throws ERR_FEATURE_UNAVAILABLE_ON_PLATFORM at runtime.
 * @param {string} platform - A `process.platform` value
 * @returns {boolean} True when recursive watching is available
 */
export function recursiveWatchSupported(platform = process.platform) {
  return platform === "darwin" || platform === "win32";
}

/**
 * The directories to hand to `fs.watch()` in order to cover `dir` and
 * everything under it. With recursive watching that is just `dir`; without it,
 * every nested subdirectory needs its own watcher, or edits inside a nested
 * section (`guide/advanced/`) never reach the top-level watcher and the nav
 * goes stale until the server restarts.
 * @param {string} dir - Content directory to cover
 * @param {object} options - `{ recursive }`, as passed to `fs.watch()`
 * @returns {string[]} Directories to watch; empty when `dir` does not exist
 */
export function watchTargets(dir, { recursive }) {
  if (!existsSync(dir)) {
    return [];
  }
  if (recursive) {
    return [dir];
  }
  const nested = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => watchTargets(join(dir, entry.name), { recursive }));
  return [dir, ...nested];
}

/**
 * Updates a file's timestamps, without throwing when it is missing.
 * The config file can be renamed or deleted mid-session; a dev server should
 * report that and keep running rather than crash.
 * @param {string} path - File to touch
 * @param {Date} time - Timestamp to apply
 * @returns {boolean} True when the file existed and was touched
 */
export function touch(path, time = new Date()) {
  if (!existsSync(path)) {
    return false;
  }
  utimesSync(path, time, time);
  return true;
}

/**
 * Starts the VitePress dev server and the content watchers.
 * @returns {object} The spawned `child` process and its `watchers`
 */
function startDevServer() {
  // Spawn with an argument array (no shell) so nothing is re-parsed or
  // re-quoted by a shell. On Windows, `npx` is a .cmd shim, so spawn needs the
  // explicit extension.
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(npx, ["vitepress", "dev", "."], { stdio: "inherit" });

  // Where recursion is unavailable, cover the tree by watching each nested
  // directory directly. Directories added during the session are picked up on
  // the next restart, which the config touch triggers anyway.
  const recursive = recursiveWatchSupported();
  const targets = WATCH_DIRS.flatMap((dir) => watchTargets(dir, { recursive }));
  if (!recursive) {
    console.log(
      `[dev] recursive watching is unavailable on ${process.platform}; ` +
      `watching ${targets.length} directories individually`,
    );
  }

  const watchers = targets.map((dir) =>
    watch(dir, { recursive }, (event, filename) => {
      if (touch(CONFIG_PATH)) {
        console.log(`\n[dev] ${event}: ${dir}/${filename} — reloading nav\n`);
      } else {
        console.warn(
          `\n[dev] ${event}: ${dir}/${filename} — cannot reload nav: ` +
          `${CONFIG_PATH} not found\n`,
        );
      }
    }),
  );

  return { child, watchers };
}

// Only run the server when executed directly, so tests can import the helpers.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const { child, watchers } = startDevServer();

  /**
   * Handle graceful shutdown on Ctrl+C: close the watchers and terminate the
   * VitePress child process before exiting cleanly.
   */
  process.on("SIGINT", () => {
    for (const watcher of watchers) watcher.close();
    child.kill();
    process.exit(0);
  });
}
