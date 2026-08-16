---
title: "Streaming Output"
---

# Streaming Output

Awaiting `sh` or `cmd` buffers the entire output and resolves once the command
finishes. For long-running commands — a build, an install, a watch process —
you often want to see output *as it happens*. The
[`Process`](/reference/process) class gives you access to the underlying streams.

## The `Process` class

Create a `Process` with a command string and read from its `output` stream:

```javascript
import { Process } from "@chriscalo/sh-cmd-tag";

const process = new Process("npm run build");
process.start();

for await (const chunk of process.output) {
  console.log("Build output:", chunk.toString());
}
```

Each `chunk` arrives as it is produced, so you can display progress, parse
incremental results, or forward the output somewhere else in real time.

## Available streams

A `Process` exposes the child process's three standard streams:

- **`output`** — standard output (stdout).
- **`debug`** — standard error (stderr).
- **`input`** — standard input (stdin), for writing to the process.

```javascript
const process = new Process("some-long-task");
process.start();

// Read standard output as it arrives.
for await (const chunk of process.output) {
  process.stdout.write(chunk);
}
```

## Immediate vs. deferred start

By default a `Process` starts immediately when constructed. Pass
`{ immediate: false }` to construct it without starting, then call `start()`
when you're ready:

```javascript
const process = new Process("npm test", { immediate: false });
// ...set things up...
process.start();
```

Calling `start()` on an already-started process throws, so a process runs at
most once.

See the [`Process` reference](/reference/process) for the full list of
properties and configuration options.
