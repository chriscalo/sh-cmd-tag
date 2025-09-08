import { spawn, spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";

// Safe string infrastructure
const SHELL_SAFE = Symbol("shellSafe");

function markSafeString(str) {
  if (typeof str !== "string") {
    throw new Error("Only strings can be marked as shell-safe");
  }
  const safeStr = new String(str);
  safeStr[SHELL_SAFE] = true;
  return safeStr;
}

function isSafeString(str) {
  return (typeof str === "string" || str instanceof String) && 
    str[SHELL_SAFE] === true;
}

function shellEscape(value) {
  if ((typeof value === "string" || value instanceof String) && 
      isSafeString(value)) {
    return String(value); // Already safe, convert to primitive string
  }
  
  const str = String(value);
  if (str === "") {
    return "''";
  }
  
  // For strings with spaces or dangerous chars, wrap in single quotes
  // Single quotes prevent ALL shell interpretation (except for single quotes
  // themselves)
  if (/[\s$`"';|&\\]/.test(str)) {
    return `'${str.replaceAll("'", "'\\''")}'`;
  }
  
  // Safe strings with no spaces can be used as-is
  return str;
}

// ProcessResult class for successful command execution
class ProcessResult {
  constructor({ ok, error, output, debug }) {
    this.ok = ok;
    this.error = error;
    this.output = output;
    this.debug = debug;
  }
}

// ProcessError class for failed command execution
class ProcessError extends Error {
  constructor({ message, code, output, debug }) {
    super(message);
    this.name = "ProcessError";
    this.code = code;
    this.output = output;
    this.debug = debug;
  }
}

// Factory function to create execution tag functions
function makeExecTag(useShell, isSync = false) {
  return function execTag(strings, ...values) {
    // Handle configuration options passed as first argument
    let options = {};
    if (typeof strings === "object" && !Array.isArray(strings)) {
      options = strings;
      return function configuredExecTag(templateStrings, ...templateValues) {
        return executeCommand(
          templateStrings,
          templateValues,
          useShell,
          isSync,
          options,
        );
      };
    }
    
    return executeCommand(strings, values, useShell, isSync, options);
  };
}

// Get the directory of the file that called sh/cmd
function getCallerDirectory() {
  const originalPrepareStackTrace = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = (_, stack) => stack;
    const stack = new Error().stack;
    
    // Find the first stack frame that's not in process.js
    for (const frame of stack) {
      const filename = frame.getFileName();
      if (filename && !filename.endsWith("process.js") && 
          filename.startsWith("file:")) {
        return dirname(fileURLToPath(filename));
      }
    }
    
    // Fallback to process.cwd() if we can't detect the caller
    return process.cwd();
  } catch {
    return process.cwd();
  } finally {
    Error.prepareStackTrace = originalPrepareStackTrace;
  }
}


// Simple command parser that handles basic quoted arguments
function parseCommand(command) {
  const parts = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    
    if (!inQuotes && (char === `"` || char === `'`)) {
      inQuotes = true;
      quoteChar = char;
    } else if (inQuotes && char === quoteChar) {
      inQuotes = false;
      quoteChar = "";
    } else if (!inQuotes && /\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  
  if (current) {
    parts.push(current);
  }
  
  return parts;
}

// Helper function to check if something is a stream
function isStream(obj) {
  return obj && typeof obj.pipe === "function";
}

// Synchronous execution
function executeSyncCommand(cmd, args, spawnOptions, inputData, options) {
  try {
    const result = spawnSync(cmd, args, {
      ...spawnOptions,
      input: inputData,
      encoding: "utf8",
    });
    
    const output = result.stdout || "";
    const debug = result.stderr || "";
    
    if (result.error) {
      const error = new ProcessError({
        message: result.error.message,
        code: result.error.code,
        output,
        debug,
      });
      if (options.throw !== false) {
        throw error;
      }
      return new ProcessResult({ ok: false, error, output, debug });
    }
    
    if (result.status !== 0) {
      // Create a more informative error message
      let errorMessage = `Command failed with exit code ${result.status}`;
      if (debug && debug.trim()) {
        // Include stderr information in the error message for better
        // diagnostics
        errorMessage += `: ${debug.trim()}`;
      }
      
      const error = new ProcessError({
        message: errorMessage,
        code: result.status,
        output,
        debug,
      });
      if (options.throw !== false) {
        throw error;
      }
      return new ProcessResult({ ok: false, error, output, debug });
    }
    
    return new ProcessResult({ ok: true, error: undefined, output, debug });
  } catch (error) {
    if (error instanceof ProcessError) {
      throw error;
    }
    
    const processError = new ProcessError({
      message: error.message,
      code: error.code,
      output: "",
      debug: "",
    });
    if (options.throw !== false) {
      throw processError;
    }
    return new ProcessResult({ ok: false, error: processError, output: "", 
                               debug: "" });
  }
}

// Asynchronous execution
async function executeAsyncCommand(cmd, args, spawnOptions, inputData, 
                                   options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, spawnOptions);
    
    // Collect chunks as Buffers for proper streaming and final assembly
    const outputChunks = [];
    const debugChunks = [];
    
    // Handle stdout: pipe for live output + collect chunks for capture
    if (child.stdout) {
      if (options.output) {
        // Stream immediately for real-time output
        child.stdout.pipe(process.stdout);
      }
      child.stdout.on("data", (chunk) => {
        // Always collect chunks for final result
        outputChunks.push(chunk);
      });
    }
    
    // Handle stderr: pipe for live debug + collect chunks for capture  
    if (child.stderr) {
      if (options.debug) {
        // Stream immediately for real-time debug output
        child.stderr.pipe(process.stderr);
      }
      child.stderr.on("data", (chunk) => {
        // Always collect chunks for final result
        debugChunks.push(chunk);
      });
    }
    
    // Handle input
    if (inputData && child.stdin) {
      if (isStream(inputData)) {
        inputData.pipe(child.stdin);
      } else if (typeof inputData === "string") {
        child.stdin.write(inputData);
        // If interactive mode, keep stdin open for parent piping
        if (options.input !== true) {
          child.stdin.end();
        }
      }
    }
    
    // After writing data, if interactive mode is enabled, pipe parent stdin
    if (options.input === true && child.stdin) {
      process.stdin.pipe(child.stdin);
    }
    
    child.on("error", (error) => {
      // Assemble final output from chunks
      const output = Buffer.concat(outputChunks).toString("utf-8");
      const debug = Buffer.concat(debugChunks).toString("utf-8");
      
      const processError = new ProcessError({
        message: error.message,
        code: error.code,
        output,
        debug,
      });
      if (options.throw !== false) {
        reject(processError);
      } else {
        resolve(new ProcessResult(false, processError, output, debug));
      }
    });
    
    child.on("close", (code) => {
      // Assemble final output from chunks using Buffer.concat()
      const output = Buffer.concat(outputChunks).toString("utf-8");
      const debug = Buffer.concat(debugChunks).toString("utf-8");
      
      if (code === 0) {
        resolve(new ProcessResult({ ok: true, error: undefined, output, 
                                    debug }));
      } else {
        // Create a more informative error message
        let errorMessage = `Command failed with exit code ${code}`;
        if (debug && debug.trim()) {
          // Include stderr information in the error message for better
          // diagnostics
          errorMessage += `: ${debug.trim()}`;
        }
        
        const error = new ProcessError({
          message: errorMessage,
          code,
          output,
          debug,
        });
        if (options.throw !== false) {
          reject(error);
        } else {
          resolve(new ProcessResult({ ok: false, error, output, debug }));
        }
      }
    });
  });
}

function objectToCLIFlags(obj) {
  return toFlagDescriptors(obj)
    .filter(shouldIncludeFlag)
    .map(formatFlag)
    .join(" ");
}

function objectToShellSafeFlags(obj) {
  return toFlagDescriptors(obj)
    .filter(shouldIncludeFlag)
    .map(formatShellSafeFlag)
    .join(" ");
}

function formatShellSafeFlag({ name, value }) {
  name = formatFlagName(name); // This will throw for invalid flag names
  if (value === true) {
    return name;
  } else {
    value = formatShellSafeValue(value);
    return `${name}=${value}`;
  }
}

function formatShellSafeValue(value) {
  const valueStr = String(value);
  const specialChars = /[ "'$`\\\/]/;
  const needsQuotes = typeof value === "string" && specialChars.test(valueStr);
  
  if (needsQuotes) {
    return shellEscape(valueStr); // Escape dangerous values with single quotes
  } else {
    return valueStr; // Safe values don't need quotes
  }
}

function shouldIncludeFlag({ value }) {
  const exclusionValues = [false, null, undefined];
  return !exclusionValues.includes(value);
}

function formatFlag({ name, value }) {
  name = formatFlagName(name);
  if (value === true) {
    return name;
  } else {
    value = formatValueForShell(value);
    return `${name}=${value}`;
  }
}

function toFlagDescriptors(obj) {
  return Object.entries(obj).map(entriesToNameValueObjects);
  
  function entriesToNameValueObjects([name, value]) {
    return { name, value };
  }
}

function formatValueForShell(value) {
  const valueStr = String(value);
  const specialChars = /[ "\'$`\\\/]/;
  const needsQuotes = typeof value === "string" && specialChars.test(valueStr);
  
  if (needsQuotes) {
    return `"${valueStr}"`;
  } else {
    // Handles strings without special chars, numbers, booleans, etc.
    return valueStr;
  }
}

function formatFlagName(key) {
  const flagPattern = /^(?<dashes>-+)?(?<name>[a-zA-Z_][\w-]*)$/;
  const match = key.match(flagPattern);
  
  if (!match) {
    throw new Error(oneLine`
      Invalid flag name: "${key}". Flag names must contain only letters,
      numbers, underscores, and hyphens.
    `);
  }
  
  const { dashes = "--", name } = match.groups;
  return `${dashes}${name}`;
}



function oneLine(strings, ...values) {
  return strings
    .reduce((result, string, index) => {
      return result + string + (values[index] || "");
    }, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Convert array to space-separated arguments
function arrayToShellArgs(arr) {
  return arr
    .filter(hasValue)
    .map(item => shellEscape(String(item)))
    .join(" ");
}

function arrayToCommandArgs(arr) {
  return arr
    .filter(hasValue)
    .map(item => String(item))
    .join(" ");
}

function hasValue(item) {
  return item !== null && item !== undefined;
}


// Core execution function
function executeCommand(strings, values, useShell, isSync, options = {}) {
  const command = useShell 
    ? buildShellExpression(strings, values)
    : buildCommandString(strings, values);
    
  // Execute the command based on sync/async and shell mode
  return runCommand(command, useShell, isSync, options);
}

function buildShellExpression(strings, values) {
  let command = "";
  for (let i = 0; i < strings.length; i++) {
    command += strings[i];
    if (i < values.length) {
      // Determine the context for this interpolation
      const beforeValue = strings[i];
      const afterValue = i + 1 < strings.length ? strings[i + 1] : "";
      const context = getInterpolationContext(beforeValue, afterValue);
      
      const safeValue = valueToShellString(values[i], context);
      command += safeValue;
    }
  }
  return command;
}

// Determine the quoting context for an interpolated value
function getInterpolationContext(beforeValue, afterValue) {
  const before = beforeValue.trim();
  const after = afterValue.trim();
  
  // Check if we're inside double quotes
  const beforeDoubleQuotes = (before.match(/"/g) || []).length;
  const afterDoubleQuotes = (after.match(/"/g) || []).length;
  
  // Check if we're inside single quotes  
  const beforeSingleQuotes = (before.match(/'/g) || []).length;
  const afterSingleQuotes = (after.match(/'/g) || []).length;
  
  // If odd number of double quotes before and after, we're inside double quotes
  if (beforeDoubleQuotes % 2 === 1 && afterDoubleQuotes % 2 === 1) {
    return { type: "double-quoted" };
  }
  
  // If odd number of single quotes before and after, we're inside single quotes
  if (beforeSingleQuotes % 2 === 1 && afterSingleQuotes % 2 === 1) {
    return { type: "single-quoted" };
  }
  
  return { type: "unquoted" };
}

function valueToShellString(value, context = { type: "unquoted" }) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return objectToShellSafeFlags(value);
  } else if (Array.isArray(value)) {
    return arrayToShellArgs(value);
  } else {
    // Direct string interpolation - context-aware escaping
    if (isSafeString(value)) {
      return String(value); // Already safe
    } else {
      return templateEscape(String(value), context);
    }
  }
}

function templateEscape(str, context = { type: "unquoted" }) {
  if (str === "") {
    return "''";
  }
  
  if (context.type === "double-quoted") {
    // Inside double quotes, we need to escape $, `, \, and "
    // But we cannot use single quotes here - they'd be literal
    // Instead, escape the dangerous characters with backslashes
    return str.replace(/[$`"\\]/g, "\\$&");
  }
  
  if (context.type === "single-quoted") {
    // Inside single quotes, we need to handle single quotes specially
    // We CANNOT escape anything inside single quotes - they prevent ALL
    // interpretation. But if the value contains single quotes, we need to break
    // out, escape, and re-enter. Pattern: `before'\''after` where `'\''` is an
    // escaped single quote outside quotes
    return str.replaceAll("'", "'\\''");
  }
  
  // For unquoted context, use single quotes to prevent ALL shell interpretation
  if (/[\s$`"'\\;|&]/.test(str)) {
    return `'${str.replaceAll("'", "'\\''")}'`;
  }
  
  // Safe strings with no spaces can be used as-is
  return str;
}

function buildCommandString(strings, values) {
  let command = "";
  for (let i = 0; i < strings.length; i++) {
    command += strings[i];
    if (i < values.length) {
      const valueStr = valueToCommandString(values[i]);
      command += valueStr;
    }
  }
  return command;
}

function valueToCommandString(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return objectToCLIFlags(value);
  } else if (Array.isArray(value)) {
    return arrayToCommandArgs(value);
  } else {
    return String(value);
  }
}

function runCommand(command, useShell, isSync, options) {
  // Trim whitespace
  command = command.trim();
  
  // Handle empty commands
  if (!command) {
    const error = new ProcessError({
      message: "Command cannot be empty",
      code: "EMPTY_COMMAND",
      output: "",
      debug: "",
    });
    if (options.throw !== false) {
      throw error;
    }
    return new ProcessResult({ ok: false, error, output: "", debug: "" });
  }
  
  // Validate configuration
  if (isSync && options.input && isStream(options.input)) {
    throw new Error(
      "Configuration error: Streams are not supported in synchronous mode",
    );
  }
  
  if (isSync && options.input === true) {
    throw new Error(
      "Configuration error: Interactive input (input: true) is not " +
      "supported in synchronous mode",
    );
  }
  
  // Determine working directory
  const callerDir = getCallerDirectory();
  const workingDir = options.cwd ? options.cwd : callerDir;
  
  // Parse command for spawn
  let cmd, args;
  // Always use pipe to capture output, even in interactive mode
  const spawnOptions = {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    cwd: workingDir,
  };
  
  if (useShell) {
    // Use shell execution - pass the full command to spawn with shell: true
    cmd = command;
    args = [];
    spawnOptions.shell = true;
  } else {
    // Parse command for direct execution
    // Simple parsing that handles basic quoted arguments
    const parts = parseCommand(command.trim());
    cmd = parts[0];
    args = parts.slice(1);
    spawnOptions.shell = false;
  }
  
  // Handle input
  let inputData = null;
  if (options.input) {
    if (typeof options.input === "string") {
      inputData = options.input;
    } else if (isStream(options.input)) {
      inputData = options.input;
    }
  }
  
  if (isSync) {
    return executeSyncCommand(cmd, args, spawnOptions, inputData, options);
  } else {
    return executeAsyncCommand(cmd, args, spawnOptions, inputData, options);
  }
}

// Add chainable properties using getters
function addChainableProps(fn, useShell, isSync, baseOptions = {}) {
  // Safe mode - don"t throw on errors
  Object.defineProperty(fn, "safe", {
    get() {
      const safeFn = (strings, ...values) => {
        const mergedOptions = { ...baseOptions, throw: false };
        if (typeof strings === "object" && !Array.isArray(strings)) {
          const options = { ...strings, ...mergedOptions };
          return function(templateStrings, ...templateValues) {
            return executeCommand(
              templateStrings,
              templateValues,
              useShell,
              isSync,
              options,
            );
          };
        }
        return executeCommand(strings, values, useShell, isSync, mergedOptions);
      };
      addChainableProps(safeFn, useShell, isSync, 
                        { ...baseOptions, throw: false });
      return safeFn;
    },
    configurable: true,
  });
  
  // Interactive mode - alias for output + debug
  Object.defineProperty(fn, "interactive", {
    get() {
      const interactiveFn = (strings, ...values) => {
        const mergedOptions = {
          ...baseOptions,
          input: true,
          output: true,
          debug: true,
        };
        if (typeof strings === "object" && !Array.isArray(strings)) {
          const options = { ...strings, ...mergedOptions };
          return function(templateStrings, ...templateValues) {
            return executeCommand(
              templateStrings,
              templateValues,
              useShell,
              isSync,
              options,
            );
          };
        }
        return executeCommand(strings, values, useShell, isSync, mergedOptions);
      };
      addChainableProps(
        interactiveFn,
        useShell,
        isSync,
        { ...baseOptions, input: true, output: true, debug: true },
      );
      
      return interactiveFn;
    },
    configurable: true,
  });
  
  // Input method
  fn.input = (inputData) => {
    const inputFn = (strings, ...values) => {
      const mergedOptions = { ...baseOptions, input: inputData };
      if (typeof strings === "object" && !Array.isArray(strings)) {
        const options = { ...strings, ...mergedOptions };
        return function(templateStrings, ...templateValues) {
          return executeCommand(
            templateStrings,
            templateValues,
            useShell,
            isSync,
            options,
          );
        };
      }
      return executeCommand(strings, values, useShell, isSync, mergedOptions);
    };
    addChainableProps(inputFn, useShell, isSync, 
                      { ...baseOptions, input: inputData });
    return inputFn;
  };
  
  return fn;
}

// Create base execution functions
const shBase = makeExecTag(true, false);
const cmdBase = makeExecTag(false, false);
const shSyncBase = makeExecTag(true, true);
const cmdSyncBase = makeExecTag(false, true);

// Create the main export functions with chainable properties
const sh = addChainableProps(shBase, true, false);
const cmd = addChainableProps(cmdBase, false, false);

// Add sync variants
sh.sync = addChainableProps(shSyncBase, true, true);
cmd.sync = addChainableProps(cmdSyncBase, false, true);

/**
 * Process class that encapsulates child process execution with streaming
 * output and enhanced control capabilities.
 */
class Process {
  static #defaults = { immediate: true, shell: true };
  
  #commandString;
  #config;
  #childProcess;
  
  /**
   * Creates a new Process instance.
   * @param {string} commandString - The command to execute
   * @param {object} config - Configuration options
   */
  constructor(commandString, config = {}) {
    this.#commandString = commandString;
    this.#config = Object.freeze({ 
      ...Process.#defaults,
      ...config,
    });
    
    if (this.config.immediate) {
      this.start();
    }
  }
  
  /**
   * Gets the command string for this process.
   * @returns {string} The command string
   */
  get command() {
    return this.#commandString;
  }
  
  /**
   * Gets whether the process has been started.
   * @returns {boolean} True if process has started
   */
  get started() {
    return Boolean(this.#childProcess);
  }
  
  /**
   * Gets the configuration for this process.
   * @returns {object} The configuration object
   */
  get config() {
    return this.#config;
  }
  
  /**
   * Gets the stdout stream for this process.
   * @returns {ReadableStream | null} The stdout stream
   */
  get output() {
    return this.#childProcess?.stdout || null;
  }
  
  /**
   * Gets the stderr stream for this process.
   * @returns {ReadableStream | null} The stderr stream
   */
  get debug() {
    return this.#childProcess?.stderr || null;
  }
  
  /**
   * Gets the stdin stream for this process.
   * @returns {WritableStream | null} The stdin stream
   */
  get input() {
    return this.#childProcess?.stdin || null;
  }
  
  /**
   * Starts the process execution.
   */
  start() {
    if (this.started) {
      throw new Error(`Process "${this.command}" has already been started`);
    }
    this.#childProcess = {
      stdout: new Readable({ read() {} }),
      stderr: new Readable({ read() {} }),
      stdin: new Writable({ write() {} }),
    };
  }
}

export {
  sh,
  cmd,
  ProcessResult,
  ProcessError,
  markSafeString,
  isSafeString,
  shellEscape,
  Process,
};
