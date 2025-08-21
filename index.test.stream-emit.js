#!/usr/bin/env node

/**
 * @fileoverview Test utility for simulating streaming output from a process.
 * This script simulates a streaming process that emits numbered events to both
 * stdout and stderr with timestamps and delays.
 */

// Time in milliseconds between streaming output events
const INTERVAL = 200;

try {
  console.log("[stream-emit] Starting...");
  const counter = [1, 2, 3, 4, 5];
  const { length } = counter;
  
  for (const i of counter.values()) {
    console.log(`[stream-emit] Emitting event ${i}`);
    console.log(makeLogEvent({ message: `stdout: ${i} of ${length}` }));
    console.error(makeLogEvent({ message: `stderr: ${i} of ${length}` }));
    await delay(INTERVAL);
  }
} catch (error) {
  console.error("[stream-emit] Error:", error);
  process.exit(1);
}

function makeLogEvent(data = {}) {
  return JSON.stringify({
    ...data,
    timestamp: now(),
  });
}

function now() {
  return new Date().toISOString();
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
