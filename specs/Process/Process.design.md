# Process Class Design Document

## Overview

This document outlines the design for an enhanced Process class that provides advanced process control capabilities including deferred execution, stream access, and introspection while maintaining complete backward compatibility with existing APIs.

## Current State

The existing implementation uses inline promise-based execution with manual stream handling spread across `executeAsyncCommand()` and `executeSyncCommand()` functions (index.js:218-318, 152-215).

## New Process Class Architecture

### Core Features

1. **Deferred Execution Control**: Optional immediate execution vs manual start
2. **Stream Exposure**: Direct access to stdout, stderr, and stdin streams  
3. **Process Introspection**: Read-only access to command and configuration
4. **Thenable Interface**: Seamless Promise integration for backward compatibility

### Class Definition

```javascript
/**
 * Process class that encapsulates child process execution with streaming
 * output and enhanced control capabilities.
 */
class Process {
  #stdout = "";
  #stderr = "";
  #childProcess;
  #commandString;
  #config;
  #isStarted = false;
  
  constructor(child, commandString, config = {}) {
    this.#childProcess = child;
    this.#commandString = commandString;
    this.#config = { immediate: true, ...config };
    
    if (this.#config.immediate) {
      this.#start();
    }
  }
  
  // Read-only getters for introspection
  get command() {
    return this.#commandString;
  }
  
  get config() {
    return { ...this.#config }; // Return copy to prevent mutation
  }
  
  // Stream access for advanced users
  get stdout() {
    return this.#childProcess?.stdout;
  }
  
  get stderr() {
    return this.#childProcess?.stderr;
  }
  
  get stdin() {
    return this.#childProcess?.stdin;
  }
  
  // Manual execution for deferred processes
  exec() {
    if (!this.#isStarted) {
      this.#start();
      return this;
    }
    throw new Error("Process has already been started");
  }
  
  #start() {
    this.#isStarted = true;
    this.#initStreams();
  }
  
  #initStreams() {
    this.#childProcess.stdout?.on("data", (chunk) => {
      if (this.#config.output !== false) {
        process.stdout.write(chunk);
      }
      this.#stdout += chunk.toString();
    });
    
    this.#childProcess.stderr?.on("data", (chunk) => {
      if (this.#config.debug !== false) {
        process.stderr.write(chunk);
      }
      this.#stderr += chunk.toString();
    });
  }
  
  async then(resolve, reject) {
    // Auto-start if not immediate and not manually started
    if (!this.#isStarted) {
      this.#start();
    }
    
    try {
      await this.#childProcess;
      
      resolve(new ProcessResult({
        ok: true,
        error: null,
        output: this.#stdout,
        debug: this.#stderr
      }));
    } catch (execaError) {
      const message = execaError.exitCode !== undefined 
        ? `Command failed with exit code ${execaError.exitCode}`
        : `Process error: ${execaError.message}`;
      
      const error = new ProcessError({
        message,
        code: execaError.exitCode ?? execaError.code,
        output: this.#stdout,
        debug: this.#stderr
      });

      reject(error);
    }
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
const process = sh({ immediate: false })`echo "hello"`;  // Waits for process.exec()
```

## New API Methods

### Process Introspection

#### `process.command`
**Type**: `string` (read-only)  
**Purpose**: Returns the resolved command string for debugging and logging.

```javascript
const process = sh`echo "hello ${name}"`;
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

#### `process.stdout`
**Type**: `ReadableStream | null`  
**Purpose**: Direct access to the child process stdout stream for advanced users.

#### `process.stderr`  
**Type**: `ReadableStream | null`  
**Purpose**: Direct access to the child process stderr stream for advanced users.

#### `process.stdin`
**Type**: `WritableStream | null`  
**Purpose**: Direct access to the child process stdin stream for advanced users.

```javascript
const process = sh({ immediate: false })`long-running-command`;

// Set up custom stream handling
process.stdout.on('data', chunk => {
  // Custom processing
  customLogger.info(chunk.toString());
});

process.stderr.pipe(errorLogStream);
process.exec(); // Start execution
```

### Manual Execution

#### `process.exec()`
**Type**: `Process` (returns self for chaining)  
**Purpose**: Manually start execution of a deferred process.  
**Throws**: `Error` if process has already been started.

```javascript
const process = sh({ immediate: false })`command`;
// ... set up streams, logging, etc ...
process.exec();  // Start the process
await process;   // Wait for completion
```

## Usage Patterns

### 1. Backward Compatibility (No Changes)

```javascript
// All existing patterns work unchanged
const result1 = await sh`echo "test"`;                    
const result2 = await sh.safe`might-fail`;               
const result3 = await sh.interactive`interactive-cmd`;   
const result4 = sh.sync`sync-command`;
```

### 2. Deferred Execution with Custom Streams

```javascript
// Create process but don't start
const process = sh({ immediate: false })`complex-command`;

// Set up custom stream handling
process.stdout.on('data', chunk => {
  metrics.recordOutput(chunk.length);
  customProcessor.process(chunk);
});

process.stderr.pipe(errorAggregator);

// Start execution when ready
process.exec();
const result = await process;
```

### 3. Process Monitoring and Introspection

```javascript
const process = sh`echo "hello ${userName}"`;

// Log command for audit trail
logger.info(`Executing: ${process.command}`);
logger.debug(`Config: ${JSON.stringify(process.config)}`);

// Monitor streams for debugging
process.stderr.on('data', chunk => {
  debugger.captureStderr(process.command, chunk.toString());
});

const result = await process;
```

### 4. Advanced Stream Manipulation

```javascript
const process = sh({ 
  immediate: false, 
  output: false,  // Don't auto-pipe to process.stdout
  debug: false    // Don't auto-pipe to process.stderr
})`data-processing-command`;

// Custom stream processing pipeline
process.stdout
  .pipe(dataTransform)
  .pipe(dataValidator)
  .pipe(dataOutput);

process.stderr.pipe(customErrorHandler);

process.exec();
await process;
```

## Implementation Considerations

### 1. Backward Compatibility

**Critical Requirement**: All existing APIs must work unchanged. The Process class implements the thenable interface (`then()` method) to ensure seamless integration with existing Promise-based code.

**Test Coverage**: All 127 existing tests must pass without modification.

### 2. Stream Lifecycle Management

**Immediate Mode**: Streams are initialized immediately in constructor via `#start()`
**Deferred Mode**: Streams are initialized when `exec()` is called or `then()` is awaited

**Auto-start Behavior**: If a deferred process is awaited without calling `exec()`, it automatically starts to prevent hanging.

### 3. Error Handling

**Process Not Started**: `exec()` throws if called on already-started process
**Stream Access**: Stream getters return `null` if child process not available
**Promise Compatibility**: `then()` method maintains identical error handling to existing implementation

### 4. Memory and Resource Management

**Stream References**: Getters provide direct access to underlying streams without additional wrappers
**Configuration Copies**: `config` getter returns defensive copies to prevent mutation
**Process Lifecycle**: Existing process cleanup and resource management preserved

## Integration Points

### Template Literal Functions

```javascript
// sh function integration
export async function sh(strings, ...values) {
  const childProcess = streaming$(strings, ...values);
  const command = buildShellExpression(strings, values);
  const options = /* extract from chainable API */;
  
  return new Process(childProcess, command, options);
}
```

### Chainable API Preservation

```javascript
// All chainable methods (.safe, .interactive, .input) work with new Process class
const process = sh.safe.interactive({ immediate: false })`command`;
console.log(process.config);  // Shows all merged configuration options
```

## Testing Strategy

### 1. Existing Test Compatibility
- All 127 existing tests must pass unchanged
- No modifications to existing test files

### 2. New Feature Tests

#### Deferred Execution Tests
```javascript
test("immediate: false prevents automatic execution", async () => {
  const process = sh({ immediate: false })`echo "test"`;
  // Process should not have started yet
  assert.equal(process.config.immediate, false);
  
  process.exec();
  const result = await process;
  assert.equal(result.output.trim(), "test");
});
```

#### Stream Access Tests
```javascript
test("stdout getter provides access to child process stdout", async () => {
  const process = sh({ immediate: false })`echo "test"`;
  
  let capturedData = "";
  process.stdout.on('data', chunk => {
    capturedData += chunk.toString();
  });
  
  process.exec();
  await process;
  assert.equal(capturedData.trim(), "test");
});
```

#### Introspection Tests
```javascript
test("command getter returns resolved command string", () => {
  const name = "world";
  const process = sh`echo "hello ${name}"`;
  assert.equal(process.command, "echo 'hello world'");
});
```

### 3. Error Condition Tests

```javascript
test("exec() throws on already started process", () => {
  const process = sh({ immediate: false })`echo "test"`;
  process.exec();
  
  assert.throws(() => {
    process.exec();
  }, /Process has already been started/);
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