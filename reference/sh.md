---
title: "sh & cmd"
---

# `sh` & `cmd`

The two primary template tags. Both build a command from a template literal,
execute it, and resolve to a [`ProcessResult`](/reference/utilities#processresult).

- **`sh`** runs the command through a shell (`/bin/sh`), enabling pipes, globs,
  redirects, and other shell features.
- **`cmd`** executes the program directly, without a shell.

## `sh` — shell execution

```javascript
const result = await sh`command ${arg}`;
```

Resolves to a `ProcessResult` after the command completes:

```javascript
{
  ok: true,
  output: "command result\n",
  debug: "",
}
```

## `cmd` — direct execution

```javascript
const result = await cmd`command ${arg}`;
```

Resolves to a `ProcessResult` after the command completes:

```javascript
{
  ok: true,
  output: "command output\n",
  debug: "",
}
```

## Interpolation

Both tags apply the same [interpolation rules](/guide/interpolation): strings are
[shell-escaped](/guide/shell-escaping), objects expand into `--flag=value`
pairs, and arrays expand into space-separated arguments.

```javascript
const opts = { verbose: true, output: "file.txt" };
await sh`command ${opts}`;
// command --verbose --output=file.txt

const files = ["a.txt", "b.txt"];
await sh`rm ${files}`;
// rm a.txt b.txt
```

## Chainable modifiers

Both `sh` and `cmd` expose chainable properties that change how a command runs.
Each modifier returns a tag you can call with a template literal.

### Safe mode

`.safe` returns a `ProcessResult` with `ok: false` instead of throwing when the
command fails. See [Error Handling](/guide/error-handling#non-throwing-behavior-with-safe).

```javascript
const result = await sh.safe`ls /nonexistent`;
if (!result.ok) {
  console.error(result.error);
}
```

### Sync execution

`.sync` runs the command synchronously, blocking until it completes, and returns
the `ProcessResult` directly (no `await`):

```javascript
const result = sh.sync`echo hello`;
console.log(result.output); // "hello\n"
```

`.sync` composes with the other modifiers — for example `sh.sync.safe` runs
synchronously without throwing.

### Interactive mode

`.interactive` wires the command up to the current process's input, output, and
debug streams, so it behaves like running the command directly in your terminal:

```javascript
await sh.interactive`vim notes.txt`;
```

### Providing input

`.input()` supplies data to the command's standard input:

```javascript
await sh.input("hello\n")`cat`;
```

## Async vs. sync summary

| Call            | Returns                      | Blocks? |
| --------------- | ---------------------------- | ------- |
| `await sh\`…\`` | `Promise<ProcessResult>`     | No      |
| `sh.sync\`…\``  | `ProcessResult`              | Yes     |

The same applies to `cmd` and `cmd.sync`.
