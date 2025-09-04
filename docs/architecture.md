# sh-cmd-tag Architecture Document

**Version:** v4  
**Date:** 2025-01-09  
**Status:** Approved  

## Architecture Overview

sh-cmd-tag is a Node.js ES module that provides secure template literal shell command execution through a layered architecture prioritizing security, performance, and developer experience.

## System Architecture

### Core Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Template Literal API                    │
│              sh`command` / cmd`command`                     │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                 Security & Interpolation Layer             │
│         Shell Escaping • Object/Array Processing           │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    Process Management                      │
│          Process Class • Stream Handling • Lifecycle       │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                   Execution Engine                         │
│              Node.js child_process / execa                 │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Template Literal API Layer

**Responsibility:** Provide ergonomic template literal interface for command execution

**Components:**
- `sh` function: Shell execution with pipes, redirects, expansions
- `cmd` function: Direct process execution without shell interpretation  
- Factory pattern: Chainable configuration methods (.safe, .interactive, etc.)
- Dual call mode: Template tag vs configuration object support

**Key Files:**
- `index.js` (lines 636-740): Main exported functions
- Configuration parsing and validation logic

### 2. Security & Interpolation Layer

**Responsibility:** Ensure secure template literal interpolation and prevent injection attacks

**Components:**
- **Shell Escaping System:** Context-aware escaping using single quotes
- **Safe String Infrastructure:** Symbol-based marking for already-escaped strings  
- **Object/Array Interpolation:** Convert objects to CLI flags, arrays to arguments
- **Validation System:** Strict validation of object keys with security-first approach

**Key Files:**
- `index.js` (lines 6-42): Safe string infrastructure and shell escaping
- `index.js` (lines 506-534): Object/array interpolation logic
- `index.js` (lines 465-504): Template processing and security validation

**Security Design:**
```javascript
const SHELL_SAFE = Symbol('shellSafe');

function shellEscape(value) {
  if (isSafeString(value)) return value;
  const str = String(value);
  return str === "" ? "''" : `'${str.replaceAll("'", "'\\''")}'`;
}

function formatFlagName(key) {
  // Validation-first: reject dangerous patterns
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(key)) {
    throw new Error(`Invalid flag name: "${key}"`);
  }
  return `--${key}`;
}
```

### 3. Process Management Layer

**Responsibility:** Advanced process control, stream management, and lifecycle handling

**Components:**
- **Process Class:** Thenable interface with enhanced control capabilities
- **Stream Architecture:** Stable PassThrough streams available before process start
- **Deferred Execution:** Optional immediate vs manual start control  
- **Process Introspection:** Read-only access to command string and configuration
- **Process Piping:** Chain processes with native stream piping

**Key Files:**
- Process class implementation (to be created in Epic 2)
- Stream lifecycle management
- Thenable interface (then, catch, finally methods)

**Process Class Architecture:**
```javascript
class Process {
  #stdout = "";
  #stderr = "";
  #process;
  #command;
  #config;
  #promise;
  #io; // Stable PassThrough streams
  
  constructor(commandString, config = {}) {
    this.#config = deepFreeze({ immediate: true, ...config });
    this.#setupStableStreams(); // Available immediately
    
    if (this.#config.immediate) {
      this.#start();
    }
  }
  
  // Thenable interface for Promise compatibility
  then(resolve, reject) { /* ... */ }
  catch(reject) { /* ... */ }
  finally(onFinally) { /* ... */ }
}
```

### 4. Execution Engine Layer

**Responsibility:** Low-level process spawning and stream handling

**Current Implementation:**
- `executeAsyncCommand()` (lines 218-318): Async process execution with manual stream handling
- `executeSyncCommand()` (lines 152-215): Synchronous process execution
- Manual stdout/stderr piping and buffering

**Target Implementation (Epic 3):**
- Replace with execa for enhanced reliability and performance
- Maintain identical API behavior and error handling
- Reduce complexity by ~100 lines through proven execa implementation

## Data Flow Architecture

### Request Flow
```
Template Literal Input
       ↓
Security Processing & Validation
       ↓
Command String Construction
       ↓
Process Class Creation  
       ↓
Stream Setup & Event Handling
       ↓  
Child Process Execution
       ↓
Real-time Stream Processing
       ↓
Result Object Construction
       ↓
Promise Resolution/Rejection
```

### Stream Flow
```
Child Process stdout/stderr
       ↓
PassThrough Streams (stable interface)
       ↓
Event Handlers & Custom Processing
       ↓
Optional Live Output (process.stdout/stderr)
       ↓
Buffer Collection for Final Result
       ↓
ProcessResult with captured output
```

## Security Architecture

### Defense in Depth Strategy

1. **Input Validation:** Strict validation of object keys and values
2. **Escape at Source:** Individual value escaping before composition
3. **Safe String Marking:** Prevent double-escaping with symbol-based tracking
4. **Context-Aware Processing:** Handle quoted and unquoted shell contexts
5. **Fail-Fast Validation:** Reject dangerous inputs immediately with clear errors

### Security Boundaries
- **User Input → Shell Execution:** Template interpolation with automatic escaping
- **Object Keys → CLI Flags:** Strict validation rejecting dangerous patterns  
- **Array Elements → Arguments:** Individual escaping of each element
- **Template Processing → Command Construction:** Safe composition of escaped parts

### Threat Model
**Protected Against:**
- Shell injection via template interpolation
- Command injection via object keys
- Path traversal via malicious file paths
- Quote breaking and escape sequence attacks

**Attack Surface:**
- Template literal interpolation points
- Object key names used as CLI flags
- Array elements used as arguments
- Shell metacharacter handling

## Performance Architecture

### Streaming Design
- **Real-time Processing:** <50ms latency for live output
- **Efficient Buffering:** Minimize memory usage for large outputs
- **Parallel Streams:** Concurrent stdout/stderr processing
- **Color Preservation:** Environment variable control for ANSI colors

### Memory Management
- **Buffer Chunking:** Process output in chunks rather than full buffering
- **Stream Cleanup:** Proper resource cleanup and garbage collection
- **PassThrough Efficiency:** Minimal overhead for stream proxying

### Performance Optimizations
- **Factory Pattern:** Efficient function creation with enclosed configuration
- **Lazy Stream Creation:** Create streams only when needed
- **Cached Escaping:** Reuse escaped strings where possible

## Configuration Architecture

### Option Processing
```javascript
interface ExecConfig {
  // Core execution
  shell?: boolean;      // sh vs cmd mode  
  sync?: boolean;       // Sync vs async execution
  throw?: boolean;      // Error throwing behavior
  immediate?: boolean;  // Deferred execution control
  
  // I/O configuration  
  input?: string | ReadableStream | boolean;
  output?: boolean;     // Live stdout streaming
  debug?: boolean;      // Live stderr streaming
  
  // Environment
  color?: boolean;      // Color output control
  env?: object;         // Environment variables
  cwd?: string;         // Working directory
}
```

### Chainable API Implementation
```javascript
// Factory pattern with property getters
Object.defineProperties(execTag, {
  safe: { get: () => makeExecTag({ ...config, throw: false }) },
  interactive: { get: () => makeExecTag({ ...config, input: true, output: true, debug: true }) },
  sync: { get: () => makeExecTag({ ...config, sync: true }) },
  input: { value: (data) => makeExecTag({ ...config, input: data }) },
});
```

## Error Handling Architecture

### Error Class Hierarchy
```javascript
class ProcessError extends Error {
  constructor({ message, code, output, debug }) {
    super(message);
    this.name = "ProcessError";
    this.code = code;       // Exit code
    this.output = output;   // Captured stdout  
    this.debug = debug;     // Captured stderr
  }
}

class ProcessResult {
  constructor({ ok, error, output, debug }) {
    this.ok = ok;           // Boolean success indicator
    this.error = error;     // ProcessError | undefined
    this.output = output;   // String stdout content
    this.debug = debug;     // String stderr content  
  }
}
```

### Error Propagation Strategy
- **Default Behavior:** Throw ProcessError on non-zero exit codes
- **Safe Mode:** Return ProcessResult with error property instead of throwing
- **Error Context:** Include command, exit code, and all captured output
- **ENOENT Mapping:** Map missing commands to exit code 127

## Testing Architecture

### Test Strategy
- **Comprehensive Tests:** Cover all functionality with security focus
- **TDD Approach:** Test-driven development for new features
- **Security Testing:** Dedicated tests for injection prevention  
- **Cross-Platform Testing:** Validate behavior on Unix and Windows
- **Performance Testing:** Benchmark streaming latency and memory usage

### Test Categories
1. **Core Functionality:** Basic command execution and result handling
2. **Security Tests:** Shell injection prevention and escaping validation
3. **Stream Tests:** Real-time output processing and capture
4. **Configuration Tests:** All option combinations and chainable methods
5. **Error Tests:** Error conditions, edge cases, and failure modes
6. **Integration Tests:** End-to-end scenarios and complex workflows

## Deployment Architecture

### Module Structure
```
sh-cmd-tag/
├── index.js                 # Main module with all exports
├── package.json            # ES module configuration  
├── specs/                  # Technical specifications
└── tests/                  # Comprehensive test suite
```

### Export Strategy
```javascript
// Named exports for main functionality
export { sh, cmd };
export { Process, ProcessResult, ProcessError };

// Default export for convenience
export default { sh, cmd, Process, ProcessResult, ProcessError };
```

### Compatibility Requirements
- **Node.js Version:** 16+ for ES modules and modern features
- **ES Module Only:** Pure ES module, no CommonJS support
- **Cross-Platform:** Unix systems and Windows compatibility
- **Zero Dependencies:** Self-contained implementation (until Epic 3 execa migration)

## Future Architecture Evolution

### Epic 2: Process Class Integration
- Introduce enhanced Process class as primary execution interface
- Maintain backward compatibility with existing template literal API
- Add deferred execution and advanced stream control capabilities

### Epic 3: Execa Migration  
- Replace manual child_process handling with execa library
- Maintain identical external API and behavior
- Reduce internal complexity while improving reliability

### Long-term Considerations
- **Plugin System:** Extensible architecture for custom behaviors
- **Monitoring Integration:** Built-in observability and metrics
- **Advanced Piping:** More sophisticated process chaining capabilities
- **Remote Execution:** Optional SSH and remote command support

## Conclusion

The sh-cmd-tag architecture balances security, performance, and usability through a clean layered design. The security-first approach with automatic escaping eliminates common vulnerabilities, while the template literal API provides the developer experience modern Node.js applications expect. The planned Process class enhancement and execa migration will further improve the architecture's sophistication while maintaining the core design principles.