# Story 1.1: Template Literal Shell Execution

**Status:** Approved  
**Priority:** P0 (Critical)  
**Epic:** [Epic 1: Core Shell Execution API](./epic-01.shell-execution-core.md)  
**Labels:** template-literals, shell, api  
**Story Points:** 8  
**Assignee:** Development Team  

## User Story

**As a** Node.js developer  
**I want** to execute shell commands using template literal syntax  
**So that** I can write intuitive, readable command execution code with shell features like pipes and expansions  

## Acceptance Criteria

### AC1: Basic Template Literal Execution
- **Given** I use the sh template tag function
- **When** I execute sh\`echo "hello world"\`
- **Then** the command executes in a shell environment
- **And** returns a ProcessResult with output "hello world\n"

### AC2: Shell Feature Support  
- **Given** I need to use shell features like pipes
- **When** I execute sh\`ls -la | grep ".js" | wc -l\`
- **Then** the shell processes the pipe chain correctly  
- **And** returns the count of .js files as expected

### AC3: Shell Expansions Work
- **Given** I use shell expansion patterns
- **When** I execute sh\`echo $HOME/*.txt\`  
- **Then** the shell expands the home directory and glob pattern
- **And** returns the expanded file paths

### AC4: Template Interpolation
- **Given** I have JavaScript variables to interpolate
- **When** I execute sh\`echo "Hello ${userName}"\` where userName = "world"
- **Then** the variable is safely interpolated into the command
- **And** returns "Hello world\n"

### AC5: Async Execution by Default
- **Given** I call sh\`command\` without await
- **When** I inspect the return value
- **Then** it returns a Promise that resolves to ProcessResult
- **And** I can await it or use .then() for handling

### AC6: Safe Multi-line Commands
- **Given** I have a multi-line shell script in a template literal  
- **When** I execute it with sh\`...\`
- **Then** all lines execute in the same shell session
- **And** variables and state persist across lines

## Technical Requirements

- **Implementation:** Use Node.js spawn() with shell: true option
- **Error Handling:** Non-zero exit codes throw ProcessError by default
- **Shell Selection:** Use /bin/sh on Unix, cmd.exe on Windows  
- **Working Directory:** Commands execute in caller's directory by default
- **Stream Handling:** Capture stdout/stderr while optionally showing live output

## Security Requirements

- **Interpolation Safety:** All template values must be shell-escaped
- **No Injection Vulnerabilities:** Malicious input cannot execute unintended commands
- **Context-Aware Escaping:** Handle single quotes, double quotes, and unquoted contexts

## Examples

```javascript
// Basic shell command
const result = await sh`ls -la`;
console.log(result.output);

// With shell features  
const fileCount = await sh`find . -name "*.js" | wc -l`;

// Variable interpolation (safely escaped)
const filename = "file with spaces.txt";
const content = await sh`cat ${filename}`;

// Shell expansions
const homeFiles = await sh`echo $HOME/*.txt`;
```

## Testing Strategy

- Test basic command execution and result format
- Verify shell features (pipes, redirects, expansions) work correctly
- Test variable interpolation with various data types  
- Test security: malicious input cannot cause injection
- Test error conditions and proper ProcessError throwing
- Test async behavior and Promise interface

## Definition of Done

- All acceptance criteria pass with automated tests
- Security tests confirm no shell injection vulnerabilities
- Performance meets <50ms latency requirement for streaming
- Cross-platform compatibility (Unix shells and Windows cmd)
- API documentation with comprehensive examples
- Error messages are clear and actionable