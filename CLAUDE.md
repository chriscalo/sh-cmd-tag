# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working
with code in this repository.

## Commands

**Testing:**
```bash
npm test  # Runs all tests with Node.js test runner
npm run test:verbose  # Runs tests with debug output
```

**CRITICAL DIRECTIVE FOR CLAUDE:** ALWAYS run the full test suite after making ANY changes to ensure no regressions. This project has a comprehensive test suite covering:
- Core shell execution functionality
- Security and escaping mechanisms  
- Streaming output processing
- Object/array interpolation
- Error handling and edge cases

## Architecture

This is a **Node.js ES module** providing template literal shell command execution with security-first design:

### Core Components
- **`sh`** - Async shell execution with interpolation safety
- **`cmd`** - Direct command execution (sync/async modes)
- **Security layer** - Automatic shell escaping and injection prevention
- **Streaming support** - Real-time output processing capabilities
- **ProcessResult/ProcessError** - Comprehensive result and error handling

### Key Features
- Template literal syntax for intuitive command construction
- Safe interpolation with automatic shell escaping
- Object/array interpolation (objects become --flag value pairs, arrays become space-separated)
- Streaming output with latency tracking
- Security-first approach preventing shell injection
- Comprehensive error reporting with exit codes and output

## Development Rules

**CRITICAL DIRECTIVE FOR CLAUDE:** This is an ES module project using `"type": "module"` in package.json. All JavaScript files use ES module syntax (import/export). Never create CommonJS files (.cjs).

**From AGENTS.md:**
- Never rename files/functions unless explicitly instructed
- Don't insert TODO comments or speculative suggestions  
- Don't refactor unless explicitly requested
- For non-trivial bugs: use diagnostic logging, never attempt one-shot fixes
- Work on one test at a time following strict TDD

**From STYLE.md:**
- Use 2-space indentation for all languages
- Wrap lines at 80 characters
- Indent blank lines to match surrounding code
- Use descriptive function names instead of comments
- Define helper functions in call order (top-down structure)
- Use double-quoted strings, kebab-case for CSS classes
- Extract complex logic into named functions

## Testing Framework

Uses Node.js built-in test runner with:
```javascript
import { test } from "node:test";
import { strict as assert } from "node:assert";

test("description", () => {
  const actual = functionToTest();
  const expected = expectedValue;
  assert.equal(actual, expected);
});
```

Tests cover security, functionality, streaming, and edge cases. Always define `actual` and `expected` variables in tests for clarity.

## Security

This module prioritizes security through:
- Automatic shell escaping of all interpolated values
- Rejection of malicious object keys and array elements
- Safe string marking system for trusted input
- Comprehensive injection prevention testing
- Context-aware escaping based on shell quoting

When working on security features, always run the full test suite to ensure no vulnerabilities are introduced.
