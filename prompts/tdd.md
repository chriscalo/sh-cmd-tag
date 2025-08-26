# Design to Tasks Prompt

## Purpose

A systematic approach to decompose design specifications into tasks using strict Test-Driven Development (TDD) workflow. Each task represents one behavior and maps to one test, ensuring comprehensive coverage and maintainable implementation.

## Usage

### Planning Mode
Use when you need to break down a design document into tasks:

```
Plan TDD tasks for `[design-file]`.

- Decompose the design into discrete tasks
- One behavior <=> one test
- List all tasks upfront with test names
- Walk through each task for user approval
```

### Execution Mode
Use when you need to implement tasks using strict TDD workflow:

```
Execute TDD task `[task-name]` from `[design-file]`.

- Follow strict TDD: 🟢 Green → 🔴 Red → 🟢 Green → [ASK TO REFACTOR] → 🟢 Refactor → ✅ Mark Complete  
- Work through Green-Red-Green automatically until implementation
- STOP after implementation and ask user if they want to refactor
- Refactor is optional - only if user wants it
- Continue refactoring until user says done
- Mark task completed in `*.tasks.md`: `- [x] task description`
```

## Workflow Modes

### Planning Mode
Decompose the design into tasks interactively:
- Parse the design document for key requirements
- Identify functional components and behaviors
- List all tasks upfront with test names
- Walk through each task for user approval
- User says "approved" to proceed with TDD cycle

**Example task format:**

- [ ] **Task 1:** module exports Process class

```javascript
test("module exports Process class", async () => {
  const { Process } = await import("./process.js");
  
  const actual = typeof Process;
  const expected = "function";
  assert.equal(actual, expected);
});
```

- [ ] **Task 2:** Process creates instance with command string

```javascript
test("Process creates instance with command string", async () => {
  const { Process } = await import("./process.js");
  const proc = new Process("echo hello");
  
  assert.ok(proc instanceof Process);
  
  const actual = proc.command;
  const expected = "echo hello";
  assert.equal(actual, expected);
});
```


### Execution Mode  
Implement tasks using strict TDD workflow and mark completed tasks:

#### Step 1: 🟢 Green (Establish Baseline)
- Ensure all existing tests pass
- Verify current system state
- Document any assumptions or dependencies

#### Step 2: 🔴 Red (Write Failing Test)
- Write one test that defines the desired behavior
- Test should fail for the right reason
- Verify test fails as expected

#### Step 3: 🟢 Green (Make It Pass)
- Write minimal implementation to make tests pass
- Focus on functionality, not perfection
- Ensure all tests pass (new and existing)
- **STOP and ask user if they want to refactor**

#### Step 4: 🟢 Green (Interactive Refactor)
- **Only proceed if user wants to refactor**
- Collaboratively improve code quality with user
- Maintain test coverage throughout
- Keep all tests passing during refactoring
- **Continue until user says refactoring is done**

#### Step 5: ✅ Mark Complete
- Update `*.tasks.md` file to mark task as completed: `- [x] task description`
- Verify task fully satisfies design requirements

## Process Flow

### 1. Design Analysis
- Parse the design document for key requirements
- Identify functional components and behaviors
- Map out dependencies between features
- Highlight integration points and edge cases

### 2. Task Decomposition
For the entire design:

#### a) Complete Task List
- **Identify all behaviors** from the design document
- **Create test name** for each behavior
- **Establish logical order** (basic functionality first)
- **Present complete list** to user upfront

#### b) Individual Approval
- **Walk through each task** one by one for planning approval only
- **Present task with complete test code** using proper format
- **User says "approved"** to write task to `*.tasks.md` file
- **Write approved task with full test code** in checkbox format  
- **DO NOT execute TDD cycle** during planning mode
- **Continue to next task** for approval until all tasks planned

### 3. Implementation Cycle

For each task:

#### Step 1: 🟢 Green
```
Verify current state:
- Run existing tests: `npm test`
- Confirm all tests pass
- Document current behavior
```

#### Step 2: 🔴 Red
```
Write failing test:
- Define expected behavior in test
- Run test to confirm failure
- Analyze failure message for correctness
```

#### Step 3: 🟢 Green
```
Implement minimal solution:
- Write code to make tests pass
- Run full test suite: `npm test`
- Verify no regressions introduced
- STOP and ask user if they want to refactor
```

#### Step 4: 🟢 Refactor (Interactive)
```
Only if user wants to refactor:
- Ask user what they want to improve
- Apply improvements while maintaining tests
- Verify tests continue to pass after changes
- Continue refactoring until user says done
```

#### Step 5: ✅ Mark Complete
```
Update task tracking:
- Edit `*.tasks.md` file to mark task completed: `- [x] task description`
- Confirm task meets all design requirements
- Proceed to next pending task
```

## Task Template

Each task in `*.tasks.md` must use this exact format:

```markdown
- [ ] **Task N:** brief description without test() wrapper
  ```javascript
  test("complete sentence describing behavior", async () => {
    const { ModuleName } = await import("./module.js");
    
    const actual = someValue;
    const expected = expectedValue;
    assert.equal(actual, expected);
  });
  ```
```

Detailed task breakdown format:

```markdown
## Task: [Brief Description]

### Behavior
- [ ] Specific behavior 1
- [ ] Specific behavior 2
- [ ] Edge case handling

### Test Case
- `test("module exports Process class")`

### Test Order
- Position: 3 (after basic creation, before validation)
- Existing functionality Z (must not break)

### Implementation Notes
- Consider security implications
- Maintain backward compatibility
- Follow existing code patterns
```

## Example Interaction

````
User: Follow `prompts/tdd.md` for `specs/Process/Process.design.md`

Assistant: I'll analyze the Process design and break it down into testable tasks using strict TDD workflow.

Let me first examine the design document to understand the requirements...

[After reading Process.design.md]

## Identified Tasks:

1. `test("module exports Process class")`
2. `test("creates Process with command string")`
3. `test("accepts options object")`
4. `test("throws error for invalid command")`

I'll now walk you through each task for approval. When you say "approved", I'll write the task to `Process.tasks.md` (same directory as the design file) in proper format.

**Task 1:** module exports Process class

```javascript
test("module exports Process class", async () => {
  const { Process } = await import("./process.js");
  
  const actual = typeof Process;
  const expected = "function";
  assert.equal(actual, expected);
});
```
````

## Best Practices

### Task Prioritization
1. **Core Infrastructure**: Base classes and fundamental functionality
2. **Happy Path Features**: Main use cases users will encounter
3. **Edge Cases**: Error handling and boundary conditions
4. **Integration**: How components work together
5. **Performance**: Optimization and efficiency concerns

### Communication Guidelines
- **PLANNING MODE ONLY**: Present one task at a time for approval
- Show complete test code with proper formatting
- Use complete sentence test names (unless part of grouped tests)
- Use const expected/actual pattern in all tests (except booleans)
- Use assert.ok() for boolean assertions, not assert.equal(actual, true)
- NO comments in test code unless absolutely necessary
- Use assert.deepEqual to avoid multiple assertions when testing objects
- Get explicit approval before writing to `*.tasks.md` file
- Write tasks file next to the design file: if planning from `specs/Process/Process.design.md`, create `specs/Process/Process.tasks.md`
- **DO NOT execute TDD cycles during planning**
- **DO NOT jump between planning and execution modes**

### Implementation Standards
- Follow existing code patterns in the project
- Maintain test coverage above current levels
- Use descriptive test names that explain behavior
- Keep implementations minimal until refactor phase
- Run full test suite after each green phase

## Integration with Project Workflow

This prompt works well for:
- **Feature Development**: Breaking down new features into testable chunks
- **Refactoring**: Systematic improvement of existing code
- **Bug Fixes**: Ensuring fixes are properly tested
- **Architecture Changes**: Implementing design changes incrementally
- **Code Reviews**: Demonstrating test-driven approach

## Success Metrics

- All design requirements covered by tasks
- Each task has clear, executable test cases
- TDD workflow followed strictly for each task
- No regressions in existing functionality
- Code quality maintained or improved
- User approval obtained before proceeding
- Tests pass consistently throughout development
