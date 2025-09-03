# Story 2.1: Process Class with Thenable Interface

**Status:** Approved  
**Priority:** P0 (Critical)  
**Epic:** [Epic 2: Process Class Enhancement](./epic-02.process-class-enhancement.md)  
**Labels:** process-class, promises, thenable  
**Story Points:** 5  
**Assignee:** Development Team  

## User Story

**As a** Node.js developer using sh-cmd-tag  
**I want** Process instances to work seamlessly with async/await and Promise chains  
**So that** I can integrate process execution naturally into my existing async code without changing patterns  

## Acceptance Criteria

### AC1: Process Implements Thenable Interface
- **Given** I create a Process instance using sh\`command\`
- **When** I inspect its methods
- **Then** it has then(), catch(), and finally() methods
- **And** can be used with await or .then() syntax

### AC2: Await Resolves to ProcessResult
- **Given** I execute const result = await sh\`echo "hello"\`
- **When** the process completes successfully
- **Then** result is a ProcessResult instance  
- **And** result.ok === true
- **And** result.output === "hello\n"

### AC3: Promise Chain Compatibility  
- **Given** I use sh\`command\`.then(result => ...)
- **When** the process completes
- **Then** the then callback receives a ProcessResult
- **And** I can chain multiple .then() calls normally

### AC4: Error Handling via Catch
- **Given** I execute await sh\`exit 1\` or sh\`exit 1\`.catch(...)
- **When** the process fails  
- **Then** a ProcessError is thrown/passed to catch
- **And** error.code === 1
- **And** error instanceof ProcessError === true

### AC5: Finally Block Execution
- **Given** I use sh\`command\`.finally(() => ...)
- **When** the process completes (success or failure)
- **Then** the finally block executes regardless of outcome
- **And** cleanup code runs as expected

### AC6: Safe Mode Returns ProcessResult with Error
- **Given** I use sh.safe\`exit 1\` (throw: false)
- **When** the process fails
- **Then** Promise resolves (doesn't reject)
- **And** result.ok === false  
- **And** result.error instanceof ProcessError === true

## Technical Requirements

- **Implementation:** Process class with then/catch/finally methods
- **Thenable Spec:** Follow Promises/A+ thenable specification  
- **Backward Compatibility:** Existing await/then patterns work unchanged
- **Error Handling:** Maintain existing throw vs safe mode behavior
- **Auto-start Behavior:** then() auto-starts deferred processes

## Implementation Notes

```javascript
class Process {
  // Promise interface for await compatibility  
  then(resolve, reject) {
    if (!this.started) {
      this.start();
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
}
```

## Examples

```javascript
// Async/await (existing pattern - unchanged)
const result = await sh`echo "hello"`;
console.log(result.output); // "hello\n"

// Promise chains (existing pattern - unchanged)  
sh`echo "world"`
  .then(result => console.log(result.output))
  .catch(error => console.error(error.message));

// Error handling (existing pattern - unchanged)
try {
  await sh`exit 1`;
} catch (error) {
  console.log(error.code); // 1
}

// Safe mode (existing pattern - unchanged)
const result = await sh.safe`exit 1`;  
if (!result.ok) {
  console.log(result.error.code); // 1
}

// Finally blocks work as expected
sh`long-running-command`
  .then(result => processResult(result))
  .catch(error => handleError(error))  
  .finally(() => cleanup());
```

## Testing Strategy

- Test Process instances have then/catch/finally methods
- Verify await resolves to correct ProcessResult structure
- Test Promise chaining with multiple .then() calls
- Test error handling through catch() and try/catch  
- Test finally() executes in success and error cases
- Verify safe mode behavior (resolve with error, don't reject)
- Test auto-start behavior when then() called on deferred process

## Definition of Done

- Process class implements full thenable interface
- All existing async patterns work unchanged (backward compatibility)
- New thenable behavior tested comprehensively  
- Error handling maintains existing semantics (throw vs safe mode)
- Performance impact is negligible
- Documentation shows Promise integration examples