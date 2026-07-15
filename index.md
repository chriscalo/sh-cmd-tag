---
layout: home
title: sh-cmd-tag
titleTemplate: Shell command template tags for Node.js
hero:
  name: sh-cmd-tag
  text: Shell commands as template tags
  tagline: >-
    Run shell commands from Node.js with template-literal syntax, safe
    interpolation, streaming output, and flexible I/O control.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /reference/
    - theme: alt
      text: GitHub
      link: https://github.com/chriscalo/sh-cmd-tag
features:
  - icon: 🏷️
    title: Template literal syntax
    details: >-
      Build commands with ordinary template strings. Use sh for full shell
      expansion or cmd to run a program directly.
    link: /reference/sh
  - icon: 🛡️
    title: Safe interpolation
    details: >-
      Interpolated values are shell-escaped automatically, so untrusted input
      can't break out of an argument.
    link: /guide/shell-escaping
  - icon: 🧩
    title: Objects and arrays
    details: >-
      Objects expand into --flag=value pairs and arrays into space-separated
      arguments — no manual string building.
    link: /guide/interpolation
  - icon: 🌊
    title: Streaming output
    details: >-
      Read output as it arrives with the Process class for long-running
      commands.
    link: /guide/streaming
  - icon: 🧯
    title: Rich error handling
    details: >-
      Failures throw a detailed ProcessError, or opt into .safe to get a
      ProcessResult with ok === false instead.
    link: /guide/error-handling
  - icon: ⚡
    title: Sync and async
    details: >-
      Await a command for async execution, or reach for the .sync variant when
      you need a blocking call.
    link: /reference/sh
---

## Quick start

Install from GitHub Packages, then import the tags you need:

```sh
npm install @chriscalo/sh-cmd-tag
```

```javascript
import { sh, cmd } from "@chriscalo/sh-cmd-tag";

// Shell expansion — pipes, globs, redirects
const words = await sh`echo "hello world" | wc -w`;
console.log(words.output); // "2\n"

// Direct execution — no shell involved
const greeting = await cmd`echo Hello World`;
console.log(greeting.output); // "Hello World\n"
```

Head to [Getting Started](/guide/getting-started) for a guided tour, or jump
straight to the [API Reference](/reference/).
