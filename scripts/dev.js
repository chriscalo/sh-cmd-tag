#!/usr/bin/env node
/**
 * =============================================================================
 * dev.js — Development server with hot-reload for skills documentation
 * =============================================================================
 *
 * DESCRIPTION
 *   Starts the VitePress development server and watches for changes in the
 *   skills/ directory. When skill files change, it triggers a VitePress
 *   reload by touching the config file, which causes the sidebar to update.
 *
 * USAGE
 *   node scripts/dev.js
 *   # Or via npm:
 *   npm run dev
 *
 * BEHAVIOR
 *   - Spawns VitePress dev server as a child process
 *   - Watches skills/ directory recursively for any file changes
 *   - On change, touches .vitepress/config.js to trigger sidebar regeneration
 *   - Handles SIGINT (Ctrl+C) gracefully, cleaning up watchers and child process
 *
 * REQUIREMENTS
 *   - Node.js with ES modules support
 *   - VitePress installed in the project
 *
 * =============================================================================
 */
import { spawn } from "child_process";
import { watch, utimesSync, existsSync } from "fs";

/** Path to VitePress config file — touched to trigger hot reload */
const CONFIG_PATH = ".vitepress/config.js";

/**
 * Start VitePress development server.
 * - Uses npx to run vitepress from node_modules
 * - Inherits stdio so output appears in the current terminal
 * - Runs in shell mode for cross-platform compatibility
 */
const vitepress = spawn("npx vitepress dev .", {
  stdio: "inherit",
  shell: true,
});

/**
 * Watch the content directories for file changes.
 * When any markdown file changes (add, modify, delete), we "touch" the
 * VitePress config file, which triggers VitePress to regenerate the nav and
 * sidebar with any new or removed pages.
 */
const WATCH_DIRS = ["guide", "reference"];
const watchers = WATCH_DIRS
  .filter((dir) => existsSync(dir))
  .map((dir) =>
    watch(dir, { recursive: true }, (event, filename) => {
      const now = new Date();
      utimesSync(CONFIG_PATH, now, now);
      console.log(`\n[dev] ${event}: ${dir}/${filename} — reloading nav\n`);
    }),
  );

/**
 * Handle graceful shutdown on Ctrl+C.
 * Closes the file watchers and terminates the VitePress child process
 * before exiting cleanly.
 */
process.on("SIGINT", () => {
  for (const watcher of watchers) watcher.close();
  vitepress.kill();
  process.exit(0);
});
