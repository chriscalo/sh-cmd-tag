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
  // Outside the try on purpose. A configuration error is not the command
  // failing, and the catch below turns anything it sees into a
  // ProcessError — which `throw: false` then hands back as a result, so
  // `sh.sync.safe({ timeout: "30" })` reported a typo as a failed command
  // and swallowed it. The asynchronous path throws these at the call site;
  // this is the same promise kept the same way.
  //
  // A blocking call has no moment in which to wait politely and then
  // escalate, so the deadline is enforced with an unrefusable kill: the
  // promise is the same as the asynchronous form — the deadline holds and
  // the failure is labelled — while the mechanism differs because the mode
  // does. gracePeriod is meaningless here and is ignored.
  const timeout = toMilliseconds(options.timeout, "timeout");
  const limit = captureLimit(options.capture);

  try {
    const result = spawnSync(cmd, args, {
      ...spawnOptions,
      input: inputData,
      encoding: "utf8",
      // spawnSync defaults to a 1MB buffer and kills the child with ENOBUFS
      // on the byte after it, so `sh.sync`cat big.txt`` failed on any output
      // past a megabyte — whatever `capture` said, including the default.
      // The ceiling is what a string can hold, which is the same net the
      // asynchronous path uses; `capture` then decides what the result
      // keeps, and can only be honoured if the bytes arrived at all.
      maxBuffer: MAX_CAPTURE_BYTES,
      ...(timeout !== undefined && timeout !== Infinity
        ? { timeout, killSignal: "SIGKILL" }
        : {}),
    });
    
    // Only spawnSync's own ETIMEDOUT says the deadline expired. The signal
    // cannot: a child that kills itself exits with exactly the same
    // SIGKILL, and would otherwise be reported as having timed out.
    const timedOut = result.error?.code === "ETIMEDOUT";
    
    const capturedOutput = limitCapture(result.stdout || "", limit);
    const capturedDebug = limitCapture(result.stderr || "", limit);
    const output = capturedOutput.text;
    const debug = capturedDebug.text;
    const truncated = capturedOutput.truncated || capturedDebug.truncated;

    if (result.error || timedOut) {
      const error = new ProcessError({
        message: timedOut
          ? `Command timed out: ${cmd}`
          : result.error.message,
        code: timedOut ? (result.status ?? "ETIMEDOUT") : result.error.code,
        output,
        debug,
      });
      if (timedOut) {
        error.timedOut = true;
      }
      if (truncated) {
        error.truncated = true;
      }
      if (options.throw !== false) {
        throw error;
      }
      return withTruncation(
        new ProcessResult({ ok: false, error, output, debug }), truncated);
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
      if (truncated) {
        error.truncated = true;
      }
      if (options.throw !== false) {
        throw error;
      }
      return withTruncation(
        new ProcessResult({ ok: false, error, output, debug }), truncated);
    }
    
    return withTruncation(
      new ProcessResult({ ok: true, error: undefined, output, debug }),
      truncated);
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

function withTruncation(result, truncated) {
  if (truncated) {
    result.truncated = true;
  }
  return result;
}

// Asynchronous execution

/**
 * The same flags as separate arguments, unquoted.
 *
 * `cmd` hands its arguments to the child directly, so there is no shell to
 * quote for. Quoting anyway would put the quote characters into the value:
 * `{ out: "d i r" }` became the three arguments `--out="d`, `i`, `r"`,
 * which happened to print correctly and was wrong.
 */
function objectToCLIFlagList(obj) {
  return toFlagDescriptors(obj)
    .filter(shouldIncludeFlag)
    .map(({ name, value }) => {
      const flag = formatFlagName(name);
      return value === true ? flag : `${flag}=${String(value)}`;
    });
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

function hasValue(item) {
  return item !== null && item !== undefined;
}

// Core execution function
function executeCommand(strings, values, useShell, isSync, options = {}) {
  // `cmd` gets an argument list, not a string to be split apart again.
  const command = useShell
    ? buildShellExpression(strings, values)
    : buildCommandArgs(strings, values);

  // Execute the command based on sync/async and shell mode
  return runCommand(command, useShell, isSync, options);
}

function buildShellExpression(strings, values) {
  // The raw strings, not the cooked ones. JavaScript processes escape
  // sequences in a template before anyone sees it, which is wrong when the
  // text is destined for a shell: `grep '\d'` would arrive as `grep 'd'`,
  // silently searching for a letter. Worse, an escape JavaScript considers
  // invalid — an octal like \033 — makes the cooked string `undefined`
  // while the raw one survives, so the command became the literal text
  // "undefined". Backslashes belong to the shell, so they are left alone.
  const parts = strings.raw ?? strings;
  let command = "";
  for (let i = 0; i < parts.length; i++) {
    command += parts[i];
    if (i < values.length) {
      // Determine the context for this interpolation
      const beforeValue = parts[i];
      const afterValue = i + 1 < parts.length ? parts[i + 1] : "";
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
  // A marked string is a String object, so this has to come first: the
  // object branch below would otherwise read it as a bag of flags and
  // reject its indices as flag names, making the one thing marking is for
  // — interpolating it — the one thing that could not be done with it.
  if (isSafeString(value)) {
    return String(value);
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
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

/**
 * Builds the argument list for `cmd` directly, so interpolated values are
 * never tokenized.
 *
 * `cmd` used to build a command string and then split it back apart, which
 * meant every value made a round trip through a parser that strips quotes
 * and splits on whitespace. A filename like `it's.txt` came out as
 * `its.txt`, and `say "hi"` came out as `sayhi` — silently, in the tag
 * whose whole purpose is not to hand text to something that interprets it.
 *
 * The literal parts of the template still have to be parsed, because they
 * carry the quoting a caller wrote themselves. So they are parsed with each
 * value replaced by a placeholder, and the placeholders are swapped back
 * afterwards. Whatever the parser does to the template, it never sees a
 * value.
 */
function buildCommandArgs(strings, values) {
  const parts = strings.raw ?? strings;
  // Per call, so a value cannot contain something that looks like one.
  const mark = ` ${Math.random().toString(36).slice(2)} `;
  const slots = [];
  const hold = (value) => `${mark}${slots.push(String(value)) - 1}${mark}`;

  let templated = "";
  for (let i = 0; i < parts.length; i++) {
    templated += parts[i];
    if (i >= values.length) continue;
    const value = values[i];

    if (Array.isArray(value)) {
      // Each element is its own argument, so they are separated here
      // rather than left to the parser.
      templated += value.map((item) => ` ${hold(item)} `).join("");
    } else if (isSafeString(value)) {
      templated += hold(value);
    } else if (value && typeof value === "object") {
      templated += objectToCLIFlagList(value)
        .map((flag) => ` ${hold(flag)} `)
        .join("");
    } else {
      // Glued to whatever surrounds it, so `--flag=${value}` stays one
      // argument.
      templated += hold(value);
    }
  }

  return parseCommand(templated.trim()).map((token) =>
    token
      .split(mark)
      .map((piece, index) => (index % 2 === 1 ? slots[Number(piece)] : piece))
      .join(""),
  );
}

function runCommand(command, useShell, isSync, options) {
  // `cmd` arrives as an argument list; `sh` as a string to hand a shell.
  const isArgv = Array.isArray(command);
  command = isArgv ? command.filter((part) => part !== "") : command.trim();

  // Handle empty commands
  if (isArgv ? command.length === 0 : !command) {
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
  // Commands run where the caller is running, which is what every other
  // process API in Node means by "here".
  const workingDir = options.cwd ? options.cwd : process.cwd();
  
  // Parse command for spawn
  let cmd, args;
  // Always use pipe to capture output, even in interactive mode
  const spawnOptions = {
    stdio: ["pipe", "pipe", "pipe"],
    // The same environment the asynchronous path builds. This was
    // `process.env` outright, so `sync` ignored `env` altogether.
    env: buildEnvironment(options),
    cwd: workingDir,
  };
  
  if (useShell) {
    // The same resolved shell as the asynchronous path, so sync and async
    // agree about what a command means.
    cmd = command;
    args = [];
    spawnOptions.shell = resolveShell(options.shell);
  } else {
    // Already an argument list when it came from `cmd`; a string only when
    // a caller handed one in directly.
    const parts = isArgv ? command : parseCommand(command.trim());
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
    // A caller who named a shell keeps it; `useShell` only decides whether
    // there is one at all, which is what separates `sh` from `cmd`.
    shell: useShell ? (options.shell ?? true) : false,
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
          const options = { ...mergedOptions, ...strings };
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
          const options = { ...liveOptions, ...strings };
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
          const options = { ...mergedOptions, ...strings };
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
        const options = { ...mergedOptions, ...strings };
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

const SELECTED_SHELL = selectShell();

/**
 * Resolves the `shell` option to a shell path.
 *
 * `true` lets the library choose, which is what makes the same command mean
 * the same thing on macOS and Linux. A string names one explicitly — a
 * caller who wants zsh, dash, or a shell at a particular path is not
 * obliged to accept ours.
 */
function resolveShell(shell) {
  if (shell === false) {
    return false;
  }
  if (typeof shell === "string" && shell.length > 0) {
    return shell;
  }
  return SELECTED_SHELL;
}

// A JS string cannot exceed this, so neither can captured output. It is a
// safety net, not a policy: a caller running something endless turns capture
// off rather than relying on the net to catch them.
const MAX_CAPTURE_BYTES = 0x1fffffe8;

/**
 * Resolves the `capture` option to a limit in bytes.
 */
function captureLimit(capture) {
  if (capture === false) {
    return 0;
  }
  if (capture === true || capture === undefined || capture === null) {
    return MAX_CAPTURE_BYTES;
  }
  // Infinity spells "no limit", the same way it does for gracePeriod. The
  // net still applies, because a string cannot hold more than that.
  if (capture === Infinity) {
    return MAX_CAPTURE_BYTES;
  }
  // Everything else has to be a byte count, and saying so beats quietly
  // clamping: NaN and "64kb" fell through to an unbounded capture, while
  // -1 clamped to zero — so a caller who asked for a limit got no limit,
  // and a caller who mistyped one got nothing, both in silence.
  if (!Number.isSafeInteger(capture) || capture < 0) {
    const received = typeof capture === "string"
      ? JSON.stringify(capture)
      : String(capture);
    throw new TypeError(
      `capture must be true, false, or a non-negative whole number of ` +
      `bytes — received ${received}`,
    );
  }
  return Math.min(capture, MAX_CAPTURE_BYTES);
}

/**
 * Joins captured chunks into the string a result carries.
 */
function joinCapture(chunks) {
  return Buffer.concat(chunks).toString();
}

/**
 * Applies a capture limit to text already in hand, keeping the tail.
 *
 * `spawnSync` buffers everything before it returns, so synchronously there
 * is no streaming to opt out of and `capture` cannot save the memory the
 * way it does asynchronously. It still decides what the result holds, which
 * is what the option means — and honouring it here keeps one command from
 * meaning two different things depending on how it was run.
 */
function limitCapture(text, limit) {
  // Asking for nothing and getting nothing is not truncation, and the
  // streaming path does not flag it either.
  if (limit === 0) {
    return { text: "", truncated: false };
  }
  const buffer = Buffer.from(text);
  if (buffer.length <= limit) {
    return { text, truncated: false };
  }
  // The oldest bytes go, matching the streaming path.
  return { text: buffer.subarray(buffer.length - limit).toString(),
           truncated: true };
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
/**
 * The environment the child runs in.
 *
 * `env` is the environment, not an addition to it — the same meaning Node's
 * `child_process` and Python's `subprocess` give it. Extending is explicit
 * and visible at the call site:
 *
 *     sh({ env: { ...process.env, FOO: "bar" } })`echo $FOO`
 *
 * Merging on the caller's behalf would be the library doing something
 * unasked, and it would leave a clean environment unsayable without another
 * option. Forgetting the spread fails loudly — the child gets no PATH and
 * reports `command not found` — rather than quietly running somewhere
 * unexpected.
 *
 * Nothing here manipulates FORCE_COLOR or NO_COLOR. A child decides colour
 * by asking whether its output is a terminal, so colour appears wherever
 * one is involved and not otherwise.
 */
function buildEnvironment(config) {
  return config.env === undefined ? process.env : { ...config.env };
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
/**
 * Commands still running, so they can be ended when this process is.
 *
 * Every command is spawned into its own process group, which is what lets
 * `stop()` reach the command *and everything it spawned* without signalling
 * this process too. The same separation means nothing ties the group's
 * lifetime to ours: without this, a command outlives the program that
 * started it — including on Ctrl-C, which is how most scripts end. A leaked
 * dev server keeps its port bound and its watchers running, so the next run
 * fails with "address already in use", pointing nowhere near the cause.
 *
 * `process.on("exit")` alone is not enough, because exit handlers do not run
 * when a process is killed by a signal. So the signals that ordinarily end a
 * program are handled too, and afterwards the default behaviour is allowed
 * to happen rather than swallowed.
 *
 * What this cannot cover is SIGKILL and a hard crash, where no code of ours
 * runs at all. Closing that needs a supervisor holding a pipe, or a
 * pseudo-terminal whose hangup the kernel delivers. Every library built on
 * handlers has the same hole.
 */
const liveGroups = new Set();
let exitHooksInstalled = false;

const SIGNALS_THAT_END_US = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];

function endLiveGroups() {
  for (const pid of liveGroups) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // Already gone, or never had a group. Nothing to do either way.
    }
  }
  liveGroups.clear();
}

function installExitHooks() {
  if (exitHooksInstalled) return;
  exitHooksInstalled = true;

  process.on("exit", endLiveGroups);

  for (const signal of SIGNALS_THAT_END_US) {
    process.on(signal, () => {
      endLiveGroups();
      // Only take over the exit when nothing else is listening. A caller
      // with their own handler has their own intentions, and ending the
      // program on their behalf would override them.
      if (process.listenerCount(signal) === 1) {
        process.removeAllListeners(signal);
        process.kill(process.pid, signal);
      }
    });
  }
}

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
  #captured = { output: 0, debug: 0 };
  #captureLimit = MAX_CAPTURE_BYTES;
  #truncated = false;
  #inheritedStdin = false;
  #abortListener;
  #detachInput;
  
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
    
    this.#shell = resolveShell(this.#config.shell);
    this.#captureLimit = captureLimit(this.#config.capture);
    
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
   * Gets whether this process has finished, either way.
   * @returns {boolean} True once the result is known
   */
  get settled() {
    return this.#settled;
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
    const useShell = this.#shell !== false;
    const parts = useShell
      ? null
      : (Array.isArray(this.#commandString)
        ? this.#commandString
        : parseCommand(this.#commandString.trim()));
    
    this.#childProcess = spawn(
      useShell ? this.#commandString : parts[0],
      useShell ? [] : parts.slice(1),
      {
        shell: this.#shell,
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
    
    installExitHooks();
    if (this.#childProcess.pid !== undefined) {
      liveGroups.add(this.#childProcess.pid);
    }

    this.#bridgeStreams();
    this.#connectInput();
    this.#connectAbortSignal();
    this.#drainIfUnobserved();
    this.#settleOn(this.#childProcess);
    this.#armTimeout();
  }
  
  #bridgeStreams() {
    const child = this.#childProcess;
    
    if (child.stdout) {
      child.stdout.pipe(this.#io.output);
      child.stdout.on("data", (chunk) => {
        this.#capture(this.#outputChunks, chunk, "output");
        if (this.#config.output) {
          process.stdout.write(chunk);
        }
      });
    }
    if (child.stderr) {
      child.stderr.pipe(this.#io.debug);
      child.stderr.on("data", (chunk) => {
        this.#capture(this.#debugChunks, chunk, "debug");
        if (this.#config.debug) {
          process.stderr.write(chunk);
        }
      });
    }
    if (child.stdin) {
      // A command is free to exit without reading its input — `yes | head`
      // is an ordinary shell idiom — and writing to the closed pipe then
      // raises EPIPE. That is the expected end of the conversation rather
      // than a failure of the command, and without a listener it is an
      // unhandled error event that takes the host down.
      //
      // Anything else closes the input and lets the command report its own
      // outcome: a write failure is not the command's verdict, and the exit
      // status is. Rethrowing from inside an error listener would only
      // exchange one crash for another.
      for (const stream of [child.stdin, this.#io.input]) {
        stream.on("error", (error) => {
          if (error.code === "EPIPE" || error.code === "ERR_STREAM_DESTROYED") {
            return;
          }
          // Closing only the source leaves the child's stdin open, and a
          // command waiting for EOF — `cat` with nothing more coming —
          // would wait forever, so the process would never settle.
          this.#io.input.destroy();
          child.stdin.destroy();
        });
      }
      this.#io.input.pipe(child.stdin);
    }
  }
  
  #drainIfUnobserved() {
    // Capture happens on the child's own streams, so the exposed ones exist
    // purely for a caller who wants to watch. If nobody does, they must not
    // fill up: an unread PassThrough stops draining at its high-water mark
    // and backpressures the child, which then blocks before exiting and
    // never settles. A command printing a few megabytes would hang forever.
    //
    // Checked on the next tick so that a handler attached in this one — the
    // documented pattern for a deferred process — still counts as a reader.
    // readableFlowing is null only while nothing at all is consuming: a
    // "data" listener or a pipe makes it true, and async iteration makes it
    // false.
    process.nextTick(() => {
      for (const stream of [this.#io.output, this.#io.debug]) {
        if (stream.readableFlowing === null) {
          stream.resume();
        }
      }
    });
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
    // Held so it can be removed once the process settles. A long-lived
    // signal reused across many short commands would otherwise accumulate a
    // listener per command, each retaining a finished Process along with its
    // streams and captured output.
    this.#abortListener = () => this.kill();
    signal.addEventListener("abort", this.#abortListener, { once: true });
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
      // A source the caller owns can fail, and without a listener that is an
      // unhandled error event. Closing both ends means the child sees EOF
      // rather than waiting forever for input that will never arrive.
      const onSourceError = () => {
        this.#io.input.destroy();
        this.#childProcess?.stdin?.destroy();
      };
      input.on("error", onSourceError);
      input.pipe(this.#io.input);
      // Held so both can be released once the process settles. A caller
      // reusing one stream across commands would otherwise leave a listener
      // and a pipe destination behind for each, until Node warns about the
      // leak it has come to look like.
      this.#detachInput = () => {
        input.off("error", onSourceError);
        input.unpipe(this.#io.input);
      };
    }
  }
  
  #capture(chunks, chunk, which) {
    const limit = this.#captureLimit;
    if (limit === 0) {
      return;
    }

    chunks.push(chunk);
    this.#captured[which] += chunk.length;

    // Over the limit, the oldest bytes go rather than the newest. Whatever
    // made a command outproduce its own result is diagnosed from the end —
    // the error, the last thing it managed — and dropping the tail would
    // throw away exactly that.
    while (this.#captured[which] > limit && chunks.length > 0) {
      this.#truncated = true;
      const excess = this.#captured[which] - limit;
      const oldest = chunks[0];
      if (oldest.length <= excess) {
        chunks.shift();
        this.#captured[which] -= oldest.length;
      } else {
        chunks[0] = oldest.subarray(excess);
        this.#captured[which] -= excess;
      }
    }
  }
  
  #settleOn(child) {
    const finish = (error) => {
      if (this.#settled) return;
      this.#settled = true;
      clearTimeout(this.#timeoutTimer);

      // Finished, so there is no group worth signalling any more — and the
      // pid could later be reused by something unrelated.
      liveGroups.delete(this.#childProcess?.pid);
      
      // An inherited stdin holds the event loop open long after the child is
      // gone, so release it the moment the process settles.
      if (this.#detachInput) {
        this.#detachInput();
        this.#detachInput = undefined;
      }

      if (this.#abortListener) {
        this.#config.signal?.removeEventListener("abort", this.#abortListener);
        this.#abortListener = undefined;
      }
      
      if (this.#inheritedStdin) {
        process.stdin.unpipe(this.#io.input);
        process.stdin.pause();
        this.#inheritedStdin = false;
      }
      
      const output = joinCapture(this.#outputChunks);
      const debug = joinCapture(this.#debugChunks);
      
      if (!error) {
        const result = new ProcessResult({ ok: true, output, debug });
        if (this.#truncated) {
          result.truncated = true;
        }
        this.#resolve(result);
        return;
      }
      
      error.output = output;
      error.debug = debug;
      if (this.#truncated) {
        error.truncated = true;
      }
      
      if (this.#config.throw === false) {
        const failed = new ProcessResult({ ok: false, error, output, debug });
        if (this.#truncated) {
          failed.truncated = true;
        }
        this.#resolve(failed);
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
      // A well-behaved child handles termination and exits 0, so exit status
      // alone cannot tell a completed command from one that ran out of time.
      if (code === 0 && !this.#timedOut) {
        finish(null);
        return;
      }
      // stderr is appended when present, which is what makes a "command not
      // found" failure name the command that was not found.
      const trimmedDebug = joinCapture(this.#debugChunks).trim();
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
    // The group includes the child, so signalling both would deliver the
    // same signal twice — and a process shutting down gracefully on the
    // first one can have that interrupted by the second.
    try {
      process.kill(-this.#childProcess.pid, signal);
    } catch {
      // No group yet, or it is already gone: fall back to the child alone.
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
      (reason) => Promise.resolve(onFinally())
        .then(() => Promise.reject(reason)),
    );
  }
  
  /**
   * A process is a source of its own output: iterating it yields stdout
   * chunks. Use `debug` for stderr; a failure throws an error already
   * carrying it.
   */
  async *[Symbol.asyncIterator]() {
    this.start();
    let reachedEnd = false;
    try {
      for await (const chunk of this.#io.output) {
        yield chunk;
      }
      reachedEnd = true;
    } finally {
      // Only abandonment stops the process. A command may close stdout and
      // keep working, and ending iteration is not a reason to terminate a
      // healthy process — the loop simply has nothing left to yield.
      if (!reachedEnd && !this.#settled) {
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
  #streamCompletions = new Map();
  #tornDown = false;
  #closedProducers = new Set();
  
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
        ? buildCommandArgs(strings, values)
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
    // Piping is a commitment to run: without this a deferred source never
    // starts, and iterating the chain waits on output that cannot arrive.
    for (const stage of this.#stages) {
      if (stage instanceof Process) {
        stage.start();
      }
    }
    this.#stages.push(next);
    
    if (!(next instanceof Process)) {
      // Watched from here rather than when the pipeline is awaited: a stream
      // that fails before anyone is listening emits an unhandled "error",
      // which takes the whole process down instead of failing the stage.
      this.#streamCompletions.set(
        next,
        finished(next).then(() => null, (error) => {
          // A broken stage leaves everything downstream waiting on input
          // that will never arrive, so the chain is torn down rather than
          // left hanging. The error is already recorded, and settling
          // reports the earliest failing stage, so it stays the cause.
          this.#teardown();
          return error;
        }),
      );
    }
    
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
    // A tail nobody reads never finishes, so awaiting a chain that ends in a
    // transform would hang. Same rule as a process's own streams: if nothing
    // is consuming, drain rather than accumulate.
    const tail = this.#tailOutput;
    if (tail && !(this.#tail instanceof Process)
        && typeof tail.resume === "function"
        && tail.readableFlowing === null) {
      tail.resume();
    }
    
    // Indexed by stage, so a failure can say which stage failed whether it
    // was a process or a stream.
    // A failing stage tears down the rest rather than leaving the pipeline
    // waiting on them: `sh`false`.pipe`sleep 30`` should not wait thirty
    // seconds to report that its first stage failed, and a downstream that
    // never terminates would leave it pending forever. Settling still picks
    // the earliest failure, so the original cause is what gets reported.
    for (const stage of this.#stages) {
      if (stage instanceof Process) {
        const index = this.#stages.indexOf(stage);
        stage.then(
          // A safe stage resolves a failed result rather than rejecting, so
          // watching only for rejections would leave `.safe` chains waiting
          // on the very stages a failure has made pointless.
          (result) => {
            if (result && result.ok === false) {
              this.#teardown();
            } else {
              this.#closeProducersFor(index);
            }
          },
          () => this.#teardown(),
        );
      }
    }
    
    const outcomes = await Promise.all(
      this.#stages.map(async (stage, index) => {
        if (stage instanceof Process) {
          try {
            return { index, stage, result: await stage };
          } catch (error) {
            return { index, stage, error };
          }
        }
        const error = await this.#streamCompletions.get(stage);
        return { index, stage, error: error ?? undefined };
      }),
    );
    
    const failed = outcomes.find((outcome) =>
      outcome.error && !this.#closedProducers.has(outcome.stage));
    if (failed) {
      const { error } = failed;
      error.stage = failed.index;
      if (failed.stage instanceof Process) {
        error.command = failed.stage.command;
      }
      throw error;
    }
    
    const withResults = outcomes.filter((outcome) => outcome.result);
    const unsuccessful = withResults.find((outcome) =>
      !outcome.result.ok && !this.#closedProducers.has(outcome.stage));
    if (unsuccessful) {
      // Safe stages resolve a failed result rather than rejecting, so they
      // never pass through the branch above — without this, a safe pipeline
      // reports that something failed but not what.
      const { error } = unsuccessful.result;
      if (error) {
        error.stage = unsuccessful.index;
        error.command = unsuccessful.stage.command;
      }
      return unsuccessful.result;
    }
    const results = withResults.map((outcome) => outcome.result);
    return results[results.length - 1];
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
      (reason) => Promise.resolve(onFinally())
        .then(() => Promise.reject(reason)),
    );
  }
  
  async *[Symbol.asyncIterator]() {
    for await (const chunk of this.#tailOutput) {
      yield chunk;
    }
    await this.#settle();
  }
  
  #closeProducersFor(index) {
    // A stage that has finished is not reading any more, so everything
    // upstream of it is producing for nobody. A shell sends SIGPIPE here;
    // `yes | head -2` ends instead of running forever. These are closed
    // deliberately, so they are not failures — see #settle.
    for (let earlier = 0; earlier < index; earlier++) {
      const stage = this.#stages[earlier];
      if (stage instanceof Process && !stage.settled) {
        this.#closedProducers.add(stage);
        stage.kill();
      }
    }
  }
  
  #teardown() {
    if (this.#tornDown) {
      return;
    }
    this.#tornDown = true;
    for (const stage of this.#stages) {
      if (stage instanceof Process) {
        stage.kill();
      } else if (typeof stage.destroy === "function") {
        stage.destroy();
      }
    }
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
