# sh-cmd-tag

Template tag functions for shell command execution with streaming output, safe
interpolation, and flexible I/O control.

## Features

- **Template literal syntax** for intuitive command construction
- **Safe interpolation** with automatic shell escaping
- **Object/array support** - interpolate complex data structures
- **Streaming output** - real-time command output processing  
- **Security-first** - prevents shell injection by default
- **Comprehensive error handling** with detailed ProcessError information
- **Both sync and async** execution modes

## Installation

This package is published to GitHub Packages, not npm. First authenticate with the GitHub CLI:

```bash
gh auth login
```

Then create a `.npmrc` file in your project:

```
@chriscalo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Set the token environment variable and install:

```bash
export GITHUB_TOKEN=$(gh auth token)
npm install @chriscalo/sh-cmd-tag
```

For alternative installation methods, see the [GitHub Packages documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).

## Quick Start

```javascript
import { sh, cmd } from "@chriscalo/sh-cmd-tag";

// Basic usage
const result = await sh`echo "Hello World"`;
console.log(result.output); // "Hello World"

// Safe interpolation
const filename = "my file.txt";
await sh`touch ${filename}`; // Automatically escaped as 'my file.txt'

// Object interpolation
const config = { host: "localhost", port: 3000 };
await sh`curl ${config}`; // Becomes: curl --host localhost --port 3000

// Array interpolation  
const files = ["file1.txt", "file2.txt"];
await sh`rm ${files}`; // Becomes: rm file1.txt file2.txt

// Streaming output
for await (const chunk of sh.stream`npm install`) {
  process.stdout.write(chunk);
}
```

## API Reference

### `sh` - Async Command Execution with Shell Expansion

```javascript
const result = await sh`command ${arg}`;
// Returns ProcessResult with .output, .ok, .error properties
```

### `cmd` - Async Command Execution without Shell Expansion

```javascript
const result = cmd`command ${arg}`;
// Returns ProcessResult immediately
```

### Object/Array Interpolation

Interpolate complex data structures:

```javascript
// Objects become --key value pairs
const opts = { verbose: true, output: "file.txt" };
await sh`command ${opts}`;
// Becomes: command --verbose --output file.txt

// Arrays become space-separated values
const files = ["a.txt", "b.txt"];
await sh`rm ${files}`;
// Becomes: rm a.txt b.txt
```

### Streaming

Real-time output processing:

```javascript
// Stream chunks as they arrive
for await (const chunk of sh.stream`long-running-command`) {
  console.log("Received:", chunk);
}

// Live output (inherit stdio)
await sh.live`interactive-command`;
```

### Error Handling

Detailed error information:

```javascript
try {
  await sh`false`; // Command that fails
} catch (error) {
  console.log(error instanceof ProcessError); // true
  console.log(error.code); // Exit code
  console.log(error.output); // Combined stdout/stderr
}
```

## Security

All values are automatically escaped to prevent shell injection:

```javascript
const userInput = "'; rm -rf /; echo '";
await sh`echo ${userInput}`; 
// Safe: echo ''\'''; rm -rf /; echo '\''';
```

Use `markSafeString()` only for trusted input:

```javascript
import { markSafeString } from "@chriscalo/sh-cmd-tag";

const trustedCommand = markSafeString("ls -la");
await sh`${trustedCommand}`; // No escaping applied
```

## Testing

```bash
npm test
```

Runs comprehensive tests covering all functionality.
