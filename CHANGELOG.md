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

**Driving a command as it runs.** Give `input` a stream you hold and the
port stays open for as long as that stream does, so a REPL or a database
shell can be written to and read from in turn. Writing to `proc.input`
directly works before `start()`, where the buffered bytes become the
connection; a port with nothing connected closes stdin at once — which is
what lets `` sh`sort` `` finish — so writing to it afterwards throws instead
of quietly going nowhere.

**Pipelines.** `pipe` accepts a command or a writable stream and returns the
pipeline so far: awaitable when every stage has finished, iterable over the
last stage, and pipeable onward. A pipeline succeeds only if every stage
succeeds, and a failure reports which stage and tears down the rest.

**Control.** `stop()` terminates politely and escalates to an unrefusable
kill after `gracePeriod`; `kill()` is immediate; `interrupt()` is the Ctrl-C
equivalent. Signals reach the child's whole process group. `timeout` applies
the same escalation on a deadline and reports `timedOut`. A `signal` option
accepts an `AbortSignal`.

**Why a command ended.** A command a signal ended never picked an exit code,
so `code` is `undefined` and `signal` names what ended it, rather than the
message reporting an exit code of `null`. `timedOut` and `aborted` say
whether a deadline or a cancellation was responsible, so a caller composing
`AbortSignal.any([request.signal, AbortSignal.timeout(30_000)])` can tell
the three apart. `sync` reports all of this identically, and refuses to run
a command whose signal was aborted before the call.

**Durations** are milliseconds as a number, or a string with a unit —
`"500ms"`, `"30s"`, `"5m"`, `"1.5h"`. A string without a unit is an error.

**Working directory and shell.** Commands run where the caller is running
unless `cwd` says otherwise. Left to itself the library picks a shell —
`bash` where available — so the same command behaves the same way on macOS
and Linux; `shell` accepts a string for a caller who wants zsh, dash, or a
particular path, and `false` to execute directly.

**Where the bytes go.** Each of `input`, `output`, and `debug` names a port,
and its value says what that port is connected to: `false` for nothing, `true`
to put it in the result, a stream to read from or write to, and on `input` a
string for literal text. Several connections are written as a list — read in
order on `input`, since sources follow one another, and fanned out on `output`
and `debug`, where every destination receives every byte. The defaults are
`output: true`, `debug: true`, `input: false`, so a command is kept but not
shown and gets no input — which is why a command that reads stdin finishes
instead of waiting for bytes that cannot arrive. A port that was not kept
reads as `undefined` rather than `""`, so "never asked for it" is
distinguishable from "asked, and it printed nothing". Nothing is discarded, so
a string you get back is all of it; a command producing more than a JavaScript
string can hold fails with an error naming the command and the remedies.

**Bounded logs.** `head(size)` and `tail(size)` are exported writables that
keep the first or last bytes written to them and expose the result as
`text` — one for a compiler whose first error caused every later one, the
other for a build that died at the end. They ship because trimming bytes to
a limit cuts multi-byte characters in half, so a hand-rolled version works
on ASCII and then corrupts the first accented word in a build log. A size is
a number of bytes, or a string whose unit is visible: `"64kB"` counts in
thousands, `"64KiB"` in units of 1024, and a string without a unit is an
error.

**Terminals.** `interactive` hands the child the real file descriptors, so it
sees a terminal and `vim`, `ssh`, and password prompts work — and its output
is unobservable in exchange, because the bytes never pass through this
process. Every other mode pipes, so iteration, pipelines, and the result
always work. There is no colour option: a command decides colour by asking
whether its output is a terminal, so colour appears wherever one is involved
and not otherwise.

**Environment.** `env` is the child's environment rather than an addition to
it, the same meaning `child_process` and `subprocess` give it. Extending is
explicit: `{ env: { ...process.env, FOO: "bar" } }`.

**Commands do not outlive the program that started them.** Ending — including
Ctrl-C, which is how most scripts end — signals each running command's process
group on the way out.

**Requirements.** Node 22 or newer, macOS or Linux, zero dependencies.
Windows is not supported: the escaping is POSIX-specific.
