#!/usr/bin/env node
// Run as a real child process so `interactive` has a real stdin to inherit.
// The test writes to this process's stdin and reads its stdout, so a round
// trip proves bytes actually reached the grandchild — asserting the config
// flag instead would pass even if the stdio wiring were wrong.
import { sh } from "./index.js";

try {
  // stdin is inherited, so `cat` reads what the test wrote here, and its
  // output is forwarded back out through this process's stdout.
  await sh({ input: process.stdin, output: process.stdout })`cat`;
} catch (error) {
  process.stderr.write(`[INTERACTIVE-INVOKER] ${error.message}\n`);
  process.exit(1);
}
