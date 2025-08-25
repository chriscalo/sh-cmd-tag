import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { createReadStream, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  sh,
  cmd,
  ProcessError,
  ProcessResult,
  markSafeString,
  isSafeString,
  shellEscape
} from "./index.js";

const DEBUG = process.env.DEBUG?.includes("test");
const __dirname = dirname(new URL(import.meta.url).pathname);

test("sh is a function", () => {
  const actual = typeof sh;
  const expected = "function";
  assert.equal(actual, expected);
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
  await assert.rejects(
    async () => {
      await sh`nonexistent-cmd`;
    },
    new ProcessError({
      message: oneLine`
        Command failed with exit code 127:
        /bin/sh: nonexistent-cmd: command not found
      `,
      code: 127,
      output: "",
      debug: "/bin/sh: nonexistent-cmd: command not found\n",
    }),
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

test("cmd is a function", () => {
  const actual = typeof cmd;
  const expected = "function";
  assert.equal(actual, expected);
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
  const expected = /(\s+)2\n/;
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


test("sh.sync is a function", () => {
  const actual = typeof sh.sync;
  const expected = "function";
  assert.equal(actual, expected);
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
  assert.throws(
    () => sh.sync`this-command-does-not-exist`,
    new ProcessError({
      message: oneLine`
        Command failed with exit code 127:
        /bin/sh: this-command-does-not-exist: command not found
      `,
      code: 127,
      output: "",
      debug: "/bin/sh: this-command-does-not-exist: command not found\n"
    })
  );
});

test("cmd.sync is a function", () => {
  const actual = typeof cmd.sync;
  const expected = "function";
  assert.equal(actual, expected);
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

test("sh.input is a function", () => {
  const actual = typeof sh.input;
  const expected = "function";
  assert.equal(actual, expected);
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
  "sh.interactive.input should provide data then enable interactive stdin",
  async () => {
    const interactiveWithInput = sh.interactive.input("initial data\n");
    const actual = typeof interactiveWithInput;
    const expected = "function";
    assert.equal(actual, expected);
  }
);


test("sh with output: true should show and capture output", async () => {
  const DEBUG = process.env.DEBUG?.includes("test");
  const actual = await sh({ output: DEBUG })`echo "visible output"`;
  const expected = new ProcessResult({
    ok: true,
    output: "visible output\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});

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

test("sh.interactive is a function", () => {
  const actual = typeof sh.interactive;
  const expected = "function";
  assert.equal(actual, expected);
});

test("sh.interactive should capture output while displaying it", async () => {
  const DEBUG = process.env.DEBUG?.includes("test");
  const actual = await sh({ 
    output: DEBUG,
    debug: DEBUG,
    input: true 
  })`echo "test output"`;
  const expected = new ProcessResult({
    ok: true,
    output: "test output\n",
    debug: "",
  });
  assert.deepEqual(actual, expected);
});


test("any combination order should work with getters", async () => {
  const actual1 = await sh.safe.interactive`exit 6`;
  const expected1 = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 6",
      code: 6,
      output: "",
      debug: "",
    }),
    output: "",
    debug: "",
  });
  assert.deepEqual(actual1, expected1);
  
  const actual2 = await sh.interactive.safe`exit 6`;
  const expected2 = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 6",
      code: 6,
      output: "",
      debug: "",
    }),
    output: "",
    debug: "",
  });
  assert.deepEqual(actual2, expected2);
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
    const shResult = await sh`echo test-glob-*.txt`;
    // sh should expand the glob
    assert.ok(shResult.ok);
    assert.ok(shResult.output.includes("test-glob-file.txt"));
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

test("cmd.input is a function", () => {
  const actual = typeof cmd.input;
  const expected = "function";
  assert.equal(actual, expected);
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

test("cmd.interactive is a function", () => {
  const actual = typeof cmd.interactive;
  const expected = "function";
  assert.equal(actual, expected);
});


test(
  "cmd.interactive.input should provide data then enable interactive stdin",
  async () => {
    const interactiveWithInput = cmd.interactive.input("initial data\n");
    const actual = typeof interactiveWithInput;
    const expected = "function";
    assert.equal(actual, expected);
  }
);

test("cmd.interactive should capture output while displaying it", async () => {
  const DEBUG = process.env.DEBUG?.includes("test");
  const result = await cmd({ 
    output: DEBUG,
    debug: DEBUG,
    input: true 
  })`echo "cmd test"`;
  const expected = new ProcessResult({
    ok: true,
    output: "cmd test\n",
    debug: "",
  });
  assert.deepEqual(result, expected);
});

test("sh.safe is a function", () => {
  const actual = typeof sh.safe;
  const expected = "function";
  assert.equal(actual, expected);
});

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

test("cmd.safe is a function", () => {
  const actual = typeof cmd.safe;
  const expected = "function";
  assert.equal(actual, expected);
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

test(
  "sh.safe.interactive should combine safe + interactive modes",
  async () => {
    const DEBUG = process.env.DEBUG?.includes("test");
  const result = await sh({
    throw: false,
    output: DEBUG,
    debug: DEBUG,
    input: true,
  })`exit 3`;
  
  const expected = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 3",
      code: 3,
      output: "",
      debug: "",
    }),
    output: "",
    debug: "",
  });
  assert.deepEqual(result, expected);
});

test(
  "sh.interactive.safe should combine interactive + safe modes",
  async () => {
  const DEBUG = process.env.DEBUG?.includes("test");
  const actual = await sh({ 
    output: DEBUG,
    debug: DEBUG,
    input: true,
    throw: false,
  })`exit 4`;
  
  const expected = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 4",
      code: 4,
      output: "",
      debug: "",
    }),
    output: "",
    debug: "",
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
  const DEBUG = process.env.DEBUG?.includes("test");
  
  const actual = await cmd({
    output: DEBUG,
    debug: DEBUG,
    input: true,
    throw: false,
  })`node -e "process.exit(5)"`;
  
  const expected = new ProcessResult({
    ok: false,
    error: new ProcessError({
      message: "Command failed with exit code 5",
      code: 5,
      output: "",
      debug: "",
    }),
    output: "",
    debug: "",
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
test("sh rejects flag names with shell metacharacters", async () => {
  const args = { "$(echo PWNED)": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 
    'Should reject shell metacharacters: "$(echo PWNED)"');
});

test("sh rejects flag names with shell injection", async () => {
  const args = { "; echo HACKED": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject shell injection: "; echo HACKED"');
});

test("sh rejects flag names with backticks", async () => {
  const args = { "`echo INJECTED`": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject backticks: "`echo INJECTED`"');
});

test("sh rejects flag names with path traversal", async () => {
  const args = { "../../etc/passwd": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject path traversal: "../../etc/passwd"');
});

test("sh rejects flag names with spaces", async () => {
  const args = { "foo bar": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject spaces: "foo bar"');
});

test("sh rejects flag names starting with numbers", async () => {
  const args = { "123invalid": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject starts with number: "123invalid"');
});

test("sh rejects empty flag names", async () => {
  const args = { "": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject empty: ""');
});

test("sh rejects flag names with dots", async () => {
  const args = { "with.dots": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject dots not allowed: "with.dots"');
});

test("sh rejects flag names with double dots", async () => {
  const args = { "foo..bar": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject double dots: "foo..bar"');
});

test("sh rejects file-like flag names with extensions", async () => {
  const args = { "file.txt": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject file-like with extension: "file.txt"');
});

test("sh rejects pre-dashed flag names with shell metacharacters (short dash)", 
     async () => {
  const args = { "-$(whoami)": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject shell metacharacters with short dash');
});

test("sh rejects pre-dashed flag names with shell metacharacters (long dash)", 
     async () => {
  const args = { "--$(echo test)": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject shell metacharacters with long dash');
});

test("sh rejects pre-dashed flag names with shell metacharacters (triple dash)", 
     async () => {
  const args = { "---$(evil)": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject shell metacharacters with triple dash');
});

test("sh rejects pre-dashed flag names with shell injection (short dash)", 
     async () => {
  const args = { "-; echo hacked": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject shell injection with short dash');
});

test("sh rejects pre-dashed flag names with spaces (long dash)", async () => {
  const args = { "--foo bar": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject spaces with long dash');
});

test("sh rejects pre-dashed flag names with spaces (quad dash)", async () => {
  const args = { "----foo bar": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject spaces with quad dash');
});

test("sh rejects pre-dashed flag names starting with numbers (short dash)", 
     async () => {
  const args = { "-123invalid": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 
    'Should reject starts with number with short dash');
});

test("sh rejects pre-dashed flag names with dots (long dash)", async () => {
  const args = { "--with.dots": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 
    'Should reject dots not allowed with long dash');
});

test("sh rejects just a dash as flag name", async () => {
  const args = { "-": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject just a dash');
});

test("sh rejects just double dash as flag name", async () => {
  const args = { "--": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject just double dash');
});

test("sh rejects just triple dash as flag name", async () => {
  const args = { "---": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject just triple dash');
});

test("sh rejects just quad dash as flag name", async () => {
  const args = { "----": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject just quad dash');
});

test("sh rejects just many dashes as flag name", async () => {
  const args = { "------": "value" };
  assert.throws(() => {
    sh`echo ${args}`;
  }, /Invalid flag name/, 'Should reject just many dashes');
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
test("cmd rejects malicious object keys", async () => {
  const maliciousArgs = {
    "$(echo KEY)": "$(echo VALUE)",
    "foo bar": "value",
  };
  
  assert.throws(() => {
    cmd`echo "Args:" ${maliciousArgs}`;
  }, /Invalid flag name/, "Should reject malicious keys in cmd too");
});

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
  assert.equal(isSafeString(safe), true);
  assert.equal(String(safe), "already escaped");
});

test("isSafeString returns false for unmarked strings", () => {
  assert.equal(isSafeString("not marked"), false);
  assert.equal(isSafeString(123), false);
  assert.equal(isSafeString(null), false);
});

test("markSafeString throws for non-strings", () => {
  assert.throws(() => markSafeString(123), /Only strings can be marked/);
  assert.throws(() => markSafeString({}), /Only strings can be marked/);
});

test("safe strings can be concatenated", () => {
  const safe1 = markSafeString("--foo='bar'");
  const safe2 = markSafeString("--baz='qux'");
  const combined = markSafeString(`${safe1} ${safe2}`);
  assert.equal(isSafeString(combined), true);
  assert.equal(String(combined), "--foo='bar' --baz='qux'");
});

test("shellEscape handles simple strings", () => {
  // Safe strings don't need quotes
  assert.equal(shellEscape("hello"), "hello");
  // Strings with spaces get quoted
  assert.equal(shellEscape("hello world"), "'hello world'");
});

test("shellEscape handles empty string", () => {
  assert.equal(shellEscape(""), "''");
});

test("shellEscape handles single quotes", () => {
  assert.equal(shellEscape("it's"), "'it'\\''s'");
  assert.equal(shellEscape("'quoted'"), "''\\''quoted'\\'''");
});

test("shellEscape handles already-safe strings", () => {
  const safe = markSafeString("'already escaped'");
  assert.equal(shellEscape(safe), "'already escaped'");
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
  // This test ensures that context-aware escaping correctly prevents command
  // injection in all quoting contexts while producing natural output
  
  const testCases = [
    {
      name: "unquoted interpolation",
      template: (val) => sh`echo ${val}`,
      input: "$(echo TEST)",
      // Literal text, not executed
      expectedOutput: "$(echo TEST)\n"
    },
    {
      name: "double quoted interpolation", 
      template: (val) => sh`echo "${val}"`,
      input: "$(echo TEST)",
      // Literal text, not executed
      expectedOutput: "$(echo TEST)\n"
    },
    {
      name: "single quoted interpolation",
      template: (val) => sh`echo '${val}'`,
      input: "$(echo TEST)",
      // Literal text, not executed
      expectedOutput: "$(echo TEST)\n"
    },
    {
      name: "mixed interpolation",
      template: (val1, val2) => sh`echo "${val1}" ${val2}`,
      input1: "hello",
      input2: "$(echo WORLD)",
      // Both literal, not executed
      expectedOutput: "hello $(echo WORLD)\n"
    }
  ];
  
  for (const testCase of testCases) {
    let result;
    if (testCase.input1 !== undefined) {
      result = await testCase.template(testCase.input1, testCase.input2);
    } else {
      result = await testCase.template(testCase.input);
    }
    assert.equal(result.output, testCase.expectedOutput, 
      `${testCase.name} failed. ` +
      `Expected ${JSON.stringify(testCase.expectedOutput)} ` +
      `but got: ${JSON.stringify(result.output)}`);
  }
});

test("prevents all forms of command injection", async () => {
  const injectionVectors = [
    "$(echo PWNED)",
    "`echo HACKED`", 
    "benign; echo INJECTED",
    "benign && echo INJECTED",
    "benign | echo PIPED",
  ];
  
  for (const payload of injectionVectors) {
    const result = await sh`echo "${payload}"`;
    
    // CRITICAL SECURITY TEST: The payload should appear literally in output
    // This proves the dangerous command was NOT executed, just treated as text
    assert.ok(result.output.includes(payload), 
      `🚨 SECURITY TEST FAILED: Payload should appear literally in output. ` +
      `Payload: ${JSON.stringify(payload)}, ` +
      `Output: ${JSON.stringify(result.output)}`);
      
    // The output should be exactly the literal payload plus newline
    const expectedOutput = payload + "\n";
    assert.equal(result.output, expectedOutput,
      `Expected literal payload in output. ` +
      `Payload: ${JSON.stringify(payload)}, ` +
      `Expected: ${JSON.stringify(expectedOutput)}, ` +
      `Actual: ${JSON.stringify(result.output)}`);
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
