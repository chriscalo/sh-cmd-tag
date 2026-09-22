# Changelog

## 1.0.0

The first release. `sh-cmd-tag` runs shell commands from template literals,
escaping every interpolated value so user input cannot escape its position.

**Execution.** `sh` runs a command through a shell; `cmd` runs it directly,
treating shell metacharacters literally. Both return a `Process`, which
resolves a `ProcessResult` when awaited. `.sync` returns a `ProcessResult`
immediately.

**Interpolation.** Values are escaped at every site. Objects become flags,
arrays become arguments, and `markSafeString` marks a value that is already
safe.

**Streaming.** A `Process` is async-iterable over stdout, and exposes
`output`, `debug`, and `input` streams that exist from construction — so
handlers and pipes can be attached before the process starts. `live`
forwards both output streams to the terminal while capturing them;
`interactive` also inherits stdin.

**Pipelines.** `pipe` accepts a command or a writable stream and returns the
pipeline so far: awaitable when every stage has finished, iterable over the
last stage, and pipeable onward. A pipeline succeeds only if every stage
succeeds, and a failure reports which stage and tears down the rest.

**Control.** `stop()` terminates politely and escalates to an unrefusable
kill after `gracePeriod`; `kill()` is immediate; `interrupt()` is the Ctrl-C
equivalent. Signals reach the child's whole process group. `timeout` applies
the same escalation on a deadline and reports `timedOut`. A `signal` option
accepts an `AbortSignal`.

**Durations** are milliseconds as a number, or a string with a unit —
`"500ms"`, `"30s"`, `"5m"`, `"1.5h"`. A string without a unit is an error.

**Colour.** `color: true` sets `FORCE_COLOR` in the child and `color: false`
sets `NO_COLOR` — never both, since whichever is asked for clears the other.
Unset, the library adds and removes nothing, so the child inherits whatever
the environment already holds, which may be neither variable or both.

**Environment.** Commands run in the caller's working directory unless `cwd`
says otherwise. Left to itself the library picks a shell — `bash` where
available — so the same command behaves the same way on macOS and Linux;
`shell` accepts a string for a caller who wants zsh, dash, or a particular
path, and `false` to execute directly.

**Captured output is bounded** by what a JavaScript string can hold, and the
result carries `truncated` once anything is dropped, so an endless producer
cannot grow the buffer past the point where the result could be built.

**Requirements.** Node 22 or newer, macOS or Linux, zero dependencies.
Windows is not supported: the escaping is POSIX-specific.
