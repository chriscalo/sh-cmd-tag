# sh-cmd-tag

Template tag functions for shell command execution with streaming output, safe
interpolation, and flexible I/O control.

## Features

- **Template literal syntax** for intuitive command construction
- **Safe interpolation** — every interpolated value is escaped, so user input
  cannot escape its position and become part of the command
- **Object/array interpolation** — objects become flags, arrays become
  arguments
- **Streaming output** — a process is a source you can iterate as it runs
- **Pipelines** — compose processes and streams, awaiting the whole chain
- **Process control** — stop, kill, interrupt, and timeouts
- **Both sync and async** execution
- **Zero dependencies**

## Installation

```sh
npm install sh-cmd-tag
```

Requires Node 22 or newer. macOS and Linux; Windows is not supported, because
the escaping strategy is POSIX-specific and would not protect you there.

## Quick Start

```javascript
import { sh, cmd } from "sh-cmd-tag";
```

### Direct command execution with `cmd`

```javascript
const result = await cmd`echo "Hello World"`;
```

The resolved `result` is a `ProcessResult`:

```javascript
{
  ok: true,
  output: "Hello World\n",
  debug: "",
}
```

### Shell execution with `sh`

```javascript
const result = await sh`echo "hello world" | wc -w`;
```

`sh` runs the command through a shell, so pipes, globs, and expansions work.
`cmd` executes directly, treating those characters literally.

### Escaped interpolation of variables

```javascript
const filename = "file with spaces.txt";
await sh`touch ${filename}`;
```

The value is escaped, so this runs `touch 'file with spaces.txt'` rather than
creating three files. The same protection applies to hostile input:

```javascript
const userInput = "file.txt; rm -rf /";
await sh`cat ${userInput}`;
```

That looks for a file named `file.txt; rm -rf /`. It does not delete anything.

### Object interpolation for command flags

```javascript
const options = { verbose: true, output: "dist" };
await sh`build ${options}`;
```

Becomes `build --verbose --output=dist`.

### Array interpolation for multiple arguments

```javascript
const files = ["a.txt", "b.txt"];
await sh`rm ${files}`;
```

Becomes `rm a.txt b.txt`.

## Reading output as it arrives

A process is a source of its own output, so you can iterate it:

```javascript
for await (const chunk of sh`npm install`) {
  process.stdout.write(chunk);
}
```

Iteration yields stdout. Use `.debug` for stderr, and note that a failure
throws an error that already carries stderr, so you rarely need to ask:

```javascript
for await (const chunk of proc.debug) {
  log.warn(chunk.toString());
}
```

If the command fails, the loop throws when iteration ends rather than
finishing quietly on partial output. Breaking out early stops the process
rather than leaving it running.

To echo a child's output to your own terminal instead, use `live`:

```javascript
await sh.live`npm run build`;
```

That forwards stdout and stderr while still capturing both, and does not hand
the child your stdin. `interactive` does the same and also inherits stdin, for
commands that prompt:

```javascript
await sh.interactive`npm init`;
```

## Pipelines

`pipe` accepts a command or a writable stream, and returns the pipeline so
far:

```javascript
const result = await sh`cat access.log`.pipe`grep 500`.pipe`wc -l`;
```

Stages can be streams as well as commands, and the two mix freely:

```javascript
import { createGzip } from "node:zlib";
import { createWriteStream } from "node:fs";

await sh`cat big.txt`.pipe(createGzip()).pipe(createWriteStream("big.gz"));
```

Awaiting a pipeline waits for every stage, so when that resolves the bytes are
on disk.

**A pipeline succeeds only if every stage succeeds.** A failure anywhere
rejects the chain, carrying which stage failed:

```javascript
try {
  await sh`cat missing.txt`.pipe`wc -l`;
} catch (error) {
  error.stage;    // 0
  error.command;  // "cat missing.txt"
}
```

Without that rule the chain would report `wc`'s cheerful `0` and hide the
missing file. Note that this governs pipelines *this library* composes. A pipe
written inside a single command string — `` sh`cat missing.txt | wc -l` `` — is
shell code, and its exit status is the shell's to define.

## Controlling a running process

```javascript
const server = sh.live`npm run dev`;

await server.stop();       // ask it to exit, force it if it refuses
await server.kill();       // immediate, cannot be refused
await server.interrupt();  // the equivalent of Ctrl-C
```

`stop` sends a polite termination and escalates to an unrefusable kill after
`gracePeriod`, which defaults to 5 seconds. A process that needs longer can
have it:

```javascript
await database.stop({ gracePeriod: "30s" });
await database.stop({ gracePeriod: Infinity });  // wait as long as it takes
```

Signals reach the whole process group, so stopping a shell command stops what
that shell started.

### Timeouts

```javascript
await sh({ timeout: "30s" })`npm test`;
```

At the deadline the process is stopped, escalating the same way, and the
rejection carries `timedOut: true` along with whatever output arrived first:

```javascript
try {
  await sh({ timeout: "30s" })`npm test`;
} catch (error) {
  error.timedOut;  // true
  error.output;    // what the command managed to print
}
```

Durations are milliseconds as a number, or a string with a unit — `"500ms"`,
`"30s"`, `"5m"`, `"1.5h"`. A string without a unit is an error rather than a
guess.

### Cancellation

A process accepts an `AbortSignal`, so it composes with anything else that
speaks that protocol:

```javascript
const signal = AbortSignal.any([request.signal, AbortSignal.timeout("30s")]);

const svg = await fetch(url, { signal });
const png = await sh({ signal })`convert - out.png`;
```

Aborting kills the process, because `abort` means now.

## Deferred execution

```javascript
const proc = sh({ immediate: false })`long-running-job`;

proc.output.on("data", onChunk);   // attach before anything runs
proc.start();
await proc;
```

The `output`, `debug`, and `input` streams exist from construction and stay
the same objects once the process starts, so handlers and pipes set up
beforehand receive what follows. Input written before the start is buffered
and flushes when the process begins. `start()` is safe to call more than once.

## Error handling

Commands throw on a non-zero exit by default:

```javascript
try {
  await sh`ls /nonexistent`;
} catch (error) {
  error.name;    // "ProcessError"
  error.code;    // exit code
  error.output;  // captured stdout
  error.debug;   // captured stderr
}
```

Use `safe` when a non-zero exit is an answer rather than a failure:

```javascript
const result = await sh.safe`grep TODO src/index.js`;

if (result.ok) {
  console.log(result.output);
} else {
  console.log("no matches");
}
```

Or substitute a value, since a process is a thenable:

```javascript
const branch = await sh`git branch --show-current`.catch(() => "unknown");
```

## Configuration

Any of these can be passed to `sh({ ... })` or `cmd({ ... })`:

| Option        | Default | Meaning                                      |
| ------------- | ------- | -------------------------------------------- |
| `immediate`   | `true`  | Start on construction rather than on `start()` |
| `shell`       | `true`  | `true` picks a shell for you; a string names one |
| `output`      | `false` | Stream stdout to your terminal as it arrives |
| `debug`       | `false` | Stream stderr to your terminal as it arrives |
| `input`       | —       | `true` inherits your stdin; a string or stream is written |
| `throw`       | `true`  | Reject on failure, or resolve with `.error`  |
| `color`       | —       | Force colour on or off in the child          |
| `timeout`     | —       | Stop the process after this long             |
| `gracePeriod` | `5000`  | Wait before escalating a stop to a kill      |
| `signal`      | —       | An `AbortSignal`; aborting kills the process |
| `env`         | —       | Variables, merged over `process.env`         |
| `cwd`         | —       | Working directory                            |

### Choosing a shell

By default the library picks one — `bash` where available — so the same
command behaves the same way on macOS and Linux rather than depending on
whatever `/bin/sh` is on the host. That is a default, not a restriction:

```javascript
await sh({ shell: "/bin/dash" })`echo $0`;
await sh({ shell: "zsh" })`setopt extended_glob; echo *`;
```

Chainable shorthands compose in any order: `safe`, `live`, `interactive`,
`sync`, and `input(data)`.

```javascript
await sh.safe.live`npm test`;
await cmd.sync.safe`which node`;
await sh.input("hello")`wc -w`;
```

### Colour

Tools decide whether to emit colour by checking whether their output is a
terminal, and forwarding hands them a pipe — so live output is not coloured
by default. `color: true` sets `FORCE_COLOR` in the child; `color: false` sets
`NO_COLOR`. Whichever you ask for clears the other, so the library never sets
both — precedence between them varies between tools.

Left unset, the library adds and removes nothing: the child inherits your
environment, which may hold neither variable or both. That is your
environment's business, not something this library rewrites behind you.

```javascript
await sh.live({ color: true })`npm test`;
```

Captured output keeps its escape codes: if you asked for colour, you get it.

## Synchronous execution

```javascript
const result = sh.sync`pwd`;
```

`sync` returns a `ProcessResult` directly rather than a process, because a
synchronous call cannot be awaited. It honours `timeout`, enforcing the
deadline with an immediate kill — a blocking call has no moment in which to
wait politely first.

## Not in scope

- **Browsers.** Node only.
- **Windows.** The escaping is POSIX-specific.
- **A shell implementation.** System shells parse the commands; this library
  builds them safely.
- **Process monitoring or supervision.** Start, stop, and observe processes,
  but this is not a service manager.
- **Remote execution.** No SSH, no transports.

## Testing

```sh
npm test
```

## License

MIT
