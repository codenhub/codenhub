# AGENTS.md Update Guidelines

## Core Principle

Only add information that will genuinely help future agent sessions. Attention
and context are limited, so every line must earn its place.

## What TO Add

### 1. Commands or Workflows Discovered

```markdown
## Build

`npm run build:prod` - Full production build with optimization
`npm run build:dev` - Fast development build without minification
```

Why: Saves future sessions from rediscovering these commands.

### 2. Gotchas and Non-Obvious Patterns

```markdown
## Gotchas

- Tests must run sequentially (`--runInBand`) due to shared DB state
- `yarn.lock` is authoritative; delete `node_modules` if deps mismatch
```

Why: Prevents repeated debugging sessions.

### 3. Package Relationships

```markdown
## Dependencies

The `auth` module depends on `crypto` being initialized first.
Import order matters in `src/bootstrap.ts`.
```

Why: Captures architecture knowledge that is not obvious from the code alone.

### 4. Testing Approaches That Worked

```markdown
## Testing

For API endpoints: Use `supertest` with the helper in `tests/setup.ts`
Mocking: Factory functions in `tests/factories/` instead of inline mocks
```

Why: Establishes patterns that are known to work.

### 5. Configuration Quirks

```markdown
## Config

- `NEXT_PUBLIC_*` variables must be set at build time, not runtime
- Redis connection requires the `?family=0` suffix for IPv6
```

Why: Preserves environment-specific knowledge.

## What NOT to Add

### 1. Obvious Code Information

Bad:

```markdown
The `UserService` class handles user operations.
```

The class name already tells us this.

### 2. Generic Best Practices

Bad:

```markdown
Always write tests for new features.
Use meaningful variable names.
```

This is universal advice, not project-specific guidance.

### 3. One-Off Fixes

Bad:

```markdown
We fixed a bug in commit abc123 where the login button did not work.
```

It will not help future sessions and only adds clutter.

### 4. Verbose Explanations

Bad:

```markdown
The authentication system uses JWT tokens. JWT (JSON Web Tokens) are
an open standard that defines a compact and self-contained way for securely
transmitting information between parties as a JSON object. In our
implementation, we use the HS256 algorithm which...
```

Good:

```markdown
Auth: JWT with HS256, tokens in `Authorization: Bearer <token>`.
```

## Diff Format for Updates

For each suggested change:

### 1. Identify the File

```text
File: ./AGENTS.md
Section: Commands (new section after ## Architecture)
```

### 2. Show the Change

```diff
 ## Architecture
 ...

+## Commands
+
+| Command | Purpose |
+|---------|---------|
+| `npm run dev` | Dev server with HMR |
+| `npm run build` | Production build |
+| `npm test` | Run test suite |
```

### 3. Explain Why

> **Why this helps:** The build commands were not documented, which forces
> future sessions to inspect `package.json` before they can work efficiently.

## Validation Checklist

Before finalizing an update, verify:

- [ ] Each addition is project-specific
- [ ] There is no generic advice or obvious information
- [ ] Commands are tested or otherwise verified
- [ ] File paths are accurate
- [ ] A new agent session would actually find this helpful
- [ ] This is the most concise way to express the information
