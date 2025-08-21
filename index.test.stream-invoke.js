#!/usr/bin/env node
import { sh } from "./index.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEBUG = Boolean(process.env.DEBUG?.includes("test"));
const emitterPath = join(__dirname, "index.test.stream-emit.js");

try {
  await withStdioOverrides(async () => {
    await sh({ output: true, debug: true })`node "${emitterPath}"`;
  });
} catch (error) {
  console.error("[INVOKER] Error:", error);
  process.exit(1);
}

// TODO: turn this into an object with .on() and .off() methods
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
    const receivedTimestamp = Date.now();
    const lines = chunk.toString().split("\n").filter(line => line.trim());
    const parsedLines = lines.map(tryJSONParse).filter(Boolean);
    
    for (const object of parsedLines) {
      const withLatency = appendLatency(object, receivedTimestamp);
      const output = JSON.stringify(withLatency);
      stdoutWrite(`${output}\n`);
      if (DEBUG) stderrWrite(`DEBUG: ${output}\n`);
    }
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

function appendLatency(object, receivedTimestamp) {
  const { timestamp } = object;
  const emittedAt = new Date(timestamp).getTime();

  return {
    ...object,
    latency: receivedTimestamp - emittedAt,
  };
}

function tryJSONParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
