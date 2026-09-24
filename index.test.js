import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn, execSync } from "node:child_process";
import { createReadStream, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { finished } from "node:stream/promises";
import {
  sh,
  cmd,
  head,
  tail,
  ProcessError,
  ProcessResult,
  markSafeString,
  isSafeString,
  shellEscape,
} from "./index.js";

const DEBUG = process.env.DEBUG?.includes("test");
const __dirname = dirname(new URL(import.meta.url).pathname);

/**
 * Runs `fn` and returns what it threw, or null if it did not throw.
 *
 * A test that only asserts "something threw" reads as a bare assertion and
 * says nothing about what it expected. Returning the error lets the parts
 * that matter — the type, what the message names — be bound to `actual`
 * and compared against a named `expected`, so a failure prints the
 * difference instead of a stack trace.
 */
function errorFrom(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

test("every tag and chainable on the public surface exists", () => {
  // One map rather than a test each. These only say the surface is there;
  // what each one does is asserted by the behaviour tests below, which is
  // the check that would actually catch a break.
  const surfaceOf = (tag) => ({
    tag: typeof tag,
    safe: typeof tag.safe,
    live: typeof tag.live,
    interactive: typeof tag.interactive,
    sync: typeof tag.sync,
    input: typeof tag.input,
  });
  const all = "function";
  
  const actual = { sh: surfaceOf(sh), cmd: surfaceOf(cmd) };
  const expected = {
    sh: { tag: all, safe: all, live: all, interactive: all, sync: all,
          input: all },
    cmd: { tag: all, safe: all, live: all, interactive: all, sync: all,
           input: all },
  };
  assert.deepEqual(actual, expected);
});

test("sh`` returns Promise<ProcessResult>", async () => {
  const actual = await sh`echo "test"`;
  const expected = new ProcessResult({
    ok: true,
    output: "test\n",
    debug: "",
  });
  
  assert.deepEqual(actual, expected);
});

test("sh throws ProcessError on command failure", async () => {
  await assert.rejects(
    async () => {
      await sh`exit 42`;
    },
    new ProcessError({
      message: "Command failed with exit code 42",
      code: 42,
      output: "",
      debug: "",
    }),
  );
});

test("sh interpolates variables correctly", async () => {
  const message = "test message";
  const actual = await sh`echo "${message}"`;
  const expected = new ProcessResult({
    ok: true,
    // Normal strings pass through unchanged
    output: "test message\n",
    debug: "",
  });
  
  assert.deepEqual(actual, expected);
});

test("sh handles stderr output", async () => {
  const actual = await sh`node -e "console.error('error message')"`;
  const expected = new ProcessResult({
    ok: true,
    output: "",
    debug: "error message\n"
  });
  assert.deepEqual(actual, expected);
});

test("sh throws error for non-existent command", async () => {
  // Callback form instead of exact ProcessError match: the shell's "command not
  // found" message differs across environments (Linux vs macOS), so we assert
  // on the stable fields (name, code, output) and verify the command name
  // appears somewhere in the message rather than pinning the exact wording.
  await assert.rejects(
    async () => {
      await sh`nonexistent-cmd`;
    },
    (err) => {
      assert.equal(err.name, "ProcessError");
      assert.equal(err.code, 127);
      assert.equal(err.output, "");
      assert.match(err.debug, /nonexistent-cmd/);
      assert.match(err.message, /nonexistent-cmd/);
      return true;
    },
  );
});

test("sh safely handles special characters in interpolation", async () => {
  const filename = "file with spaces & special chars.txt";
  const actual = await sh`echo "File: ${filename}"`;
  const expected = new ProcessResult({
    ok: true,
    // Ampersand is safe inside double quotes
    output: "File: file with spaces & special chars.txt\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("cmd executes command directly and returns output", async () => {
  const actual = await cmd`echo "cmd test"`;
  const expected = new ProcessResult({
    ok: true,
    output: "cmd test\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("cmd treats pipes as literal arguments", async () => {
  // cmd treats the whole thing as literal arguments to echo
  const actual = await cmd`echo "hello world" | wc -w`;
  const expected = new ProcessResult({
    ok: true,
    output: "hello world | wc -w\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("cmd interpolates variables correctly", async () => {
  const message = "cmd interpolation";
  const actual = await cmd`echo "${message}"`;
  const expected = new ProcessResult({
    ok: true,
    output: "cmd interpolation\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh supports shell pipes", async () => {
  const result = await sh`echo "hello world" | wc -w`;
  const actual = result.output;
  // Regex instead of exact string: `wc -w` output includes leading spaces on
  // some platforms (e.g. macOS pads to a column width) but not others (Linux).
  const expected = /\s*2\n/;
  assert.match(actual, expected);
});

test("sh supports environment variables while cmd does not", async () => {
  process.env.TEST_VAR = "shell-test-value";
  
  try {
    const shActual = await sh`echo $TEST_VAR`;
    const shExpected = new ProcessResult({
      ok: true,
      output: "shell-test-value\n",
      debug: "",
    });
    assert.deepEqual(shActual, shExpected);
    
    const cmdActual = await cmd`echo $TEST_VAR`;
    const cmdExpected = new ProcessResult({
      ok: true,
      output: "$TEST_VAR\n",
      debug: "",
    });
    assert.deepEqual(cmdActual, cmdExpected);
  } finally {
    delete process.env.TEST_VAR;
  }
});

test("sh.sync executes command synchronously", () => {
  const actual = sh.sync`echo "sync test"`;
  const expected = new ProcessResult({
    ok: true,
    output: "sync test\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh.sync throws error for non-existent command", () => {
  // Callback form instead of exact ProcessError match: the shell's "command not
  // found" message differs across environments (Linux vs macOS), so we assert
  // on the stable fields (name, code, output) and verify the command name
  // appears somewhere in the message rather than pinning the exact wording.
  assert.throws(
    () => sh.sync`this-command-does-not-exist`,
    (err) => {
      assert.equal(err.name, "ProcessError");
      assert.equal(err.code, 127);
      assert.equal(err.output, "");
      assert.match(err.debug, /this-command-does-not-exist/);
      assert.match(err.message, /this-command-does-not-exist/);
      return true;
    },
  );
});

test("cmd.sync executes command synchronously and returns output", () => {
  const actual = cmd.sync`echo "cmd.sync test"`;
  const expected = new ProcessResult({
    ok: true,
    output: "cmd.sync test\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("cmd.sync throws error for failing command", () => {
  const expected = new ProcessError({
    message: "Command failed with exit code 42",
    code: 42,
    output: "",
    debug: "",
  });
  
  assert.throws(
    () => {
      cmd.sync`node -e "process.exit(42)"`;
    },
    expected
  );
});

test("sh should accept string input via options", async () => {
  const actual = await sh({ input: "hello" })`cat`;
  const expected = new ProcessResult({
    ok: true,
    output: "hello",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("cmd.sync should accept string input via options", () => {
  const actual = cmd.sync({ input: "world" })`cat`;
  const expected = new ProcessResult({
    ok: true,
    output: "world",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh.input() should provide input to the command", async () => {
  const actual = await sh.input("fluent hello")`cat`;
  const expected = new ProcessResult({
    ok: true,
    output: "fluent hello",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh should accept stream input", async () => {
  const testFileName = "/tmp/sh-stream-test.txt";
  const testContent = "stream test content\n";
  
  try {
    writeFileSync(testFileName, testContent);
    const inputStream = createReadStream(testFileName);
    const actual = await sh({ input: inputStream })`cat`;
    const expected = new ProcessResult({
      ok: true,
      output: testContent,
      debug: "",
    });
    assert.deepEqual(actual, expected);
  } finally {
    try {
      unlinkSync(testFileName);
    } catch {}
  }
});

test("should throw for sync execution with a stream", () => {
  const mockStream = {
    pipe: function() { return this; },
    on: function() { return this; },
  };
  
  const expectedError = new Error(
    "Configuration error: Streams are not supported in synchronous mode"
  );
  
  assert.throws(
    () => cmd.sync({ input: mockStream })`cat`,
    expectedError,
  );
});

test(
  "sh.interactive.input replaces inherited stdin with the given data",
  async () => {
    // One `input` setting, and the later one wins: `interactive` asks for
    // this process's stdin, `.input(data)` then asks for data instead. The
    // command reads the data and nothing else.
    //
    // `output: true` is added because interactive would otherwise hand the
    // descriptor over and leave nothing to read — which is the behaviour
    // under test in its own tests, not here.
    const result = await sh.interactive.input("initial data\n")(
      { output: true })`cat`;

    const actual = result.output;
    const expected = "initial data\n";
    assert.equal(actual, expected);
  }
);

test("cmd with debug: true should show and capture stderr", async () => {
  const DEBUG = process.env.DEBUG?.includes("test");
  const actual = await cmd({
    debug: DEBUG,
  })`node -e "console.error('stderr msg')"`;
  
  const expected = new ProcessResult({
    ok: true,
    output: "",
    debug: "stderr msg\n"
  });
  
  assert.deepEqual(actual, expected);
});

test("interactive hands the terminal over, so its output is not readable",
  async () => {
    // The real file descriptors go to the child, which is what makes vim
    // draw and password prompts hide typing. The bytes then never pass
    // through this process, so there is nothing to keep — Node reports the
    // stream as null because no pipe exists.
    const result = await sh.interactive`echo "test output"`;

    const actual = {
      output: result.output, debug: result.debug, ok: result.ok,
    };
    const expected = { output: undefined, debug: undefined, ok: true };
    assert.deepEqual(actual, expected);
  });

test("any combination order should work with getters", async () => {
  // The order the chainables are written in does not matter; each adds its
  // settings and later ones win.
  const first = await sh.safe.interactive`exit 6`;
  const second = await sh.interactive.safe`exit 6`;

  const actual = {
    firstOk: first.ok,
    firstCode: first.error.code,
    secondOk: second.ok,
    secondCode: second.error.code,
  };
  const expected = {
    firstOk: false, firstCode: 6, secondOk: false, secondCode: 6,
  };
  assert.deepEqual(actual, expected);
});

test("cmd.safe.input should combine safe + input modes", async () => {
  const actual = await cmd.safe.input("hello")`false`;
  const expected = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 1",
      code: 1,
      output: "",
      debug: "",
    }),
    output: "",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh handles multiple interpolated values", async () => {
  const word1 = "hello";
  const word2 = "world";
  const actual = await sh`echo "${word1} ${word2}"`;
  const expected = new ProcessResult({
    ok: true,
    output: "hello world\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh.sync interpolates variables correctly", () => {
  const value = "sync value";
  const actual = sh.sync`echo "${value}"`;
  const expected = new ProcessResult({
    ok: true,
    // Normal strings pass through unchanged
    output: "sync value\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("cmd throws error for failing command", async () => {
  await assert.rejects(
    async () => {
      await cmd`node -e "process.exit(42)"`;
    },
    new ProcessError({
      message: "Command failed with exit code 42",
      code: 42,
      output: "",
      debug: "",
    })
  );
});

test("cmd throws error for non-existent command", async () => {
  await assert.rejects(
    async () => {
      await cmd`this-command-absolutely-does-not-exist`;
    },
    new ProcessError({
      message: "spawn this-command-absolutely-does-not-exist ENOENT",
      code: "ENOENT",
      output: "",
      debug: "",
    })
  );
});

test("cmd.sync interpolates variables correctly", () => {
  const message = "cmd.sync interpolation";
  const actual = cmd.sync`echo "${message}"`;
  const expected = new ProcessResult({
    ok: true,
    output: "cmd.sync interpolation\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("cmd.sync throws error for non-existent command", () => {
  assert.throws(
    () => {
      cmd.sync`this-command-absolutely-does-not-exist`;
    },
    new ProcessError({
      message: "spawnSync this-command-absolutely-does-not-exist ENOENT",
      code: "ENOENT",
      output: "",
      debug: "",
    })
  );
});

test("cmd.sync handles multiple interpolated values", () => {
  const word1 = "sync";
  const word2 = "test";
  const actual = cmd.sync`echo "${word1} ${word2}"`;
  const expected = new ProcessResult({
    ok: true,
    output: "sync test\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("cmd.sync safely handles special characters in interpolation", () => {
  const filename = "file with spaces & special chars.txt";
  const actual = cmd.sync`echo "File: ${filename}"`;
  const expected = new ProcessResult({
    ok: true,
    output: "File: file with spaces & special chars.txt\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh handles multiline commands", async () => {
  const actual = await sh`
    echo "line 1" &&
    echo "line 2"
  `;
  const expected = new ProcessResult({
    ok: true,
    output: "line 1\nline 2\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh executes in caller's directory (__dirname)", async () => {
  const actual = await sh`pwd`;
  const expected = new ProcessResult({
    ok: true,
    output: `${__dirname}\n`,
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh error includes stdout and stderr", async () => {
  await assert.rejects(
    async () => {
      await sh`
        node -e "console.log('out'); console.error('err'); process.exit(1)"
      `;
    },
    new ProcessError({
      message: "Command failed with exit code 1: err",
      code: 1,
      output: "out\n",
      debug: "err\n"
    })
  );
});

test("sh supports glob patterns", async () => {
  await cmd`touch test-glob-file.txt`;
  
  try {
    const result = await sh`echo test-glob-*.txt`;
    
    const actual = { ok: result.ok, expanded: result.output.trim() };
    const expected = { ok: true, expanded: "test-glob-file.txt" };
    assert.deepEqual(actual, expected);
  } finally {
    await cmd`rm -f test-glob-file.txt`;
  }
});

test("cmd does not expand glob patterns", async () => {
  const actual = await cmd`echo test-glob-*.txt`;
  const expected = new ProcessResult({
    ok: true,
    output: "test-glob-*.txt\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh is safer with potentially malicious input", async () => {
  const maliciousInput = "; echo HACKED";
  
  const actual = await sh`echo "safe${maliciousInput}"`;
  const expected = new ProcessResult({
    ok: true,
    // Double quotes in the template prevent semicolon from acting as command
    // separator. The semicolon becomes part of the echo argument, not a shell
    // metacharacter
    output: "safe; echo HACKED\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("cmd is safer with potentially malicious input", async () => {
  const maliciousInput = "; echo HACKED";
  
  const actual = await cmd`echo "safe${maliciousInput}"`;
  const expected = new ProcessResult({
    ok: true,
    // cmd doesn't run in a shell
    output: "safe; echo HACKED\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh handles empty command", async () => {
  await assert.rejects(
    async () => {
      await sh``;
    },
    new ProcessError({
      message: "Command cannot be empty",
      code: "EMPTY_COMMAND",
      output: "",
      debug: "",
    })
  );
});

test("sh handles command with only whitespace", async () => {
  await assert.rejects(
    async () => {
      await sh`   `;
    },
    new ProcessError({
      message: "Command cannot be empty",
      code: "EMPTY_COMMAND",
      output: "",
      debug: "",
    })
  );
});

test("cmd.sync should not throw when throw:false is set", () => {
  const result = cmd.sync({ throw: false })`node -e "process.exit(42)"`;
  const expected = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 42",
      code: 42,
      output: "",
      debug: "",
    }),
    output: "",
    debug: "",
  });
  assert.deepEqual(result, expected);
});

test("cmd should accept string input via options", async () => {
  const actual = await cmd({ input: "cmd hello" })`cat`;
  const expected = new ProcessResult({
    ok: true,
    output: "cmd hello",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("cmd should accept stream input", async () => {
  const testFileName = "/tmp/cmd-stream-test.txt";
  const testContent = "cmd stream content\n";
  
  try {
    writeFileSync(testFileName, testContent);
    
    const inputStream = createReadStream(testFileName);
    const actual = await cmd({ input: inputStream })`cat`;
    const expected = new ProcessResult({
      ok: true,
      output: testContent,
      debug: "",
    });
    assert.deepEqual(actual, expected);
  } finally {
    try {
      unlinkSync(testFileName);
    } catch {}
  }
});

test("cmd.input() should provide input to the command", async () => {
  const result = await cmd.input("fluent cmd hello")`cat`;
  const actual = result.output;
  const expected = "fluent cmd hello";
  assert.equal(actual, expected);
});

test("cmd.sync.input() should chain and provide input", () => {
  const result = cmd.sync.input("fluent world")`cat`;
  const actual = result.output;
  const expected = "fluent world";
  assert.equal(actual, expected);
});

test(
  "cmd.interactive.input replaces inherited stdin with the given data",
  async () => {
    // One `input` setting, and the later one wins: `interactive` asks for
    // this process's stdin, `.input(data)` then asks for data instead. The
    // command reads the data and nothing else.
    //
    // `output: true` is added because interactive would otherwise hand the
    // descriptor over and leave nothing to read — which is the behaviour
    // under test in its own tests, not here.
    const result = await cmd.interactive.input("initial data\n")(
      { output: true })`cat`;

    const actual = result.output;
    const expected = "initial data\n";
    assert.equal(actual, expected);
  }
);

test("sh.safe should not throw on non-zero exit", async () => {
  const result = await sh.safe`exit 1`;
  const expected = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 1",
      code: 1,
      output: "",
      debug: "",
    }),
    output: "",
    debug: "",
  });
  assert.deepEqual(result, expected);
});

test("cmd.safe should not throw on non-zero exit", async () => {
  const result = await cmd.safe`node -e "process.exit(2)"`;
  const expected = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 2",
      code: 2,
      output: "",
      debug: "",
    }),
    output: "",
    debug: "",
  });
  assert.deepEqual(result, expected);
});

test("sh.safe.interactive should combine safe + interactive modes",
  async () => {
    const actual = await sh.safe.interactive`exit 6`;

    const expected = new ProcessResult({
      ok: false,
      error: new ProcessError({
        message: "Command failed with exit code 6",
        code: 6,
        output: undefined,
        debug: undefined,
      }),
      output: undefined,
      debug: undefined,
    });
    assert.deepEqual(actual, expected);
  });

test("sh.interactive.safe should combine interactive + safe modes",
  async () => {
    const actual = await sh.interactive.safe`exit 4`;

    const expected = new ProcessResult({
      ok: false,
      error: new ProcessError({
        message: "Command failed with exit code 4",
        code: 4,
        output: undefined,
        debug: undefined,
      }),
      output: undefined,
      debug: undefined,
    });
    assert.deepEqual(actual, expected);
  });

test("sh.input.safe should work in reverse order", async () => {
  const actual = await sh.input("hello").safe`false`;
  const expected = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 1",
      code: 1,
      output: "",
      debug: "",
    }),
    output: "",
    debug: "",
  });
  
  assert.deepEqual(actual, expected);
});

test("cmd.interactive.safe should work for long chains", async () => {
  const actual = await cmd.interactive.safe`node -e "process.exit(5)"`;

  const expected = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 5",
      code: 5,
      output: undefined,
      debug: undefined,
    }),
    output: undefined,
    debug: undefined,
  });
  assert.deepEqual(actual, expected);
});

test("sh with combined output and debug options", async () => {
  const DEBUG = process.env.DEBUG?.includes("test");
  const combinedOptions = { output: DEBUG, debug: DEBUG };
  const actual = await sh(combinedOptions)`echo "stdout" && echo "stderr" >&2`;
  const expected = new ProcessResult({
    ok: true,
    output: "stdout\n",
    debug: "stderr\n"
  });
  assert.deepEqual(actual, expected);
});

test("sh.sync should not throw when throw:false is set", () => {
  const actual = sh.sync({ throw: false })`exit 7`;
  const expected = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 7",
      code: 7,
      output: "",
      debug: "",
    }),
    output: "",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("streaming latency validation", async (t) => {
  t.plan(10);
  
  if (DEBUG) console.log("\n=== STREAMING TEST OUTPUT ===");
  
  const invokerPath = join(__dirname, "index.test.stream-invoke.js");
  const child = spawn("node", [invokerPath], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env }
  });
  
  child.stdout.on("data", (chunk) => {
    const lines = String(chunk).split("\n");
    const nonEmptyLines = lines.filter(line => line.trim());
    for (const line of nonEmptyLines) {
      const result = JSON.parse(line);
      t.assert.ok(
        result.latency < 50,
        `${result.stream}: latency ${result.latency}ms should be under 50ms`,
      );
    }
  });

  if (DEBUG) {
    child.stderr.pipe(process.stderr);
  }
  
  await new Promise((resolve, reject) => {
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Process exited with code ${code}`));
    });
    child.on("error", reject);
  });
  
  if (DEBUG) {
    console.log("=== END STREAMING TEST ===\n");
  }
});

test("color output preservation", async (t) => {
  if (DEBUG) console.log("\n=== COLOR OUTPUT TEST ===");
  
  const result = await cmd`node index.test.color-invoke.js`;
  
  if (DEBUG) {
    console.error("Helper stderr:", result.debug);
  }
  
  const lines = result.output
    .trim()
    .split("\n")
    .filter(line => line.trim());
  const jsonObjects = lines.map(line => JSON.parse(line));
  
  const allColors = new Set();
  for (const object of jsonObjects) {
    if (object.colors) {
      object.colors.forEach(color => allColors.add(color));
    }
  }
  
  const results = {
    colors: Array.from(allColors),
    stdout: result.output,
    stderr: result.debug,
  };
  
  if (DEBUG) {
    console.log("\nColors found:", results.colors.join(", "));
    
    console.log("\nRaw emit output:");
    for (const object of jsonObjects) {
      if (object.output) {
        console.log(object.output);
      }
    }
  }
  
  // Verify all colors were preserved
  t.assert.ok(results.colors.includes("RED"), "RED color preserved");
  t.assert.ok(results.colors.includes("GREEN"), "GREEN color preserved");
  t.assert.ok(
    results.colors.includes("YELLOW"),
    "YELLOW color preserved"
  );
  t.assert.ok(results.colors.includes("BLUE"), "BLUE color preserved");
  t.assert.ok(results.colors.includes("CYAN"), "CYAN color preserved");
  
  if (DEBUG) {
    console.log("\n✓ All 5 colors preserved through process pipes");
    console.log("=== END COLOR TEST ===\n");
  }
});

// Security tests - test interpolation escaping
test(
  "sh escapes dangerous chars when value is inside double quotes",
  async () => {
  const malicious = "test $(echo PWNED)";
  const actual = await sh`echo "value: ${malicious}"`;
  const expected = new ProcessResult({
    ok: true,
    output: "value: test $(echo PWNED)\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test(
  "sh escapes dangerous chars when value is inside single quotes",
  async () => {
  const malicious = "test' || echo PWNED || '";
  const actual = await sh`echo 'value: ${malicious}'`;
  const expected = new ProcessResult({
    ok: true,
    output: "value: test' || echo PWNED || '\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh escapes backticks when value is inside double quotes", async () => {
  const malicious = "test `echo PWNED`";
  const actual = await sh`echo "value: ${malicious}"`;
  const expected = new ProcessResult({
    ok: true,
    output: "value: test `echo PWNED`\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh adds quotes when value is not quoted", async () => {
  const malicious = "test $(echo PWNED)";
  const actual = await sh`echo value: ${malicious}`;
  const expected = new ProcessResult({
    ok: true,
    output: "value: test $(echo PWNED)\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh properly escapes single quotes in unquoted context", async () => {
  const malicious = "test' || echo PWNED || '";
  const actual = await sh`echo value: ${malicious}`;
  const expected = new ProcessResult({
    ok: true,
    output: "value: test' || echo PWNED || '\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh handles semicolons safely in unquoted context", async () => {
  const malicious = "test; echo PWNED";
  const actual = await sh`echo value: ${malicious}`;
  const expected = new ProcessResult({
    ok: true,
    output: "value: test; echo PWNED\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test(
  "sh handles multiple interpolations with different quote contexts",
  async () => {
  const safe = "hello world";
  const danger = "$(echo PWNED)";
  
  const actual = await sh`echo "${safe}" and ${danger}`;
  const expected = new ProcessResult({
    ok: true,
    output: "hello world and $(echo PWNED)\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh does not over-escape normal values in double quotes", async () => {
  const normal = "hello world";
  const actual = await sh`echo "value: ${normal}"`;
  const expected = new ProcessResult({
    ok: true,
    output: "value: hello world\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh does not over-escape normal values without quotes", async () => {
  const normal = "hello";
  const actual = await sh`echo value: ${normal}`;
  const expected = new ProcessResult({
    ok: true,
    output: "value: hello\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("cmd does not escape values", async () => {
  const value = "test $(echo PWNED)";
  const actual = await cmd`echo value: ${value}`;
  const expected = new ProcessResult({
    ok: true,
    output: "value: test $(echo PWNED)\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh should interpolate object arguments as named flags", async () => {
  const args = {
    watch: true,
    quiet: false,
    port: 8080,
    configFile: "/path/to/config.json",
    verbose: undefined,
    debug: null
  };
  const actual = await sh`echo "Args:" ${args}`;
  const expected = new ProcessResult({
    ok: true,
    output: `Args: --watch --port=8080 --configFile=/path/to/config.json\n`,
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh preserves valid flag names without transformation", async () => {
  const args = {
    someKey: "camel",
    XMLParser: "pascal",
    HTTP_REQUEST: "upper_snake",
    UPPERCASE: "caps",
    snake_case: "snake",
    _private: "underscore",
    "version-name": "kebab-case",
    "output-file": "with-hyphens",
    "-v": "short-flag",
    "--help": "long-flag"
  };
  const actual = await sh`echo ${args}`;
  const expected = new ProcessResult({
    ok: true,
    output: oneLine`
      --someKey=camel --XMLParser=pascal --HTTP_REQUEST=upper_snake
      --UPPERCASE=caps --snake_case=snake --_private=underscore
      --version-name=kebab-case --output-file=with-hyphens -v=short-flag
      --help=long-flag
    ` + "\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

// Security tests - malicious object keys
//
// One table rather than a test each. A flag name is rejected or it is not,
// so the interesting thing is the whole set at once: a deepEqual over every
// case names the ones that changed, where twenty-four separate throws-tests
// reported only the first to break. Every input is kept verbatim.
const REJECTED_FLAG_NAMES = [
  "$(echo PWNED)",
  "; echo HACKED",
  "`echo INJECTED`",
  "../../etc/passwd",
  "foo bar",
  "123invalid",
  "",
  "with.dots",
  "foo..bar",
  "file.txt",
  "-$(whoami)",
  "--$(echo test)",
  "---$(evil)",
  "-; echo hacked",
  "--foo bar",
  "----foo bar",
  "-123invalid",
  "--with.dots",
  "-",
  "--",
  "---",
  "----",
  "------",
];

test("every malicious flag name is refused, by both tags", () => {
  const refusalFor = (tag, name) => {
    const error = errorFrom(() => tag`echo ${{ [name]: "value" }}`);
    return error === null
      ? "accepted"
      : /Invalid flag name/.test(error.message)
        ? "refused"
        : `wrong error: ${error.message}`;
  };
  
  const actual = REJECTED_FLAG_NAMES.map((name) => ({
    name,
    sh: refusalFor(sh, name),
    cmd: refusalFor(cmd, name),
  }));
  const expected = REJECTED_FLAG_NAMES.map((name) => ({
    name,
    sh: "refused",
    cmd: "refused",
  }));
  assert.deepEqual(actual, expected);
});

test("a malicious key is refused alongside innocent ones", () => {
  // The original cmd case: a bad key mixed in with a good one must still
  // sink the whole object rather than being dropped quietly.
  const maliciousArgs = {
    "$(echo KEY)": "$(echo VALUE)",
    "foo bar": "value",
  };
  
  const error = errorFrom(() => cmd`echo "Args:" ${maliciousArgs}`);
  
  const actual = {
    threw: error !== null,
    reason: /Invalid flag name/.test(error?.message ?? ""),
  };
  const expected = { threw: true, reason: true };
  assert.deepEqual(actual, expected);
});

test("sh supports multiple leading dashes for compatibility", async () => {
  const multiDashArgs = {
    "---verbose": true,
    "----debug": true,
    "-----custom": "value",
    "------legacy-flag": "test",
    "-------enterprise-tool": true
  };
  
  const actual = await sh`echo ${multiDashArgs}`;
  const expected = new ProcessResult({
    ok: true,
    output: oneLine`
      ---verbose ----debug -----custom=value ------legacy-flag=test
      -------enterprise-tool
    ` + "\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh accepts valid flag names with hyphens", async () => {
  const validArgs = {
    "version-name": "v1.0.0",
    "output-file": "result.txt",
    "dry-run": true,
    "no-cache": false,
    "max-count": 100
  };
  
  const actual = await sh`echo ${validArgs}`;
  const expected = new ProcessResult({
    ok: true,
    output: oneLine`
      --version-name=v1.0.0 --output-file=result.txt --dry-run --max-count=100
    ` + "\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

test("sh preserves pre-dashed flags and adds dashes when missing", async () => {
  const mixedArgs = {
    // short flag - preserve as-is
    "-v": true,
    // long flag - preserve as-is (excluded due to false)
    "--verbose": false,
    // short flag with value
    "-o": "output.txt",
    // long flag - preserve as-is
    "--debug": true,
    // no dashes - add --
    quiet: true,
    // no dashes - add --
    "force": true,
    // no dashes, with hyphen - add --
    "dry-run": true
  };
  
  const actual = await sh`echo ${mixedArgs}`;
  const expected = new ProcessResult({
    ok: true,
    output: `-v -o=output.txt --debug --quiet --force --dry-run\n`,
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

// Security tests - malicious object values  
test("sh safely handles malicious object values", async () => {
  const args = {
    config: "$(echo PWNED)",
    file: "; echo INJECTED",
    path: "`echo HACKED`",
    script: "' || echo GOTCHA || '",
  };
  const actual = await sh`echo "Args:" ${args}`;
  const expected = new ProcessResult({
    ok: true,
    // Object values are escaped during shell processing - dangerous commands
    // appear as literal text (not executed)
    output: "Args: --config=$(echo PWNED) --file=; echo INJECTED " +
            "--path=`echo HACKED` --script=' || echo GOTCHA || '\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

// Security tests - malicious array elements
test("sh safely handles malicious array elements", async () => {
  const files = [
    "safe.txt",
    "$(echo PWNED)",
    "; echo INJECTED",
    "`echo HACKED`",
    "' || echo GOTCHA || '",
  ];
  const actual = await sh`echo "Files:" ${files}`; 
  const expected = new ProcessResult({
    ok: true,
    // Arrays are escaped during shell processing - dangerous commands appear as
    // literal text (not executed)
    output: "Files: safe.txt $(echo PWNED) ; echo INJECTED `echo HACKED` " +
            "' || echo GOTCHA || '\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

// Security tests - cmd with malicious object keys/values
test("cmd preserves valid flag names without transformation", async () => {
  const args = {
    someKey: "value",
    UPPERCASE: "caps",
    "output-file": "test.txt"
  };
  
  const actual = await cmd`echo "Args:" ${args}`;
  const expected = new ProcessResult({
    ok: true,
    output: `Args: --someKey=value --UPPERCASE=caps --output-file=test.txt\n`,
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

// Security tests - cmd with malicious array elements
test("cmd safely handles malicious array elements", async () => {
  const files = [
    "safe.txt",
    "$(echo PWNED)",
    "; echo INJECTED",
  ];
  // cmd doesn't use shell, treats as literal arguments
  const actual = await cmd`echo "Files:" ${files}`;
  const expected = new ProcessResult({
    ok: true,
    output: `Files: safe.txt $(echo PWNED) ; echo INJECTED\n`,
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

// Safe String Infrastructure Tests
test("markSafeString marks strings as safe", () => {
  const safe = markSafeString("already escaped");
  assert.ok(isSafeString(safe));
  const actual = String(safe);
  const expected = "already escaped";
  assert.equal(actual, expected);
});

test("isSafeString returns false for unmarked strings", () => {
  {
    const actual = isSafeString("not marked");
    const expected = false;
    assert.equal(actual, expected);
  }
  
  {
    const actual = isSafeString(123);
    const expected = false;
    assert.equal(actual, expected);
  }
  
  {
    const actual = isSafeString(null);
    const expected = false;
    assert.equal(actual, expected);
  }
});

test("markSafeString throws for non-strings", () => {
  assert.throws(() => markSafeString(123), /Only strings can be marked/);
  assert.throws(() => markSafeString({}), /Only strings can be marked/);
});

test("safe strings can be concatenated", () => {
  const safe1 = markSafeString("--foo='bar'");
  const safe2 = markSafeString("--baz='qux'");
  const combined = markSafeString(`${safe1} ${safe2}`);
  
  {
    const actual = isSafeString(combined);
    const expected = true;
    assert.equal(actual, expected);
  }
  
  {
    const actual = String(combined);
    const expected = "--foo='bar' --baz='qux'";
    assert.equal(actual, expected);
  }
});

test("shellEscape handles simple strings", () => {
  // Simple strings without special characters don't need quotes
  {
    const actual = shellEscape("hello");
    const expected = "hello";
    assert.equal(actual, expected);
  }
  
  // Strings with spaces get quoted
  {
    const actual = shellEscape("hello world");
    const expected = "'hello world'";
    assert.equal(actual, expected);
  }
});

test("shellEscape handles empty string", () => {
  const actual = shellEscape("");
  const expected = "''";
  assert.equal(actual, expected);
});

test("shellEscape handles single quote in middle of string", async () => {
  const input = "it's";
  
  {
    const actual = shellEscape(input);
    const expected = String.raw`'it'\''s'`;
    assert.equal(actual, expected);
  }
  
  {
    const escaped = shellEscape(input);
    const command = `printf '%s' ${escaped}`;
    const actual = execSync(command, { encoding: 'utf8' });
    const expected = "it's";
    assert.equal(actual, expected);
  }
});

test("shellEscape handles string wrapped in single quotes", async () => {
  const input = "'quoted'";
  
  {
    const actual = shellEscape(input);
    const expected = String.raw`''\''quoted'\'''`;
    assert.equal(actual, expected);
  }
  
  {
    const escaped = shellEscape(input);
    const command = `printf '%s' ${escaped}`;
    const actual = execSync(command, { encoding: 'utf8' });
    const expected = "'quoted'";
    assert.equal(actual, expected);
  }
});

test("shellEscape handles already-safe strings", () => {
  const safe = markSafeString("'already escaped'");
  const actual = shellEscape(safe);
  const expected = "'already escaped'";
  assert.equal(actual, expected);
});

test("shellEscape prevents command injection", () => {
  const malicious = [
    "$(echo PWNED)",
    "`echo HACKED`",
    "; echo INJECTED",
    "|| echo INJECTED",
    "& echo BACKGROUND",
    "> output.txt",
    "| echo PIPED"
  ];
  
  for (const input of malicious) {
    const escaped = shellEscape(input);
    // Should be wrapped in single quotes with inner quotes escaped
    assert.ok(escaped.startsWith("'"), `${input} should start with quote`);
    assert.ok(escaped.endsWith("'"), `${input} should end with quote`);
    // Original dangerous content should be preserved but safe
    assert.ok(escaped.includes(input.replace(/'/g, "'\\'''")));
  }
});

test("sh safely escapes array elements to prevent shell injection", () => {
  const maliciousArray = ["safe.txt", "; echo compromised"];
  const result = sh.sync`echo ${maliciousArray}`;
  // With proper escaping, the semicolon should be treated as literal text (not
  // executed). Shell quotes are consumed during processing - dangerous text
  // appears literal.
  const actual = result.output;
  const expected = "safe.txt ; echo compromised\n";
  assert.equal(actual, expected);
});

test("sh should escape array elements with spaces and special chars", () => {
  const arrayWithSpaces = ["file name with spaces.txt", "another file.txt"];
  const result = sh.sync`echo ${arrayWithSpaces}`;
  // With proper escaping, each element should be quoted to preserve spaces
  // Shell consumes quotes - spaces are preserved as single arguments to echo
  const actual = result.output;
  const expected = "file name with spaces.txt another file.txt\n";
  assert.equal(actual, expected);
});

test("object values are shell-escaped in sh execution", async () => {
  const obj = {
    "config": "$(echo DANGER)",
    "path": "/path/with spaces",
    "enable": true
  };
  
  const result = await sh`echo ${obj}`;
  // Values are escaped during shell processing - dangerous commands appear as
  // literal text (not executed)
  const expected = new ProcessResult({
    ok: true,
    output: "--config=$(echo DANGER) --path=/path/with spaces --enable\n",
    debug: "",
  });
  assert.deepEqual(result, expected);
});

test("regression test: context-aware escaping prevents injection", async () => {
  {
    const input = "$(echo TEST)";
    const result = await sh`echo ${input}`;
    const actual = result.output;
    const expected = "$(echo TEST)\n";
    assert.equal(actual, expected);
  }
  
  {
    const input = "$(echo TEST)";
    const result = await sh`echo "${input}"`;
    const actual = result.output;
    const expected = "$(echo TEST)\n";
    assert.equal(actual, expected);
  }
  
  {
    const input = "$(echo TEST)";
    const result = await sh`echo '${input}'`;
    const actual = result.output;
    const expected = "$(echo TEST)\n";
    assert.equal(actual, expected);
  }
  
  {
    const input1 = "hello";
    const input2 = "$(echo WORLD)";
    const result = await sh`echo "${input1}" ${input2}`;
    const actual = result.output;
    const expected = "hello $(echo WORLD)\n";
    assert.equal(actual, expected);
  }
});

test("prevents all forms of command injection", async () => {
  {
    const payload = "$(echo PWNED)";
    const result = await sh`echo "${payload}"`;
    const actual = result.output;
    const expected = "$(echo PWNED)\n";
    assert.equal(actual, expected);
  }
  
  {
    const payload = "`echo HACKED`";
    const result = await sh`echo "${payload}"`;
    const actual = result.output;
    const expected = "`echo HACKED`\n";
    assert.equal(actual, expected);
  }
  
  {
    const payload = "benign; echo INJECTED";
    const result = await sh`echo "${payload}"`;
    const actual = result.output;
    const expected = "benign; echo INJECTED\n";
    assert.equal(actual, expected);
  }
  
  {
    const payload = "benign && echo INJECTED";
    const result = await sh`echo "${payload}"`;
    const actual = result.output;
    const expected = "benign && echo INJECTED\n";
    assert.equal(actual, expected);
  }
  
  {
    const payload = "benign | echo PIPED";
    const result = await sh`echo "${payload}"`;
    const actual = result.output;
    const expected = "benign | echo PIPED\n";
    assert.equal(actual, expected);
  }
});

function oneLine(strings, ...values) {
  return strings
    .reduce((result, string, index) => {
      return result + string + (values[index] || "");
    }, "")
    .replace(/\s+/g, " ")
    .trim();
}

test("module exports Process class", async () => {
  const { Process } = await import("./index.js");
  
  const actual = typeof Process;
  const expected = "function";
  assert.equal(actual, expected);
});

test("creates Process instance with command string", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello");
  
  assert.ok(proc instanceof Process);
  const actual = proc.command;
  const expected = "echo hello";
  assert.equal(actual, expected);
});

test("Process uses default configuration", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello");
  
  const actual = proc.config;
  const expected = { immediate: true, shell: true };
  assert.deepEqual(actual, expected);
});

test("Process merges custom config with defaults", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false, shell: false });
  
  const actual = proc.config;
  const expected = { immediate: false, shell: false };
  assert.deepEqual(actual, expected);
});

test("Process config is immutable", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  const config = proc.config;
  assert.throws(() => {
    config.immediate = true;
  }, TypeError);
});

test("Process with immediate true starts automatically", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: true });
  
  const actual = proc.started;
  const expected = true;
  assert.equal(actual, expected);
});

test("Process with immediate false prevents automatic start", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  const actual = proc.started;
  const expected = false;
  assert.equal(actual, expected);
});

test("start starts deferred process", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  proc.start();
  
  const actual = proc.started;
  const expected = true;
  assert.equal(actual, expected);
});

test("start() on an already-started process is a no-op", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  proc.start();
  const child = proc.started;
  
  assert.doesNotThrow(() => {
    proc.start();
  });
  
  const actual = proc.started;
  const expected = child;
  assert.equal(actual, expected);
  
  await proc;
});

test("start() returns the process for chaining", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  const actual = proc.start();
  const expected = proc;
  assert.equal(actual, expected);
  
  await proc;
});

test("output getter provides stdout stream access", async () => {
  const { Readable } = await import("node:stream");
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: true });
  
  assert.ok(proc.output instanceof Readable);
});

test("debug getter provides stderr stream access", async () => {
  const { Readable } = await import("node:stream");
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: true });
  
  assert.ok(proc.debug instanceof Readable);
});

test("input getter provides stdin stream access", async () => {
  const { Writable } = await import("node:stream");
  const { Process } = await import("./index.js");
  const proc = new Process("cat", { immediate: true });
  
  assert.ok(proc.input instanceof Writable);
  
  await proc.kill();
});

test("exposed streams exist before the process starts", async () => {
  const { Readable, Writable } = await import("node:stream");
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  const actual = {
    output: proc.output instanceof Readable,
    debug: proc.debug instanceof Readable,
    input: proc.input instanceof Writable,
  };
  const expected = { output: true, debug: true, input: true };
  assert.deepEqual(actual, expected);
});

// --- streams and lifecycle -------------------------------------------------

test("exposed streams are the same objects after start", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  const before = [proc.output, proc.debug, proc.input];
  proc.start();
  const after = [proc.output, proc.debug, proc.input];
  
  assert.deepEqual(after, before);
  await proc;
});

test("a handler attached before start receives data after it", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello world", { immediate: false });
  
  let captured = "";
  proc.output.on("data", (chunk) => {
    captured += chunk.toString();
  });
  
  proc.start();
  await proc;
  
  const actual = captured.trim();
  const expected = "hello world";
  assert.equal(actual, expected);
});

test("input written before start reaches the child", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("cat", { immediate: false });
  
  proc.input.write("written early\n");
  proc.input.end();
  proc.start();
  
  const actual = (await proc).output.trim();
  const expected = "written early";
  assert.equal(actual, expected);
});

test("multiple pre-start writes keep their order", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("cat", { immediate: false });
  
  proc.input.write("first\n");
  proc.input.write("second\n");
  proc.input.write("third\n");
  proc.input.end();
  proc.start();
  
  const actual = (await proc).output.trim();
  const expected = "first\nsecond\nthird";
  assert.equal(actual, expected);
});

test("output and debug emit nothing before start", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  let emitted = false;
  proc.output.on("data", () => { emitted = true; });
  proc.debug.on("data", () => { emitted = true; });
  
  await new Promise((resolve) => setTimeout(resolve, 20));
  
  const actual = emitted;
  const expected = false;
  assert.equal(actual, expected);
  
  await proc;
});

test("the selected shell is introspectable", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  assert.match(proc.shell, /\/(ba)?sh$/);
});

test("config is frozen all the way down", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", {
    immediate: false,
    env: { NESTED: "value" },
  });
  
  const actual = {
    config: Object.isFrozen(proc.config),
    env: Object.isFrozen(proc.config.env),
  };
  const expected = { config: true, env: true };
  assert.deepEqual(actual, expected);
});

// --- result semantics ------------------------------------------------------

test("catch and finally behave as Promise analogues", async () => {
  const { Process } = await import("./index.js");
  
  const caught = await new Process("exit 7").catch((error) => error.code);
  assert.equal(caught, 7);
  
  let ran = false;
  await new Process("echo hello").finally(() => { ran = true; });
  
  const actual = ran;
  const expected = true;
  assert.equal(actual, expected);
});

test("cwd is honoured", async () => {
  const { sh } = await import("./index.js");
  
  const actual = (await sh({ cwd: "/tmp" })`pwd`).output.trim();
  assert.match(actual, /tmp$/);
});

test("env is merged over the parent environment", async () => {
  const { sh } = await import("./index.js");
  
  const actual = (await sh({ env: { CUSTOM_VAR: "custom" } })`echo $CUSTOM_VAR`)
    .output.trim();
  const expected = "custom";
  assert.equal(actual, expected);
});

// --- stopping --------------------------------------------------------------

test("stop terminates the process and resolves once it exits", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("sleep 30");
  
  await proc.stop();
  
  const actual = proc.started;
  const expected = true;
  assert.equal(actual, expected);
});

test("stop escalates when the process ignores the polite request", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("trap '' TERM; sleep 30");
  
  await new Promise((resolve) => setTimeout(resolve, 100));
  const started = Date.now();
  await proc.stop({ gracePeriod: "200ms" });
  const elapsed = Date.now() - started;
  
  const actual = elapsed < 3000;
  const expected = true;
  assert.equal(actual, expected, `escalation took ${elapsed}ms`);
});

test("kill terminates immediately", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("sleep 30", { throw: false });

  await proc.kill();

  const { error } = await proc;
  const actual = { name: error.name, signal: error.signal };
  const expected = { name: "ProcessError", signal: "SIGKILL" };
  assert.deepEqual(actual, expected);
});

test("interrupt delivers the Ctrl-C equivalent", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("sleep 30", { throw: false });

  await proc.interrupt();

  const { error } = await proc;
  const actual = { name: error.name, signal: error.signal };
  const expected = { name: "ProcessError", signal: "SIGINT" };
  assert.deepEqual(actual, expected);
});

test("stopping an already-exited process is a no-op", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello");
  
  await proc;
  await proc.stop();
  await proc.kill();
});

// --- timeouts --------------------------------------------------------------

test("timeout stops the process and reports timedOut", async () => {
  const { sh } = await import("./index.js");

  const error = await sh({ timeout: "200ms" })`sleep 30`
    .then(() => null, (rejection) => rejection);

  const actual = {
    rejected: error !== null,
    name: error?.name,
    timedOut: error?.timedOut,
  };
  const expected = { rejected: true, name: "ProcessError", timedOut: true };
  assert.deepEqual(actual, expected);
});

test("a timed-out process keeps the output captured before the stop",
  async () => {
    const { sh } = await import("./index.js");

    const error = await sh({ timeout: "400ms" })`echo before; sleep 30`
      .then(() => null, (rejection) => rejection);

    const actual = {
      rejected: error !== null,
      output: error?.output?.trim(),
    };
    const expected = { rejected: true, output: "before" };
    assert.deepEqual(actual, expected);
  });

test("safe mode resolves a timeout instead of rejecting", async () => {
  const { sh } = await import("./index.js");

  const result = await sh.safe({ timeout: "200ms" })`sleep 30`;

  const actual = { ok: result.ok, timedOut: result.error.timedOut };
  const expected = { ok: false, timedOut: true };
  assert.deepEqual(actual, expected);
});

test("the timeout clock starts when the process starts", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", {
    immediate: false,
    timeout: "300ms",
  });
  
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  const actual = (await proc).output.trim();
  const expected = "hello";
  assert.equal(actual, expected);
});

// --- durations -------------------------------------------------------------

test("durations accept milliseconds or a unit string", async () => {
  const { Process } = await import("./index.js");
  const accepted = (timeout) => {
    const error = errorFrom(
      () => new Process("true", { immediate: false, timeout }));
    return error === null ? "accepted" : error.constructor.name;
  };

  const actual = {
    milliseconds: accepted(1000),
    seconds: accepted("1s"),
    fractionalSeconds: accepted("0.5s"),
    minutes: accepted("5m"),
    hours: accepted("1.5h"),
    // A string without a unit is an error rather than a guess: "30" could
    // as easily mean thirty seconds as thirty milliseconds.
    unitless: accepted("30"),
    notADuration: accepted("soon"),
  };
  const expected = {
    milliseconds: "accepted",
    seconds: "accepted",
    fractionalSeconds: "accepted",
    minutes: "accepted",
    hours: "accepted",
    unitless: "TypeError",
    notADuration: "TypeError",
  };
  assert.deepEqual(actual, expected);
});

// --- colour ----------------------------------------------------------------

test("color unset adds neither variable", async () => {
  const { sh } = await import("./index.js");
  // The parent's own variables are inherited by design, so they have to be
  // cleared here: otherwise this measures the environment the suite happens
  // to run in rather than what the library adds.
  const previous = {
    FORCE_COLOR: process.env.FORCE_COLOR,
    NO_COLOR: process.env.NO_COLOR,
  };
  delete process.env.FORCE_COLOR;
  delete process.env.NO_COLOR;
  
  try {
    const actual = (await sh`echo "$FORCE_COLOR|$NO_COLOR"`).output.trim();
    const expected = "|";
    assert.equal(actual, expected);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

// --- iteration -------------------------------------------------------------

test("iterating a process yields its stdout", async () => {
  const { sh } = await import("./index.js");
  
  let collected = "";
  for await (const chunk of sh`printf "one\ntwo\n"`) {
    collected += chunk.toString();
  }
  
  const actual = collected;
  const expected = "one\ntwo\n";
  assert.equal(actual, expected);
});

test("iterating a failing command throws at the end", async () => {
  const { sh } = await import("./index.js");
  let yielded = "";
  
  await assert.rejects(
    async () => {
      for await (const chunk of sh`echo partial; exit 4`) {
        yielded += chunk.toString();
      }
    },
    (error) => {
      // The chunks before the failure are still delivered; the throw
      // arrives at the end rather than replacing them.
      const actual = { yielded: yielded.trim(), code: error.code };
      const expected = { yielded: "partial", code: 4 };
      assert.deepEqual(actual, expected);
      return true;
    },
  );
});

test("awaiting after iterating still gives a complete result", async () => {
  const { sh } = await import("./index.js");
  const proc = sh`printf "alpha\n"`;
  
  let collected = "";
  for await (const chunk of proc) {
    collected += chunk.toString();
  }
  const result = await proc;
  
  const actual = result.output;
  const expected = collected;
  assert.equal(actual, expected);
});

test("abandoning iteration early does not leave the child running",
  async () => {
    const { sh } = await import("./index.js");
    const { readFileSync, existsSync, unlinkSync } = await import("node:fs");
    const marker = `/tmp/sh-cmd-tag-reap-${process.pid}-${Date.now()}.txt`;
    try { unlinkSync(marker); } catch {}
    
    // The child keeps writing, so its liveness is observable from outside.
    // Asserting on proc.started would pass whether or not it was reaped.
    const loop = `while true; do echo tick; echo tick >> ${marker};` +
      ` sleep 0.05; done`;
    const proc = sh`sh -c ${loop}`;
    
    for await (const chunk of proc) {
      break;
    }
    
    const sizeAtBreak = existsSync(marker)
      ? readFileSync(marker, "utf-8").length
      : 0;
    await new Promise((resolve) => setTimeout(resolve, 400));
    const sizeLater = existsSync(marker)
      ? readFileSync(marker, "utf-8").length
      : 0;
    
    try { unlinkSync(marker); } catch {}
    
    const actual = sizeLater;
    const expected = sizeAtBreak;
    assert.equal(actual, expected, "child kept writing after the loop broke");
  });

// --- pipelines -------------------------------------------------------------

test("a two-stage chain moves data end to end", async () => {
  const { sh } = await import("./index.js");
  
  const actual = (await sh`printf "a\nb\nc\n"`.pipe`grep b`).output.trim();
  const expected = "b";
  assert.equal(actual, expected);
});

test("a three-stage chain composes", async () => {
  const { sh } = await import("./index.js");
  
  const actual = (await sh`printf "1\n2\n3\n"`.pipe`grep -v 2`.pipe`wc -l`)
    .output.trim();
  const expected = "2";
  assert.equal(actual, expected);
});

test("pipe accepts an argv array as a stage", async () => {
  const { sh } = await import("./index.js");
  
  const actual = (await sh`echo hello`.pipe(["cat"])).output.trim();
  const expected = "hello";
  assert.equal(actual, expected);
});

test("interpolation in a pipe stage is escaped", async () => {
  const { sh } = await import("./index.js");
  const pattern = "b; echo pwned";
  
  const actual = (await sh.safe`printf "a\nb\n"`.pipe`grep ${pattern}`)
    .output.trim();
  const expected = "";
  assert.equal(actual, expected);
});

test("a chain rejects with the first failing stage", async () => {
  const { sh } = await import("./index.js");
  
  await assert.rejects(
    async () => { await sh`cat /nonexistent/path`.pipe`wc -l`; },
    (error) => {
      assert.equal(error.name, "ProcessError");
      assert.equal(error.stage, 0);
      assert.match(error.command, /nonexistent/);
      return true;
    },
  );
});

test("a chain whose stages all succeed resolves the last result",
  async () => {
    const { sh } = await import("./index.js");
    
    const result = await sh`echo hello`.pipe`tr a-z A-Z`;
    
    const actual = { ok: result.ok, output: result.output.trim() };
    const expected = { ok: true, output: "HELLO" };
    assert.deepEqual(actual, expected);
  });

test("pipe accepts a writable stream as a stage", async () => {
  const { sh } = await import("./index.js");
  const { createWriteStream, readFileSync, unlinkSync } =
    await import("node:fs");
  const path = "/tmp/sh-cmd-tag-pipe-test.txt";
  
  try {
    await sh`echo to-a-file`.pipe(createWriteStream(path));
    
    const actual = readFileSync(path, "utf-8").trim();
    const expected = "to-a-file";
    assert.equal(actual, expected);
  } finally {
    try { unlinkSync(path); } catch {}
  }
});

test("a stream stage can be followed by a command stage", async () => {
  const { sh } = await import("./index.js");
  const { PassThrough } = await import("node:stream");
  
  const actual = (await sh`echo mixed`.pipe(new PassThrough()).pipe`cat`)
    .output.trim();
  const expected = "mixed";
  assert.equal(actual, expected);
});

test("a transform stage feeds a command stage", async () => {
  const { sh } = await import("./index.js");
  const { createGzip } = await import("node:zlib");
  
  // Compressed bytes reach wc, so the transform really is in the path
  // rather than the source being forked past it.
  const compressed = Number(
    (await sh`printf "hello hello hello"`.pipe(createGzip()).pipe`wc -c`)
      .output.trim(),
  );
  const raw = "hello hello hello".length;
  
  const actual = { produced: compressed > 0, sameAsRaw: compressed === raw };
  const expected = { produced: true, sameAsRaw: false };
  assert.deepEqual(actual, expected);
});

test("iterating a chain yields the last stage's output", async () => {
  const { sh } = await import("./index.js");
  
  let collected = "";
  for await (const chunk of sh`printf "x\ny\n"`.pipe`grep y`) {
    collected += chunk.toString();
  }
  
  const actual = collected.trim();
  const expected = "y";
  assert.equal(actual, expected);
});

test("pipe rejects a stage that is neither a command nor a stream",
  async () => {
    const { sh } = await import("./index.js");
    const proc = sh`echo hello`;
    
    assert.throws(() => proc.pipe(42), TypeError);
    await proc;
  });

test("stopping a pipeline stops every stage", async () => {
  const { sh } = await import("./index.js");
  const chain = sh`sleep 30`.pipe`cat`;
  
  await chain.stop();
  
  const actual = chain.stages.map((stage) => stage.started);
  const expected = chain.stages.map(() => true);
  assert.deepEqual(actual, expected);
});

// --- live mode -------------------------------------------------------------

test("live shows a command without keeping it", async () => {
  // Shown and kept are separate questions. `live` answers the first, and
  // says nothing about the second — so the result holds `undefined`, which
  // is how "never asked for it" is told apart from "printed nothing".
  const { sh } = await import("./index.js");

  const result = await sh.live`echo shown`;

  const actual = { output: result.output, debug: result.debug, ok: result.ok };
  const expected = { output: undefined, debug: undefined, ok: true };
  assert.deepEqual(actual, expected);
});

test("live does not inherit stdin", async () => {
  const { sh } = await import("./index.js");
  const proc = sh.live`echo hello`;
  
  const actual = proc.config.input;
  const expected = undefined;
  assert.equal(actual, expected);
  
  await proc;
});

test("live composes with the other chainables", async () => {
  const { sh } = await import("./index.js");
  
  const result = await sh.safe.live`exit 5`;
  
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 5);
});

// --- abort signal ----------------------------------------------------------

test("aborting the signal kills the process, and says that is why", async () => {
  // `aborted` is to cancellation what `timedOut` is to a deadline. Without
  // it the shape the README recommends — composing a request's signal with
  // a timeout — cannot tell a cancelled command from a crashed one, which
  // is the whole reason a caller reaches for cancellation.
  const controller = new AbortController();
  const proc = sh.safe({ signal: controller.signal })`sleep 30`;
  setTimeout(() => controller.abort(), 50);
  const { error } = await proc;

  const actual = {
    name: error.name,
    aborted: error.aborted,
    signal: error.signal,
    timedOut: error.timedOut,
  };
  const expected = {
    name: "ProcessError",
    aborted: true,
    signal: "SIGKILL",
    timedOut: undefined,
  };
  assert.deepEqual(actual, expected);
});

test("an already-aborted signal kills the process at once", async () => {
  const { error } = await sh.safe({ signal: AbortSignal.abort() })`sleep 30`;

  const actual = { name: error.name, aborted: error.aborted };
  const expected = { name: "ProcessError", aborted: true };
  assert.deepEqual(actual, expected);
});

test("a signal that ends a command is named, not reported as an exit code", async () => {
  // A signalled command has no exit code — the kernel never let it pick
  // one. Every stop, kill, interrupt, abort, and outside `kill` used to
  // report `Command failed with exit code null` while carrying `code: 128`
  // asynchronously and `code: null` synchronously: a number that was never
  // there, spelled two different ways.
  const command = `sh -c 'kill -TERM $$'`;
  const asyncError = (await sh.safe`${markSafeString(command)}`).error;
  const syncError = sh.sync.safe`${markSafeString(command)}`.error;

  const shapeOf = (error) => ({
    message: error.message,
    code: error.code,
    signal: error.signal,
  });
  const actual = { async: shapeOf(asyncError), sync: shapeOf(syncError) };
  const expected = {
    async: {
      message: `Command was killed by SIGTERM: ${command}`,
      code: undefined,
      signal: "SIGTERM",
    },
    sync: {
      message: `Command was killed by SIGTERM: ${command}`,
      code: undefined,
      signal: "SIGTERM",
    },
  };
  assert.deepEqual(actual, expected);
});

test("code is a number, an errno, or nothing — never a second spelling", async () => {
  // One field, one meaning: the exit code the command chose. A spawn
  // failure keeps the platform's errno string, which is what makes a
  // missing command say ENOENT. A deadline had `"ETIMEDOUT"` here
  // synchronously and `null` asynchronously — two spellings of the fact
  // that `timedOut` already states, in a field the design says holds a
  // number.
  const codeOf = (error) => ({
    code: error.code,
    timedOut: error.timedOut ?? false,
  });
  const actual = {
    asyncTimeout: codeOf((await sh.safe({ timeout: "200ms" })`sleep 5`).error),
    syncTimeout: codeOf(sh.sync.safe({ timeout: "200ms" })`sleep 5`.error),
    asyncMissing: codeOf(
      (await sh.safe({ shell: false })`definitely-not-a-command`).error),
    syncMissing: codeOf(
      sh.sync.safe({ shell: false })`definitely-not-a-command`.error),
    asyncExit: codeOf((await sh.safe`exit 3`).error),
    syncExit: codeOf(sh.sync.safe`exit 3`.error),
  };
  const expected = {
    asyncTimeout: { code: undefined, timedOut: true },
    syncTimeout: { code: undefined, timedOut: true },
    asyncMissing: { code: "ENOENT", timedOut: false },
    syncMissing: { code: "ENOENT", timedOut: false },
    asyncExit: { code: 3, timedOut: false },
    syncExit: { code: 3, timedOut: false },
  };
  assert.deepEqual(actual, expected);
});

test("sync refuses a command whose signal has already been aborted", async () => {
  // Asynchronously, an aborted signal kills at once. This path used to
  // ignore `signal` and run the command anyway, so one option meant two
  // things depending on how it was called. An abort arriving *during* a
  // blocking call still cannot be seen, because nothing can see anything
  // then — the same bargain `timeout` strikes here.
  const result = sh.sync.safe({ signal: AbortSignal.abort() })`printf ran`;

  const actual = {
    ok: result.ok,
    output: result.output,
    aborted: result.error.aborted,
    code: result.error.code,
    namesTheCommand: result.error.message.includes("printf ran"),
  };
  const expected = {
    ok: false,
    output: "",
    aborted: true,
    code: undefined,
    namesTheCommand: true,
  };
  assert.deepEqual(actual, expected);
});

// --- the tags return processes ---------------------------------------------

test("sh and cmd return Process instances", async () => {
  const { sh, cmd, Process } = await import("./index.js");
  
  const shProc = sh`echo hello`;
  const cmdProc = cmd`echo hello`;
  
  const actual = {
    sh: shProc instanceof Process,
    cmd: cmdProc instanceof Process,
  };
  const expected = { sh: true, cmd: true };
  assert.deepEqual(actual, expected);
  
  await shProc;
  await cmdProc;
});

test("sh with immediate false defers execution", async () => {
  const { sh } = await import("./index.js");
  const proc = sh({ immediate: false })`echo deferred`;
  
  assert.equal(proc.started, false);
  
  const actual = (await proc).output.trim();
  const expected = "deferred";
  assert.equal(actual, expected);
});

test("sync still returns a ProcessResult directly", async () => {
  const { sh, ProcessResult, Process } = await import("./index.js");
  
  const result = sh.sync`echo sync`;
  
  const actual = {
    isResult: result instanceof ProcessResult,
    isProcess: result instanceof Process,
  };
  const expected = { isResult: true, isProcess: false };
  assert.deepEqual(actual, expected);
});

test("commands run in the caller's working directory, not the library's",
  async () => {
    // Regression: getCallerDirectory() looked for the first stack frame not
    // in "process.js", a file that has never existed here, so it always
    // returned the library's own directory. In the repo that is invisible,
    // because the tests run from the same directory; once installed it meant
    // every command ran inside node_modules/sh-cmd-tag.
    const { sh } = await import("./index.js");
    
    const actual = (await sh`pwd`).output.trim();
    const expected = process.cwd();
    assert.equal(actual, expected);
  });

test("an explicit cwd still overrides the default", async () => {
  const { sh } = await import("./index.js");
  
  const actual = (await sh({ cwd: "/tmp" })`pwd`).output.trim();
  assert.match(actual, /tmp$/);
});

test("a mid-chain stream error fails that stage instead of hanging",
  async () => {
    const { sh } = await import("./index.js");
    const { Transform } = await import("node:stream");
    
    const exploding = new Transform({
      transform(chunk, encoding, callback) {
        callback(new Error("transform blew up"));
      },
    });
    
    await assert.rejects(
      async () => { await sh`echo data`.pipe(exploding).pipe`cat`; },
      (error) => {
        assert.equal(error.message, "transform blew up");
        assert.equal(error.stage, 1);
        return true;
      },
    );
  });

test("sync honours timeout, enforcing the deadline with an immediate kill",
  async () => {
    const { sh } = await import("./index.js");
    const started = Date.now();
    
    assert.throws(
      () => { sh.sync({ timeout: "300ms" })`sleep 30`; },
      (error) => {
        assert.equal(error.name, "ProcessError");
        assert.equal(error.timedOut, true);
        return true;
      },
    );
    
    const elapsed = Date.now() - started;
    const actual = elapsed < 5000;
    const expected = true;
    assert.equal(actual, expected, `sync timeout took ${elapsed}ms`);
  });

test("sync safe mode resolves a timeout instead of throwing", async () => {
  const { sh } = await import("./index.js");
  
  const result = sh.sync.safe({ timeout: "300ms" })`sleep 30`;
  
  assert.equal(result.ok, false);
  assert.equal(result.error.timedOut, true);
});

test("env can override the colour variables when color is unset", async () => {
  const { sh } = await import("./index.js");
  
  const actual = (await sh({ env: { FORCE_COLOR: "3" } })`echo "$FORCE_COLOR"`)
    .output.trim();
  const expected = "3";
  assert.equal(actual, expected);
});

// --- findings from automated review ----------------------------------------

test("a command producing megabytes of stdout still settles", async () => {
  // An unread PassThrough stops draining at its high-water mark and
  // backpressures the child, which then blocks before exiting. Awaiting
  // without consuming the stream used to hang forever.
  const { sh } = await import("./index.js");
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const script = `/tmp/sh-cmd-tag-big-${process.pid}.js`;
  writeFileSync(script, 'process.stdout.write("x".repeat(5_000_000));');
  
  try {
    const actual = (await sh`node ${script}`).output.length;
    const expected = 5_000_000;
    assert.equal(actual, expected);
  } finally {
    try { unlinkSync(script); } catch {}
  }
});

test("a command producing megabytes of stderr still settles", async () => {
  const { sh } = await import("./index.js");
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const script = `/tmp/sh-cmd-tag-bigerr-${process.pid}.js`;
  writeFileSync(script, 'process.stderr.write("y".repeat(5_000_000));');
  
  try {
    const actual = (await sh`node ${script}`).debug.length;
    const expected = 5_000_000;
    assert.equal(actual, expected);
  } finally {
    try { unlinkSync(script); } catch {}
  }
});

test("ending iteration naturally does not stop a healthy process",
  async () => {
    // A command may close stdout and keep working. Iteration ending is not
    // a reason to terminate it.
    const { sh } = await import("./index.js");
    const { writeFileSync, unlinkSync } = await import("node:fs");
    const script = `/tmp/sh-cmd-tag-eof-${process.pid}.js`;
    writeFileSync(
      script,
      'process.stdout.write("early\\n"); process.stdout.end();' +
      'setTimeout(() => process.exit(0), 400);',
    );
    
    try {
      const proc = sh`node ${script}`;
      for await (const chunk of proc) {
        void chunk;
      }
      const result = await proc;
      
      const actual = result.ok;
      const expected = true;
      assert.equal(actual, expected);
    } finally {
      try { unlinkSync(script); } catch {}
    }
  });

test("a timeout is a failure even when the child exits cleanly", async () => {
  // A well-behaved child handles termination and exits 0, so exit status
  // alone cannot tell a finished command from one that ran out of time.
  const { sh } = await import("./index.js");
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const script = `/tmp/sh-cmd-tag-coop-${process.pid}.js`;
  writeFileSync(
    script,
    'process.on("SIGTERM", () => process.exit(0));' +
    'setInterval(() => {}, 1000);',
  );
  
  try {
    await assert.rejects(
      async () => { await sh({ timeout: "300ms" })`node ${script}`; },
      (error) => {
        assert.equal(error.timedOut, true);
        return true;
      },
    );
  } finally {
    try { unlinkSync(script); } catch {}
  }
});

test("awaiting a chain that ends in a transform settles", async () => {
  const { sh } = await import("./index.js");
  const { createGzip } = await import("node:zlib");
  
  const result = await sh`printf "hi"`.pipe(createGzip());
  
  const actual = result.ok;
  const expected = true;
  assert.equal(actual, expected);
});

test("a safe pipeline still reports which stage failed", async () => {
  // Safe stages resolve a failed result rather than rejecting, so they skip
  // the rejection path that records the stage.
  const { sh } = await import("./index.js");
  
  const result = await sh.safe`cat /nonexistent/path`.pipe`wc -l`;
  
  assert.equal(result.ok, false);
  assert.equal(result.error.stage, 0);
  assert.match(result.error.command, /nonexistent/);
});

test("a reused abort signal does not accumulate listeners", async () => {
  const { sh } = await import("./index.js");
  const { getEventListeners } = await import("node:events");
  const controller = new AbortController();
  
  for (let index = 0; index < 20; index++) {
    await sh({ signal: controller.signal })`true`;
  }
  
  const actual = getEventListeners(controller.signal, "abort").length;
  const expected = 0;
  assert.equal(actual, expected);
});

test("writing input to a command that never reads it does not crash",
  async () => {
    // A command may exit without reading stdin — `yes | head` is an ordinary
    // idiom — and writing to the closed pipe raises EPIPE. That is the
    // expected end of the conversation, not a failure worth propagating.
    // This surfaced as an intermittent CI failure on Node 24 before it was
    // ever reproduced locally, since it depends on how much gets written
    // before the child exits.
    const { cmd } = await import("./index.js");
    
    const result = await cmd.safe.input("x".repeat(500_000))`false`;
    
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 1);
  });

test("a shell pipeline whose reader exits early still succeeds", async () => {
  const { sh } = await import("./index.js");
  
  const actual = (await sh`yes | head -2`).output;
  const expected = "y\ny\n";
  assert.equal(actual, expected);
});

test("an input stream error closes the child's stdin", async () => {
  // Destroying only the source leaves child.stdin open, so a command
  // waiting for EOF runs forever and the process never settles. The
  // assertion is that it settles at all; the previous version asserted
  // `result !== undefined`, which is true of anything that returns.
  const { sh } = await import("./index.js");
  const proc = sh.safe`cat`;
  
  setTimeout(() => proc.input.destroy(new Error("boom")), 50);
  
  let timer;
  const settled = await Promise.race([
    proc.then(() => "settled"),
    new Promise((resolve) => {
      // Cleared below: the losing timer would otherwise keep the runner
      // alive for its full duration after the race is decided, adding three
      // seconds to every run of the suite.
      timer = setTimeout(() => resolve("hung"), 3000);
    }),
  ]).finally(() => clearTimeout(timer));
  
  const actual = settled;
  const expected = "settled";
  assert.equal(actual, expected);
});

test("a failing stage tears down the rest of the pipeline", async () => {
  // Without this the chain waits for every stage before reporting, so a
  // failed first stage followed by a long-running one stays pending for the
  // full duration — and a downstream that never ends, forever.
  const { sh } = await import("./index.js");
  const started = Date.now();
  
  const error = await sh`false`.pipe`sleep 30`.catch((e) => e);
  const elapsed = Date.now() - started;
  
  const actual = { stage: error.stage, promptly: elapsed < 5000 };
  const expected = { stage: 0, promptly: true };
  assert.deepEqual(actual, expected, `took ${elapsed}ms`);
});

test("a child killed before its deadline is not reported as timed out",
  async () => {
    // spawnSync reports the same SIGKILL whether the deadline expired or the
    // child killed itself, so only its own ETIMEDOUT can tell them apart.
    const { sh } = await import("./index.js");
    
    const result = sh.sync.safe({ timeout: "10s" })`sh -c "kill -9 $$"`;
    
    const actual = { ok: result.ok, timedOut: Boolean(result.error.timedOut) };
    const expected = { ok: false, timedOut: false };
    assert.deepEqual(actual, expected);
  });

test("stopping delivers one signal, not two", async () => {
  // The process group includes the child, so signalling both delivers the
  // same signal twice and can interrupt a graceful shutdown already under
  // way on the first.
  const { sh } = await import("./index.js");
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const script = `/tmp/sh-cmd-tag-signals-${process.pid}.js`;
  writeFileSync(
    script,
    'let n = 0;' +
    'process.on("SIGTERM", () => {' +
    '  n++; console.log("TERM " + n);' +
    '  setTimeout(() => process.exit(0), 200);' +
    '});' +
    'setInterval(() => {}, 1000);',
  );
  
  try {
    const proc = sh.safe`node ${script}`;
    await new Promise((resolve) => setTimeout(resolve, 300));
    await proc.stop();
    const result = await proc;
    
    const actual = result.output.trim();
    const expected = "TERM 1";
    assert.equal(actual, expected);
  } finally {
    try { unlinkSync(script); } catch {}
  }
});

test("a safe pipeline short-circuits too", async () => {
  // A safe stage resolves a failed result rather than rejecting, so watching
  // only for rejections left safe chains waiting on stages that a failure
  // had already made pointless.
  const { sh } = await import("./index.js");
  const started = Date.now();
  
  const result = await sh.safe`false`.pipe`sleep 30`;
  const elapsed = Date.now() - started;
  
  const actual = {
    ok: result.ok,
    stage: result.error.stage,
    promptly: elapsed < 5000,
  };
  const expected = { ok: false, stage: 0, promptly: true };
  assert.deepEqual(actual, expected, `took ${elapsed}ms`);
});

test("a pipe inside a command string keeps the shell's own semantics",
  async () => {
    // Turning on pipefail was tried and reverted: it reports 141 for
    // `yes | head`, a correct idiom, so it would change the meaning of
    // shell the caller wrote. A pipe() chain is where the strict rule
    // applies, because that is the composition this library performs.
    const { sh } = await import("./index.js");
    
    const actual = {
      async: (await sh.safe`false | true`).ok,
      sync: sh.sync.safe`false | true`.ok,
    };
    const expected = { async: true, sync: true };
    assert.deepEqual(actual, expected);
  });

test("a finished stage closes the producers feeding it", async () => {
  // Without this an endless producer never learns its consumer is gone,
  // and the chain runs forever. A shell sends SIGPIPE; this is the
  // equivalent, and the closed producer is not counted as a failure.
  //
  // The producer is paced deliberately. `yes` proves the same thing but
  // emits hundreds of megabytes before teardown, which made this test's
  // timing — and its memory use — vary enough to fail intermittently on
  // Node 22.
  const { sh } = await import("./index.js");
  const producer = "while true; do echo y; sleep 0.01; done";
  
  const result = await sh.safe`sh -c ${producer}`.pipe`head -2`;
  
  const actual = { ok: result.ok, output: result.output };
  const expected = { ok: true, output: "y\ny\n" };
  assert.deepEqual(actual, expected);
});

test("a succeeding shell pipeline still succeeds", async () => {
  const { sh } = await import("./index.js");
  
  const result = await sh`printf "a\nb\n" | grep b`;
  
  const actual = { ok: result.ok, output: result.output.trim() };
  const expected = { ok: true, output: "b" };
  assert.deepEqual(actual, expected);
});

test("an error from a caller's input stream does not strand the child",
  async () => {
    const { sh } = await import("./index.js");
    const { Readable } = await import("node:stream");
    const failing = new Readable({
      read() { this.destroy(new Error("source failed")); },
    });
    
    let timer;
    const settled = await Promise.race([
      sh.safe({ input: failing })`cat`.then(() => "settled"),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve("hung"), 3000);
      }),
    ]).finally(() => clearTimeout(timer));
    
    const actual = settled;
    const expected = "settled";
    assert.equal(actual, expected);
  });

test("piping from a deferred process starts it", async () => {
  // Without this the chain has no source: iterating it waits on output that
  // can never arrive, because nothing ever ran.
  const { sh } = await import("./index.js");
  
  let collected = "";
  for await (const chunk of sh({ immediate: false })`echo deferred`.pipe`cat`) {
    collected += chunk.toString();
  }
  
  const actual = collected.trim();
  const expected = "deferred";
  assert.equal(actual, expected);
});

test("capture is bounded so a noisy process still settles", async () => {
  // An endless producer used to accumulate every chunk until
  // Buffer.concat().toString() exceeded the maximum string length — and
  // that threw inside the completion handler, so the process never settled
  // at all rather than merely losing output.
  const { sh } = await import("./index.js");
  const producer = "while true; do echo y; sleep 0.01; done";
  const proc = sh.safe`sh -c ${producer}`;
  
  setTimeout(() => proc.kill(), 200);
  
  let timer;
  const settled = await Promise.race([
    proc.then(() => "settled"),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve("hung"), 4000);
    }),
  ]).finally(() => clearTimeout(timer));
  
  const actual = settled;
  const expected = "settled";
  assert.equal(actual, expected);
});

test("a caller can choose the shell", async () => {
  // The library picking bash is a default, not a restriction: a caller who
  // wants dash, zsh, or a shell at a particular path says so.
  //
  // /bin/sh is named rather than /bin/dash so this asserts on every POSIX
  // host instead of skipping where dash is absent. A test that can skip
  // itself into silence proves nothing about the hosts that skip it.
  const { sh, Process } = await import("./index.js");
  // The unnamed case is compared against whatever the library selected, not
  // a hardcoded path: bash sits at different paths across distributions, and
  // on a host with no bash at all, falling back to /bin/sh is correct
  // behaviour that a hardcoded expectation would report as a failure.
  const selected = new Process("true", { immediate: false }).shell;

  const actual = {
    named: (await sh({ shell: "/bin/sh" })`echo $0`).output.trim(),
    sync: sh.sync({ shell: "/bin/sh" })`echo $0`.output.trim(),
    unnamed: (await sh`echo $0`).output.trim(),
  };
  const expected = {
    named: "/bin/sh",
    sync: "/bin/sh",
    unnamed: selected,
  };
  assert.deepEqual(actual, expected);
});

test("the chosen shell is introspectable", async () => {
  const { Process } = await import("./index.js");
  
  const actual = new Process("true", {
    immediate: false,
    shell: "/bin/sh",
  }).shell;
  const expected = "/bin/sh";
  assert.equal(actual, expected);
});

test("a reused input stream does not accumulate listeners or pipes",
  async () => {
    // One listener and one pipe destination per command would otherwise
    // stay attached to a stream the caller reuses, until Node warns about
    // the leak it has come to look like.
    const { sh } = await import("./index.js");
    const { PassThrough } = await import("node:stream");
    const { getEventListeners } = await import("node:events");
    const shared = new PassThrough();
    
    for (let index = 0; index < 12; index++) {
      await sh.safe({ input: shared })`true`;
    }
    
    const actual = {
      listeners: getEventListeners(shared, "error").length,
      pipes: shared._readableState.pipes.length,
    };
    const expected = { listeners: 0, pipes: 0 };
    assert.deepEqual(actual, expected);
  });

test("capture false still streams to an iterator", async () => {
  // Not capturing is about what the result holds, not about whether the
  // caller can see the output.
  const { sh } = await import("./index.js");
  const lines = "for i in 1 2 3; do echo line$i; done";
  
  let collected = "";
  for await (const chunk of sh({ capture: false })`sh -c ${lines}`) {
    collected += chunk.toString();
  }
  
  const actual = collected;
  const expected = "line1\nline2\nline3\n";
  assert.equal(actual, expected);
});

test("a shortcut still applies its settings when nothing overrides them",
  async () => {
    // `live` sends both streams to this process's own, which is what makes
    // a command visible. It keeps nothing, because nothing asked it to —
    // the default is the other way round, kept and not shown.
    const { sh } = await import("./index.js");

    const live = sh.live`echo x`;
    const safe = sh.safe`exit 3`;

    const actual = {
      output: live.config.output === process.stdout,
      debug: live.config.debug === process.stderr,
      throws: safe.config.throw,
    };
    const expected = { output: true, debug: true, throws: false };
    assert.deepEqual(actual, expected);

    await Promise.all([live, safe]);
  });

test("finally runs on a pipeline, for both outcomes", async () => {
  const { sh } = await import("./index.js");
  let ranOnSuccess = false;
  let ranOnFailure = false;
  
  await sh`echo ok`.pipe`cat`.finally(() => { ranOnSuccess = true; });
  await sh`cat /nonexistent/path`.pipe`cat`
    .finally(() => { ranOnFailure = true; })
    .catch(() => {});
  
  const actual = { ranOnSuccess, ranOnFailure };
  const expected = { ranOnSuccess: true, ranOnFailure: true };
  assert.deepEqual(actual, expected);
});

test("a duration of Infinity means no deadline", async () => {
  const { Process } = await import("./index.js");
  
  const proc = new Process("echo hello", {
    immediate: false,
    timeout: Infinity,
  });
  
  const actual = (await proc).output.trim();
  const expected = "hello";
  assert.equal(actual, expected);
});

test("a negative duration is rejected", async () => {
  const { Process } = await import("./index.js");
  
  const error = errorFrom(
    () => new Process("true", { immediate: false, timeout: -1 }),
  );
  
  const actual = { type: error?.constructor.name, names: /timeout/.test(
    error?.message ?? "") };
  const expected = { type: "TypeError", names: true };
  assert.deepEqual(actual, expected);
});

test("interactive input is refused in synchronous mode", async () => {
  // There is no way to hand a blocking call the parent's stdin, so saying so
  // beats pretending.
  const { sh } = await import("./index.js");
  
  const error = errorFrom(() => sh.sync({ input: true })`cat`);
  
  const actual = {
    threw: error !== null,
    explains: /synchronous/i.test(error?.message ?? ""),
  };
  const expected = { threw: true, explains: true };
  assert.deepEqual(actual, expected);
});

test("input as a chainable accepts a configuration object", async () => {
  const { sh } = await import("./index.js");
  
  const actual = (await sh.input("hello there")({ capture: true })`wc -w`)
    .output.trim();
  const expected = "2";
  assert.equal(actual, expected);
});

// --- blind spots a refactor could pass through -----------------------------
//
// Two behaviours were asserted only indirectly: stdin inheritance was checked
// by reading back the config, and signal delivery was checked by watching the
// direct child. Both would keep passing if the wiring underneath broke. These
// drive the real thing instead.

function runInvoker(stdinData, timeoutMs = 5000) {
  const invokerPath = join(__dirname, "index.test.interactive-invoke.js");
  const child = spawn("node", [invokerPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  
  let output = "";
  let debug = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { debug += chunk; });
  child.stdin.end(stdinData);
  
  return Promise.race([
    new Promise((resolve, reject) => {
      child.on("close", (code) => resolve({ code, output, debug }));
      child.on("error", reject);
    }),
    new Promise((resolve) => setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: "TIMED OUT", output, debug });
    }, timeoutMs)),
  ]);
}

test("interactive really inherits stdin, end to end", async () => {
  // Asserting `config.input === true` passes even if the stdio array is
  // built wrong. The bytes have to make the whole trip: this test's write
  // -> the invoker's stdin -> the inherited fd -> `cat` -> forwarded back
  // out -> this test's read.
  const { code, output, debug } = await runInvoker("round trip\n");
  
  const actual = { code, output };
  const expected = { code: 0, output: "round trip\n" };
  assert.deepEqual(actual, expected, debug);
});

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !isAlive(pid);
}

// A shell without job control puts its background children in its own
// process group, so the grandchild is reachable only by signalling the
// group. Printing its pid lets the test check the thing that actually
// matters: whether it is gone afterwards.
const SPAWNS_GRANDCHILD = "sleep 300 & echo $!; wait";

function grandchildPidOf(proc) {
  // Deliberately not `for await ... break`: breaking out of iteration stops
  // the process, so every assertion below would pass against a kill() that
  // did nothing at all. Listening leaves the process running, untouched.
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const pid = Number(String(chunk).trim().split("\n")[0]);
      if (Number.isInteger(pid) && pid > 0) {
        proc.output.off("data", onData);
        resolve(pid);
      }
    };
    proc.output.on("data", onData);
    setTimeout(() => reject(new Error("no pid was reported")), 3000);
  });
}

test("kill reaps the whole tree, not just the direct child", async () => {
  // Signalling only the child leaves its children running and holding the
  // pipe open — the failure that first showed up as `sh`sleep 30`` never
  // settling. Checking the grandchild by pid turns that hang into a
  // failed assertion.
  const proc = sh.safe`${markSafeString(SPAWNS_GRANDCHILD)}`;
  const grandchild = await grandchildPidOf(proc);
  
  await proc.kill();
  await proc;
  
  const actual = await waitForExit(grandchild);
  const expected = true;
  assert.equal(actual, expected, `pid ${grandchild} survived the kill`);
});

test("stop reaps the whole tree, not just the direct child", async () => {
  const proc = sh.safe`${markSafeString(SPAWNS_GRANDCHILD)}`;
  const grandchild = await grandchildPidOf(proc);
  
  await proc.stop({ gracePeriod: "500ms" });
  await proc;
  
  const actual = await waitForExit(grandchild);
  const expected = true;
  assert.equal(actual, expected, `pid ${grandchild} survived the stop`);
});

test("a timeout reaps the whole tree", async () => {
  const proc = sh.safe({ timeout: "700ms", gracePeriod: "300ms" })
    `${markSafeString(SPAWNS_GRANDCHILD)}`;
  const grandchild = await grandchildPidOf(proc);
  const result = await proc;
  
  const actual = {
    timedOut: Boolean(result.error?.timedOut),
    reaped: await waitForExit(grandchild),
  };
  const expected = { timedOut: true, reaped: true };
  assert.deepEqual(actual, expected, `pid ${grandchild} survived the timeout`);
});

test("a failing pipeline leaves no stage running", async () => {
  // Tearing down a pipeline has to reach the processes, not just reject the
  // promise. A surviving stage holds a pipe open and shows up later as an
  // unrelated hang.
  const proc = sh.safe`${markSafeString(SPAWNS_GRANDCHILD)}`;
  const grandchild = await grandchildPidOf(proc);
  
  const result = await proc.pipe`false`.pipe`cat`;
  
  const actual = { ok: result.ok, reaped: await waitForExit(grandchild) };
  const expected = { ok: false, reaped: true };
  assert.deepEqual(actual, expected, `pid ${grandchild} survived the pipeline`);
});

test("an aborted process reaps the whole tree", async () => {
  const controller = new AbortController();
  const proc = sh.safe({ signal: controller.signal })
    `${markSafeString(SPAWNS_GRANDCHILD)}`;
  const grandchild = await grandchildPidOf(proc);
  
  controller.abort();
  await proc;
  
  const actual = await waitForExit(grandchild);
  const expected = true;
  assert.equal(actual, expected, `pid ${grandchild} survived the abort`);
});

test("a marked string interpolates as itself, in both tags", async () => {
  // Marking exists so a caller can interpolate a string they have already
  // made safe. It is a String object, so the object branch claimed it
  // first and rejected its indices as flag names — every existing test
  // called isSafeString or shellEscape directly, so none of them ever put
  // a marked string where it was meant to go.
  const actual = {
    sh: (await sh`${markSafeString("echo one; echo two")}`).output,
    quoted: (await sh`echo "${markSafeString("x y")}"`).output,
    inArray: (await sh`echo ${[markSafeString("a b"), "c d"]}`).output,
    cmd: (await cmd`echo ${markSafeString("literal")}`).output,
  };
  const expected = {
    sh: "one\ntwo\n",
    quoted: "x y\n",
    inArray: "a b c d\n",
    cmd: "literal\n",
  };
  assert.deepEqual(actual, expected);
});

test("marking one value does not unmark the escaping around it", async () => {
  // The ordering fix must not become a hole: an unmarked value sitting
  // next to a marked one is still escaped, and a plain object is still
  // read as flags rather than as a safe string.
  const hostile = "hi; echo PWNED";
  
  const actual = {
    sh: (await sh`echo ${hostile}`).output,
    cmd: (await cmd`echo ${hostile}`).output,
    mixed: (await sh`echo ${markSafeString("safe")} ${hostile}`).output,
    flags: (await sh`echo ${{ verbose: true, out: "d" }}`).output,
  };
  const expected = {
    sh: "hi; echo PWNED\n",
    cmd: "hi; echo PWNED\n",
    mixed: "safe hi; echo PWNED\n",
    flags: "--verbose --out=d\n",
  };
  assert.deepEqual(actual, expected);
});

// --- capture limits are validated, not guessed at ---------------------------

test("an invalid escape no longer makes the whole command undefined",
  async () => {
    // A template holding an escape JavaScript rejects — an octal like
    // \033 — has an `undefined` cooked value while `raw` survives. Built
    // from cooked, the command became the literal text "undefined" and
    // failed with "command not found", telling the caller nothing.
    const result = await sh`printf '\033[31mRED\033[0m'`;

    const actual = result.output;
    const expected = "[31mRED[0m";
    assert.equal(actual, expected);
  });

test("escape sequences in a template are the command's to interpret",
  async () => {
    // printf understands \n and \t. It now receives the two characters
    // and decides for itself, which is what the same text typed into a
    // shell would do.
    const actual = {
      newline: (await sh`printf 'a\nb'`).output,
      tab: (await sh`printf 'a\tb'`).output,
    };
    const expected = { newline: "a\nb", tab: "a\tb" };
    assert.deepEqual(actual, expected);
  });

test("a backslash inside an interpolated value is still escaped", async () => {
  // Raw applies to the literal parts of the template only. Values are
  // still escaped, so a backslash in one stays data rather than becoming
  // shell syntax.
  const value = "a\\b";
  const actual = {
    sh: (await sh`printf '%s' ${value}`).output,
    cmd: (await cmd`printf '%s' ${value}`).output,
  };
  const expected = { sh: "a\\b", cmd: "a\\b" };
  assert.deepEqual(actual, expected);
});

// --- cmd hands values to the child untouched -------------------------------

test("cmd delivers a value exactly as it was given", async () => {
  // cmd built a command string and then split it back apart, so every
  // value made a round trip through a parser that strips quotes and
  // splits on whitespace. A filename like it's.txt became its.txt,
  // silently, in the tag chosen precisely for not interpreting things.
  const values = [
    'say "hi"',
    "it's fine",
    'path "with" quotes',
    "a  b",
    '--flag="x y"',
    "; rm -rf /",
    "$(echo pwned)",
  ];

  const actual = [];
  for (const value of values) {
    actual.push((await cmd`printf '%s' ${value}`).output);
  }
  const expected = values;
  assert.deepEqual(actual, expected);
});

test("cmd keeps argument boundaries, not just the printed text", async () => {
  // Printing can look right while the boundaries are wrong: an object
  // whose value held spaces produced --out="d, i, and r" as three
  // arguments, which echoed identically to the one argument intended.
  // Printing each argument on its own line shows the difference.
  const lines = async (fn) =>
    (await fn()).output.split("\n").filter(Boolean);

  const actual = {
    object: await lines(() =>
      cmd`printf '%s\n' ${{ verbose: true, out: "d i r" }}`),
    array: await lines(() => cmd`printf '%s\n' ${["one", "two three"]}`),
    glued: await lines(() => cmd`printf '%s\n' --name=${"a b"}`),
    quotedLiteral: await lines(() => cmd`printf '%s\n' "Hello World"`),
  };
  const expected = {
    object: ["--verbose", "--out=d i r"],
    array: ["one", "two three"],
    glued: ["--name=a b"],
    quotedLiteral: ["Hello World"],
  };
  assert.deepEqual(actual, expected);
});

test("a value cannot smuggle in an argument boundary", async () => {
  // The placeholders that keep values away from the parser are generated
  // per call, so a value containing something that looks like one cannot
  // split itself into two arguments.
  const sneaky = "a 0 b";
  const actual = (await cmd`printf '%s\n' ${sneaky}`).output
    .split("\n")
    .filter(Boolean);
  const expected = ["a 0 b"];
  assert.deepEqual(actual, expected);
});

test("the published source is text, so every tool can read it", async () => {
  // A placeholder delimiter has to be a byte no argument can contain, which
  // makes NUL the right choice — but writing it as a literal byte rather
  // than `\0` turns the only file this package ships into binary. `grep`
  // then matches nothing, `git diff` prints "Binary files differ", and
  // GitHub refuses to render the review. The escape means the same thing to
  // JavaScript and keeps the file readable, so this guards the encoding
  // rather than the behaviour.
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(join(__dirname, "index.js"));
  const actual = { nulBytes: source.filter((byte) => byte === 0).length };
  const expected = { nulBytes: 0 };
  assert.deepEqual(actual, expected);
});

// --- writing to the input port -------------------------------------------

test("a command can be driven as it runs, through a stream you supply", async () => {
  // Use case 13 of the design: drive a REPL. Write, read what came back,
  // write again. The port model's own answer — anything unusual is a
  // stream you supply — has to actually carry this, so it is checked
  // rather than assumed.
  const { PassThrough } = await import("node:stream");
  const keyboard = new PassThrough();
  const proc = sh({ input: keyboard })`cat`;

  const seen = [];
  const reading = (async () => {
    for await (const chunk of proc) {
      seen.push(String(chunk));
    }
  })();

  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
  keyboard.write("first\n");
  await settle();
  const afterFirst = seen.join("");
  keyboard.write("second\n");
  await settle();
  const afterSecond = seen.join("");
  keyboard.end();
  await reading;

  const actual = { afterFirst, afterSecond };
  const expected = { afterFirst: "first\n", afterSecond: "first\nsecond\n" };
  assert.deepEqual(actual, expected);
});

test("writing to an input port with nothing connected fails where it was written", async () => {
  // It used to vanish. A port with nothing connected closes the child's
  // stdin at once so `sh`sort`` finishes, and the `write after end` that
  // followed was swallowed by the handler that exists for EPIPE. Writing
  // before `start()` worked, because the buffered bytes are themselves the
  // connection — so the same two lines worked or did nothing depending on
  // their order, and nothing said which.
  const started = sh.safe`cat`;
  const beforeStart = sh.safe({ immediate: false })`cat`;
  beforeStart.input.write("buffered\n");
  beforeStart.input.end();
  beforeStart.start();

  const refusal = errorFrom(() => started.input.write("dropped\n"));
  const actual = {
    refused: refusal?.constructor.name ?? "accepted",
    namesTheCommand: refusal?.message.includes("cat") ?? false,
    offersAStream: refusal?.message.includes("input: myStream") ?? false,
    offersDeferredStart: refusal?.message.includes("immediate: false") ?? false,
    // The supported way still works, and is the same two lines reordered.
    beforeStartStillWorks: (await beforeStart).output,
  };
  const expected = {
    refused: "Error",
    namesTheCommand: true,
    offersAStream: true,
    offersDeferredStart: true,
    beforeStartStillWorks: "buffered\n",
  };
  assert.deepEqual(actual, expected);
  await started;
});

test("a destination that cannot keep up slows the command down", async () => {
  // Without this the forwarding loop kept reading and queueing, so a slow
  // log file or socket turned a noisy command into unbounded memory growth
  // here, and the command "finished" with its output still in a buffer.
  // Measured by how much is queued at the high-water mark, which is what a
  // shell pipe bounds and what was unbounded.
  const { Writable } = await import("node:stream");
  let peakQueued = 0;
  const slow = new Writable({
    highWaterMark: 64 * 1024,
    write(chunk, encoding, callback) {
      peakQueued = Math.max(peakQueued, slow.writableLength);
      // Slow enough that a fast producer would outrun it.
      setTimeout(callback, 5);
    },
  });

  const megabytes = 8;
  await sh({ output: slow })
    `${markSafeString(`dd if=/dev/zero bs=1048576 count=${megabytes} 2>/dev/null`)}`;

  const produced = megabytes * 1024 * 1024;
  const actual = {
    stayedNearTheWatermark: peakQueued < produced / 4,
    didNotQueueEverything: peakQueued < produced,
  };
  const expected = {
    stayedNearTheWatermark: true,
    didNotQueueEverything: true,
  };
  assert.deepEqual(actual, expected, `peak queued ${peakQueued} of ${produced}`);
});

test("sync does not collect a port that nothing is connected to", async () => {
  // A blocking call cannot stream, so every byte it collects is held until
  // the call returns. Asking the kernel for output that is about to be
  // discarded meant a noisy command could hold hundreds of megabytes to
  // throw them away. Measured by peak resident memory of a child process,
  // because the cost is memory rather than a value any assertion can read.
  const script = (settings) =>
    `const { sh } = await import(${JSON.stringify(join(__dirname, "index.js"))});\n` +
    `sh.sync(${settings})\`dd if=/dev/zero bs=1048576 count=200 2>/dev/null\`;\n` +
    `process.stdout.write(String(process.memoryUsage().rss));\n`;

  const peakRssOf = async (settings) => {
    const path = `/tmp/sh-cmd-tag-syncbuf-${process.pid}-${settings.length}.mjs`;
    writeFileSync(path, script(settings));
    try {
      const out = await new Promise((resolve, reject) => {
        const child = spawn("node", [path], { stdio: ["ignore", "pipe", "ignore"] });
        let seen = "";
        child.stdout.on("data", (chunk) => { seen += chunk; });
        child.on("close", () => resolve(seen));
        child.on("error", reject);
      });
      return Number(out.trim());
    } finally {
      try { unlinkSync(path); } catch {}
    }
  };

  const discarded = await peakRssOf(`{ output: false, debug: false }`);
  const kept = await peakRssOf(`{ output: true, debug: false }`);

  const actual = {
    // 200MB of output, so keeping it must cost far more than discarding it.
    discardingIsCheap: discarded < kept / 2,
  };
  const expected = { discardingIsCheap: true };
  assert.deepEqual(actual, expected, `discarded ${discarded} vs kept ${kept}`);
});

// --- head and tail: the two bounded writables worth shipping --------------

/**
 * Writes each text to a bounded writable, closes it, and returns what it
 * kept — so the assertion sees the settled value rather than whatever had
 * arrived by the time the line ran.
 */
async function writtenTo(sink, ...texts) {
  for (const text of texts) {
    sink.write(text);
  }
  sink.end();
  await finished(sink);
  return sink.text;
}

test("head and tail keep an end of the bytes, never half a character", async () => {
  // This is the bug a hand-rolled version has, and the reason these are
  // exported at all. "é" is two bytes and "🙂" is four, so every limit
  // below falls inside a character. A naive buffer returns the halves and
  // the text grows a replacement character; these return one character
  // fewer.
  const actual = {
    headUnderLimit: await writtenTo(head(64), "hello"),
    tailUnderLimit: await writtenTo(tail(64), "hello"),
    headAscii: await writtenTo(head(3), "abcdef"),
    tailAscii: await writtenTo(tail(3), "abcdef"),
    headCutsTwoByte: await writtenTo(head(5), "ééé"),
    tailCutsTwoByte: await writtenTo(tail(5), "ééé"),
    headCutsFourByte: await writtenTo(head(4), "a🙂"),
    tailCutsFourByte: await writtenTo(tail(3), "a🙂"),
    headKeepsWholeFourByte: await writtenTo(head(5), "a🙂"),
    tailKeepsWholeFourByte: await writtenTo(tail(4), "a🙂"),
    acrossWrites: await writtenTo(tail(4), "abc", "def"),
    nothingWritten: await writtenTo(tail(4)),
  };
  const expected = {
    headUnderLimit: "hello",
    tailUnderLimit: "hello",
    headAscii: "abc",
    tailAscii: "def",
    headCutsTwoByte: "éé",
    tailCutsTwoByte: "éé",
    headCutsFourByte: "a",
    tailCutsFourByte: "",
    headKeepsWholeFourByte: "a🙂",
    tailKeepsWholeFourByte: "🙂",
    acrossWrites: "cdef",
    nothingWritten: "",
  };
  assert.deepEqual(actual, expected);
});

test("a bounded writable is just a destination a port accepts", async () => {
  // The promise made when a size option was removed: anything unusual is a
  // stream you supply. These are the two that are not unusual.
  const lastLines = tail(11);
  const firstLines = head(7);
  const result = await sh({
    output: [lastLines, firstLines],
  })`printf 'one\ntwo\nthree\n'`;

  const actual = {
    tail: lastLines.text,
    head: firstLines.text,
    kept: result.output,
  };
  const expected = {
    tail: "\ntwo\nthree\n",
    head: "one\ntwo",
    kept: undefined,
  };
  assert.deepEqual(actual, expected);
});

test("a size carries its unit, and everything is not a size", async () => {
  const filler = "x".repeat(3000);
  const rejection = (fn) => {
    const error = errorFrom(fn);
    return error === null ? "accepted" : error.constructor.name;
  };

  const actual = {
    bytes: (await writtenTo(tail(12), filler)).length,
    decimal: (await writtenTo(tail("1kB"), filler)).length,
    binary: (await writtenTo(tail("1KiB"), filler)).length,
    fractional: (await writtenTo(tail("1.5kB"), filler)).length,
    unitless: rejection(() => tail("1024")),
    unknownUnit: rejection(() => tail("1 kilobyte")),
    everything: rejection(() => head(Infinity)),
    zero: rejection(() => head(0)),
    fractionalBytes: rejection(() => head(1.5)),
    // Keeping everything is a port's own job, so the error says so rather
    // than leaving a caller to guess which key they wanted.
    everythingNamesThePort: errorFrom(() => head(Infinity)).message
      .includes("`true` on the port"),
  };
  const expected = {
    bytes: 12,
    decimal: 1000,
    binary: 1024,
    fractional: 1500,
    unitless: "TypeError",
    unknownUnit: "TypeError",
    everything: "TypeError",
    zero: "TypeError",
    fractionalBytes: "TypeError",
    everythingNamesThePort: true,
  };
  assert.deepEqual(actual, expected);
});

// --- env is the environment, not an addition to it ------------------------

test("env replaces the environment rather than extending it", async () => {
  // Node's child_process and Python's subprocess both replace. Merging on
  // the caller's behalf would be the library doing something unasked, and
  // would leave a clean environment unsayable without another option.
  // Asserted against a variable this test controls rather than PATH,
  // because bash substitutes a compiled-in default PATH when none is
  // inherited, so an empty PATH never appears even under replacement.
  const previous = process.env.SH_CMD_TAG_INHERITED;
  process.env.SH_CMD_TAG_INHERITED = "from the parent";
  try {
    const actual = {
      replaced: (await sh({ env: { ONLY: "this" } })
        `printf '%s' "$ONLY|$SH_CMD_TAG_INHERITED"`).output,
      extended: (await sh({ env: { ...process.env, EXTRA: "added" } })
        `printf '%s' "$EXTRA|$SH_CMD_TAG_INHERITED"`).output,
    };
    const expected = {
      replaced: "this|",
      extended: "added|from the parent",
    };
    assert.deepEqual(actual, expected);
  } finally {
    if (previous === undefined) delete process.env.SH_CMD_TAG_INHERITED;
    else process.env.SH_CMD_TAG_INHERITED = previous;
  }
});

test("sync and async agree about env", async () => {
  // sync passed process.env outright, so it ignored the option entirely
  // and ran the command in the wrong environment with no error.
  const actual = {
    async: (await sh({ env: { WHO: "async" } })`printf '%s' "$WHO"`).output,
    sync: sh.sync({ env: { WHO: "sync" } })`printf '%s' "$WHO"`.output,
    asyncCmd: (await cmd({ env: { WHO: "acmd" } })`printenv WHO`).output.trim(),
    syncCmd: cmd.sync({ env: { WHO: "scmd" } })`printenv WHO`.output.trim(),
  };
  const expected = {
    async: "async", sync: "sync", asyncCmd: "acmd", syncCmd: "scmd",
  };
  assert.deepEqual(actual, expected);
});

test("omitting env inherits the caller's environment", async () => {
  // Replacing is what `env` means when given; saying nothing still means
  // "whatever I have", which is also what child_process does.
  const previous = process.env.SH_CMD_TAG_PROBE;
  process.env.SH_CMD_TAG_PROBE = "inherited";
  try {
    const actual = {
      async: (await sh`printf '%s' "$SH_CMD_TAG_PROBE"`).output,
      sync: sh.sync`printf '%s' "$SH_CMD_TAG_PROBE"`.output,
    };
    const expected = { async: "inherited", sync: "inherited" };
    assert.deepEqual(actual, expected);
  } finally {
    if (previous === undefined) delete process.env.SH_CMD_TAG_PROBE;
    else process.env.SH_CMD_TAG_PROBE = previous;
  }
});

// --- commands do not outlive the program that started them -----------------

test("a command is ended when the program that started it ends", async () => {
  // Each command leads its own process group so stop() can reach it and
  // everything it spawned without signalling us too. Nothing then ties the
  // group's lifetime to ours, so a command outlived the program that
  // started it — including on Ctrl-C, which is how most scripts end.
  //
  // Driven from a real child process, because the behaviour under test is
  // what happens when a process ends, which cannot be observed from inside
  // the process it is happening to.
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const script = `/tmp/sh-cmd-tag-exit-${process.pid}.mjs`;
  const here = new URL("./index.js", import.meta.url).pathname;
  writeFileSync(
    script,
    `const { sh } = await import(${JSON.stringify(here)});\n` +
    "const p = sh`sleep 517 & echo $!; wait`;\n" +
    "p.output.on('data', (c) => {\n" +
    "  const pid = String(c).trim().split('\\n')[0];\n" +
    "  if (/^\\d+$/.test(pid)) process.stderr.write(pid + '\\n');\n" +
    "});\n" +
    "setInterval(() => {}, 1000);\n",
  );

  const alive = (pid) => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  };

  const endedBy = async (signal) => {
    const child = spawn("node", [script], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let seen = "";
    child.stderr.on("data", (chunk) => { seen += chunk; });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const grandchild = Number(seen.trim().split("\n")[0]);
    child.kill(signal);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const survived = alive(grandchild);
    if (survived) { try { process.kill(grandchild, "SIGKILL"); } catch {} }
    return survived ? "survived" : "ended";
  };

  try {
    const actual = {
      interrupt: await endedBy("SIGINT"),
      terminate: await endedBy("SIGTERM"),
      hangup: await endedBy("SIGHUP"),
    };
    const expected = {
      interrupt: "ended", terminate: "ended", hangup: "ended",
    };
    assert.deepEqual(actual, expected);
  } finally {
    try { unlinkSync(script); } catch {}
  }
});

test("a program that handles the signal itself keeps its commands", async () => {
  // The promise is that a command does not outlive the program that started
  // it — and a program still running has not ended. A server traps SIGTERM
  // precisely so it can drain in its own order, and its commands are
  // usually what it needs to drain; ending them on the signal took that
  // away before the first line of its handler ran.
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const script = `/tmp/sh-cmd-tag-handled-${process.pid}.mjs`;
  const here = new URL("./index.js", import.meta.url).pathname;
  writeFileSync(
    script,
    `const { sh } = await import(${JSON.stringify(here)});\n` +
    "const p = sh`sleep 519 & echo $!; wait`;\n" +
    "p.output.on('data', (c) => {\n" +
    "  const pid = String(c).trim().split('\\n')[0];\n" +
    "  if (/^\\d+$/.test(pid)) process.stderr.write(pid + '\\n');\n" +
    "});\n" +
    // The host's own handler: it keeps running, as a draining server does.
    "process.on('SIGTERM', () => { process.stderr.write('handled\\n'); });\n" +
    "setInterval(() => {}, 1000);\n",
  );

  const alive = (pid) => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  };

  try {
    const child = spawn("node", [script], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let seen = "";
    child.stderr.on("data", (chunk) => { seen += chunk; });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const grandchild = Number(seen.trim().split("\n")[0]);

    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 400));

    const actual = {
      hostHandledIt: seen.includes("handled"),
      commandSurvived: alive(grandchild),
    };
    // And the host's own exit still reaches the command.
    child.kill("SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (alive(grandchild)) { try { process.kill(grandchild, "SIGKILL"); } catch {} }

    const expected = { hostHandledIt: true, commandSurvived: true };
    assert.deepEqual(actual, expected);
  } finally {
    try { unlinkSync(script); } catch {}
  }
});

// --- the stdio model: a port says what it is connected to -----------------

test("a port takes nothing, the result, a stream, or a list", async () => {
  // `true` means the same thing on every port: put it in the result. A
  // stream means write there. `false` means nothing. A list means all of
  // them — fanning out on output, in order on input.
  const { Writable } = await import("node:stream");
  const written = [];
  const sink = new Writable({
    write(chunk, _enc, cb) { written.push(String(chunk)); cb(); },
  });

  const actual = {
    kept: (await sh({ output: true })`printf kept`).output,
    nothing: (await sh({ output: false })`printf dropped`).output,
    toStream: await (async () => {
      written.length = 0;
      await sh({ output: sink })`printf streamed`;
      return written.join("");
    })(),
    both: await (async () => {
      written.length = 0;
      const r = await sh({ output: [sink, true] })`printf both`;
      return `${written.join("")}|${r.output}`;
    })(),
  };
  const expected = {
    kept: "kept",
    nothing: undefined,
    toStream: "streamed",
    both: "both|both",
  };
  assert.deepEqual(actual, expected);
});

test("the default keeps output and gives the command no input", async () => {
  // Which is what stops a command that reads stdin from waiting forever
  // for bytes that cannot arrive — the bug this model was built to fix.
  const settled = await Promise.race([
    sh`sort`.then((r) => r.output),
    new Promise((resolve) => setTimeout(() => resolve("WAITED"), 3000)),
  ]);

  const actual = { sortSettles: settled, kept: (await sh`printf x`).output };
  const expected = { sortSettles: "", kept: "x" };
  assert.deepEqual(actual, expected);
});

test("input sources are read in the order they were written", async () => {
  // A list on input is a sequence, not a merge. execa's identical-looking
  // syntax merges concurrently, so a fast source overtakes a slow one.
  const { Readable } = await import("node:stream");
  const slow = Readable.from((async function* () {
    for (const piece of ["one ", "two ", "three "]) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      yield piece;
    }
  })());

  const actual = {
    strings: (await sh({ input: ["a", "b", "c"] })`cat`).output,
    mixed: (await sh({ input: [slow, "last"] })`cat`).output,
  };
  const expected = { strings: "abc", mixed: "one two three last" };
  assert.deepEqual(actual, expected);
});

test("input can be kept, so a session can be transcribed", async () => {
  // `true` on input means the same as anywhere else: put it in the result.
  const result = await sh({ input: ["typed\n", true] })`cat`;

  const actual = { input: result.input, output: result.output };
  const expected = { input: "typed\n", output: "typed\n" };
  assert.deepEqual(actual, expected);
});

test("a port that was not kept reads as undefined, not empty", async () => {
  // So "never asked for it" is distinguishable from "asked, and it printed
  // nothing", and the mistake surfaces on the line that holds it.
  const notKept = await sh({ output: false })`printf something`;
  const keptButSilent = await sh`true`;

  const actual = {
    notKept: notKept.output,
    keptButSilent: keptButSilent.output,
  };
  const expected = { notKept: undefined, keptButSilent: "" };
  assert.deepEqual(actual, expected);
});

test("a port refuses a value that is not a connection", async () => {
  const cases = [42, {}, Symbol("x")];
  const actual = cases.map((value) =>
    errorFrom(() => sh({ output: value })`echo hi`)?.constructor.name
      ?? "accepted");
  const expected = cases.map(() => "TypeError");
  assert.deepEqual(actual, expected);
});

test("sync and async agree about every port", async () => {
  const { Writable } = await import("node:stream");
  const seen = [];
  const sink = new Writable({
    write(chunk, _enc, cb) { seen.push(String(chunk)); cb(); },
  });

  const actual = {
    asyncKept: (await sh({ output: true })`printf x`).output,
    syncKept: sh.sync({ output: true })`printf x`.output,
    asyncNone: (await sh({ output: false })`printf x`).output,
    syncNone: sh.sync({ output: false })`printf x`.output,
    asyncStream: await (async () => {
      seen.length = 0;
      await sh({ output: sink })`printf s`;
      return seen.join("");
    })(),
    syncStream: (() => {
      seen.length = 0;
      sh.sync({ output: sink })`printf s`;
      return seen.join("");
    })(),
  };
  const expected = {
    asyncKept: "x", syncKept: "x",
    asyncNone: undefined, syncNone: undefined,
    asyncStream: "s", syncStream: "s",
  };
  assert.deepEqual(actual, expected);
});
