# Process Class Implementation Tasks

## TDD Task Tracking

- [ ] **Task 1:** `module exports Process class`
```javascript
test("module exports Process class", async () => {
  const { Process } = await import("./process.js");
  
  const actual = typeof Process;
  const expected = "function";
  assert.equal(actual, expected);
});
```

- [ ] **Task 2:** `creates Process instance with command string`
```javascript
test("creates Process instance with command string", async () => {
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello");
  
  const actual = proc instanceof Process;
  const expected = true;
  assert.equal(actual, expected);
  
  const actualCommand = proc.command;
  const expectedCommand = "echo hello";
  assert.equal(actualCommand, expectedCommand);
});
```

- [ ] **Task 3:** `Process uses default configuration`
```javascript
test("Process uses default configuration", async () => {
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello");
  
  const actual = proc.config;
  const expected = { immediate: true, shell: true };
  assert.deepEqual(actual, expected);
});
```

- [ ] **Task 4:** `Process merges custom config with defaults`
```javascript
test("Process merges custom config with defaults", async () => {
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello", { immediate: false, shell: false });
  
  const actual = proc.config;
  const expected = { immediate: false, shell: false };
  assert.deepEqual(actual, expected);
});
```

- [ ] **Task 5:** `Process config is immutable`
```javascript
test("Process config is immutable", async () => {
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello", { immediate: false });
  
  const config = proc.config;
  assert.throws(() => {
    config.immediate = true;
  }, TypeError);
});
```

- [ ] **Task 6:** `Process with immediate true starts automatically`
```javascript
test("Process with immediate true starts automatically", async () => {
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello", { immediate: true });
  
  const actual = proc.started;
  const expected = true;
  assert.equal(actual, expected);
});
```

- [ ] **Task 7:** `Process with immediate false prevents automatic start`
```javascript
test("Process with immediate false prevents automatic start", async () => {
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello", { immediate: false });
  
  const actual = proc.started;
  const expected = false;
  assert.equal(actual, expected);
});
```

- [ ] **Task 8:** `start starts deferred process`
```javascript
test("start starts deferred process", async () => {
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello", { immediate: false });
  
  proc.start();
  
  const actual = proc.started;
  const expected = true;
  assert.equal(actual, expected);
});
```

- [ ] **Task 9:** `start throws error if already started`
```javascript
test("start throws error if already started", async () => {
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello", { immediate: false });
  
  proc.start();
  
  assert.throws(() => {
    proc.start();
  }, Error);
});
```

- [ ] **Task 10:** output getter provides stdout stream access
```javascript
test("output getter provides stdout stream access", async () => {
  const { Readable } = await import("node:stream");
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello", { immediate: true });
  
  assert.ok(proc.output instanceof Readable);
});
```

- [ ] **Task 11:** debug getter provides stderr stream access
```javascript
test("debug getter provides stderr stream access", async () => {
  const { Readable } = await import("node:stream");
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello", { immediate: true });
  
  assert.ok(proc.debug instanceof Readable);
});
```

- [ ] **Task 12:** input getter provides stdin stream access
```javascript
test("input getter provides stdin stream access", async () => {
  const { Writable } = await import("node:stream");
  const { Process } = await import("./process.js");
  const proc = new Process("cat", { immediate: true });
  
  assert.ok(proc.input instanceof Writable);
});
```

- [ ] **Task 13:** stream getters provide access before process starts
```javascript
test("stream getters provide access before process starts", async () => {
  const { Readable, Writable } = await import("node:stream");
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello", { immediate: false });
  
  assert.ok(proc.output instanceof Readable);
  assert.ok(proc.debug instanceof Readable);
  assert.ok(proc.input instanceof Writable);
});
```

- [ ] **Task 14:** Process is awaitable with then method
```javascript
test("Process is awaitable with then method", async () => {
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello", { immediate: false });
  
  assert.ok(typeof proc.then === "function");
});
```

- [ ] **Task 15:** then auto-starts deferred process
```javascript
test("then auto-starts deferred process", async () => {
  const { Process } = await import("./process.js");
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
  const { Process } = await import("./process.js");
  const proc1 = new Process("echo hello", { immediate: false });
  
  const proc2 = proc1.pipe(["cat"]);
  
  assert.ok(proc2 instanceof Process);
});
```

- [ ] **Task 19:** pipe auto-starts source process
```javascript
test("pipe auto-starts source process", async () => {
  const { Process } = await import("./process.js");
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
  const { Process } = await import("./process.js");
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
  const { Process } = await import("./process.js");
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
  const { Process } = await import("./process.js");
  const proc = new Process("node -e 'console.error(\"error message\")'");
  
  const result = await proc;
  
  const actual = result.debug;
  const expected = "error message\n";
  assert.equal(actual, expected);
});
```