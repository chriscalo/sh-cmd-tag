#!/usr/bin/env node
import { sh } from "./index.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEBUG = Boolean(process.env.DEBUG?.includes("test"));
const emitterPath = join(__dirname, "index.test.color-emit.js");

try {
  await withStdioOverrides(async () => {
    await sh({ output: true, debug: true })`node "${emitterPath}" emit`;
  });
} catch (error) {
  console.error("[COLOR-INVOKER] Error:", error);
  process.exit(1);
}

async function withStdioOverrides(callback) {
  const originalProcess = global.process;
  const stdoutWrite = bindMethod(process.stdout, "write");
  const stderrWrite = bindMethod(process.stderr, "write");
  
  const write = createWriteInterceptor(stdoutWrite, stderrWrite);
  
  globalThis.process = createProxy(originalProcess, {
    stdout: {
      write,
    },
    stderr: {
      write,
    },
  });
  
  try {
    await callback();
  } finally {
    globalThis.process = originalProcess;
  }
}

function bindMethod(context, methodName) {
  const method = context[methodName];
  
  function boundMethod(...args) {
    return method.apply(context, args);
  }

  return Object.assign(boundMethod, {
    context,
    method,
  });
}

function createWriteInterceptor(stdoutWrite, stderrWrite) {
  return function write(chunk) {
    const output = chunk.toString();
    const colorAnalysis = analyzeColors(output);
    const result = JSON.stringify(colorAnalysis);
    
    stdoutWrite(`${result}\n`);
    if (DEBUG) stderrWrite(`DEBUG: ${result}\n`);
  };
}

function createProxy(target, overrides) {
  return new Proxy(target, {
    get(target, prop) {
      const value = target[prop];
      
      if (hasOverride(prop, value)) {
        return createOverrideObject(value, overrides[prop]);
      }
      
      return value;
    }
  });
  
  function hasOverride(prop, value) {
    return overrides[prop] && value && typeof value === "object";
  }
  
  function createOverrideObject(original, overrides) {
    return Object.assign(
      Object.create(Object.getPrototypeOf(original)), 
      original,
      overrides,
    );
  }
}

function analyzeColors(output) {
  const colorMap = {
    "\x1b[31m": "RED",
    "\x1b[32m": "GREEN", 
    "\x1b[33m": "YELLOW",
    "\x1b[34m": "BLUE",
    "\x1b[36m": "CYAN"
  };
  
  const foundColors = [];
  for (const [code, name] of Object.entries(colorMap)) {
    if (output.includes(code)) {
      foundColors.push(name);
    }
  }
  
  return {
    colors: foundColors,
    output: output,
    timestamp: new Date().toISOString()
  };
}