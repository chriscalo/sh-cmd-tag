---
title: "Streaming Output"
---

# Streaming Output

Awaiting `sh` or `cmd` buffers the entire output and resolves once the command
finishes. For long-running commands — a build, an install, a watch process —
you often want to see output *as it happens*. The
[`Process`](/reference/process) class gives you access to the underlying streams.

::: warning `Process` is not implemented yet
`Process` is exported and its API is settled, but `start()` does not spawn a
child process yet — it assigns placeholder streams that never emit, so
iterating `output` waits forever. This page describes the intended behavior;
track the implementation in
[issue #31](https://github.com/chriscalo/sh-cmd-tag/issues/31). For output you
can use today, await [`sh` or `cmd`](/reference/sh) and read `result.output`.
:::

## The `Process` class

Create a `Process` with a command string and read from its `output` stream. A
`Process` starts as soon as it is constructed, so there is nothing else to call:

```javascript
import { Process } from "@chriscalo/sh-cmd-tag";

const build = new Process("npm run build");

for await (const chunk of build.output) {
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
const task = new Process("some-long-task");

// Forward standard output to your own stdout as it arrives.
for await (const chunk of task.output) {
  process.stdout.write(chunk);
}
```

## Immediate vs. deferred start

By default a `Process` starts immediately when constructed. Pass
`{ immediate: false }` to construct it without starting, then call `start()`
when you're ready:

```javascript
const tests = new Process("npm test", { immediate: false });
// ...set things up...
tests.start();
```

Calling `start()` on an already-started process throws, so a process runs at
most once.

See the [`Process` reference](/reference/process) for the full list of
properties and configuration options.
