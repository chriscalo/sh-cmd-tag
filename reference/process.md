---
title: "Process"
---

# `Process`

The `Process` class encapsulates a child process with streaming output and
enhanced control. Use it when you need to read a command's output as it arrives
rather than waiting for it to finish. See the [Streaming Output](/guide/streaming)
guide for a walkthrough.

## Constructor

```javascript
new Process(commandString, config?)
```

- **`commandString`** — the command to execute, as a string.
- **`config`** — optional configuration object.

```javascript
import { Process } from "@chriscalo/sh-cmd-tag";

const process = new Process("npm run build");
```

### Configuration

| Option      | Default | Description                                             |
| ----------- | ------- | ------------------------------------------------------- |
| `immediate` | `true`  | Start the process as soon as it is constructed.         |
| `shell`     | `true`  | Run the command through a shell.                        |

Pass `{ immediate: false }` to construct the process without starting it, then
call [`start()`](#start) yourself:

```javascript
const process = new Process("npm test", { immediate: false });
process.start();
```

## Properties

### `command`

The command string the process was created with.

### `started`

`true` once the process has been started, `false` otherwise.

### `config`

The frozen configuration object in effect for this process.

### `output`

The process's standard output stream (stdout), or `null` before it starts.
Iterate it to read output as it arrives:

```javascript
for await (const chunk of process.output) {
  console.log(chunk.toString());
}
```

### `debug`

The process's standard error stream (stderr), or `null` before it starts.

### `input`

The process's standard input stream (stdin), or `null` before it starts. Write
to it to send input to the command.

## Methods

### `start()`

Starts the process execution. Calling `start()` on a process that has already
started throws an error, so a process runs at most once:

```javascript
const process = new Process("echo hi", { immediate: false });
process.start();
process.start(); // throws: already been started
```
