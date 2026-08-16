---
title: "Utilities & Types"
---

# Utilities & Types

Helper functions for escaping and marking values, plus the shapes of the result
and error objects.

## Functions

### `markSafeString()`

```javascript
markSafeString(str)
```

Marks a string as safe so it is **not** shell-escaped when interpolated into an
`sh` or `cmd` template. Use it only for trusted input you fully control — see
the warning in [Shell Escaping](/guide/shell-escaping#opting-out-with-marksafestring).

```javascript
import { markSafeString } from "@chriscalo/sh-cmd-tag";

const safeArgs = markSafeString("-la --color=auto");
await sh`ls ${safeArgs}`; // ls -la --color=auto
```

### `isSafeString()`

```javascript
isSafeString(value)
```

Returns `true` if `value` has been marked safe with `markSafeString()`,
`false` otherwise.

### `shellEscape()`

```javascript
shellEscape(value)
```

Returns the shell-escaped form of `value`. This is the same escaping applied
automatically during interpolation, exposed for when you need the escaped string
directly.

```javascript
import { shellEscape } from "@chriscalo/sh-cmd-tag";

shellEscape("my file.txt"); // "'my file.txt'"
```

## Types

### `ProcessResult`

The object every command resolves to. Describes the outcome of an execution.

| Field    | Type      | Description                                             |
| -------- | --------- | ------------------------------------------------------- |
| `ok`     | `boolean` | Whether the command exited successfully.                |
| `output` | `string`  | Everything written to standard output.                  |
| `debug`  | `string`  | Everything written to standard error.                   |
| `error`  | `ProcessError` | Present on `.safe` results when the command failed. |

```javascript
{
  ok: true,
  output: "Hello World\n",
  debug: "",
}
```

### `ProcessError`

Thrown when a command fails (or attached as `result.error` under
[`.safe`](/guide/error-handling#non-throwing-behavior-with-safe)).

| Field     | Type     | Description                                     |
| --------- | -------- | ----------------------------------------------- |
| `name`    | `string` | Always `"ProcessError"`.                        |
| `message` | `string` | Human-readable summary including the exit code. |
| `code`    | `number` | The process exit code.                          |
| `output`  | `string` | Anything written to stdout before failing.      |
| `debug`   | `string` | Anything written to stderr.                     |

```javascript
{
  name: "ProcessError",
  message: "Command failed with exit code 2: ...",
  code: 2,
  output: "",
  debug: "ls: cannot access '/nonexistent': No such file or directory\n",
}
```
