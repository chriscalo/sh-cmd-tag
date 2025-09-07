# GitHub Copilot Instructions for sh-cmd-tag

**ALWAYS FOLLOW THESE INSTRUCTIONS FIRST.** Only fallback to additional search and context gathering if the information in these instructions is incomplete or found to be in error.

## Project Overview

sh-cmd-tag is a **Node.js ES module** library providing secure shell command execution through template literals. It's designed with security-first principles, comprehensive test coverage, and intuitive API design.

## Working Effectively

### Bootstrap and Test
- **Run tests**: `npm test` -- takes ~2.2 seconds. NEVER CANCEL. Set timeout to 10+ minutes.
- **Verbose tests**: `npm run test:verbose` -- includes debug output for troubleshooting
- **Node.js version**: Uses Node.js v20+ (built-in test runner)

### Key Commands and Timing
- `npm test` -- Runs ~140 tests in ~2.2 seconds. **NEVER CANCEL** - always wait for completion
- `node --version` -- Check Node.js version (requires v18.0.0+, project uses v20+)
- `node -e "import { sh, cmd } from './index.js'; ..."` -- Manual testing of functionality

### Development Dependencies
- **None** - This is a zero-dependency library
- Uses Node.js built-in modules: `node:child_process`, `node:stream`, `node:path`, etc.
- No build step required - source is directly executable

## Core Architecture

### Main Components
- **`sh`** - Async shell execution with shell expansion (pipes, variables)
- **`cmd`** - Direct command execution without shell interpretation  
- **Security layer** - Automatic shell escaping prevents injection attacks
- **ProcessResult** - Success result object with `.ok`, `.output`, `.error` properties
- **ProcessError** - Detailed error class with exit codes and debug info

### API Patterns
```javascript
// Basic async usage
const result = await sh`echo "Hello World"`;
console.log(result.output); // "Hello World"

// Safe interpolation (automatically escaped)
const filename = "my file.txt";  
await sh`touch ${filename}`; // Becomes: touch 'my file.txt'

// Object interpolation (--key value pairs)
const config = { host: 'localhost', port: 3000 };
await sh`curl ${config}`; // Becomes: curl --host=localhost --port=3000

// Array interpolation (space-separated)
const files = ['file1.txt', 'file2.txt'];
await sh`rm ${files}`; // Becomes: rm file1.txt file2.txt

// Synchronous execution
const result = sh.sync`echo "test"`;

// Safe mode (no exceptions on failure)
const result = await sh.safe`false`; // Returns result with ok: false
```

### Key Differences
- **`sh`** - Uses shell, supports pipes/variables: `sh`echo $HOME | wc -c``
- **`cmd`** - Direct execution, no shell features: `cmd`echo "literal | pipe"`

## Validation Scenarios

After making changes to the library, **ALWAYS** test these scenarios:

### 1. Basic Functionality Test
```javascript
node -e "
import { sh, cmd } from './index.js';
console.log('Testing basic commands...');
const result = await sh\`echo 'Hello World'\`;
console.log('Output:', result.output);
console.log('Success:', result.ok);
"
```

### 2. Security and Interpolation Test  
```javascript
node -e "
import { sh } from './index.js';
const filename = 'test file.txt';
const result = await sh\`echo \${filename}\`;
console.log('Safe interpolation result:', result.output);
"
```

### 3. Object/Array Interpolation Test
```javascript
node -e "
import { sh } from './index.js';
const config = { host: 'localhost', port: 3000 };
const files = ['file1.txt', 'file2.txt'];
console.log('Object:', (await sh\`echo \${config}\`).output);
console.log('Array:', (await sh\`echo \${files}\`).output);
"
```

### 4. Error Handling Test
```javascript
node -e "
import { sh } from './index.js';
try {
  await sh\`false\`;
} catch (e) {
  console.log('Error handled correctly:', e.name === 'ProcessError');
}
"
```

## Development Rules

### Critical ES Module Requirements
- **This is an ES module project** using `"type": "module"` in package.json
- **NEVER create CommonJS files** - all JavaScript uses import/export syntax
- Use `node:` prefix for built-in modules: `import fs from "node:fs"`

### From AGENTS.md - Mandatory Rules
- **DON'T** rename files/functions unless explicitly instructed
- **DON'T** insert TODO comments or speculative suggestions  
- **DON'T** refactor unless explicitly requested
- **DON'T** create CommonJS files (.cjs) - this is an ES module project
- **DON'T** compromise security features or escaping mechanisms

### Testing Requirements
- **ALWAYS run full test suite** after ANY changes: `npm test`
- Test coverage: ~140 tests covering security, functionality, streaming, edge cases
- Follow strict TDD: failing test first, then minimal implementation
- Use descriptive test names explaining behavior being tested
- Always define `actual` and `expected` variables in tests for clarity

### Code Style (from STYLE.md)
- Use 2-space indentation for all languages
- Wrap lines at 80 characters  
- Use double-quoted strings
- Use descriptive function names instead of comments
- Define helper functions in call order (top-down structure)
- Extract complex logic into named functions

## Security Guidelines

This library prevents shell injection attacks through:
- **Automatic escaping** of all interpolated values
- **Validation** of object keys and array elements  
- **Safe string marking** for trusted input via `markSafeString()`
- **Context-aware escaping** based on shell quoting

### Security Testing
When modifying security-related code:
- Review all injection prevention tests
- Add tests for new attack vectors
- Never disable or weaken escaping mechanisms  
- Document security assumptions clearly

## Common Gotchas

### Test Environment Differences
- Some tests may fail due to shell error message format differences
- Error message format: `/bin/sh: 1: command: not found` vs `/bin/sh: command: not found`
- These are environment-specific and don't affect core functionality
- **Core library functionality works correctly** despite these test failures

### Missing Features
- The README mentions `sh.stream` API which is not yet implemented
- Focus on the working APIs: `sh`, `cmd`, `.sync`, `.safe`, `.interactive`

## File Structure

```
/
├── index.js                    # Main library source
├── index.test.js              # Core functionality tests  
├── index.test.*.js            # Specialized test files
├── package.json               # ES module configuration
├── README.md                  # API documentation
├── AGENTS.md                  # AI assistant behavioral rules
├── CLAUDE.md                  # Claude-specific guidance
├── STYLE.md                   # Code style guidelines
└── docs/                      # Additional documentation
```

## Timing Expectations

- **Tests**: ~2.2 seconds total (measured). **NEVER CANCEL** - Set 10+ minute timeouts
- **Manual validation**: Each validation scenario takes <1 second
- **No build step**: Source is directly executable, no compilation needed

## Important Notes

- This is a **zero-dependency** library - don't add external dependencies
- **Security-first design** - all interpolated values are automatically escaped
- **Comprehensive test coverage** - 140+ tests ensure stability
- **ES modules only** - never mix with CommonJS patterns  
- **Node.js built-in test runner** - no external test framework needed

Always run `npm test` and validate core functionality after making any changes to ensure no regressions in this security-critical library.