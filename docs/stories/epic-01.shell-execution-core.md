# Epic 1: Core Shell Execution API

**Status:** Approved  
**Priority:** P0 (Critical)  
**Labels:** core, api, security  
**Assignee:** Development Team  
**Epic Summary:** Implement the fundamental sh and cmd template tag functions that provide ergonomic shell command execution with guaranteed safety and consistent interfaces.

## Epic Description

As developers building Node.js applications, we need a secure, ergonomic API for executing shell commands that eliminates common security vulnerabilities while providing the flexibility of shell features or direct process execution.

This epic establishes the foundation of the sh-cmd-tag library with template literal syntax, automatic security escaping, and dual execution modes.

## Success Criteria

- [x] Template literal syntax: sh\`command\` and cmd\`command\`  
- [x] Automatic shell escaping prevents all injection vulnerabilities
- [x] Dual execution modes: shell interpretation (sh) vs direct (cmd)
- [x] Consistent ProcessResult and ProcessError interfaces  
- [x] Support for sync and async execution patterns
- [x] Object/array interpolation for command construction
- [x] Streaming output with <50ms latency
- [x] Comprehensive security test coverage

## User Stories

- [Story 1.1: Template Literal Shell Execution](./story-01.01.template-literal-shell-execution.md)
- [Story 1.2: Direct Command Execution](./story-01.02.direct-command-execution.md)  
- [Story 1.3: Security-First Interpolation](./story-01.03.security-first-interpolation.md)
- [Story 1.4: Object and Array Interpolation](./story-01.04.object-array-interpolation.md)
- [Story 1.5: Synchronous Execution Mode](./story-01.05.synchronous-execution-mode.md)
- [Story 1.6: Error Handling and Result Objects](./story-01.06.error-handling-result-objects.md)
- [Story 1.7: Streaming Output Processing](./story-01.07.streaming-output-processing.md)

## Dependencies

- Node.js child_process module
- Comprehensive test suite for security validation
- Cross-platform shell compatibility testing

## Technical Debt

- Manual stream handling complexity (addressed in Epic 2)
- Buffer management for real-time output processing

## Definition of Done

- All acceptance criteria met for each user story
- Comprehensive tests pass with full coverage
- Security audit confirms no injection vulnerabilities  
- Performance benchmarks show <50ms streaming latency
- Documentation complete with usage examples
- Cross-platform compatibility verified