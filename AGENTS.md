# Agent instructions

This is the single behavioural source for anyone — human or agent — working
in this repository.

For what the library is, read [README.md](README.md). For how code should
look, read [STYLE.md](STYLE.md). For how it is designed, read the design
documents under `design/`.

**Work in flight.** While the 1.0 branch is open, what has been decided, what
is left, and the reasoning behind both live in task #42 — whose subject says
to read it first — and in the state-of-play comment on PR #34. Task
descriptions are not shown by default, so that one has to be fetched
deliberately. Start there rather than inferring the state from the diff.

## Commands

```sh
npm test               # the whole suite, ~12s
npm run test:verbose   # same, with debug output
```

## Invariants

These are not preferences. Breaking one is a bug.

- **Zero runtime dependencies, permanently.** This is a shell-execution
  library whose value is injection safety; its dependency surface stays empty.
  `package.json` has no `dependencies` block and should never gain one.
- **ES modules only.** `"type": "module"`. Never create `.cjs` files.
- **POSIX only** — macOS and Linux. Windows is not supported, because
  `shellEscape` uses POSIX single-quote quoting that `cmd.exe` ignores, which
  would make the library's central guarantee a no-op there. Supporting it
  means a second escaping strategy and a Windows CI runner, not a flag.
- **Node 22 or newer.** Node 18 reached end of life in April 2025, and
  testing an unpatched runtime sits badly with a security-sensitive library.
- **Never weaken escaping or any injection defence.** The security tests are
  load-bearing.

## Working rules

- **Run `npm test` after every atomic change**, not once per commit. The
  suite takes under two seconds, so there is no reason to batch. A regression
  found in the same minute it was caused costs nothing to fix.
- **Strict TDD.** One behaviour, one test, failing first, then the minimal
  implementation. Work one test at a time.
- **Name `actual` and `expected` in tests.** Whenever a test compares values,
  bind them to those names and assert on them, so a failure says what was
  expected rather than leaving it to be inferred. Group several related
  checks into one object and `assert.deepEqual` rather than firing a run of
  bare assertions. A test whose assertion cannot fail — `assert.ok(result)`
  on something that always returns — is worse than no test, because it
  reports success for behaviour it never exercised.
- **Do not rename files or functions** unless asked.
- **Do not refactor** unless asked.
- **Do not leave `TODO` comments** or speculative suggestions in the code. If
  something needs doing, it belongs on the issue.
- For a non-trivial bug: reproduce it with a failing test first, then fix it.
  Never attempt a one-shot fix for something you cannot reproduce.

## Where the design lives

- `design/Process.md` — the `Process` class: lifecycle,
  streams, pipelines, stopping, timeouts, configuration. It is the single
  authority, and it ends with the behaviour list the tests are written from.
- `design/sh-cmd.md` — the `sh` and `cmd` template tags, the
  architecture, and the security model including the threat model.

Progress tracking lives on the GitHub issue, not in the repository. There is
no task-list file to keep in sync, because two copies of a checklist always
drift apart.

## Security

The library prevents shell injection by escaping every interpolated value at
the point of interpolation, marking already-escaped strings so they cannot be
double-escaped, validating object keys used as flags, and rejecting dangerous
input outright rather than sanitising it.

When touching any of that:

- read the injection-prevention tests before changing escaping code;
- add a test for each new attack vector;
- never disable or weaken an escaping mechanism to make something else work;
- state security assumptions explicitly in the design document.

## Testing

Node's built-in test runner, no framework:

```javascript
import { test } from "node:test";
import { strict as assert } from "node:assert";

test("describes the behaviour in a sentence", async () => {
  const actual = await somethingUnderTest();
  const expected = "what it should be";
  assert.equal(actual, expected);
});
```

Child-process behaviour that cannot be observed in-process is tested with a
fixture pair: `index.test.<name>-invoke.js` runs the scenario and prints
JSON, and the test asserts against that output. Follow the existing pairs
rather than inventing a new mechanism.
