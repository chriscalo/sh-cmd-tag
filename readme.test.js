// Every javascript example in README.md, executed against the built
// library. Documentation that is never run is a claim, not a guarantee, and
// this suite is what makes the difference: the `AbortSignal.timeout("30s")`
// in the cancellation example threw a TypeError for as long as nobody ran
// it, because that argument is Node's and takes a number.
//
// Blocks naming things that do not exist here — `npm run dev`, `access.log`,
// `convert` — are run with a stand-in that makes the same claim. A block
// that is only a value table is checked value by value.
import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync,
  createWriteStream, createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGzip } from "node:zlib";
import { Writable } from "node:stream";
import { sh, cmd, head, tail } from "./index.js";

// Node runs each test file in its own process, so this directory change is
// contained to this file.
let scratch;
let previousDirectory;

before(() => {
  previousDirectory = process.cwd();
  scratch = mkdtempSync(join(tmpdir(), "sh-cmd-tag-readme-"));
  process.chdir(scratch);
});

after(() => {
  process.chdir(previousDirectory);
  rmSync(scratch, { recursive: true, force: true });
});

/**
 * Collects everything written to it, for the blocks that show a stream on a
 * port.
 */
function collector() {
  const written = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      written.push(String(chunk));
      callback();
    },
  });
  stream.written = written;
  return stream;
}

test("README: quick start — the result shape, sh versus cmd", async () => {
  const result = await cmd`echo "Hello World"`;
  const actual = {
    shape: { ok: result.ok, output: result.output, debug: result.debug },
    shellPipes: (await sh`echo "hello world" | wc -w`).output.trim(),
  };
  const expected = {
    shape: { ok: true, output: "Hello World\n", debug: "" },
    shellPipes: "2",
  };
  assert.deepEqual(actual, expected);
});

test("README: interpolation — escaping, objects, arrays", async () => {
  const filename = "file with spaces.txt";
  await sh`touch ${filename}`;

  const userInput = "file.txt; rm -rf /";
  const hostile = await sh.safe`cat ${userInput}`;

  const options = { verbose: true, output: "dist" };
  const files = ["a.txt", "b.txt"];

  const actual = {
    // One file, not three.
    spacesMakeOneFile: readdirSync(".").filter((f) => f.startsWith("file with")),
    // Looks for a file with that literal name; deletes nothing.
    hostileStaysOneArgument: {
      ok: hostile.ok,
      namesTheWholeString: hostile.debug.includes("file.txt; rm -rf /"),
    },
    objectBecomesFlags: (await cmd`printf '%s\n' ${options}`)
      .output.split("\n").filter(Boolean),
    arrayBecomesArguments: (await cmd`printf '%s\n' ${files}`)
      .output.split("\n").filter(Boolean),
  };
  const expected = {
    spacesMakeOneFile: ["file with spaces.txt"],
    hostileStaysOneArgument: { ok: false, namesTheWholeString: true },
    objectBecomesFlags: ["--verbose", "--output=dist"],
    arrayBecomesArguments: ["a.txt", "b.txt"],
  };
  assert.deepEqual(actual, expected);
});

test("README: reading output as it arrives", async () => {
  const chunks = [];
  for await (const chunk of sh`printf 'a\nb\n'`) {
    chunks.push(String(chunk));
  }

  const warnings = [];
  for await (const chunk of sh.safe`printf 'oops\n' >&2`.debug) {
    warnings.push(String(chunk));
  }

  // "If the command fails, the loop throws when iteration ends rather than
  // finishing quietly on partial output."
  let thrown = "did not throw";
  try {
    for await (const chunk of sh`printf 'partial\n'; exit 3`) {
      void chunk;
    }
  } catch (error) {
    thrown = { name: error.name, code: error.code };
  }

  const actual = {
    iterationYieldsStdout: chunks.join(""),
    debugYieldsStderr: warnings.join(""),
    failureThrowsAtTheEnd: thrown,
    // "It keeps nothing, which is what you want for something
    // long-running."
    liveKeepsNothing: (await sh.live`printf 'building\n'`).output,
  };
  const expected = {
    iterationYieldsStdout: "a\nb\n",
    debugYieldsStderr: "oops\n",
    failureThrowsAtTheEnd: { name: "ProcessError", code: 3 },
    liveKeepsNothing: undefined,
  };
  assert.deepEqual(actual, expected);
});

test("README: pipelines — commands, streams, and which stage failed", async () => {
  writeFileSync("access.log", "200 ok\n500 boom\n500 boom\n");
  writeFileSync("big.txt", "x".repeat(1000));

  const counted = await sh`cat access.log`.pipe`grep 500`.pipe`wc -l`;
  // "when that resolves the bytes are on disk"
  await sh`cat big.txt`.pipe(createGzip()).pipe(createWriteStream("big.gz"));

  let failure = "did not throw";
  try {
    await sh`cat missing.txt`.pipe`wc -l`;
  } catch (error) {
    failure = { stage: error.stage, command: error.command };
  }

  const actual = {
    threeStages: counted.output.trim(),
    bytesOnDisk: readdirSync(".").includes("big.gz"),
    failureNamesTheStage: failure,
  };
  const expected = {
    threeStages: "2",
    bytesOnDisk: true,
    failureNamesTheStage: { stage: 0, command: "cat missing.txt" },
  };
  assert.deepEqual(actual, expected);
});

test("README: controlling a running process", async () => {
  const stopped = sh.safe.live`sleep 30`;
  await stopped.stop();
  const killed = sh.safe.live`sleep 30`;
  await killed.kill();
  const interrupted = sh.safe.live`sleep 30`;
  await interrupted.interrupt();

  // "A process that needs longer can have it" — both forms are accepted.
  const withDuration = sh.safe.live`sleep 30`;
  await withDuration.stop({ gracePeriod: "30s" });
  const withInfinity = sh.safe.live`sh -c 'trap "" TERM; sleep 0.2'`;
  await withInfinity.stop({ gracePeriod: Infinity });

  const settled = await Promise.all(
    [stopped, killed, interrupted, withDuration, withInfinity]);
  const actual = settled.map((result) => result.ok);
  const expected = [false, false, false, false, false];
  assert.deepEqual(actual, expected);
});

test("README: timeouts and cancellation", async () => {
  let expired = "did not throw";
  try {
    await sh({ timeout: "300ms" })`printf 'started\n'; sleep 30`;
  } catch (error) {
    expired = { timedOut: error.timedOut, output: error.output };
  }

  // Exactly as the README composes it: Node's AbortSignal takes a number.
  const signal = AbortSignal.any([
    AbortSignal.timeout(30_000),
    AbortSignal.timeout(50),
  ]);
  let cancelled = "did not throw";
  try {
    await sh({ signal })`sleep 30`;
  } catch (error) {
    cancelled = { aborted: error.aborted, code: error.code };
  }

  const actual = { expired, cancelled };
  const expected = {
    expired: { timedOut: true, output: "started\n" },
    cancelled: { aborted: true, code: undefined },
  };
  assert.deepEqual(actual, expected);
});

test("README: why it ended — signal, timedOut, aborted tell three cases apart", async () => {
  const controller = new AbortController();
  const cancelled = sh.safe({ signal: controller.signal })`sleep 30`;
  setTimeout(() => controller.abort(), 50);
  const expired = sh.safe({ timeout: "200ms" })`sleep 30`;
  const crashed = sh.safe`exit 3`;
  const missing = sh.safe({ shell: false })`definitely-not-a-command`;

  const why = (error) => ({
    code: error.code,
    timedOut: error.timedOut ?? false,
    aborted: error.aborted ?? false,
  });
  const actual = {
    cancelled: why((await cancelled).error),
    expired: why((await expired).error),
    crashed: why((await crashed).error),
    missing: why((await missing).error),
  };
  const expected = {
    cancelled: { code: undefined, timedOut: false, aborted: true },
    expired: { code: undefined, timedOut: true, aborted: false },
    crashed: { code: 3, timedOut: false, aborted: false },
    missing: { code: "ENOENT", timedOut: false, aborted: false },
  };
  assert.deepEqual(actual, expected);
});

test("README: deferred execution, error handling, and safe", async () => {
  const chunks = [];
  const deferred = sh({ immediate: false })`printf 'deferred\n'`;
  deferred.output.on("data", (chunk) => chunks.push(String(chunk)));
  deferred.start();
  await deferred;

  let failure = "did not throw";
  try {
    await sh`ls /nonexistent`;
  } catch (error) {
    failure = {
      name: error.name,
      // Not the exact number: GNU `ls` exits 2 where BSD `ls` exits 1, so
      // pinning one passes on a laptop and fails in CI. The claim the
      // README makes is that `code` carries the command's exit code, which
      // the case below checks against a code this test chooses.
      codeIsTheCommandsOwn: Number.isInteger(error.code) && error.code > 0,
      output: error.output,
      debugHasText: error.debug.length > 0,
    };
  }

  let chosenCode = "did not throw";
  try {
    await sh`exit 42`;
  } catch (error) {
    chosenCode = error.code;
  }

  writeFileSync("src.js", "const x = 1;\n");
  const noMatches = await sh.safe`grep TODO src.js`;

  const actual = {
    handlersAttachedBeforeStart: chunks.join(""),
    errorFields: failure,
    codeIsWhatTheCommandChose: chosenCode,
    safeReportsNotOk: noMatches.ok,
    thenableCatchSubstitutes: await sh`false`.catch(() => "unknown"),
  };
  const expected = {
    handlersAttachedBeforeStart: "deferred\n",
    errorFields: {
      name: "ProcessError",
      codeIsTheCommandsOwn: true,
      output: "",
      debugHasText: true,
    },
    codeIsWhatTheCommandChose: 42,
    safeReportsNotOk: false,
    thenableCatchSubstitutes: "unknown",
  };
  assert.deepEqual(actual, expected);
});

test("README: driving a command as it runs", async () => {
  // The README shows `bc`, which is not installed everywhere; `cat` makes
  // the same claim — a port fed by a stream the caller holds stays open,
  // so the conversation can go both ways.
  const { PassThrough } = await import("node:stream");
  const keyboard = new PassThrough();
  const repl = sh({ input: keyboard })`cat`;

  const replies = [];
  const reading = (async () => {
    for await (const chunk of repl) {
      replies.push(String(chunk));
    }
  })();

  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
  keyboard.write("1 + 1\n");
  await settle();
  const midConversation = replies.join("");
  keyboard.end();
  await reading;

  // "writing to `proc.input` afterwards throws rather than quietly going
  // nowhere"
  const closed = sh.safe`cat`;
  let refusal = "accepted";
  try {
    closed.input.write("nowhere\n");
  } catch (error) {
    refusal = error.constructor.name;
  }
  await closed;

  const actual = { midConversation, refusal };
  const expected = { midConversation: "1 + 1\n", refusal: "Error" };
  assert.deepEqual(actual, expected);
});

test("README: choosing a shell, and the chainable shorthands", async () => {
  const actual = {
    // The README names `/bin/dash` and `zsh` to show that a string names a
    // shell. Which shells a host has installed is not this library's
    // promise, so the claim is checked against one every POSIX system has,
    // and against one no system has.
    namedShell: (await sh({ shell: "/bin/sh" })`echo $0`).output.trim(),
    unnamedShellFailsLoudly: await sh
      .safe({ shell: "/nonexistent/shell" })`echo hi`
      .then((result) => result.error.code),
    safeLive: (await sh.safe.live`true`).ok,
    syncSafe: cmd.sync.safe`which node`.ok,
    inputShorthand: (await sh.input("hello there")`wc -w`).output.trim(),
    // "your own configuration wins over the bundle"
    liveOverridden: (await sh.live({ output: true })`printf 'kept\n'`).output,
    safeOverridden: await sh.safe({ throw: true })`false`
      .then(() => "did not throw", (error) => error.name),
  };
  const expected = {
    namedShell: "/bin/sh",
    unnamedShellFailsLoudly: "ENOENT",
    safeLive: true,
    syncSafe: true,
    inputShorthand: "2",
    liveOverridden: "kept\n",
    safeOverridden: "ProcessError",
  };
  assert.deepEqual(actual, expected);
});

test("README: where the bytes go — every value in the table", async () => {
  const sink = collector();
  writeFileSync("big.csv", "a,b\n");

  await sh({ output: createWriteStream("build.log") })`printf 'logged\n'`;

  sink.written.length = 0;
  await sh({ output: sink })`printf s`;
  const toAStream = sink.written.join("");

  sink.written.length = 0;
  const shownAndKept = await sh({ output: [sink, true] })`printf both`;

  const started = process.hrtime.bigint();
  const readsStdin = await sh`sort`;
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  const actual = {
    outputTrue: (await sh({ output: true })`printf x`).output,
    outputFalse: (await sh({ output: false })`printf x`).output,
    outputStream: toAStream,
    outputFile: readFileSync("build.log", "utf-8"),
    outputList: { shown: sink.written.join(""), kept: shownAndKept.output },
    inputFalse: readsStdin.output,
    inputFinishesRatherThanHanging: elapsedMs < 1000,
    inputString: (await sh({ input: "banana\napple\n" })`sort`).output,
    inputStream: (await sh({ input: createReadStream("big.csv") })`cat`).output,
    inputList: (await sh({ input: ["b\n", "a\n"] })`sort`).output,
    inputKept: (await sh({ input: ["b\n", true] })`cat`).input,
    // undefined (shown, not kept) versus "" (kept, printed nothing)
    shownNotKept: (await sh.live`printf 'dev\n'`).output,
    keptAndSilent: (await sh`true`).output,
  };
  const expected = {
    outputTrue: "x",
    outputFalse: undefined,
    outputStream: "s",
    outputFile: "logged\n",
    outputList: { shown: "both", kept: "both" },
    inputFalse: "",
    inputFinishesRatherThanHanging: true,
    inputString: "apple\nbanana\n",
    inputStream: "a,b\n",
    inputList: "a\nb\n",
    inputKept: "b\n",
    shownNotKept: undefined,
    keptAndSilent: "",
  };
  assert.deepEqual(actual, expected);
});

test("README: a writable of your own, and head and tail", async () => {
  const shouty = [];
  const myTransform = new Writable({
    write(chunk, encoding, callback) {
      shouty.push(String(chunk).toUpperCase());
      callback();
    },
  });
  await sh({ output: [myTransform] })`printf 'noisy\n'`;

  const log = tail("64kB");
  await sh({ output: [log] })`printf 'built ok\n'`;
  const firstErrors = head("512B");
  await sh({ output: [firstErrors] })`printf 'first error\n'`;

  const actual = {
    ownWritable: shouty.join(""),
    tailText: log.text,
    headText: firstErrors.text,
    syncReturnsAResult: sh.sync`pwd`.ok,
  };
  const expected = {
    ownWritable: "NOISY\n",
    tailText: "built ok\n",
    headText: "first error\n",
    syncReturnsAResult: true,
  };
  assert.deepEqual(actual, expected);
});

test("README: every javascript block is accounted for", () => {
  // A block added to the README without a check here would otherwise go
  // unexecuted, which is exactly how the broken cancellation example
  // survived. If this count changes, add the block above and update it.
  const readme = readFileSync(join(previousDirectory, "README.md"), "utf-8");
  const fences = readme.split("\n").filter((line) => line.startsWith("```"));
  const javascriptBlocks = fences
    .filter((fence) => fence.slice(3).trim() === "javascript").length;

  const actual = { javascriptBlocks };
  const expected = { javascriptBlocks: 36 };
  assert.deepEqual(actual, expected);
});
