---
title: "Process"
---

# `Process`

The `Process` class encapsulates a child process with streaming output and
enhanced control. Use it when you need to read a command's output as it arrives
rather than waiting for it to finish. See the [Streaming Output](/guide/streaming)
guide for a walkthrough.

::: warning `Process` is not implemented yet
The class, its constructor, its configuration, and its getters all behave as
described below, but `start()` does not spawn a child process yet — it assigns
placeholder streams that never emit or accept data. Treat this page as the
intended API, not as behavior you can rely on today; track the implementation in
[issue #31](https://github.com/chriscalo/sh-cmd-tag/issues/31).
:::

## Constructor

```javascript
new Process(commandString, config?)
```

- **`commandString`** — the command to execute, as a string.
- **`config`** — optional configuration object.

```javascript
import { Process } from "@chriscalo/sh-cmd-tag";

const build = new Process("npm run build");
```

### Configuration

| Option      | Default | Description                                             |
| ----------- | ------- | ------------------------------------------------------- |
| `immediate` | `true`  | Start the process as soon as it is constructed.         |
| `shell`     | `true`  | Run the command through a shell.                        |

Pass `{ immediate: false }` to construct the process without starting it, then
call [`start()`](#start) yourself:

```javascript
const tests = new Process("npm test", { immediate: false });
tests.start();
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
for await (const chunk of build.output) {
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
const greeting = new Process("echo hi", { immediate: false });
greeting.start();
greeting.start(); // throws: already been started
```
