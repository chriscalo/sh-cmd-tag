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

```javascript
import { sh, cmd } from "sh-cmd-tag";
```

### Direct command execution with `cmd`

```javascript
const result = await cmd`echo "Hello World"`;
```

The resolved `result` object is a `ProcessResult` with information about the command execution:

```javascript
{
  ok: true,
  output: "Hello World\n",
  debug: ""
}
```

### Shell execution with `sh`

```javascript
const result = await sh`echo "hello world" | wc -w`;
```

This example uses shell pipes to count words. The resolved `result` object contains:

```javascript
{
  ok: true,
  output: "2\n",
  debug: ""
}
```

### Escaped interpolation of variables

```javascript
const filename = "my file.txt";
await sh`touch ${filename}`;
```

This automatically escapes the filename as `'my file.txt'`. The final command that gets executed is:

```sh
touch 'my file.txt'
```

Note: `cmd` interpolation works similarly but without shell expansion.

### Object interpolation for command flags

```javascript
const config = { host: "localhost", port: 3000, quiet: false };
await sh`curl ${config}`;
```

This becomes the following command (note that falsy values like `false` are dropped):

```sh
curl --host=localhost --port=3000
```

Note: `cmd` interpolation works the same way.

### Array interpolation for multiple arguments

```javascript
const files = ["file1.txt", "file2.txt"];
await sh`rm ${files}`;
```

This becomes the following command:

```sh
rm file1.txt file2.txt
```

Note: `cmd` interpolation works the same way.

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
```

Resolves to a `ProcessResult` object after command completion:

```javascript
{
  ok: true,
  output: "command result\n",
  debug: "",
}
```

### `cmd` - Async Command Execution without Shell Expansion

```javascript
const result = await cmd`command ${arg}`;
```

Resolves to a `ProcessResult` object after the command completes:

```javascript
{
  ok: true,
  output: "command output\n",
  debug: ""
}
```

### Object/Array Interpolation

Objects are converted to command line flags and arrays become space-separated arguments:

```javascript
const opts = { verbose: true, output: "file.txt" };
await sh`command ${opts}`;
```

Objects become --key=value pairs. This becomes the following command:

```sh
command --verbose --output=file.txt
```

```javascript
const files = ["a.txt", "b.txt"];
await sh`rm ${files}`;
```

Arrays become space-separated values. This becomes the following command:

```sh
rm a.txt b.txt
```

### Streaming

Real-time output processing:

```javascript
for await (const chunk of sh.stream`long-running-command`) {
  console.log("Received:", chunk);
}
```

Stream chunks as they arrive.

```javascript
await sh.live`interactive-command`;
```

Live output with direct console interaction.

### Error Handling

You can choose whether commands throw exceptions on failure or return `ProcessResult` with `.ok === false`.

Throwing behavior (default):

```javascript
try {
  await sh`ls /nonexistent/directory`;
} catch (error) {
  console.error(error);
}
```

The error will be an instance of `ProcessError`:

```javascript
{
  name: "ProcessError",
  message: "Command failed with exit code 1",
  code: 1,
  output: "",
  debug: "",
}
```

Non-throwing behavior with `.safe`:

```javascript
const result = await sh.safe`ls /nonexistent/directory`;
```

The command that gets executed is:

```sh
ls /nonexistent/directory
```

The `result` variable contains information about the failed command execution:

```javascript
{
  ok: false,
  output: "",
  debug: "",
  error: {
    name: "ProcessError",
    message: "Command failed with exit code 1",
    code: 1,
    output: "",
    debug: "",
  },
}
```

## Shell Escaping

All interpolated values are automatically escaped to protect against shell injection:

```javascript
const userInput = "file with spaces; echo gotcha";
await sh`cat ${userInput}`;
```

This safely becomes the following command:

```sh
cat 'file with spaces; echo gotcha'
```

Use `markSafeString()` only for trusted input:

```javascript
import { markSafeString } from "sh-cmd-tag";

const trustedCommand = markSafeString("ls -la");
await sh`${trustedCommand}`;
```

No escaping applied to marked safe strings. This becomes:

```sh
ls -la
```

## Testing

```bash
npm test
```

Runs comprehensive tests covering all functionality.
