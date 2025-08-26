# Resolve TODOs Prompt

## Purpose

A systematic approach to identify, analyze, and resolve TODOs and other
technical debt markers in code and documentation. This prompt ensures thorough
review and approval before making changes.

## Usage

Use this prompt when you need to work through technical debt systematically:

```
Work through the TODOs in [file/directory/codebase].

- Work on one item at a time
- Propose a fix and get approval before applying it  
- When I request changes, provide an updated proposal
- Once approved, identify every place that needs to change
- Apply all changes comprehensively
```

## Process Flow

### 1. Discovery Phase
- Scan the specified scope for TODOs (FIXME, TODO, HACK, XXX, REFACTOR, etc.)
- Catalog all items with context (file, line number, surrounding code)
- Present a prioritized list for review

### 2. Individual Item Resolution

For each TODO:

#### a) Analysis
- **Context**: Explain what the current code does
- **Problem**: Describe what the TODO is addressing
- **Impact**: Assess the scope of changes needed
- **Dependencies**: Identify other code that might be affected

#### b) Proposal
- **Solution**: Describe the specific fix/improvement
- **Changes Required**: List all files/locations that need modification
- **Approach**: Explain the implementation strategy
- **Considerations**: Highlight any potential breaking changes

#### c) Approval Loop
- Present the proposal and wait for approval
- If changes requested, revise and re-present
- Only proceed once explicitly approved

#### d) Implementation
- Apply changes to all identified locations
- Ensure consistency across the codebase
- Run tests to verify no regressions (if relevant)
- Update related documentation if needed

### 3. Verification
- Confirm the FIXME/TODO has been completely addressed
- Validate that no new issues were introduced
- Move to the next item

## Example Interaction

```
User: Follow prompts/resolve-todos.md for index.js

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
- Changes: Update config getter implementation
- Approach: Replace spread with deep clone and freeze
- Risks: Performance impact for deep configs

Do you approve this approach for TODO 1?
```

## Scope Considerations

### File-Level Resolution
Best for design documents, small modules, or focused components where all FIXMEs
are related.

### Directory-Level Resolution  
Useful for feature areas or modules where FIXMEs span multiple related files.

### Codebase-Wide Resolution
Appropriate for systematic cleanup or when FIXMEs follow patterns across the
entire project.

## Best Practices

### Prioritization
1. **Security/Safety Issues**: Address first
2. **Blocking Dependencies**: Items that prevent other work
3. **High-Impact, Low-Effort**: Quick wins with significant benefit
4. **Architectural Concerns**: Design decisions that affect future development
5. **Polish/Refinement**: Nice-to-haves that improve code quality

### Communication
- Be explicit about what you're proposing
- Explain the reasoning behind each decision
- Highlight any trade-offs or alternatives considered
- Ask clarifying questions when requirements are ambiguous

### Implementation
- Make atomic commits per FIXME when possible
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

## Success Metrics

- All targeted TODOs are resolved or explicitly deferred
- No regressions introduced (all tests still pass)
- Code quality and maintainability improved
- Design consistency maintained across changes
- Documentation updated to reflect resolved items
