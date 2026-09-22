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
[Shell selection and platform](#shell-selection-and-platform). The supported
runtime floor is **Node 22**, the oldest line still in active maintenance;
Node 18 reached end of life in April 2025 and testing an unpatched runtime
sits badly with a security-sensitive library.

`1.0.0` is a semver commitment: the surface described here stays compatible
until a major bump. That is why the questionable parts are being settled now
rather than shipped and regretted.

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

### An unobserved stream must not stall the child

Capture happens on the child's own streams, so `output` and `debug` exist
purely for a caller who wants to watch. If nobody does, they must not fill
up: an unread `PassThrough` stops draining at its high-water mark and
backpressures the child, which then blocks before exiting and never settles.
A command printing a few megabytes would hang forever — measured at 5MB on
either stream.

So an exposed stream with no consumer is drained. The check runs on the tick
after the process starts, so a handler attached in the same tick — the
documented pattern for a deferred process — still counts as a reader.
`readableFlowing === null` is what distinguishes "nothing at all is
consuming" from both a `data` listener and an async iterator.

The same rule applies to a pipeline whose last stage is a transform: nothing
reads its output, so awaiting the chain would wait on a stream that never
finishes.

### Ending iteration is not a reason to stop a process

A command may close stdout and keep working. Iteration ending means the loop
has nothing left to yield, not that the process should die, so only
abandonment — leaving the loop early — stops it.

`Process` deliberately does **not** `extend Readable`. Inheriting Node's
`pipe`, whose contract is to return its destination, would reintroduce the
alternating return type that [Pipelines](#pipelines) exists to remove.

### Forwarding to the parent's streams stays a config flag

Iteration is for *consuming* output. Echoing a child's output to the parent's
stdout and stderr is a separate concern, already implemented, and stays where
it is: the `output` and `debug` flags, which are opt-in and absent from the
defaults. `sh({ output: true })`, `sh.live`, and `sh.interactive` set them.

That separation is why the iteration example above prints each chunk exactly
once: a plain `` sh`cmd` `` captures without forwarding, so the loop body is the
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

### A finished stage closes what feeds it

When a stage finishes, everything upstream is producing for nobody, so it is
closed. Without that, `` sh`yes`.pipe`head -2` `` never ends: the producer is
endless and nothing tells it that its consumer has gone. A shell sends
SIGPIPE for the same reason.

Those producers are closed deliberately, so they are not failures. Counting
them would reintroduce the problem from the other side, reporting a killed
`yes` as the reason a chain that did exactly what was asked "failed".

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
2. Pipeline failure reporting is simply on, so `` sh`cat missing.txt | wc -l` ``
   obeys the same rule as a `pipe()` chain, with no flag for a caller to know
   about. The rule holds at every boundary, whether the library composed the
   pipeline or the shell did.
3. The shell-dependent error text that the suite works around at
   `index.test.js:74` becomes uniform.

Selecting a shell is a **default, not a restriction**. This is a general
library, and a caller who wants zsh, dash, or an interpreter at a specific
path says so with `shell: "..."`. What the default buys is that a caller who
expresses no preference gets the same behaviour on every supported platform
rather than whatever the host's `/bin/sh` happens to be.

The selected shell is introspectable on the process, so a caller debugging an
environment difference can see what ran.

**Windows is not supported.** This is declared in `README.md`, in
`package.json` via the `os` field, and in `AGENTS.md`, rather than left
implicit. The reason is not effort but correctness: `shellEscape`
(`index.js:23-41`) quotes with POSIX single quotes, which `cmd.exe` treats as
ordinary characters. The library's central guarantee would therefore be a
no-op there — `` sh`echo ${"x & calc.exe"}` `` would leave `&` live as a command
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

  stop(opts)         // terminate politely, escalating if ignored
  kill()             // immediate, cannot be refused
  interrupt()        // what Ctrl-C sends

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
  `ProcessError` whose `code` is the errno string — `"ENOENT"` for a missing
  command — and whose message is Node's own (`spawn foo ENOENT`).

  An earlier draft of this document said a missing command maps to exit code
  `127`, inherited from `architecture.md` and never checked. It is wrong, and
  the build is what proved it: `.sync` has always reported `"ENOENT"` here,
  so mapping the asynchronous path to `127` would make the two disagree about
  the same failure. 127 does appear, but from the shell rather than from us —
  when `shell: true`, the shell reports "command not found" as exit 127 and
  never raises an `error` event at all.

- A timeout is a failure even when the child exits cleanly. Well-behaved
  programs handle termination and exit `0`, so exit status alone cannot tell
  a command that finished from one that ran out of time.

- A nonzero exit produces the message `Command failed with exit code N`, with
  the child's trimmed stderr appended after a colon when there is any. That
  is what makes a "command not found" failure name the command that was not
  found, rather than reporting a bare number.
- `config` is deep-frozen, including nested objects, so a caller cannot mutate
  a running process's configuration.

- **Capture is bounded.** Output is accumulated up to what a JavaScript
  string can hold, and `truncated` is set on the result once anything is
  dropped. An endless producer would otherwise grow the buffer until
  `Buffer.concat().toString()` exceeded the maximum string length — and that
  throws inside the completion handler, so the process would not merely lose
  output, it would never settle at all.

### Configuration

The existing keys are unchanged. `output`, `debug`, and `input` name the
process's three streams, and they keep that meaning at every point in the
lifecycle: `output: true` configures it, `proc.output` is it flowing, and
`result.output` is it finished. One concept, three moments.

- **`immediate`** — boolean, default `true`. Start on construction rather
  than waiting for `start()`.
- **`shell`** — boolean or string, default `true`. `true` runs through the
  shell the library selects; a string names one — `"/bin/dash"`, `"zsh"`, a
  path — for a caller who wants their own. `false` executes directly.
- **`output`** — boolean, default `false`. Stream stdout to the parent live.
- **`debug`** — boolean, default `false`. Stream stderr to the parent live.
- **`input`** — boolean, string, or stream. `true` inherits the parent's
  stdin; a string or stream is written to the child.
- **`throw`** — boolean, default `true`. Reject on failure, or resolve a
  result carrying `.error`.
- **`color`** — boolean. Force colour on or off in the child. Unset leaves
  the child to decide.
- **`env`** — object. Variables, merged over `process.env`.
- **`cwd`** — string. Working directory.

Three keys are new:

- **`timeout`** — duration. Stop the process after this long. No default,
  matching Node.
- **`gracePeriod`** — duration, default `5000`. How long a polite stop is
  given before it escalates to an unrefusable kill. `0` kills immediately;
  `Infinity` waits as long as the process needs.
- **`signal`** — an `AbortSignal`. Aborting kills the process.

```javascript
await sh({ timeout: "30s" })`npm test`;
await proc.stop({ gracePeriod: "2s" });
await proc.stop({ gracePeriod: Infinity });   // wait it out
```

### Durations

Every duration accepts a number of milliseconds or a string with a unit.
Numbers keep the library compatible with Node's own conventions and with any
value a caller already computed; strings make the common literal readable.

```javascript
sh({ timeout: 30_000 })   // milliseconds, as Node expresses durations
sh({ timeout: "30s" })    // identical, and easier to read at a glance
```

The string grammar is deliberately small: a number, optionally fractional,
followed by one unit of `ms`, `s`, `m`, or `h`. `"0.5s"` is 500ms. Compound
forms like `"1m30s"` are **not** accepted — allowing them means deciding about
`"1h 2m 3s"`, whitespace, ordering, and repetition, and `90_000` or `"90s"`
already says it. A unitless string such as `"30"` is a **`TypeError`**, not a
silent guess: the whole point of the string form is that the unit is visible,
so a string without one is a mistake worth catching at the call site rather
than a value worth interpreting.

Invalid durations throw when the configuration is built, not when the process
runs, matching the library's existing habit of rejecting bad input at the
boundary rather than carrying it inward.

### Designing these keys

The alternatives considered, and why these won.

**`gracePeriod` is the ops vocabulary, and there was no single convention to
follow.** Two clusters exist. Kubernetes says `terminationGracePeriodSeconds`
and Docker Compose says `stop_grace_period`; systemd says `TimeoutStopSec`,
AWS ECS says `stopTimeout`, and PM2 says `kill_timeout`. The nearest JS
precedent, execa, says `forceKillAfterDelay`. "Grace period" is the phrase
most readers have already met, and it survives the unit suffix being dropped —
`timeout` carries none, and one object should not mix two conventions.

**Unbounded patience is a first-class case, not an escape hatch.** It is
tempting to argue that processes needing a long, uninterrupted shutdown —
a database flushing a buffer pool, an encoder finishing a file write, a worker
draining a queue — belong to service managers rather than to a shell library.
That is wrong, and it mistakes which process is which. This library's *host*
may well be supervised by systemd; what it spawns is a different matter
entirely. A Node service under systemd that runs `ffmpeg`, a worker pool, a
local database, or a dev server is the supervisor of those children, and when
its own `SIGTERM` arrives it has to shut them down properly. The graceful
shutdown the host was given is exactly what it must pass on, and five seconds
is frequently not enough. Supervising children is a core use of this library,
not an edge of it.

**`Infinity` expresses that, not `false`.** A duration field should hold
a duration at every setting. `false` forces the reader to learn that this one
key is sometimes a boolean, and it reads as "grace period: off", which is the
opposite of what it means — no escalation is the *most* patient setting, not
the least. `Infinity` is a legitimate value of the same type and says exactly
what happens: wait without bound. `0` sits at the other end and means kill at
once.

**The name `signal` is free, and means what Node means by it.** It would have
been a trap beside a `signal(name)` method that delivered POSIX signals — but
that method does not exist, because stopping is expressed as `stop()`,
`kill()`, and `interrupt()`. With no competing meaning inside this API, the
key can match Node's `spawn` option exactly, which is what a reader coming
from `child_process` or `fetch` will expect.

An abort maps to `kill()`, not `stop()`: `abort` means *now* everywhere else
in the platform, and a graceful-stop interpretation would make this library's
`signal` behave differently from every other consumer of the same protocol.

The value of accepting one is composition rather than cancellation — `stop()`
and `timeout` already cancel. It earns its place where a signal already exists
in the surrounding code:

```javascript
app.get("/render", async (req, res) => {
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout("30s")]);
  const svg = await fetch(url, { signal });
  const png = await sh({ signal })`convert - out.png`;
  res.send(png.output);
});
```

Without it, that handler hand-writes a bridge from the abort event to
`proc.kill()`. With it, one signal governs the fetch and the process alike.

**The clock starts when the process starts**, not when it is constructed. With
`immediate: false` a process can sit unstarted indefinitely, and a deadline
measured from construction could expire before anything ran.

**A timeout is reported with `timedOut: true` on `ProcessError`.**
`ProcessError.code` already holds the numeric exit code, so `"ETIMEDOUT"`
there would overload one field with two types, and a `TimeoutError` subclass
forces `instanceof` checks on callers who want a boolean.

**Shape: flat, not nested.** `timeout: { after, gracePeriod }` groups the
related keys, but "just give me a deadline" is the common case by a wide
margin, and nesting turns it into `timeout: { after: "30s" }`.

**An idle timeout is out of scope.** "No output for N seconds" is a genuine
feature, common in CI runners, but it measures silence rather than duration,
and nothing here needs it.

`sync` is not a `Process` option. Synchronous execution bypasses this class
entirely — see below.

## Stopping a process

Node exposes `child.kill(signal)` and nothing else, which means a caller has
to know what `SIGTERM` and `SIGKILL` mean before they can stop anything. The
vocabulary that already explains itself comes from containers, where the words
are settled: `docker stop` sends `SIGTERM`, waits, then escalates to
`SIGKILL`; `docker kill` sends `SIGKILL` outright. Kubernetes and systemd use
the same shape with different grace periods — 30s and 90s respectively.

So this class borrows that vocabulary rather than inventing one:

```javascript
await proc.stop();       // terminate politely; escalate if ignored
await proc.kill();       // immediate, cannot be refused
await proc.interrupt();  // what Ctrl-C does
```

| Method        | Signal            | Meaning                              |
| ------------- | ----------------- | ------------------------------------ |
| `stop()`      | TERM, then KILL   | Wind down; force only if it refuses  |
| `kill()`      | KILL              | Die now, no cleanup possible         |
| `interrupt()` | INT               | The same thing Ctrl-C sends          |

Each resolves once the process has actually exited, so a caller can await a
clean shutdown.

**Signals reach the whole process group, not just the child.** The child is
spawned as its own group leader and stopping it signals the group. Without
that, stopping a shell-wrapped command stops only the shell: `` sh`sleep 30` ``
would terminate the shell and leave `sleep` running, still holding the output
pipe open, so the process would not even appear to have finished. That is not
a theoretical concern — it showed up as a `stop()` test taking thirty seconds
to do something that should take milliseconds.

**No raw signal method ships.** These three verbs describe *intent* — what a
caller wants to happen to the process. A signal is a *mechanism*, and the gap
between the two is the thing worth hiding: a caller who wants a dev server to
shut down cleanly should not have to know that the way to say so is `SIGTERM`
rather than `SIGQUIT`, or that one of them is catchable and the other is not.

The three verbs cover what callers of *this* library actually do: stop a dev
server, force-kill something wedged, and send the Ctrl-C an interactive
program is waiting for. The signals they would reach past this API for —
`SIGHUP` to reload a config, `SIGUSR1` to trigger a dump — belong to daemon
management, and someone managing a long-lived daemon is reaching for systemd
or a process supervisor, not a template-tag shell library. Serving those cases
would mean serving a user this library does not have.

A raw signal method would also re-export exactly the platform detail the rest
of the design works to absorb: which signals exist, and what they do, varies
by platform. Having just decided the library picks its own shell so callers
need not care about the host, handing back `SIGHUP` strings would undo that in
the same breath.

Stopping a pipeline stops every stage.

### Timeouts

`timeout` is the same escalation on a clock, which is what every system that
implements timeouts does:

```javascript
await sh({ timeout: 30_000 })`npm test`;
// 30s → SIGTERM → graceMs → SIGKILL → rejects
```

The rejection is a `ProcessError` with `timedOut: true`, carrying whatever
output was captured before the process was stopped — a timeout is a failure
with evidence, not a blank one. `gracePeriod` defaults to 5000ms. There is no
default timeout, matching Node.

#### Timeouts in `.sync`

`spawnSync` takes `timeout` natively, so synchronous timeouts are ordinary
and `.sync` honours them. The escalation, however, is impossible: sending
`SIGTERM`, waiting, then sending `SIGKILL` requires doing something while
waiting, and a blocking call has no turn in which to do it. `spawnSync` gets
to send exactly one signal at the deadline.

So `.sync` sends **`SIGKILL`** at the deadline rather than `SIGTERM`, because
a child that ignored `SIGTERM` would otherwise blow through the deadline and
hang the call — the worst outcome in the one mode where the caller cannot
intervene. `gracePeriod` is meaningless synchronously and is ignored. The result
carries `timedOut: true` exactly as the asynchronous form does.

The promise is therefore identical across modes — the deadline is enforced and
the failure is labelled — while the mechanism differs because the modes
genuinely differ. That asymmetry is documented rather than discovered.

`.safe` applies here as everywhere: a timed-out process under `throw: false`
resolves a `ProcessResult` with `ok: false` and `.error.timedOut` set.

## Live mode

`.live` forwards stdout and stderr to the parent while still capturing both,
and does **not** inherit stdin. It is the gap between a plain call, which
captures silently, and `.interactive`, which also hands the child the parent's
keyboard:

| Mode            | stdin inherited | output forwarded | captured |
| --------------- | --------------- | ---------------- | -------- |
| plain           | no              | no               | yes      |
| `.live`         | no              | yes              | yes      |
| `.interactive`  | yes             | yes              | yes      |

It is a configuration alias — `{ output: true, debug: true }` — not a separate
execution path, and it composes with the other chainables (`sh.safe.live`,
`sh.live({ timeout: 60_000 })`).

### Color in live mode

Forwarding hands the child a pipe rather than a terminal, and colour-aware
tools check exactly that before emitting ANSI. So live output is *not*
automatically coloured, and the library does not force it to be: `color`
unset leaves the child to decide from its own environment.

### How a child decides

No central authority decides; each tool consults roughly the same ladder:

1. **Is stdout a terminal?** Piped output means `isTTY` is false, and most
   tools default colour off on the assumption that the bytes are being
   captured rather than read. Forwarding creates exactly this situation.
2. **Environment overrides** — `FORCE_COLOR` to emit anyway, `NO_COLOR` to
   never emit.
3. **The long tail** — `TERM=dumb`, CI detection, explicit `--color` flags.

Measured against Node's own test runner: piped with no environment it emits
no escape codes; with `FORCE_COLOR=1` it emits `^[[34m`.

`color: true` sets `FORCE_COLOR=1` in the child environment, the Node
ecosystem's convention, honoured by chalk, npm, jest, and vitest. `color:
false` sets `NO_COLOR=1`, the cross-language convention from no-color.org.

The library never calls `isTTY` itself. It appears in that ladder as an
explanation of what the *child* does, not as something this code consults —
and the design deliberately keeps it that way: `color` unset means the library
adds nothing and the child decides from its own environment, which is one
fewer piece of magic to explain. The alternative would be a `color: "auto"`
default that mirrors the parent's terminal-ness into the child, so that live
output looks the way it would if the command had been run by hand. That is
defensible and remains available later; it is not the default because "unset
means we do not interfere" is easier to reason about than a rule that reads
the parent's environment behind the caller's back.

**Exactly one variable is ever set, never both.** Precedence between them is
implementation-dependent: no-color.org recommends `NO_COLOR` win, but Node 24
does the opposite — `FORCE_COLOR=1 NO_COLOR=1 node --test` still emits colour.
Setting both would make the library's behaviour depend on which tool the
caller happened to run.

Captured output is **not** stripped of escape codes. No convention asks a
process runner to rewrite a child's bytes, and a caller who forced colour on
asked for what arrived.

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
20. A spawn failure surfaces a `ProcessError` carrying the errno string as
    its code, agreeing with `.sync`.
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

47. `` sh`cat missing.txt | wc -l` `` rejects, because pipeline failure
    reporting is on in the selected shell.
48. The same command yields the same result and error shape across supported
    shells.
49. `` sh`cmd` `` returns a `Process`.
50. `` cmd`cmd` `` returns a `Process`.
51. `sh({ immediate: false })` defers.
52. `.safe`, `.interactive`, and `.input(data)` merge config into the
    constructor, including in combination.
53. `.sync` returns a `ProcessResult` directly and constructs no `Process`.
54. Every pre-existing test passes unmodified.

**Lifecycle control**

55. `stop()` terminates politely and resolves once the process exits.
56. `stop()` escalates to an unrefusable kill after `gracePeriod` if the
    process ignores the polite request.
57. `stop({ gracePeriod })` overrides the escalation delay for one call.
58. `gracePeriod: Infinity` waits without bound; `0` kills at once.
59. `kill()` terminates immediately and unrefusably.
60. `interrupt()` delivers the equivalent of Ctrl-C.
61. Stopping an already-exited process is a no-op, not a throw.
62. Stopping a pipeline stops every stage.
63. `timeout` stops a process at the deadline and rejects a `ProcessError`
    with `timedOut: true`, leaving `.code` as the exit code.
64. The timeout clock starts when the process starts, not when constructed.
65. A timed-out rejection carries the output captured before the stop.
66. Under `throw: false`, a timeout resolves `ok: false` with
    `.error.timedOut`.
67. `.sync` honours `timeout`, enforcing the deadline unrefusably and setting
    `timedOut`.

**Live mode and colour**

68. `.live` forwards stdout and stderr while still capturing both.
69. `.live` does not inherit stdin.
70. `.live` composes with the other chainables.
71. `color: true` sets `FORCE_COLOR` in the child environment.
72. `color: false` sets `NO_COLOR` in the child environment.
73. `color` unset adds neither variable, and no state ever sets both.
74. Captured output retains escape codes when colour was forced on.
