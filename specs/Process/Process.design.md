# Process Class Design

## Status

This document is the single authority for `Process`. Where it previously
contradicted itself or `Process.tasks.md`, those contradictions are resolved
here and the rationale is recorded, so a later reader can tell a decision from
an accident.

`Process` is not an optional advanced interface bolted beside the template
tags. It **is** the library's asynchronous execution engine: `sh` and `cmd`
build a command string and return a `Process`. There is one engine, not two.

Platform support is POSIX — macOS and Linux. Windows is out of scope; see
[Shell selection and platform](#shell-selection-and-platform).

## Why this class exists

Before it, `sh` and `cmd` executed commands through inline promise-and-stream
logic (`executeAsyncCommand()`), which meant a caller could only ever have the
finished result. Anything else a caller might reasonably want — watching output
as it arrives, writing to stdin, deciding when to start, composing commands
into a pipeline, or asking what command is actually running — had nowhere to
live.

`Process` gives those a home without changing what existing code sees. Every
current call site awaits a tag and reads a `ProcessResult`; a thenable
`Process` that resolves the same `ProcessResult` satisfies that unchanged.

## Design decisions

Each decision below settles a question the earlier draft left open or answered
twice.

### `start()` is idempotent and returns `this`

The earlier draft said `start()` was a safe no-op when already started, while
the task list asserted it threw. Idempotent is correct, and not as a matter of
taste:

- The class **must** ensure-start internally, because both `then()` and
  `pipe()` start a deferred process on demand. That primitive exists either
  way. If the public `start()` throws instead, one operation has two
  semantics.
- "Already started" is the normal state, not a caller error. `immediate: true`
  is the default and awaiting auto-starts, so a throwing `start()` forces
  every caller holding a possibly-started process to write
  `if (!proc.started) proc.start()` — which is the idempotent version,
  hand-rolled at each call site.

`start()` returns `this`, so it chains.

### The exposed streams are created in the constructor and never null

The earlier draft said both that stream getters "return `null` if child
process not available" and that streams are "created in the constructor and
remain stable." The second is correct; the first described the stub
implementation rather than the design.

Deferred start exists precisely so a caller can attach handlers and pipes
*before* anything runs. Null getters would make the only reason for the
feature impossible, and would force null checks on streams that are certain to
exist. So:

- `output`, `debug`, and `input` are `PassThrough` streams built in the
  constructor.
- They are identity-stable: the object a caller holds before `start()` is the
  object that carries data after it.
- `start()` spawns the child and bridges its stdio into those existing
  streams. It does not replace them.

Input written before start sits in the `PassThrough` buffer and flushes when
the pipe to `child.stdin` opens. Output and debug stay silent until a child
exists, because nothing writes into them until then.

### A `Process` is a source of its own output

`Process` implements `Symbol.asyncIterator`, yielding stdout chunks:

```javascript
for await (const chunk of sh`npm install`) {
  process.stdout.write(chunk);
}
```

This is the shortest spelling and it does the most obvious thing. stdout is
the default because it is what a caller wants when things go well; `debug` is
there for stderr, and a failure already throws a `ProcessError` carrying
stderr, so the stream you want on failure arrives without being asked for.

Consequences, all specified rather than incidental:

- **Failure surfaces at the end of iteration.** If the command exits nonzero,
  the loop throws the `ProcessError` when the stream ends. It does not finish
  quietly having yielded partial output.
- **Capture continues alongside iteration.** A later `await` still resolves a
  complete `ProcessResult`.
- **Abandoning the loop early does not leak.** Breaking out of a `for await`
  must not leave the child unreaped.
- **A consumed stream is not re-readable.** Iterating twice yields nothing the
  second time, as with any Node stream.

`Process` deliberately does **not** `extend Readable`. Inheriting Node's
`pipe`, whose contract is to return its destination, would reintroduce the
alternating return type that [Pipelines](#pipelines) exists to remove.

### Forwarding to the parent's streams stays a config flag

Iteration is for *consuming* output. Echoing a child's output to the parent's
stdout and stderr is a separate concern, already implemented, and stays where
it is: the `output` and `debug` flags, which are opt-in and absent from the
defaults. `sh({ output: true })` and `sh.interactive` set them.

That separation is why the iteration example above prints each chunk exactly
once: a plain `sh\`cmd\`` captures without forwarding, so the loop body is the
only writer.

## Pipelines

`pipe()` accepts a **stage** and returns **the pipeline so far**. A stage is
either a command — template-tag or argv-array form — or any writable or
transform stream.

```javascript
await proc.pipe`grep error`.pipe`head -5`;   // command → command
await proc.pipe(gzip).pipe(file);            // transform → sink
await proc.pipe(gzip).pipe`wc -c`;           // mixed
for await (const line of proc.pipe`grep error`) { }
```

The returned handle is:

- **awaitable** — settles when every stage is done: each process exited, each
  stream finished;
- **async-iterable** — over the last stage's output;
- **pipeable** — continuing from the last stage.

### Why the pipeline, and not the destination or the source

This is the one place where following Node's convention would produce a worse
API, so the reasoning is recorded rather than assumed. Take one line:

```javascript
proc.pipe(gzip).pipe(file)
```

**Returning the destination** (Node's `readable.pipe` contract) wires
`stdout → gzip → file` correctly, but the value in hand is a *stream*: `await`
on it is a no-op, and it cannot answer whether the command succeeded. Worse,
when the stage is a command the natural return is a `Process` — so the return
type depends on the argument type, and the meaning of the next `.pipe` in the
chain changes with it.

**Returning the source** (`this`) keeps one return type and stays awaitable,
but breaks the dataflow: the second call becomes `proc.pipe(file)`, so stdout
goes to gzip *and*, separately, raw to file. `file` receives uncompressed
bytes and gzip's output goes nowhere, while the line still reads like a
three-stage chain.

**Returning the pipeline** gives one return type regardless of stage kind,
awaitability that means "all stages finished," iteration over the tail, and a
dataflow that matches how the line reads.

### A pipeline succeeds only if every stage succeeds

`ProcessResult` is already a Result type — `ok`, `error`, `output`, `debug` —
and composing Results conjoins them. So a pipeline is `ok` only when every
stage is, and it short-circuits on the first failure, whose error carries
per-stage detail.

```javascript
await sh`cat missing.txt`.pipe`wc -l`;
// rejects with cat's ProcessError
// NOT: resolves ok with output "0"
```

This is the algebra of the type the library already has, not a convention
borrowed from shells. `set -o pipefail` is the shell arriving at the same
conclusion for the same reason.

The escape hatches need no new API:

- `.safe` resolves a failed `ProcessResult` instead of rejecting;
- `.catch()` substitutes a fallback value, since a `Process` is thenable;
- `pipe` accepts the same config forms the tags do, so one stage can swallow
  while the rest do not.

A mid-chain **stream** error propagates as that stage's failure rather than
hanging the pipeline.

## Shell selection and platform

A high-level process API should be one API, not one per host. Node's
`shell: true` is not that: it resolves to `/bin/sh`, which is bash in POSIX
mode on macOS and dash on Debian, Ubuntu, and Alpine. The difference is not
cosmetic. Measured:

```sh
$ /bin/sh -c 'set -o pipefail; echo reached'
reached                                        # exit 0

$ dash -c 'set -o pipefail; echo reached'
dash: 1: set: Illegal option -o pipefail       # exit 2, nothing ran
```

dash does not degrade; it aborts before the command runs. So the library
**selects its shell** — `bash` when available, `/bin/sh` otherwise — rather
than inheriting whatever the host ships. Three consequences:

1. The same command means the same thing on macOS and Linux.
2. Pipeline failure reporting is simply on, so `sh\`cat missing.txt | wc -l\``
   obeys the same rule as a `pipe()` chain, with no flag for a caller to know
   about. The rule holds at every boundary, whether the library composed the
   pipeline or the shell did.
3. The shell-dependent error text that the suite works around at
   `index.test.js:74` becomes uniform.

The selected shell is introspectable on the process, so a caller debugging an
environment difference can see what ran.

**Windows is not supported.** This is declared in `README.md`, in
`package.json` via the `os` field, and in `AGENTS.md`, rather than left
implicit. The reason is not effort but correctness: `shellEscape`
(`index.js:23-41`) quotes with POSIX single quotes, which `cmd.exe` treats as
ordinary characters. The library's central guarantee would therefore be a
no-op there — `sh\`echo ${"x & calc.exe"}\`` would leave `&` live as a command
separator. Supporting Windows means a second escaping strategy plus CI on a
Windows runner, and until that exists, claiming support would be false.

## Class surface

```javascript
class Process {
  constructor(commandString, config = {})

  get command()      // string, the resolved command
  get config()       // deep-frozen config object
  get started()      // boolean
  get shell()        // the selected shell, for introspection

  get output()       // PassThrough, stdout
  get debug()        // PassThrough, stderr
  get input()        // PassThrough, stdin

  start()            // idempotent, returns this
  pipe(stage)        // returns the pipeline so far

  then(onOk, onErr)  // auto-starts; resolves ProcessResult
  catch(onErr)
  finally(onFinally)

  [Symbol.asyncIterator]()   // yields stdout chunks
}
```

### Result and error semantics

- Exit code `0` resolves a `ProcessResult` after both process close and stream
  drain, so `output` is complete rather than racing the final chunk.
- A nonzero exit rejects a `ProcessError` carrying the code, `output`, and
  `debug` — unless `throw: false`, which resolves a `ProcessResult` with
  `.error` set instead.
- A spawn failure surfaces through the child's `error` event as a
  `ProcessError`, with a missing command mapped to exit code `127`, matching
  shell convention.
- `config` is deep-frozen, including nested objects, so a caller cannot mutate
  a running process's configuration.

### Configuration

| Option      | Default | Meaning                                          |
| ----------- | ------- | ------------------------------------------------ |
| `immediate` | `true`  | Start on construction rather than on `start()`   |
| `shell`     | `true`  | Run through the selected shell                   |
| `throw`     | `true`  | Reject on failure; `false` resolves with `.error`|
| `input`     | —       | String, stream, or `true` to inherit stdin       |
| `output`    | `false` | Forward stdout to the parent's stdout            |
| `debug`     | `false` | Forward stderr to the parent's stderr            |
| `color`     | —       | Preserve ANSI color in the child                 |
| `env`       | —       | Environment variables, merged over `process.env` |
| `cwd`       | —       | Working directory                                |

`sync` is not a `Process` option. Synchronous execution bypasses this class
entirely — see below.

## Integration with `sh` and `cmd`

The tags build a command string and return a `Process`:

```javascript
const proc = sh`echo ${name}`;        // a Process, started immediately
const result = await proc;            // ProcessResult

const deferred = sh({ immediate: false })`long-job`;
deferred.output.on("data", onChunk);  // attach before anything runs
await deferred.start();
```

Every chainable — `.safe`, `.interactive`, `.input(data)`, and their
combinations — merges configuration into the constructor rather than taking a
separate code path. `sh({ ... })` already returns a configured tag today, so
that plumbing partly exists.

`.sync` keeps `spawnSync` and returns a `ProcessResult` directly. A
synchronous call cannot return a thenable and pretend to be one, so it does
not construct a `Process` at all.

`executeAsyncCommand()` is deleted. Its stream handling becomes this class's
internals; there is no second engine left behind.

## Behaviors

One behavior per test, derived from the decisions above. This list is the
contract the implementation is written against; progress is tracked on the
issue rather than in a checklist file.

**Streams and lifecycle**

1. `output`, `debug`, and `input` are non-null before `start()`.
2. Each is identity-stable across `start()`.
3. A handler attached before `start()` receives data after it.
4. Input written before `start()` reaches the child.
5. Multiple pre-start writes preserve order.
6. Piping a source into `input` does not eagerly drain it.
7. `output` and `debug` emit nothing before `start()`.
8. `start()` on an already-started process is a no-op, not a throw.
9. `start()` returns `this`.
10. `started` reflects whether a child exists.
11. `config` is frozen, including nested objects.
12. `command` returns the resolved command string.
13. `shell` reports the selected shell.

**Result semantics**

14. `then` exists and auto-starts a deferred process.
15. Exit `0` resolves a `ProcessResult` with complete `output`.
16. Nonzero exit rejects a `ProcessError` with code, `output`, and `debug`.
17. `throw: false` resolves a `ProcessResult` with `.error` set.
18. `catch` behaves as the Promise analogue.
19. `finally` behaves as the Promise analogue.
20. A missing command surfaces a `ProcessError` with code `127`.
21. `cwd` is honored.
22. `env` is merged over `process.env`.

**Capture and forwarding**

23. stdout is captured on the result.
24. stderr is captured on the result.
25. `output: false` suppresses stdout forwarding while capture continues.
26. `debug: false` suppresses stderr forwarding while capture continues.

**Iteration**

27. Iterating a process yields stdout chunks.
28. Iterating a failing command throws the `ProcessError` at stream end.
29. Awaiting after iterating still resolves a complete `ProcessResult`.
30. Abandoning iteration early does not leave the child unreaped.

**Pipelines**

31. `pipe` with a template tag returns a pipeline whose tail is a `Process`.
32. `pipe` with an argv array returns a pipeline, running without a shell.
33. `pipe` auto-starts the source.
34. Interpolation in a `pipe` tag is escaped.
35. A two-command chain moves data end to end.
36. A three-command chain composes.
37. `pipe` accepts a transform stream as a stage.
38. `proc.pipe(gzip).pipe(file)` wires stdout → gzip → file, verified by
    reading the bytes back, rather than forking stdout two ways.
39. A chain mixing stream and command stages composes.
40. Awaiting a chain ending in a file sink settles only after the bytes land.
41. Iterating a chain yields the tail's output.
42. A chain rejects with the first failing stage's error.
43. The rejection identifies which stage failed.
44. `.safe` on a chain resolves `ok: false` naming the failing stage.
45. Per-stage config lets one stage swallow while others do not.
46. A mid-chain stream error propagates rather than hanging the chain.

**Shell selection and integration**

47. `sh\`cat missing.txt | wc -l\`` rejects, because pipeline failure
    reporting is on in the selected shell.
48. The same command yields the same result and error shape across supported
    shells.
49. `sh\`cmd\`` returns a `Process`.
50. `cmd\`cmd\`` returns a `Process`.
51. `sh({ immediate: false })` defers.
52. `.safe`, `.interactive`, and `.input(data)` merge config into the
    constructor, including in combination.
53. `.sync` returns a `ProcessResult` directly and constructs no `Process`.
54. Every pre-existing test passes unmodified.
