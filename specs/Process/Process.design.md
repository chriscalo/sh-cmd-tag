# Process Class Design Document

## Overview

This document outlines the design for adding a `Process` class that provides a
clean interface to the underlying child process, including deferred execution,
stream access, read-only access to the command config options, and the ability
to await the process completion.

## Key Design Clarifications

### 1. Process as Thenable

The Process class implements the Promise interface (`then()`, `catch()`, 
`finally()`) to maintain backward compatibility:

All these patterns work identically - Process instances resolve to ProcessResult 
when awaited, sync variants return ProcessResult directly, and error handling 
remains unchanged.

```javascript
// Process resolves to ProcessResult
const result1 = await sh`echo "hello"`;

// Process resolves to ProcessResult with .error
const result2 = await sh.safe`might-fail`;

// Returns ProcessResult directly (no Process)
const result3 = sh.sync`echo "world"`;

// Error handling unchanged
try {
  await sh`exit 1`;
} catch (error) {
  // true
  console.log(error instanceof ProcessError);
}

// Safe mode returns ProcessResult with error instead of rejecting
const result = await sh.safe`exit 1`;
console.log(result.ok); // false
console.log(result.error instanceof ProcessError); // true
```

### 2. Sync Variants Stay ProcessResult

Sync methods (`.sync`) bypass the Process class entirely and return 
ProcessResult directly:

Both async and sync variants have identical result structure.

```javascript
// await converts Process to ProcessResult
const asyncResult = await sh`echo "test"`;

// Returns ProcessResult immediately
const syncResult = sh.sync`echo "test"`;
```

### 3. Configuration Functions

Functions like `sh({options})` and chainable methods return configured 
functions that create Process instances:

Both `sh({options})` and chainable methods (like `sh.safe`) create configured 
functions. All Process instances resolve to ProcessResult when awaited.

```javascript
// sh({}) returns a function that creates Process with options
const safeSh = sh({ throw: false });

// Process with throw: false
const process1 = safeSh`command1`;

// Process with throw: false
const process2 = safeSh`command2`;

// Equivalent to:
// Process with throw: false
const process3 = sh.safe`command3`;

// All resolve to ProcessResult
const result1 = await process1;
const result2 = await process2;
const result3 = await process3;
```

## Current State

The existing implementation uses inline promise-based execution with manual
stream handling spread across `executeAsyncCommand()` and `executeSyncCommand()` 
functions (`index.js`:218-318, 152-215).

## New Process Class Architecture

### Core Features

1. **Deferred Execution Control**: Optional immediate execution vs manual start
2. **Stream Exposure**: Direct access to stdout, stderr, and stdin streams  
3. **Process Introspection**: Read-only access to command and configuration
4. **Thenable Interface**: Exposing a Promise-like interface

### Class Definition

```javascript
import { PassThrough, Writable } from "node:stream";

/**
 * Recursively freezes an object and all its nested properties
 */
// FIXME: define helpers AFTER they are used
function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  
  Object.getOwnPropertyNames(obj).forEach(prop => {
    const value = obj[prop];
    if (value && typeof value === "object") {
      deepFreeze(value);
    }
  });
  
  return Object.freeze(obj);
}

// FIXME: define helpers AFTER they are used
function isTemplateTagInvocation(...args) {
  // FIXME: is this all to ensure it's a template tag call?
  return Array.isArray(args[0]);
}


/**
 * Process class that encapsulates child process execution with streaming
 * output and enhanced control capabilities.
 */
class Process {
  static #defaults = { immediate: true };
  
  #stdout = "";
  #stderr = "";
  #process;
  #command;
  #config;
  #promise;
  #resolve;
  #reject;
  #io;
  
  constructor(commandString, config = {}) {
    this.#command = commandString;
    this.#config = deepFreeze({ ...Process.#defaults, ...config });
    
    // Create stable streams available immediately
    this.#io = {
      output: new PassThrough(),
      debug: new PassThrough(),
      input: new PassThrough(),
    };
    
    // Create promise and store resolvers immediately
    // TODO: why new Promise and not withResolvers()?
    this.#promise = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
    
    if (this.#config.immediate) {
      this.#start();
    }
  }
  
  get command() {
    return this.#command;
  }
  
  get started() {
    return Boolean(this.#process);
  }
  
  get config() {
    return this.#config;
  }
  
  get output() {
    return this.#io.output;
  }
  
  get debug() {
    return this.#io.debug;
  }
  
  get input() {
    return this.#io.input;
  }
  
  pipe(...args) {
    if (!this.started) {
      this.start();
    }
    
    if (isTemplateTagInvocation(...args)) {
      // TODO: how do we know whether to use sh vs cmd and which options to
      // inherit from this process?
      const nextProcess = sh(...args);
      this.output.pipe(nextProcess.input);
      return nextProcess;
    }
    
    if (args[0] instanceof Writable) {
      return this.output.pipe(args[0]);
    }
    
    throw new TypeError("Expected writable stream or template literal");
  }
  
  /**
   * Manually start execution of a deferred process.
   * Safe to call if already started.
   * @returns {Process} Returns self for chaining
   */
  start() {
    if (!this.started) {
      this.#start();
    }
    return this;
  }
  
  #start() {
    const parts = parseCommand(this.#command.trim());
    const cmd = parts[0];
    const args = parts.slice(1);
    
    const spawnOptions = {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.#config.env },
      cwd: this.#config.cwd,
      shell: this.#config.shell ?? true,
    };
    
    this.#process = spawn(cmd, args, spawnOptions);
    
    this.#initStreams();
    
    this.#setupProcessHandlers();
  }
  
  #initStreams() {
    // Pipe process output to stable output stream
    if (this.#process.stdout) {
      this.#process.stdout.pipe(this.#io.output);
      this.#process.stdout.on("data", (chunk) => {
        if (this.#config.output !== false) {
          process.stdout.write(chunk);
        }
        this.#stdout += chunk.toString();
      });
    }
    
    // Pipe process stderr to stable debug stream
    if (this.#process.stderr) {
      this.#process.stderr.pipe(this.#io.debug);
      this.#process.stderr.on("data", (chunk) => {
        if (this.#config.debug !== false) {
          process.stderr.write(chunk);
        }
        this.#stderr += chunk.toString();
      });
    }
    
    // Pipe stable input stream to process stdin
    if (this.#process.stdin) {
      this.#io.input.pipe(this.#process.stdin);
    }
  }
  
  // Promise interface for await compatibility
  // This makes Process thenable so 'await process' resolves to ProcessResult
  // FIXME: single-quoted string 'await process'
  then(resolve, reject) {
    if (!this.started) {
      this.#start();
    }
    
    return this.#promise.then(resolve, reject);
  }
  
  catch(reject) {
    return this.then(null, reject);
  }
  
  finally(onFinally) {
    return this.then(
      value => Promise.resolve(onFinally()).then(() => value),
      reason => Promise.resolve(onFinally()).then(() => Promise.reject(reason))
    );
  }
  
  #setupProcessHandlers() {
    const onExit = (code, signal) => {
      if (code === 0) {
        this.#resolve(new ProcessResult({
          ok: true,
          error: null,
          output: this.#stdout,
          debug: this.#stderr
        }));
      } else {
        const message = `Command failed with exit code ${code}`;
        const error = new ProcessError({
          message,
          code,
          output: this.#stdout,
          debug: this.#stderr
        });
        
        if (this.#config.throw !== false) {
          this.#reject(error);
        } else {
          this.#resolve(new ProcessResult({
            ok: false,
            error,
            output: this.#stdout,
            debug: this.#stderr
          }));
        }
      }
    };
    
    const onError = (err) => {
      const error = new ProcessError({
        message: err.message,
        // FIXME: single-quoted string 'UNKNOWN'
        code: err.code || 'UNKNOWN',
        output: this.#stdout,
        debug: this.#stderr
      });
      
      if (this.#config.throw !== false) {
        this.#reject(error);
      } else {
        this.#resolve(new ProcessResult({
          ok: false,
          error,
          output: this.#stdout,
          debug: this.#stderr
        }));
      }
    };
    
    // FIXME: single-quoted string 'exit'
    this.#process.on('exit', onExit);
    // FIXME: single-quoted string 'error'
    this.#process.on('error', onError);
  }
}
```

## New Configuration Options

### `immediate` Option

**Type**: `boolean`
**Default**: `true`
**Purpose**: Controls whether the process starts immediately upon creation or waits for manual execution.

```javascript
// Immediate execution (current behavior, default)
const process = sh`echo "hello"`;  // Starts immediately

// Deferred execution (new capability)
// Waits for process.start()
const process = sh({ immediate: false })`echo "hello"`;
```

## New API Methods

### Process Chaining

#### `process.pipe(command)`
**Type**: `Process | WritableStream` (returns new Process for chaining or destination stream)  
**Purpose**: Pipe the process output to another command or stream destination.

**Return Behavior**:
- When piping to template literal parts: Returns new Process for chaining
- When piping to stream: Returns the destination stream (Node.js standard behavior)

```javascript
// Chainable process piping (returns Process)
const result = await sh`cat data.txt`.pipe`grep "pattern"`.pipe`head -5`;

// Pipe to stream (returns WritableStream)
// FIXME: single-quoted string 'backup.txt'
const writeStream = sh`cat large-file.txt`.pipe(fs.createWriteStream('backup.txt'));
// FIXME: single-quoted string 'finish'
// FIXME: single-quoted string 'Done'
writeStream.on('finish', () => console.log('Done'));
```

### Process Introspection

#### `process.command`
**Type**: `string` (read-only)  
**Purpose**: Returns the resolved command string for debugging and logging.

```javascript
const process = sh`echo "hello ${name}"`;
// FIXME: single-quoted string 'hello world'
console.log(process.command);  // "echo 'hello world'"
```

#### `process.config`
**Type**: `object` (read-only copy)
**Purpose**: Returns a copy of the process configuration to prevent mutation.

```javascript
const process = sh({ immediate: false, debug: true })`command`;
console.log(process.config);  // { immediate: false, debug: true, ... }
```

### Stream Access

#### `process.output`
**Type**: `ReadableStream`
**Purpose**: Direct access to stdout stream for advanced users. Available immediately upon Process creation, allowing setup of event handlers and piping before process starts. When process starts, this stream is internally connected to the child process stdout.

#### `process.debug`
**Type**: `ReadableStream`
**Purpose**: Direct access to stderr stream for advanced users. Available immediately upon Process creation, allowing setup of event handlers and piping before process starts. When process starts, this stream is internally connected to the child process stderr.

#### `process.input`
**Type**: `WritableStream`
**Purpose**: Direct access to stdin stream for advanced users. Available immediately upon Process creation, allowing setup of event handlers and piping before process starts. When process starts, this stream is internally connected to the child process stdin.

**Stream Architecture**: Each Process instance maintains exposed streams that are created in the constructor and remain stable throughout the process lifecycle. When `start()` is called, these exposed streams are internally piped to/from the actual child process streams, ensuring seamless data flow while allowing pre-process setup.

**Input Buffering**: Data written to the `input` stream before process start is automatically buffered and flushed to the child process stdin once the process begins execution. This allows users to write input data before calling `start()`. The input stream avoids eagerly consuming data when possible, only buffering what is explicitly written to it.

**Output Streaming**: The `output` and `debug` streams begin emitting data only after the process starts and the child process produces output. No buffering is needed since data flows directly from child process to exposed streams.

```javascript
const process = sh({ immediate: false })`long-running-command`;

// Set up custom stream handling
// FIXME: single-quoted string 'data'
process.output.on('data', chunk => {
  // Custom processing
  customLogger.info(chunk.toString());
});

process.debug.pipe(errorLogStream);
process.start(); // Start execution
```

### Manual Execution

#### `process.start()`
**Type**: `Process` (returns self for chaining)  
**Purpose**: Manually start execution of a deferred process.  
**Idempotent**: Safe to call multiple times - subsequent calls are no-ops.

```javascript
const process = sh({ immediate: false })`command`;
// ... set up streams, logging, etc ...
process.start();  // Start the process
process.start();  // Safe - no-op since already started
await process;   // Wait for completion
```

## Usage Patterns

### 1. Backward Compatibility (No Changes)

```javascript
// All existing patterns work unchanged - Process resolves to ProcessResult
const result1 = await sh`echo "test"`;                    // ProcessResult
const result2 = await sh.safe`might-fail`;               // ProcessResult (with .error)
const result3 = await sh.interactive`interactive-cmd`;   // ProcessResult  
const result4 = sh.sync`sync-command`;                   // ProcessResult (not Process)

// Chainable methods still work
const result5 = await sh.safe.interactive`cmd`;          // ProcessResult
const result6 = await cmd.input("data")`cat`;            // ProcessResult
const result7 = await sh({throw: false})`might-fail`;    // ProcessResult with .error

// Error handling unchanged
try {
  await sh`exit 1`;
} catch (error) {
  console.log(error instanceof ProcessError); // true
}
```

### 2. Deferred Execution with Custom Streams

```javascript
// Create process but don't start
const process = sh({ immediate: false })`complex-command`;

// Set up custom stream handling
// FIXME: single-quoted string 'data'
process.output.on('data', chunk => {
  metrics.recordOutput(chunk.length);
  customProcessor.process(chunk);
});

process.debug.pipe(errorAggregator);

// Start execution when ready
process.start();
const result = await process;
```

### 3. Process Monitoring and Introspection

```javascript
const process = sh`echo "hello ${userName}"`;

// Log command for audit trail
logger.info(`Executing: ${process.command}`);
logger.debug(`Config: ${JSON.stringify(process.config)}`);

// Monitor streams for debugging
// FIXME: single-quoted string 'data'
process.debug.on('data', chunk => {
  debugger.captureStderr(process.command, chunk.toString());
});

const result = await process;
```

### 4. Advanced Stream Manipulation

```javascript
const process = sh({ 
  immediate: false, 
  output: false, // Don't auto-pipe to process.stdout
  debug: false, // Don't auto-pipe to process.stderr
})`data-processing-command`;

// Custom stream processing pipeline
process.output
  .pipe(dataTransform)
  .pipe(dataValidator)
  .pipe(dataOutput);

// Or use process chaining
const result = await sh`generate-data`.pipe`transform`.pipe`validate`;

process.debug.pipe(customErrorHandler);
process.start();
await process;
```

## Implementation Considerations

### 1. Backward Compatibility

**Critical Requirement**: All existing APIs must work unchanged. The Process class implements the full thenable interface (`then()`, `catch()`, `finally()` methods) to ensure seamless integration with existing Promise-based code.

**API Compatibility**: 
- `await sh`command`` → resolves to ProcessResult
- `sh.sync`command`` → returns ProcessResult directly (no Process instance)
- `sh.safe`command`` → Process that resolves to ProcessResult with error field instead of rejecting
- `sh({options})`command`` → Process with merged configuration
- All chainable methods return Process instances that resolve to ProcessResult

**Test Coverage**: All existing tests must pass without modification.

### 2. Stream Lifecycle Management

**Immediate Mode**: Streams are initialized immediately in constructor via `#start()`
**Deferred Mode**: Streams are initialized when `start()` is called or `then()` is awaited

**Auto-start Behavior**: If a deferred process is awaited without calling `start()`, it automatically starts to prevent hanging.

### 3. Error Handling

**Process Not Started**: `start()` is safe to call multiple times (idempotent)
**Sync vs Async**: `.sync` variants bypass Process entirely and return ProcessResult directly
**Stream Access**: Stream getters return `null` if child process not available
**Promise Compatibility**: `then()` method maintains identical error handling to existing implementation
**Safe Mode Support**: Respects `throw: false` config to return ProcessResult with error instead of rejecting

### 4. Memory and Resource Management

**Stream References**: Getters provide direct access to underlying streams without additional wrappers
**Configuration Copies**: `config` getter returns defensive copies to prevent mutation
**Process Lifecycle**: Existing process cleanup and resource management preserved

## Integration Points

### Template Literal Functions

```javascript
// sh function integration - returns Process that resolves to ProcessResult
export function sh(strings, ...values) {
  // FIXME: single-quoted string 'object'
  if (typeof strings === 'object' && !Array.isArray(strings)) {
    // Called as sh({options}) - return configured function
    const options = strings;
    return (strings, ...values) => {
      const command = buildShellExpression(strings, values);
      return new Process(command, options);
    };
  }
  
  // Called as sh`command` - return Process instance
  const command = buildShellExpression(strings, values);
  const options = /* extract from chainable API */;
  
  return new Process(command, options);
}

// Sync variants return ProcessResult directly, not Process
export function shSync(strings, ...values) {
  const command = buildShellExpression(strings, values);
  const options = /* extract from chainable API with sync: true */;
  
  // Execute synchronously and return ProcessResult directly
  return executeSyncCommand(command, options);
}
```

### Chainable API Preservation

```javascript
// All chainable methods (.safe, .interactive, .input) work with new Process class
const process = sh.safe.interactive({ immediate: false })`command`;
console.log(process.config);  // Shows all merged configuration options

// Sync methods bypass Process and return ProcessResult directly
const result = sh.sync`echo "hello"`;  // ProcessResult, not Process
console.log(result.output);  // "hello\n"
```

## Testing Strategy

### 1. Existing Test Compatibility
- All existing tests must pass unchanged
- No modifications to existing test files

### 2. New Feature Tests

#### Deferred Execution Tests
```javascript
test("immediate: false prevents automatic execution", async () => {
  const process = sh({ immediate: false })`echo "test"`;
  // Process should not have started yet
  assert.equal(process.config.immediate, false);
  
  process.start();
  const result = await process;
  assert.equal(result.output.trim(), "test");
});
```

#### Stream Access Tests
```javascript
test("output getter provides access to child process stdout", async () => {
  const process = sh({ immediate: false })`echo "test"`;
  
  let capturedData = "";
  // FIXME: single-quoted string 'data'
  process.output.on('data', chunk => {
    capturedData += chunk.toString();
  });
  
  process.start();
  await process;
  assert.equal(capturedData.trim(), "test");
});
```

#### Introspection Tests
```javascript
test("command getter returns resolved command string", () => {
  const name = "world";
  const process = sh`echo "hello ${name}"`;
  // FIXME: single-quoted string 'hello world'
  assert.equal(process.command, "echo 'hello world'");
});
```

### 3. Error Condition Tests

```javascript
test("start() is idempotent and safe to call multiple times", () => {
  const process = sh({ immediate: false })`echo "test"`;
  process.start();
  
  // Should not throw - idempotent behavior
  assert.doesNotThrow(() => {
    process.start();
  });
  
  assert.equal(process.started, true);
});
```

## Migration Path

### Phase 1: Process Class Implementation
1. Create new Process class with enhanced capabilities
2. Integrate with existing template literal functions
3. Ensure backward compatibility

### Phase 2: Configuration Integration
1. Add `immediate` option to configuration parsing
2. Update chainable API to pass configuration to Process constructor
3. Test deferred execution patterns

### Phase 3: Stream Integration
1. Implement stream getter methods
2. Test stream access in both immediate and deferred modes
3. Validate stream lifecycle management

### Phase 4: Testing and Validation
1. Run full existing test suite
2. Add comprehensive tests for new features
3. Performance and memory usage validation

## Benefits

### For Library Maintainers
- **Reduced Complexity**: Centralized process management in single class
- **Better Testability**: Clear separation of concerns and cleaner interfaces
- **Enhanced Debugging**: Command and config introspection for troubleshooting

### For Library Users
- **Advanced Control**: Fine-grained process execution control
- **Stream Flexibility**: Direct access to streams for custom processing
- **Better Monitoring**: Introspection capabilities for debugging and logging
- **Zero Migration**: All existing code continues to work unchanged

### For Advanced Use Cases
- **Custom Stream Processing**: Direct stream manipulation for specialized workflows
- **Process Orchestration**: Better control over when processes start
- **Monitoring and Observability**: Built-in introspection for debugging and metrics

## Success Criteria

1. **Full Backward Compatibility**: All existing APIs work unchanged
2. **New Feature Functionality**: All new features work as designed
3. **Performance Parity**: No performance regression in existing usage patterns
4. **Enhanced Capabilities**: Advanced users can leverage new process control features
5. **Test Coverage**: Comprehensive test suite covers both existing and new functionality
