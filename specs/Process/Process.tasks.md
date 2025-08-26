# Process Class Implementation Tasks

## TDD Task Tracking

- [x] **Task 1:** `module exports Process class`
```javascript
test("module exports Process class", async () => {
  const { Process } = await import("./index.js");
  
  const actual = typeof Process;
  const expected = "function";
  assert.equal(actual, expected);
});
```

- [x] **Task 2:** `creates Process instance with command string`
```javascript
test("creates Process instance with command string", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello");
  
  const actual = proc instanceof Process;
  const expected = true;
  assert.equal(actual, expected);
  
  const actualCommand = proc.command;
  const expectedCommand = "echo hello";
  assert.equal(actualCommand, expectedCommand);
});
```

- [x] **Task 3:** `Process uses default configuration`
```javascript
test("Process uses default configuration", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello");
  
  const actual = proc.config;
  const expected = { immediate: true, shell: true };
  assert.deepEqual(actual, expected);
});
```

- [x] **Task 4:** `Process merges custom config with defaults`
```javascript
test("Process merges custom config with defaults", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false, shell: false });
  
  const actual = proc.config;
  const expected = { immediate: false, shell: false };
  assert.deepEqual(actual, expected);
});
```

- [x] **Task 5:** `Process config is immutable`
```javascript
test("Process config is immutable", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  const config = proc.config;
  assert.throws(() => {
    config.immediate = true;
  }, TypeError);
});
```

- [x] **Task 6:** `Process with immediate true starts automatically`
```javascript
test("Process with immediate true starts automatically", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: true });
  
  const actual = proc.started;
  const expected = true;
  assert.equal(actual, expected);
});
```

- [x] **Task 7:** `Process with immediate false prevents automatic start`
```javascript
test("Process with immediate false prevents automatic start", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  const actual = proc.started;
  const expected = false;
  assert.equal(actual, expected);
});
```

- [x] **Task 8:** `start starts deferred process`
```javascript
test("start starts deferred process", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  proc.start();
  
  const actual = proc.started;
  const expected = true;
  assert.equal(actual, expected);
});
```

- [x] **Task 9:** `start throws error if already started`
```javascript
test("start throws error if already started", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  proc.start();
  
  assert.throws(() => {
    proc.start();
  }, Error);
});
```

- [x] **Task 10:** output getter provides stdout stream access
```javascript
test("output getter provides stdout stream access", async () => {
  const { Readable } = await import("node:stream");
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: true });
  
  assert.ok(proc.output instanceof Readable);
});
```

- [x] **Task 11:** debug getter provides stderr stream access
```javascript
test("debug getter provides stderr stream access", async () => {
  const { Readable } = await import("node:stream");
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: true });
  
  assert.ok(proc.debug instanceof Readable);
});
```

- [x] **Task 12:** input getter provides stdin stream access
```javascript
test("input getter provides stdin stream access", async () => {
  const { Writable } = await import("node:stream");
  const { Process } = await import("./index.js");
  const proc = new Process("cat", { immediate: true });
  
  assert.ok(proc.input instanceof Writable);
});
```

- [ ] **Task 13a:** exposed streams available before process starts
```javascript
test("exposed streams available before process starts", async () => {
  const { Readable, Writable } = await import("node:stream");
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  const actual = proc.started;
  const expected = false;
  assert.equal(actual, expected);
  
  assert.ok(proc.output instanceof Readable);
  assert.ok(proc.debug instanceof Readable);
  assert.ok(proc.input instanceof Writable);
});
```

- [ ] **Task 13b:** exposed streams remain stable after process starts
```javascript
test("exposed streams remain stable after process starts", async () => {
  const { Readable, Writable } = await import("node:stream");
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  const outputBefore = proc.output;
  const debugBefore = proc.debug;
  const inputBefore = proc.input;
  
  proc.start();
  
  const outputAfter = proc.output;
  const debugAfter = proc.debug;
  const inputAfter = proc.input;
  
  assert.equal(outputBefore, outputAfter);
  assert.equal(debugBefore, debugAfter);
  assert.equal(inputBefore, inputAfter);
});
```

<!-- FIXME: I don't understand this test name -->
- [ ] **Task 13c:** stream handlers set before start receive data
```javascript
test("stream handlers set before start receive data", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello world", { immediate: false });
  
  let capturedOutput = "";
  let capturedDebug = "";
  
  proc.output.on("data", (chunk) => {
    capturedOutput += chunk.toString();
  });
  
  proc.debug.on("data", (chunk) => {
    capturedDebug += chunk.toString();
  });
  
  proc.start();
  await proc;
  
  const actual = capturedOutput.trim();
  const expected = "hello world";
  assert.equal(actual, expected);
});
```

- [ ] **Task 13d:** input written before start flows to child process
```javascript
test("input written before start flows to child process", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("cat", { immediate: false });
  
  let capturedOutput = "";
  proc.output.on("data", (chunk) => {
    capturedOutput += chunk.toString();
  });
  
  proc.input.write("test input\n");
  proc.input.end();
  
  proc.start();
  await proc;
  
  const actual = capturedOutput.trim();
  const expected = "test input";
  assert.equal(actual, expected);
});
```

- [ ] **Task 13e:** input buffers multiple writes before start
```javascript
test("input buffers multiple writes before start", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("cat", { immediate: false });
  
  let capturedOutput = "";
  proc.output.on("data", (chunk) => {
    capturedOutput += chunk.toString();
  });
  
  proc.input.write("first\n");
  proc.input.write("second\n");
  proc.input.write("third\n");
  proc.input.end();
  
  proc.start();
  await proc;
  
  const actual = capturedOutput.trim();
  const expected = "first\nsecond\nthird";
  assert.equal(actual, expected);
});
```

- [ ] **Task 13f:** input does not eagerly consume from piped streams
```javascript
test("input does not eagerly consume from piped streams", async () => {
  const { Readable } = await import("node:stream");
  const { Process } = await import("./index.js");
  
  let readCount = 0;
  const sourceStream = new Readable({
    read() {
      readCount++;
      if (readCount === 1) {
        this.push("data\n");
      } else {
        this.push(null);
      }
    }
  });
  
  const proc = new Process("cat", { immediate: false });
  sourceStream.pipe(proc.input);
  
  const actualReadCount = readCount;
  const expectedReadCount = 0;
  assert.equal(actualReadCount, expectedReadCount);
});
```

- [ ] **Task 13g:** output streams only emit after process starts
```javascript
test("output streams only emit after process starts", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  let outputReceived = false;
  let debugReceived = false;
  
  proc.output.on("data", () => {
    outputReceived = true;
  });
  
  proc.debug.on("data", () => {
    debugReceived = true;
  });
  
  await new Promise(resolve => setTimeout(resolve, 10));
  
  const actualOutput = outputReceived;
  const expectedOutput = false;
  assert.equal(actualOutput, expectedOutput);
  
  const actualDebug = debugReceived;
  const expectedDebug = false;
  assert.equal(actualDebug, expectedDebug);
});
```

- [ ] **Task 14:** Process is awaitable with then method
```javascript
test("Process is awaitable with then method", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  assert.ok(typeof proc.then === "function");
});
```

- [ ] **Task 15:** then auto-starts deferred process
```javascript
test("then auto-starts deferred process", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello", { immediate: false });
  
  proc.then(() => {});
  
  assert.ok(proc.started);
});
```

- [ ] **Task 16:** then resolves with ProcessResult on success
```javascript
test("then resolves with ProcessResult on success", async () => {
  const { Process, ProcessResult } = await import("./process.js");
  const proc = new Process("echo hello");
  
  const result = await proc;
  
  assert.ok(result instanceof ProcessResult);
  assert.ok(result.ok);
});
```

- [ ] **Task 17:** then rejects with ProcessError on failure
```javascript
test("then rejects with ProcessError on failure", async () => {
  const { Process, ProcessError } = await import("./process.js");
  const proc = new Process("false");
  
  try {
    await proc;
    assert.fail("Should have thrown");
  } catch (error) {
    assert.ok(error instanceof ProcessError);
  }
});
```

- [ ] **Task 18:** pipe with array creates new Process
```javascript
test("pipe with array creates new Process", async () => {
  const { Process } = await import("./index.js");
  const proc1 = new Process("echo hello", { immediate: false });
  
  const proc2 = proc1.pipe(["cat"]);
  
  assert.ok(proc2 instanceof Process);
});
```

- [ ] **Task 19:** pipe auto-starts source process
```javascript
test("pipe auto-starts source process", async () => {
  const { Process } = await import("./index.js");
  const proc1 = new Process("echo hello", { immediate: false });
  
  proc1.pipe(["cat"]);
  
  const actual = proc1.started;
  const expected = true;
  assert.equal(actual, expected);
});
```

- [ ] **Task 20:** pipe connects process output to next process input
```javascript
test("pipe connects process output to next process input", async () => {
  const { Process } = await import("./index.js");
  const proc1 = new Process("echo hello", { immediate: false });
  
  const proc2 = proc1.pipe(["cat"]);
  const result = await proc2;
  
  const actual = result.output;
  const expected = "hello\n";
  assert.equal(actual, expected);
});
```

- [ ] **Task 21:** output false prevents stdout forwarding
```javascript
test("output false prevents stdout forwarding", async () => {
  const { cmd } = await import("./index.js");
  
  const result = await cmd`node index.test.Process-no-output-invoke.js`;
  const data = JSON.parse(result.output.trim());
  
  const actual = data.stdoutCalled;
  const expected = false;
  assert.equal(actual, expected);
});
```
// NOTE: Create index.test.Process-no-output-invoke.js following existing pattern in index.test.color-invoke.js

- [ ] **Task 22:** debug false prevents stderr forwarding
```javascript
test("debug false prevents stderr forwarding", async () => {
  const { cmd } = await import("./index.js");
  
  const result = await cmd`node index.test.Process-no-debug-invoke.js`;
  const data = JSON.parse(result.output.trim());
  
  const actual = data.stderrCalled;
  const expected = false;
  assert.equal(actual, expected);
});
```
// NOTE: Create index.test.Process-no-debug-invoke.js following existing pattern in index.test.color-invoke.js

- [ ] **Task 23:** Process captures stdout output
```javascript
test("Process captures stdout output", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("echo hello world");
  
  const result = await proc;
  
  const actual = result.output;
  const expected = "hello world\n";
  assert.equal(actual, expected);
});
```

- [ ] **Task 24:** Process captures stderr output
```javascript
test("Process captures stderr output", async () => {
  const { Process } = await import("./index.js");
  const proc = new Process("node -e 'console.error(\"error message\")'");
  
  const result = await proc;
  
  const actual = result.debug;
  const expected = "error message\n";
  assert.equal(actual, expected);
});
```