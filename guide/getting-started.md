---
title: "Getting Started"
---

# Getting Started

## Installation

`sh-cmd-tag` is published to GitHub Packages. Tell npm where to find the
`@chriscalo` scope by adding an `.npmrc` file to your project root:

```ini
@chriscalo:registry=https://npm.pkg.github.com
```

Then install the package:

```sh
npm install @chriscalo/sh-cmd-tag
```

## Your first command

Import the tags and run a command. Every command resolves to a
[`ProcessResult`](/reference/utilities#processresult):

```javascript
import { sh, cmd } from "@chriscalo/sh-cmd-tag";

const result = await cmd`echo "Hello World"`;
```

The resolved `result` is a `ProcessResult` describing the execution:

```javascript
{
  ok: true,
  output: "Hello World\n",
  debug: "",
}
```

- `ok` — whether the command exited successfully.
- `output` — everything the command wrote to standard output.
- `debug` — everything the command wrote to standard error.

## Shell execution with `sh`

Use `sh` when you want shell features like pipes, globs, and redirects:

```javascript
const result = await sh`echo "hello world" | wc -w`;
```

The shell evaluates the pipe and counts words:

```javascript
{
  ok: true,
  output: "2\n",
  debug: "",
}
```

## Direct execution with `cmd`

Use `cmd` to run a program directly, without a shell. It is faster and does no
shell parsing, so shell metacharacters are treated as literal text:

```javascript
const result = await cmd`echo Hello World`;
console.log(result.output); // "Hello World\n"
```

::: tip Which one should I use?
Reach for `cmd` by default — it is faster and avoids the shell entirely. Use
`sh` only when you specifically need pipes, globs, redirects, or other shell
behavior.
:::

## Next steps

- Learn how to safely pass variables in [Interpolation](/guide/interpolation).
- Understand automatic [Shell Escaping](/guide/shell-escaping).
- Handle long-running commands with [Streaming Output](/guide/streaming).
- Deal with failures in [Error Handling](/guide/error-handling).
