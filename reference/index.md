---
title: "Reference"
---

# API Reference

Everything `sh-cmd-tag` exports, grouped by area.

## Template tags

- **[`sh` and `cmd`](/reference/sh)** — the two command-execution tags, plus the
  chainable `.safe`, `.sync`, `.interactive`, and `.input()` modifiers.

## Classes

- **[`Process`](/reference/process)** — encapsulates a child process with
  streaming `output`, `debug`, and `input` streams.

## Utilities and types

- **[Utilities](/reference/utilities)** — `markSafeString`, `isSafeString`,
  `shellEscape`, and the `ProcessResult` / `ProcessError` shapes.

## Exports at a glance

```javascript
import {
  sh,
  cmd,
  Process,
  ProcessResult,
  ProcessError,
  markSafeString,
  isSafeString,
  shellEscape,
} from "@chriscalo/sh-cmd-tag";
```

## Source

The entire library lives in a single module. You can
[read the full source](../index.js) — it's rendered right here on the docs site.
