---
title: "Guide"
---

# Guide

`sh-cmd-tag` provides template tag functions for running shell commands from
Node.js. This guide walks through everything from your first command to
streaming output and error handling.

## In this section

- **[Getting Started](/guide/getting-started)** — install the package and run
  your first `sh` and `cmd` commands.
- **[Interpolation](/guide/interpolation)** — interpolate strings, objects, and
  arrays into commands.
- **[Shell Escaping](/guide/shell-escaping)** — how values are escaped, and how
  to opt out for trusted input.
- **[Streaming Output](/guide/streaming)** — process output in real time with
  the `Process` class.
- **[Error Handling](/guide/error-handling)** — throwing vs. non-throwing
  execution and the `ProcessError` shape.

## Two tags: `sh` and `cmd`

The package exposes two primary template tags:

- **`sh`** runs the command through a shell (`/bin/sh`), so pipes, globs,
  redirects, and other shell features work.
- **`cmd`** executes a program directly without a shell, which is faster and
  avoids shell parsing entirely.

Both resolve to a [`ProcessResult`](/reference/utilities#processresult) and both
support the same interpolation rules and chainable modifiers like
[`.safe`](/guide/error-handling#safe-mode) and
[`.sync`](/reference/sh#sync-execution).
