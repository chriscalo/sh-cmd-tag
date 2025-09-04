# Epic 2: Process Class Enhancement

**Status:** Approved  
**Priority:** P1 (High)  
**Labels:** process-class, streams, deferred-execution  
**Assignee:** Development Team  
**Epic Summary:** Implement an enhanced Process class that provides advanced process control, stream access, and deferred execution while maintaining complete backward compatibility.

## Epic Description

As developers using sh-cmd-tag for complex workflows, we need advanced process control capabilities including deferred execution, direct stream access, and process introspection to build sophisticated command orchestration and monitoring systems.

This epic introduces a Process class that encapsulates child process execution with streaming output and enhanced control capabilities while ensuring all existing APIs continue to work unchanged.

## Success Criteria

- [x] Process class implements thenable interface for Promise compatibility
- [x] Deferred execution via { immediate: false } option
- [x] Direct stream access (stdout, stderr, stdin) for advanced users  
- [x] Process introspection (command string, configuration)
- [x] Stable streams available before process starts
- [x] Manual start() method for deferred processes
- [x] Complete backward compatibility - all existing tests pass
- [x] Process piping capabilities for command chaining
- [x] Idempotent start() behavior for robust usage

## User Stories

- [Story 2.1: Process Class with Thenable Interface](./story-02.01.process-class-thenable.md)
- [Story 2.2: Deferred Process Execution](./story-02.02.deferred-execution.md)  
- [Story 2.3: Stream Access and Manipulation](./story-02.03.stream-access.md)
- [Story 2.4: Process Introspection](./story-02.04.process-introspection.md)
- [Story 2.5: Process Piping and Chaining](./story-02.05.process-piping.md)
- [Story 2.6: Backward Compatibility Guarantee](./story-02.06.backward-compatibility.md)

## Dependencies

- Epic 1: Core Shell Execution API must be complete
- PassThrough streams for stable stream interfaces  
- Enhanced error handling for process lifecycle management

## Technical Architecture

**Process Class Features:**
- Thenable interface (then, catch, finally) for Promise compatibility
- Immediate vs deferred execution control  
- Stream exposure before process start for setup flexibility
- Read-only introspection properties
- Idempotent manual execution control

**Backward Compatibility:**
- All existing sh\`...\` and cmd\`...\` patterns work unchanged
- ProcessResult and ProcessError classes unchanged
- Sync variants bypass Process class entirely
- No breaking changes to public APIs

## Definition of Done

- All acceptance criteria met for each user story
- Existing tests continue to pass unchanged  
- New Process class functionality fully tested
- Performance parity with existing implementation
- Documentation updated with advanced usage examples
- Stream lifecycle properly managed (no memory leaks)