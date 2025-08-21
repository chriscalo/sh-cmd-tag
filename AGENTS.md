# 🤖 Agent Instructions

For general project overview, see [README.md](README.md).
For style and code structure, see [STYLE.md](STYLE.md).

These instructions apply to any AI coding assistant (e.g. ChatGPT, Gemini,
Copilot, Claude) operating in this repository.

---

## 🎯 Agent Behavior Rules

- Obey all style and testing rules defined in [STYLE.md](STYLE.md).
- Always run `npm test` after making changes to ensure 127 tests still pass.
- Prioritize security - this is a shell execution library with injection risks.

---

## 🚫 Constraints

- **DON'T** rename files or functions unless explicitly instructed
- **DON'T** insert `TODO` comments or speculative suggestions
- **DON'T** refactor code unless explicitly requested
- **DON'T** create CommonJS files (.cjs) - this is an ES module project
- **DON'T** compromise security features or escaping mechanisms

---

## 🐛 Bug Fixes

For non-trivial bugs:
1. Use diagnostic logging to understand the issue
2. Write a failing test that reproduces the bug
3. Implement minimal fix to make test pass
4. Run full test suite to ensure no regressions

**Never attempt one-shot fixes** for complex issues.

---

## 🧪 Testing Approach

- Follow strict TDD: failing test first, then minimal implementation
- Work on one test at a time
- Use descriptive test names that explain the behavior being tested
- Always define `actual` and `expected` variables in tests for clarity
- Test security edge cases thoroughly when touching escaping logic

---

## 🔒 Security Guidelines

This library prevents shell injection attacks through:
- Automatic escaping of all interpolated values
- Validation of object keys and array elements
- Safe string marking for trusted input
- Context-aware quote handling

When modifying security-related code:
- Review all injection prevention tests
- Add tests for new attack vectors
- Never disable or weaken escaping mechanisms
- Document security assumptions clearly
