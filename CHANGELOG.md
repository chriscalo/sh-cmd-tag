# Changelog

## 1.0.0

First public release, under the unscoped name `sh-cmd-tag`. Earlier
instructions pointed at `@chriscalo/sh-cmd-tag` on GitHub Packages, which was
never actually published anywhere.

### Fixed

- **Commands now run in the caller's working directory.** They previously ran
  in the library's own directory, because the caller-detection walked the
  stack looking for a frame outside a file named `process.js` — a filename
  this library has never had, so the check never matched and it returned its
  own location. Installed, that meant commands ran inside
  `node_modules/sh-cmd-tag`. Pass `cwd` to override.
- **Stopping a process stops what it started.** Signals reach the child's
  process group rather than the child alone, so a shell command does not
  leave its children running and holding the output pipe open.

### Added

- **`Process` is the execution engine.** `sh` and `cmd` return `Process`
  instances rather than plain promises, so a command can be deferred,
  streamed, piped, introspected, and stopped. Awaiting one still resolves the
  same `ProcessResult`, so existing code is unaffected.
- **Iteration.** `for await (const chunk of sh`npm install`)` yields stdout as
  it arrives. A failing command throws when iteration ends rather than
  finishing quietly on partial output, and breaking out early stops the child.
- **Pipelines.** `pipe` accepts a command or a writable stream and returns the
  pipeline so far — awaitable when every stage has finished, iterable over the
  last stage, pipeable onward. A pipeline succeeds only if every stage
  succeeds, and a failure reports which stage.
- **Process control.** `stop()` terminates politely and escalates after
  `gracePeriod`; `kill()` is immediate; `interrupt()` is the Ctrl-C
  equivalent.
- **Timeouts.** `timeout` stops the process at the deadline and rejects with
  `timedOut: true`, carrying the output captured first.
- **Durations** accept milliseconds or a unit string: `"500ms"`, `"30s"`,
  `"5m"`. A string without a unit is an error rather than a guess.
- **`AbortSignal` support** through the `signal` option, so a process composes
  with `fetch` and anything else speaking that protocol.
- **`live` mode** forwards stdout and stderr while capturing both, without
  inheriting stdin.
- **`color`** forces colour on or off in the child, via `FORCE_COLOR` and
  `NO_COLOR`.
- **A selected shell.** The library picks `bash` where available rather than
  inheriting `/bin/sh`, which is bash on macOS and dash on Debian, so the same
  command behaves the same way on every supported platform.

### Removed

- **`sh.stream` is gone from the documentation.** It was never implemented;
  iterating a process does the same thing with no extra API.

### Changed

- **`start()` is idempotent** and returns the process, rather than throwing
  when the process has already started.
- **Node 22 or newer**, and macOS or Linux. Windows is not supported: the
  escaping is POSIX-specific and would not protect anyone there.
