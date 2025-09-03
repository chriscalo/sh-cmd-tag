# Story 2.2: Deferred Process Execution

**Status:** Approved  
**Priority:** P1 (High)  
**Epic:** [Epic 2: Process Class Enhancement](./epic-02.process-class-enhancement.md)  
**Labels:** deferred-execution, process-control  
**Story Points:** 8  
**Assignee:** Development Team  

## User Story

**As a** Node.js developer building complex workflows  
**I want** to control when processes start execution  
**So that** I can set up stream handlers, configure monitoring, and coordinate process execution timing  

## Acceptance Criteria

### AC1: Immediate Execution by Default
- **Given** I create a process with sh\`command\` (no options)
- **When** the Process is created  
- **Then** it starts executing immediately (current behavior)
- **And** process.started === true

### AC2: Deferred Execution Option
- **Given** I create a process with sh({ immediate: false })\`command\`
- **When** the Process is created
- **Then** it does NOT start executing automatically
- **And** process.started === false

### AC3: Manual Start Method
- **Given** I have a deferred process  
- **When** I call process.start()
- **Then** the process begins execution
- **And** process.started becomes true
- **And** start() returns the process for chaining

### AC4: Idempotent Start Behavior
- **Given** I have a process that's already started
- **When** I call process.start() again  
- **Then** it has no effect (doesn't restart or throw)
- **And** process.started remains true

### AC5: Auto-start on Await
- **Given** I have a deferred process that hasn't been manually started
- **When** I await the process or call .then()
- **Then** it automatically starts before resolving
- **And** the Promise resolves normally

### AC6: Stream Access Before Start
- **Given** I have a deferred process
- **When** I access process.output, process.debug, process.input  
- **Then** streams are available immediately (before start)
- **And** I can set up event handlers and piping

## Technical Requirements

- **Configuration:** Add immediate option to config parsing
- **Default Behavior:** immediate: true preserves existing behavior
- **Start Method:** Idempotent manual execution control  
- **Stream Lifecycle:** Stable streams available before process starts
- **Auto-start Logic:** then() method triggers start if needed

## Implementation Notes

```javascript
class Process {
  constructor(commandString, config = {}) {
    this.#config = { immediate: true, ...config };
    this.#setupStreams(); // Always available
    
    if (this.#config.immediate) {
      this.#start();
    }
  }
  
  start() {
    if (!this.started) {
      this.#start();
    }
    return this; // Chain-friendly
  }
  
  then(resolve, reject) {
    if (!this.started) {
      this.start(); // Auto-start
    }
    return this.#promise.then(resolve, reject);
  }
}
```

## Examples

```javascript
// Immediate execution (existing behavior - unchanged)
const process1 = sh`echo "immediate"`;
console.log(process1.started); // true

// Deferred execution (new capability)
const process2 = sh({ immediate: false })`echo "deferred"`;
console.log(process2.started); // false

// Set up custom handling before start
process2.output.on("data", chunk => {
  customLogger.info(chunk.toString());
});

// Manual start
process2.start();
const result = await process2;

// Auto-start on await (if not manually started)
const process3 = sh({ immediate: false })`echo "auto"`;
const result3 = await process3; // Auto-starts here
```

## Testing Strategy

- Test immediate: true starts process automatically (default behavior)
- Test immediate: false prevents automatic start  
- Test manual start() method works and is idempotent
- Test auto-start behavior when deferred process is awaited
- Test stream access works before process starts
- Test event handlers set before start receive data correctly

## Definition of Done

- { immediate: false } option prevents automatic process start
- start() method enables manual execution control  
- start() is idempotent and safe to call multiple times
- Streams available immediately regardless of immediate setting
- Auto-start works when deferred process is awaited
- All existing immediate behavior unchanged (backward compatibility)
- Comprehensive tests cover deferred execution patterns