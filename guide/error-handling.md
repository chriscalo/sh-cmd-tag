---
title: "Error Handling"
---

# Error Handling

You choose how failures are reported: commands can **throw** an exception, or
they can **return** a result you inspect. By default they throw.

## Throwing behavior (default)

When a command exits with a non-zero code, `sh` and `cmd` reject with a
[`ProcessError`](/reference/utilities#processerror):

```javascript
try {
  await sh`ls /nonexistent/directory`;
} catch (error) {
  console.error(error);
}
```

The thrown `error` is a `ProcessError` with details about the failure:

```javascript
{
  name: "ProcessError",
  message: "Command failed with exit code 2: ls: cannot access '/nonexistent/directory': No such file or directory",
  code: 2,
  output: "",
  debug: "ls: cannot access '/nonexistent/directory': No such file or directory\n",
}
```

- `code` — the process exit code.
- `output` — anything written to stdout before failing.
- `debug` — anything written to stderr.

## Non-throwing behavior with `.safe`

Prefix a command with [`.safe`](/reference/sh#safe-mode) to get a
`ProcessResult` back instead of a thrown error — even when the command fails:

```javascript
const result = await sh.safe`ls /nonexistent/directory`;
```

The `result` reports the failure via `ok: false` and includes the same error
information under `error`:

```javascript
{
  ok: false,
  output: "",
  debug: "ls: cannot access '/nonexistent/directory': No such file or directory\n",
  error: {
    name: "ProcessError",
    message: "Command failed with exit code 1: ls: cannot access '/nonexistent/directory': No such file or directory",
    code: 1,
    output: "",
    debug: "ls: cannot access '/nonexistent/directory': No such file or directory\n",
  },
}
```

`.safe` is convenient when a non-zero exit is an expected outcome you want to
branch on rather than an exceptional event:

```javascript
const result = await sh.safe`grep -q "TODO" src/index.js`;
if (result.ok) {
  console.log("Found a TODO");
} else {
  console.log("No TODO found");
}
```

## Choosing an approach

- Use the **default throwing** behavior when a failure should abort the current
  flow — it integrates cleanly with `try`/`catch` and `async` error propagation.
- Use **`.safe`** when a failure is a normal branch in your logic and you'd
  rather inspect `result.ok` than catch an exception.

See the [`ProcessError` reference](/reference/utilities#processerror) for the
full shape of the error object.
