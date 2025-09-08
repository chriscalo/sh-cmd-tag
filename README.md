# sh-cmd-tag

Template tag functions for shell command execution with streaming output, safe
interpolation, and flexible I/O control.

## Features

- **Template literal syntax** for intuitive command construction
- **Safe interpolation** with automatic shell escaping
- **Object/array interpolation** - objects become command flags, arrays become arguments
- **Streaming output** - real-time command output processing  
- **Automatic shell escaping** - protects against shell injection attacks
- **Comprehensive error handling** with detailed ProcessError information
- **Both sync and async** execution modes

## Installation

```bash
npm install sh-cmd-tag
```

## Quick Start

### Basic command execution

```javascript
import { sh, cmd } from "sh-cmd-tag";

const result = await sh`echo "Hello World"`;
```

The output displays the text "Hello World".

### Safe interpolation of variables

```javascript
const filename = "my file.txt";
await sh`touch ${filename}`;
```

This automatically escapes the filename as `'my file.txt'`.

### Object interpolation for command flags

```javascript
const config = { host: "localhost", port: 3000 };
await sh`curl ${config}`;
```

This becomes: `curl --host=localhost --port=3000`

### Array interpolation for multiple arguments

```javascript
const files = ["file1.txt", "file2.txt"];
await sh`rm ${files}`;
```

This becomes: `rm file1.txt file2.txt`

### Streaming output

```javascript
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
const result = await cmd`command ${arg}`;
// Returns ProcessResult immediately
```

### Object/Array Interpolation

Objects are converted to command line flags and arrays become space-separated arguments:

```javascript
// Objects become --key value pairs
const opts = { verbose: true, output: "file.txt" };
await sh`command ${opts}`;

This becomes: `command --verbose --output=file.txt`

// Arrays become space-separated values
const files = ["a.txt", "b.txt"];
await sh`rm ${files}`;

This becomes: `rm a.txt b.txt`
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

You can choose whether commands throw exceptions on failure or return ProcessResult with `.ok === false`:

```javascript
// Throwing behavior (default)
try {
  await sh`false`; // Command that fails
} catch (error) {
  console.log(error instanceof ProcessError); // true
  console.log(error.code); // Exit code
  console.log(error.output); // Combined stdout/stderr
}

// Non-throwing behavior with .safe
const result = await sh.safe`false`;
console.log(result.ok); // false
console.log(result.error); // Error details
```

## Shell Escaping

All interpolated values are automatically escaped to protect against shell injection:

```javascript
const userInput = "file with spaces; echo gotcha";
await sh`cat ${userInput}`;
```

This safely becomes: `cat 'file with spaces; echo gotcha'`

Use `markSafeString()` only for trusted input:

```javascript
import { markSafeString } from "sh-cmd-tag";

const trustedCommand = markSafeString("ls -la");
await sh`${trustedCommand}`; // No escaping applied
```

## Testing

```bash
npm test
```

Runs comprehensive tests covering all functionality.
