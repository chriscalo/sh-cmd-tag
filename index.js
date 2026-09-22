import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough, Readable, Writable } from "node:stream";
import { finished } from "node:stream/promises";

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
  }
  
  return new Process(command, {
    ...options,
    shell: useShell,
    cwd: workingDir,
    input: inputData ?? options.input,
  });
}

// Add chainable properties using getters
function addChainableProps(fn, useShell, isSync, baseOptions = {}) {
  // Safe mode - don't throw on errors
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
  
  // Live mode - forward both streams without inheriting stdin. The gap
  // between a plain call, which captures silently, and .interactive, which
  // also hands the child the parent's keyboard.
  Object.defineProperty(fn, "live", {
    get() {
      const liveOptions = { ...baseOptions, output: true, debug: true };
      const liveFn = (strings, ...values) => {
        if (typeof strings === "object" && !Array.isArray(strings)) {
          const options = { ...strings, ...liveOptions };
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
        return executeCommand(strings, values, useShell, isSync, liveOptions);
      };
      addChainableProps(liveFn, useShell, isSync, liveOptions);
      return liveFn;
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
 * Resolves the shell the library runs commands through.
 *
 * Node's `shell: true` means `/bin/sh`, which is bash in POSIX mode on macOS
 * and dash on Debian, Ubuntu, and Alpine. Those differ in ways that are not
 * cosmetic, so the shell is chosen here rather than inherited, and the same
 * command means the same thing on every supported platform.
 */
function selectShell() {
  for (const candidate of ["/bin/bash", "/usr/bin/bash"]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return "/bin/sh";
}

const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/;
const DURATION_UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };

/**
 * Converts a duration to milliseconds.
 *
 * Numbers are already milliseconds, matching how Node expresses every
 * duration. Strings carry an explicit unit, because the whole point of the
 * string form is that the unit is visible at the call site.
 */
function toMilliseconds(value, key) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === Infinity) {
    return Infinity;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(`${key} must be a non-negative duration`);
    }
    return value;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${key} must be a number of milliseconds or a string`);
  }
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) {
    throw new TypeError(
      `${key}: "${value}" is not a duration. Use a number of milliseconds, ` +
      `or a string with a unit such as "30s".`
    );
  }
  return Number(match[1]) * DURATION_UNITS[match[2]];
}

/**
 * Builds the child environment, honouring the colour conventions.
 *
 * Exactly one variable is ever set. Precedence between them is
 * implementation-dependent, so setting both would make behaviour depend on
 * which tool the caller happened to run.
 */
function buildEnvironment(config) {
  const env = { ...process.env, ...config.env };
  delete env.FORCE_COLOR;
  delete env.NO_COLOR;
  if (config.color === true) {
    env.FORCE_COLOR = "1";
  } else if (config.color === false) {
    env.NO_COLOR = "1";
  } else {
    if ("FORCE_COLOR" in process.env) env.FORCE_COLOR = process.env.FORCE_COLOR;
    if ("NO_COLOR" in process.env) env.NO_COLOR = process.env.NO_COLOR;
  }
  return env;
}

/**
 * Recursively freezes an object so a running process's configuration cannot
 * be mutated from under it.
 */
function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  // Only plain objects and arrays are frozen. A caller may pass a live
  // object — a stream as `input`, an AbortSignal — and freezing that breaks
  // it: a frozen Readable cannot push to its own internal buffer.
  const proto = Object.getPrototypeOf(value);
  const isPlain = proto === Object.prototype || proto === null;
  if (!isPlain && !Array.isArray(value)) {
    return value;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/**
 * Process class that encapsulates child process execution with streaming
 * output and enhanced control capabilities.
 */
class Process {
  static #defaults = { immediate: true, shell: true };
  
  #commandString;
  #config;
  #childProcess;
  #io;
  #shell;
  #promise;
  #resolve;
  #reject;
  #settled = false;
  #timedOut = false;
  #timeoutTimer;
  #outputChunks = [];
  #debugChunks = [];
  #inheritedStdin = false;
  
  /**
   * Creates a new Process instance.
   * @param {string} commandString - The command to execute
   * @param {object} config - Configuration options
   */
  constructor(commandString, config = {}) {
    this.#commandString = commandString;
    this.#config = deepFreeze({ 
      ...Process.#defaults,
      ...config,
    });
    
    toMilliseconds(this.#config.timeout, "timeout");
    toMilliseconds(this.#config.gracePeriod, "gracePeriod");
    
    this.#shell = selectShell();
    
    const { promise, resolve, reject } = Promise.withResolvers();
    this.#promise = promise;
    this.#resolve = resolve;
    this.#reject = reject;
    // Nothing may observe a rejection until the caller awaits, so keep Node
    // from reporting it as unhandled in the meantime.
    promise.catch(() => {});
    
    // Created here, not in start(), so handlers and pipes can be attached
    // before anything runs. These are the same objects data flows through
    // once the child exists.
    this.#io = {
      output: new PassThrough(),
      debug: new PassThrough(),
      input: new PassThrough(),
    };
    
    if (this.config.immediate) {
      this.start();
    }
  }
  
  /**
   * Gets the command string for this process.
   * @returns {string} The command string
   */
  get command() {
    return Array.isArray(this.#commandString)
      ? this.#commandString.join(" ")
      : this.#commandString;
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
   * Gets the shell this process runs through, for introspection.
   * @returns {string} Path to the selected shell
   */
  get shell() {
    return this.#shell;
  }
  
  /**
   * Gets the stdout stream for this process.
   * @returns {PassThrough} The stdout stream
   */
  get output() {
    return this.#io.output;
  }
  
  /**
   * Gets the stderr stream for this process.
   * @returns {PassThrough} The stderr stream
   */
  get debug() {
    return this.#io.debug;
  }
  
  /**
   * Gets the stdin stream for this process.
   * @returns {PassThrough} The stdin stream
   */
  get input() {
    return this.#io.input;
  }
  
  /**
   * Starts the process, if it has not started already.
   *
   * Idempotent: `then()` and `pipe()` both start a deferred process on
   * demand, so ensure-start is a primitive the class needs regardless, and
   * with `immediate: true` as the default, already-started is the normal
   * state rather than a caller error.
   *
   * @returns {Process} This process, for chaining
   */
  start() {
    if (this.started) {
      return this;
    }
    this.#spawn();
    return this;
  }
  
  #spawn() {
    const useShell = this.#config.shell !== false;
    const parts = useShell
      ? null
      : (Array.isArray(this.#commandString)
        ? this.#commandString
        : parseCommand(this.#commandString.trim()));
    
    this.#childProcess = spawn(
      useShell ? this.#commandString : parts[0],
      useShell ? [] : parts.slice(1),
      {
        shell: useShell ? this.#shell : false,
        cwd: this.#config.cwd,
        env: buildEnvironment(this.#config),
        stdio: ["pipe", "pipe", "pipe"],
        // The child leads its own process group, so stopping it can reach
        // the whole tree. Without this, `sh`sleep 30`` stops the shell and
        // leaves sleep running — holding the output pipe open, so the
        // process does not even appear to have finished.
        detached: true,
      },
    );
    
    this.#bridgeStreams();
    this.#connectInput();
    this.#connectAbortSignal();
    this.#settleOn(this.#childProcess);
    this.#armTimeout();
  }
  
  #bridgeStreams() {
    const child = this.#childProcess;
    
    if (child.stdout) {
      child.stdout.pipe(this.#io.output);
      child.stdout.on("data", (chunk) => {
        this.#outputChunks.push(chunk);
        if (this.#config.output) {
          process.stdout.write(chunk);
        }
      });
    }
    if (child.stderr) {
      child.stderr.pipe(this.#io.debug);
      child.stderr.on("data", (chunk) => {
        this.#debugChunks.push(chunk);
        if (this.#config.debug) {
          process.stderr.write(chunk);
        }
      });
    }
    if (child.stdin) {
      this.#io.input.pipe(child.stdin);
    }
  }
  
  #connectAbortSignal() {
    const { signal } = this.#config;
    if (!signal) {
      return;
    }
    // An abort means now, everywhere else in the platform, so it maps to
    // kill() rather than the graceful stop().
    if (signal.aborted) {
      this.kill();
      return;
    }
    signal.addEventListener("abort", () => this.kill(), { once: true });
  }
  
  #connectInput() {
    const { input } = this.#config;
    if (input === undefined || input === null || input === false) {
      return;
    }
    if (input === true) {
      process.stdin.pipe(this.#io.input);
      this.#inheritedStdin = true;
      return;
    }
    if (typeof input === "string") {
      this.#io.input.end(input);
      return;
    }
    if (isStream(input)) {
      input.pipe(this.#io.input);
    }
  }
  
  #settleOn(child) {
    const finish = (error) => {
      if (this.#settled) return;
      this.#settled = true;
      clearTimeout(this.#timeoutTimer);
      
      // An inherited stdin holds the event loop open long after the child is
      // gone, so release it the moment the process settles.
      if (this.#inheritedStdin) {
        process.stdin.unpipe(this.#io.input);
        process.stdin.pause();
        this.#inheritedStdin = false;
      }
      
      const output = Buffer.concat(this.#outputChunks).toString();
      const debug = Buffer.concat(this.#debugChunks).toString();
      
      if (!error) {
        this.#resolve(new ProcessResult({ ok: true, output, debug }));
        return;
      }
      
      error.output = output;
      error.debug = debug;
      
      if (this.#config.throw === false) {
        this.#resolve(new ProcessResult({ ok: false, error, output, debug }));
      } else {
        this.#reject(error);
      }
    };
    
    child.on("error", (err) => {
      finish(new ProcessError({
        message: err.message,
        code: err.code,
        output: "",
        debug: "",
      }));
    });
    
    child.on("close", (code, signal) => {
      if (code === 0) {
        finish(null);
        return;
      }
      // stderr is appended when present, which is what makes a "command not
      // found" failure name the command that was not found.
      const trimmedDebug = Buffer.concat(this.#debugChunks).toString().trim();
      let message = this.#timedOut
        ? `Command timed out: ${this.#commandString}`
        : `Command failed with exit code ${code}`;
      if (!this.#timedOut && trimmedDebug) {
        message += `: ${trimmedDebug}`;
      }
      const error = new ProcessError({
        message,
        code: code === null ? 128 : code,
        output: "",
        debug: "",
      });
      if (this.#timedOut) {
        error.timedOut = true;
      }
      if (signal) {
        error.signal = signal;
      }
      finish(error);
    });
  }
  
  #armTimeout() {
    const timeout = toMilliseconds(this.#config.timeout, "timeout");
    if (timeout === undefined || timeout === Infinity) {
      return;
    }
    // The clock starts here, when the process starts, rather than at
    // construction: a deferred process could otherwise expire unrun.
    this.#timeoutTimer = setTimeout(() => {
      this.#timedOut = true;
      this.stop();
    }, timeout);
    this.#timeoutTimer.unref?.();
  }
  
  /**
   * Terminates the process politely, escalating to an unrefusable kill if it
   * does not exit within the grace period.
   *
   * @param {object} options - Optionally overrides `gracePeriod` for this call
   * @returns {Promise} Resolves once the process has exited
   */
  async stop(options = {}) {
    if (!this.started || this.#settled) {
      return;
    }
    const grace = toMilliseconds(
      options.gracePeriod ?? this.#config.gracePeriod ?? 5000,
      "gracePeriod",
    );
    
    this.#signalTree("SIGTERM");
    
    if (grace !== Infinity) {
      const timer = setTimeout(() => {
        if (!this.#settled) {
          this.#signalTree("SIGKILL");
        }
      }, grace);
      timer.unref?.();
    }
    
    await this.#promise.catch(() => {});
  }
  
  /**
   * Terminates the process immediately. Cannot be refused, and the process
   * gets no chance to clean up.
   *
   * @returns {Promise} Resolves once the process has exited
   */
  async kill() {
    if (!this.started || this.#settled) {
      return;
    }
    this.#signalTree("SIGKILL");
    await this.#promise.catch(() => {});
  }
  
  /**
   * Delivers the equivalent of Ctrl-C.
   *
   * @returns {Promise} Resolves once the process has exited
   */
  async interrupt() {
    if (!this.started || this.#settled) {
      return;
    }
    this.#signalTree("SIGINT");
    await this.#promise.catch(() => {});
  }
  
  /**
   * Signals the child's whole process group, falling back to the child
   * alone if the group is already gone.
   */
  #signalTree(signal) {
    try {
      process.kill(-this.#childProcess.pid, signal);
    } catch {
      try {
        this.#childProcess.kill(signal);
      } catch {}
    }
  }
  
  /**
   * Makes the process awaitable, starting it if it is still deferred.
   */
  then(onFulfilled, onRejected) {
    this.start();
    return this.#promise.then(onFulfilled, onRejected);
  }
  
  catch(onRejected) {
    return this.then(undefined, onRejected);
  }
  
  finally(onFinally) {
    return this.then(
      (value) => Promise.resolve(onFinally()).then(() => value),
      (reason) => Promise.resolve(onFinally()).then(() => Promise.reject(reason)),
    );
  }
  
  /**
   * A process is a source of its own output: iterating it yields stdout
   * chunks. Use `debug` for stderr; a failure throws an error already
   * carrying it.
   */
  async *[Symbol.asyncIterator]() {
    this.start();
    try {
      for await (const chunk of this.#io.output) {
        yield chunk;
      }
    } finally {
      // Abandoning the loop early must not leave the child running.
      if (!this.#settled) {
        await this.stop();
      }
    }
    // Iteration ends where the process ends, so a failure surfaces here
    // rather than the loop finishing quietly on partial output.
    await this.#promise;
  }
  
  /**
   * Pipes this process into the next stage, returning the pipeline so far.
   */
  pipe(...args) {
    return new Pipeline(this).pipe(...args);
  }
}

/**
 * Checks whether a function was invoked as a tagged template literal. A true
 * template tag call gets a `raw` property on its strings array.
 */
function isTemplateTagInvocation(args) {
  const [strings] = args;
  return Array.isArray(strings) && "raw" in strings;
}

/**
 * A pipeline of stages, each a process or a stream.
 *
 * `pipe()` returns this rather than the destination or the source, so the
 * return type never depends on the argument type: one value that is
 * awaitable when every stage has finished, iterable over the last stage, and
 * pipeable onward from it.
 */
class Pipeline {
  #stages = [];
  
  constructor(source) {
    this.#stages.push(source);
  }
  
  get #tail() {
    return this.#stages[this.#stages.length - 1];
  }
  
  get #tailOutput() {
    const tail = this.#tail;
    return tail instanceof Process ? tail.output : tail;
  }
  
  /**
   * Gets the processes in this pipeline, in order.
   */
  get stages() {
    return this.#stages.filter((stage) => stage instanceof Process);
  }
  
  pipe(...args) {
    const source = this.#tailOutput;
    const inherited = this.#inheritedConfig();
    let next;
    
    if (isTemplateTagInvocation(args)) {
      const [strings, ...values] = args;
      const command = inherited.shell === false
        ? buildCommandString(strings, values)
        : buildShellExpression(strings, values);
      next = new Process(command, inherited);
    } else if (Array.isArray(args[0])) {
      next = new Process(args[0], { ...inherited, shell: false });
    } else if (args[0] && typeof args[0].write === "function") {
      next = args[0];
    } else {
      throw new TypeError(
        "pipe() takes a command, as a template tag or an argv array, or a " +
        "writable stream",
      );
    }
    
    source.pipe(next instanceof Process ? next.input : next);
    this.#stages.push(next);
    return this;
  }
  
  #inheritedConfig() {
    const source = this.#stages[0];
    const { shell, cwd, env, color, throw: shouldThrow } = source.config ?? {};
    return { shell, cwd, env, color, throw: shouldThrow };
  }
  
  /**
   * Settles when every stage has finished. A pipeline is ok only if every
   * stage is ok: composing results conjoins them, and the first failure
   * short-circuits, carrying which stage failed.
   */
  async #settle() {
    const processes = this.stages;
    const results = await Promise.allSettled(processes.map((p) => p));
    const streamEnds = this.#stages
      .filter((stage) => !(stage instanceof Process))
      .map((stream) => finished(stream).catch((error) => { throw error; }));
    await Promise.allSettled(streamEnds);
    
    const failedIndex = results.findIndex((r) => r.status === "rejected");
    if (failedIndex !== -1) {
      const error = results[failedIndex].reason;
      error.stage = failedIndex;
      error.command = processes[failedIndex].command;
      throw error;
    }
    
    const settled = results.map((r) => r.value);
    const failedResult = settled.findIndex((r) => r && r.ok === false);
    if (failedResult !== -1) {
      return settled[failedResult];
    }
    return settled[settled.length - 1];
  }
  
  then(onFulfilled, onRejected) {
    return this.#settle().then(onFulfilled, onRejected);
  }
  
  catch(onRejected) {
    return this.then(undefined, onRejected);
  }
  
  finally(onFinally) {
    return this.then(
      (value) => Promise.resolve(onFinally()).then(() => value),
      (reason) => Promise.resolve(onFinally()).then(() => Promise.reject(reason)),
    );
  }
  
  async *[Symbol.asyncIterator]() {
    for await (const chunk of this.#tailOutput) {
      yield chunk;
    }
    await this.#settle();
  }
  
  /**
   * Stopping a pipeline stops every stage.
   */
  async stop(options) {
    await Promise.all(this.stages.map((p) => p.stop(options)));
  }
  
  async kill() {
    await Promise.all(this.stages.map((p) => p.kill()));
  }
  
  async interrupt() {
    await Promise.all(this.stages.map((p) => p.interrupt()));
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
