#!/usr/bin/env node

const Color = {
  RED: "\x1b[31m",
  GREEN: "\x1b[32m", 
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  CYAN: "\x1b[36m",
  RESET: "\x1b[0m",
};

try {
  console.log("[color-emit] Starting color output...");
  
  for (const [colorName, colorCode] of Object.entries(Color)) {
    if (colorName === "RESET") continue;
    console.log(`[color-emit] Emitting ${colorName}`);
    console.log(`${colorCode}stdout ${colorName} text${Color.RESET}`);
    console.error(`${colorCode}stderr ${colorName} text${Color.RESET}`);
  }
} catch (error) {
  console.error("[color-emit] Error:", error.message);
  process.exit(1);
}
