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
import { watch, utimesSync, existsSync } from "node:fs";
import process from "node:process";

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
 * @returns {{ child: import("node:child_process").ChildProcess, watchers: import("node:fs").FSWatcher[] }}
 */
function startDevServer() {
  // Spawn with an argument array (no shell) so nothing is re-parsed or
  // re-quoted by a shell. On Windows, `npx` is a .cmd shim, so spawn needs the
  // explicit extension.
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(npx, ["vitepress", "dev", "."], { stdio: "inherit" });

  const recursive = recursiveWatchSupported();
  if (!recursive) {
    console.log(
      `[dev] recursive watching is unavailable on ${process.platform}; ` +
      `watching only the top level of ${WATCH_DIRS.join(", ")}`,
    );
  }

  const watchers = WATCH_DIRS
    .filter((dir) => existsSync(dir))
    .map((dir) =>
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
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
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
