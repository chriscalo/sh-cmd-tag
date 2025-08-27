# TODO Management Prompt

## Purpose

A systematic approach to manage TODOs and technical debt markers in code and 
documentation. This prompt provides structured workflows for both adding new 
TODO markers and resolving existing ones, ensuring thorough review and approval 
before making changes.

## Usage

### Resolve TODOs Mode
Use when you need to work through existing technical debt systematically:

```
Work through the TODOs in [file/directory/codebase].

- Work on one item at a time
- Propose a fix and get approval before applying it  
- When I request changes, provide an updated proposal
- Once approved, identify every place that needs to change
- Apply all changes comprehensively
```

### Add TODOs Mode
Use when you need to add specific TODO markers interactively:

```
Add TODOs to [file/directory]
```

This mode works iteratively where you specify each TODO marker individually.

## Workflow Modes

### Resolve TODOs Workflow

#### 1. Discovery Phase
- Scan the specified scope for TODOs (FIXME, TODO, HACK, XXX, REFACTOR, etc.)
- Catalog all items with context (file, line number, surrounding code)
- Present a prioritized list for review

#### 2. Individual Item Resolution
For each TODO:

**a) Analysis**
- **Context**: Explain what the current code does
- **Problem**: Describe what the TODO is addressing
- **Impact**: Assess the scope of changes needed
- **Dependencies**: Identify other code that might be affected

**b) Proposal**
- **Solution**: Describe the specific fix/improvement
- **Changes Required**: List all files/locations that need modification
- **MANDATORY CODE BLOCKS**: Show exact current code and proposed fix using this format:

**Current Code:**
```[language]
[exact current code]
```

**Proposed Fix:**
```[language]  
[exact proposed code]
```

- **Approach**: Explain the implementation strategy
- **Considerations**: Highlight any potential breaking changes

**c) Approval Loop**
- Present the proposal and wait for approval
- If changes requested, revise and re-present
- Only proceed once explicitly approved

**d) Implementation**
- **CRITICAL: Show all code changes** - display the actual before/after code
- Apply changes to all identified locations
- Ensure consistency across the codebase
- **Run tests after EVERY change** - use `npm test` to verify no regressions
- **If tests fail, fix them immediately** - get tests green before continuing
- Update related documentation if needed

#### 3. Verification
- **Run final test suite** - confirm all tests pass after implementation
- Confirm the TODO has been completely addressed
- Validate that no new issues were introduced
- Move to the next item

### Add TODOs Workflow

#### Interactive Addition Process
The user specifies each TODO marker individually:

1. **User specifies location and TODO**: `functionName(): FIXME for memory leak`
2. **Agent confirms and adds**: Locates the function, adds the TODO marker with context
3. **Repeat as needed**: User continues specifying additional TODOs

#### TODO Addition Format
- Locate the specified function/location in the code
- Add the TODO comment using the specified marker type (TODO, FIXME, HACK, etc.)
- Include any additional context provided by the user
- Confirm the addition was made successfully

#### 3. TODO Format Standards
```javascript
// TODO: Replace hardcoded API endpoint with configuration
// Currently breaks in different environments

// FIXME: Memory leak in event listener cleanup
// Causing performance degradation over time

// HACK: Temporary workaround for browser compatibility
// Remove once we drop support for IE11
// See issue #1234 for proper solution

// REFACTOR: Extract this logic into separate module
// This function is getting too complex and hard to test
```

## Example Interactions

### Resolve TODOs Example

```
User: Follow prompts/todos.md to resolve TODOs in index.js

Assistant: I'll work through the TODOs systematically. Let me first scan the
file to catalog all items.

Found 9 TODOs in index.js (6 FIXME, 2 TODO, 1 HACK).

Let me start with the first TODO...

**TODO 1 Analysis:**
- Context: config getter returns shallow copy with spread operator
- Problem: Objects within config could still be mutated
- Impact: Need to implement deep freezing/cloning
- Dependencies: None

**Proposal:**
- Solution: Use structuredClone() and Object.freeze() recursively
- Changes: Update config getter implementation in index.js line 45

**Code Preview:**
```javascript
// BEFORE:
get config() {
  // TODO: deep freeze to prevent nested object mutation
  return { ...this.#config };
}

// AFTER:
get config() {
  return Object.freeze(structuredClone(this.#config));
}
```

**CRITICAL**: Every proposal MUST include complete before/after code blocks showing the exact changes.

- Approach: Replace spread with deep clone and freeze
- Risks: Performance impact for deep configs

Do you approve this approach for TODO 1?
```

### Add TODOs Example

```
User: Add TODOs to auth.js

Assistant: I'm ready. Tell me the TODOs you'd like me to add or tell me if you'd
like me to propose new TODOs around a specific concern.

User: validatePassword(): FIXME for weak password validation
```

## Scope Considerations

### File-Level Management
Best for design documents, small modules, or focused components where all TODOs are related.

### Directory-Level Management  
Useful for feature areas or modules where TODOs span multiple related files.

### Codebase-Wide Management
Appropriate for systematic cleanup or when TODOs follow patterns across the entire project.

## Best Practices

### Prioritization
1. **Security/Safety Issues**: Address first
2. **Blocking Dependencies**: Items that prevent other work
3. **High-Impact, Low-Effort**: Quick wins with significant benefit
4. **Architectural Concerns**: Design decisions that affect future development
5. **Polish/Refinement**: Nice-to-haves that improve code quality

### Communication
- Be explicit about what you're proposing
- **Always show the actual code changes** in before/after format
- Explain the reasoning behind each decision
- Highlight any trade-offs or alternatives considered
- Ask clarifying questions when requirements are ambiguous

### Implementation
- **Run tests after every change** - use `npm test` to verify no regressions
- **Fix failing tests immediately** - never leave tests in broken state
- Make atomic commits per TODO when possible
- Update tests to cover the resolved behavior
- Remove the TODO comment once fully addressed
- Update related documentation or comments

## Variations

### Quick Review Mode
For simple, obvious fixes that don't need detailed analysis:
```
Quick review of TODOs in [file] - propose obvious fixes together
```

### Design-Focused Mode  
For TODOs that involve design decisions:
```
Analyze the design implications of TODOs in [file] and propose architectural
solutions
```

### Research Mode
For TODOs requiring investigation:
```
Research the context and requirements for TODOs in [file] before proposing
solutions
```

## Integration with Development Workflow

This prompt works well as:
- **Standalone Task**: Dedicated TODO resolution sessions
- **Pre-Release Cleanup**: Addressing technical debt before major releases
- **Code Review Follow-up**: Resolving items flagged during review
- **Refactoring Support**: Systematic improvement of code quality
- **Knowledge Transfer**: Understanding existing code through its technical debt
- **Technical Debt Planning**: Adding TODO markers for future improvements

## Success Metrics

- All targeted TODOs are resolved or explicitly deferred (for resolve mode)
- Appropriate TODO markers added with clear context (for add mode)
- No regressions introduced (all tests still pass)
- Code quality and maintainability improved
- Design consistency maintained across changes
- Documentation updated to reflect resolved items
- TODOs are actionable and prioritized appropriately
