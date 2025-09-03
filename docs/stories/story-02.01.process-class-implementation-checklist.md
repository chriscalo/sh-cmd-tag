# Story 2.1: Process Class Implementation Checklist

**Epic:** [Epic 2: Process Class Enhancement](./epic-02.process-class-enhancement.md)  
**Story:** [Story 2.1: Process Class with Thenable Interface](./story-02.01.process-class-thenable.md)

## TDD Implementation Tasks

### Module Structure
- [x] **Task 1:** `module exports Process class`
- [x] **Task 2:** `creates Process instance with command string`
- [x] **Task 3:** `Process uses default configuration`
- [x] **Task 4:** `Process merges custom config with defaults`
- [x] **Task 5:** `Process config is immutable`

### Process Lifecycle
- [x] **Task 6:** `Process with immediate true starts automatically`
- [x] **Task 7:** `Process with immediate false prevents automatic start`
- [x] **Task 8:** `start starts deferred process`
- [x] **Task 9:** `start throws error if already started`

### Stream Access
- [x] **Task 10:** `output getter provides stdout stream access`
- [x] **Task 11:** `debug getter provides stderr stream access`
- [x] **Task 12:** `input getter provides stdin stream access`

### Stable Stream Architecture
- [ ] **Task 13a:** `exposed streams available before process starts`
- [ ] **Task 13b:** `exposed streams remain stable after process starts`
- [ ] **Task 13c:** `stream handlers set before start receive data`
- [ ] **Task 13d:** `input written before start flows to child process`
- [ ] **Task 13e:** `input buffers multiple writes before start`
- [ ] **Task 13f:** `input does not eagerly consume from piped streams`
- [ ] **Task 13g:** `output streams only emit after process starts`

### Thenable Interface
- [ ] **Task 14:** `Process is awaitable with then method`
- [ ] **Task 15:** `then auto-starts deferred process`
- [ ] **Task 16:** `then resolves with ProcessResult on success`
- [ ] **Task 17:** `then rejects with ProcessError on failure`

### Process Piping
- [ ] **Task 18:** `pipe with array creates new Process`
- [ ] **Task 19:** `pipe auto-starts source process`
- [ ] **Task 20:** `pipe connects process output to next process input`

### Output Control
- [ ] **Task 21:** `output false prevents stdout forwarding`
- [ ] **Task 22:** `debug false prevents stderr forwarding`

### Process Execution
- [ ] **Task 23:** `Process captures stdout output`
- [ ] **Task 24:** `Process captures stderr output`

## Implementation Notes

### Key Files to Create/Modify
- Create helper files for Tasks 21-22:
  - `index.test.Process-no-output-invoke.js`
  - `index.test.Process-no-debug-invoke.js`

### Critical Architecture Points
- PassThrough streams for stable interface before process starts
- Promise.withResolvers() for thenable implementation
- Idempotent start() method behavior
- Input buffering for data written before process starts

### Testing Strategy
- Follow TDD: Red → Green → Refactor
- One test at a time, strict implementation order
- Use actual/expected pattern for clear assertions
- All tests must pass before moving to next task

## Definition of Done
- All 24 tasks completed with passing tests
- Process class fully implements thenable interface
- Stream lifecycle properly managed
- Backward compatibility maintained
- Performance requirements met