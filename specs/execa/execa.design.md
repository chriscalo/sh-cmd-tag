# Execa Migration Design Document

## Overview

This document outlines the design for migrating sh-cmd-tag from `node:child_process` to `execa`, leveraging execa's advanced process management capabilities while maintaining complete API compatibility and ensuring all existing tests pass.

## Current Architecture Analysis

### Core Components (index.js:740 lines)
- **Shell execution**: `spawn`/`spawnSync` with manual stream handling
- **Security layer**: Context-aware shell escaping and injection prevention  
- **Template processing**: Safe interpolation with object/array expansion
- **Streaming**: Complex manual stdout/stderr piping and buffering
- **Result handling**: ProcessResult/ProcessError classes
- **API surface**: Chainable methods (.safe, .interactive, .input, .sync)

### Key Features Requiring Preservation
1. **Template literal syntax**: `sh\`echo ${variable}\`` 
2. **Security-first interpolation**: Automatic shell escaping
3. **Object interpolation**: `{verbose: true}` → `--verbose`
4. **Array interpolation**: `['a', 'b']` → `a b`
5. **Streaming output**: Real-time stdout/stderr with collection
6. **Sync/async modes**: Both `sh\`` and `sh.sync\``
7. **Chainable API**: `.safe`, `.interactive`, `.input(data)`
8. **ProcessResult/ProcessError**: Consistent result objects

### Enhanced Process Class Integration
**See**: `specs/Process.design.md` for detailed Process class API design.

**Key Integration**: The migration includes implementing an enhanced Process class with advanced capabilities including deferred execution, stream access, and introspection while maintaining complete backward compatibility.

## Execa Integration Strategy

### Dependencies
```json
{
  "dependencies": {
    "execa": "^9.0.0"
  }
}
```

### Core Migration Approach

#### 1. Enhanced Process Class Architecture
**Reference**: See `specs/Process.design.md` for complete Process class design specification.

**Key Addition**: Introduce an enhanced Process class that encapsulates child process execution with streaming output, advanced control capabilities, and a thenable interface for seamless Promise integration.

**Core Benefits:**
- **Cleaner abstraction**: Replaces ~100 lines of inline stream handling
- **Advanced control**: Deferred execution, stream access, process introspection  
- **Thenable interface**: Implements `then()` for natural Promise usage
- **Backward compatibility**: All existing APIs work unchanged

#### 2. Replace Process Execution Engine
```javascript
// Current: node:child_process
import { spawn, spawnSync } from "node:child_process";

// Proposed: execa
import { $ as execa$, execa, execaSync } from "execa";
```

#### 2. Leverage Execa's Streaming
Replace manual stream handling (218-318 lines) with execa's built-in streaming:

```javascript
const streaming$ = execa$({
  buffer: false,  // Enable streaming mode
  env: {
    ...process.env,
    ...forceColorEnv,  // Preserve color support
  },
});
```

#### 3. Maintain ProcessResult/ProcessError API
Wrap execa results in existing classes to preserve API compatibility:

```javascript
export class ProcessResult {
  constructor({ ok, error, output, debug }) {
    this.ok = ok;
    this.error = error;
    this.output = output;
    this.debug = debug;
  }
}

export class ProcessError extends Error {
  constructor({ message, code, output, debug }) {
    super(message);
    this.name = "ProcessError";
    this.code = code;
    this.output = output;
    this.debug = debug;
  }
}
```

### Implementation Plan

#### Phase 1: Core Execution Replacement

**Target Functions:**
- `executeAsyncCommand()` (lines 218-318)
- `executeSyncCommand()` (lines 152-215)

**Approach:**
- Replace spawn/spawnSync with execa's template literal support
- Integrate enhanced Process class (see `specs/Process.design.md`)  
- Maintain identical error handling and result formatting
- Preserve streaming behavior with real-time output

**Example Async Implementation:**
```javascript
async function executeAsyncCommand(cmd, args, spawnOptions, inputData, options) {
  const execaOptions = {
    shell: spawnOptions.shell,
    cwd: spawnOptions.cwd,
    env: spawnOptions.env,
    buffer: false, // Enable streaming
    input: inputData,
  };
  
  const childProcess = execaOptions.shell 
    ? execa(cmd, { ...execaOptions, shell: true })
    : execa(cmd, args, execaOptions);
  
  const commandString = spawnOptions.shell ? cmd : [cmd, ...args].join(' ');
  return new Process(childProcess, commandString, options);
}

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

#### Phase 2: Template Literal Integration

**Target Functions:**
- `buildShellExpression()` (lines 448-463)
- `buildCommandString()` (lines 536-546)

**Approach:**
- Leverage execa's template literal support for simpler command building
- Preserve all security features and interpolation logic
- Maintain object/array expansion functionality

**Integration Points:**
```javascript
export async function $(strings, ...values) {
  const childProcess = streaming$(strings, ...values);
  const command = buildShellExpression(strings, values); // For introspection
  return await new Process(childProcess, command, options);
}
```

**Key architectural change**: The new Process class becomes the bridge between execa's child processes and our existing ProcessResult/ProcessError API, providing a clean thenable interface that maintains backward compatibility.

### Process Class Integration

**Complete API Documentation**: See `specs/Process.design.md` for detailed usage examples and implementation specifications.

**Key Integration Points:**
- Enhanced Process class with deferred execution capabilities
- Stream access for advanced users  
- Process introspection for debugging and monitoring
- Complete backward compatibility with existing APIs

#### Phase 3: Sync Mode Implementation

**Target Functions:**
- `executeSyncCommand()` (lines 152-215)

**Approach:**
- Use `execaSync` for synchronous execution
- Maintain identical error handling and result structure
- Preserve all configuration options

**Example Sync Implementation:**
```javascript
function executeSyncCommand(cmd, args, spawnOptions, inputData, options) {
  try {
    const result = spawnOptions.shell
      ? execaSync(cmd, { 
          shell: true, 
          cwd: spawnOptions.cwd,
          env: spawnOptions.env,
          input: inputData 
        })
      : execaSync(cmd, args, {
          cwd: spawnOptions.cwd,
          env: spawnOptions.env,
          input: inputData
        });
    
    return new ProcessResult({
      ok: true,
      error: undefined,
      output: result.stdout || "",
      debug: result.stderr || ""
    });
  } catch (execaError) {
    const error = new ProcessError({
      message: execaError.exitCode !== undefined
        ? `Command failed with exit code ${execaError.exitCode}`
        : `Process error: ${execaError.message}`,
      code: execaError.exitCode ?? execaError.code,
      output: execaError.stdout || "",
      debug: execaError.stderr || ""
    });
    
    if (options.throw !== false) throw error;
    return new ProcessResult({ ok: false, error, output: "", debug: "" });
  }
}
```

### Security Considerations

#### 1. Preserve Existing Security Model
- **Keep all shell escaping logic** (lines 22-42, 506-534)
- **Maintain context-aware interpolation** (lines 465-489, 491-504)
- **Preserve safe string infrastructure** (lines 6-20)

#### 2. Execa Security Benefits
- Built-in protection against shell injection in non-shell mode
- Better process spawning with security defaults
- Improved error handling with detailed context

#### 3. Security Testing
All existing security tests must pass, including:
- Shell injection prevention
- Special character handling
- Context-aware escaping (single/double quotes)
- Object key validation for flags

### Performance Considerations

#### 1. Expected Improvements
- **Reduced complexity**: Remove 100+ lines of manual stream handling
- **Better error handling**: Execa's enhanced error context
- **Improved reliability**: Battle-tested process spawning
- **Memory efficiency**: Execa's optimized streaming

#### 2. Potential Concerns
- **Bundle size**: Execa dependency (~50KB)
- **Compatibility**: Node.js version requirements
- **Performance overhead**: Minimal expected impact

### Testing Strategy

#### 1. Full Test Suite Compliance
**Requirement**: All 127 existing tests must pass without modification

**Test Categories:**
- Core functionality (sh/cmd execution)
- Security and escaping mechanisms
- Streaming output processing  
- Object/array interpolation
- Error handling and edge cases
- Sync/async mode behavior
- Chainable API methods

#### 2. Regression Prevention
```bash
npm test  # Must pass all 127 tests
npm run test:verbose  # Must show identical behavior
```

#### 3. Migration Validation
- Compare output byte-for-byte with current implementation
- Validate streaming latency and performance
- Ensure identical error messages and codes
- Test edge cases and error conditions

### Implementation Phases

#### Phase 1: Foundation (1-2 days)
- [ ] Add execa dependency
- [ ] Create enhanced Process class with new APIs
- [ ] Implement immediate/deferred execution logic
- [ ] Add stream exposure (stdout, stderr, stdin getters)
- [ ] Add process introspection (command, config getters)
- [ ] Implement basic async execution
- [ ] Migrate executeAsyncCommand()

#### Phase 2: Sync Support (1 day)
- [ ] Implement sync execution (note: deferred execution not applicable)
- [ ] Migrate executeSyncCommand()
- [ ] Ensure sync/async parity where applicable

#### Phase 3: Template Integration (1 day)
- [ ] Integrate with existing template processing
- [ ] Pass command string to Process constructor for introspection
- [ ] Preserve all interpolation features
- [ ] Maintain security model

#### Phase 4: New API Integration (1 day)
- [ ] Implement { immediate: false } configuration option
- [ ] Add Process.exec() method for manual execution
- [ ] Ensure stream access works in both immediate and deferred modes
- [ ] Test deferred execution patterns

#### Phase 5: Testing & Validation (1 day)
- [ ] Run full test suite (existing 127 tests must pass)
- [ ] Add tests for new API features
- [ ] Fix any test failures
- [ ] Performance validation
- [ ] Documentation updates

### Risk Mitigation

#### 1. API Compatibility Risks
- **Mitigation**: Extensive wrapper classes maintain identical interfaces
- **Validation**: All existing tests pass without modification

#### 2. Performance Regression
- **Mitigation**: Benchmarking before/after migration
- **Fallback**: Keep current implementation in git history

#### 3. Security Vulnerabilities
- **Mitigation**: Preserve all existing security mechanisms
- **Validation**: Security-focused test coverage

#### 4. Streaming Behavior Changes
- **Mitigation**: Careful mapping of execa streaming to current API
- **Testing**: Stream-specific test validation

### Benefits

#### 1. Code Quality
- **Reduced complexity**: ~100 lines of manual stream handling removed
- **Better maintainability**: Leverage execa's battle-tested implementation
- **Enhanced reliability**: Professional-grade process management

#### 2. Developer Experience
- **Improved error messages**: Execa's enhanced error context
- **Better debugging**: More detailed process information
- **Future-proofing**: Stay current with Node.js ecosystem

#### 3. Feature Opportunities
- **Enhanced streaming**: Potential for even better real-time output
- **Process management**: Advanced process control capabilities
- **Cross-platform**: Improved Windows compatibility

### Success Criteria

1. **Full test compatibility**: All 127 existing tests pass unchanged
2. **API preservation**: Zero breaking changes to existing public interface
3. **New API functionality**: All new features work as designed:
   - `{ immediate: false }` option controls process execution timing
   - `Process.exec()` method enables manual process start
   - Stream getters provide direct access to stdout/stderr/stdin
   - Command and config getters provide process introspection
4. **Performance maintenance**: No significant latency increase
5. **Security assurance**: All security features preserved
6. **Code reduction**: Meaningful reduction in complexity
7. **Enhanced capabilities**: Users can access advanced process control features

### Conclusion

This migration strategy balances the benefits of execa's mature process management with the requirement to maintain complete backward compatibility. By wrapping execa's functionality within our existing API structure, we can achieve significant code simplification while ensuring zero disruption to existing users.

The phased approach allows for careful validation at each step, with the comprehensive test suite providing confidence that all functionality is preserved throughout the migration process.