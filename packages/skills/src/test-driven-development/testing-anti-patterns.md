# Testing Anti-Patterns

Load this reference when writing tests, adding mocks, or considering test-only
helpers in production code.

## Overview

Tests should verify behavior that matters to users and calling code. Mocks are
tools for isolation, not the target of assertions.

**Core principle:** Test real behavior, not mock behavior.

## Iron Rules

```text
1. Never test mock existence instead of behavior.
2. Never add test-only methods to production APIs.
3. Never mock dependencies you do not understand.
4. Do not use partial mocks for structured payloads unless fixture builders
   provide all required fields by default.
```

## Anti-Pattern 1: Testing Mock Behavior

Problem:

- assertions target `*-mock` elements or fake methods
- tests pass when mock is present, not when behavior is correct

Fix:

- assert externally visible behavior
- use real collaborators when practical
- if mocking is required, assert the unit output, not mock rendering details

Gate check before adding assertions:

```text
Am I checking behavior of the system under test,
or only confirming a mock exists?
```

If it is only mock existence, rewrite the test.

## Anti-Pattern 2: Test-Only Methods in Production Code

Problem:

- production classes gain methods used only by tests
- public APIs become polluted with lifecycle code that belongs in test tooling

Fix:

- move cleanup/setup behavior to test utilities
- keep production APIs focused on production use cases

Gate check before adding a method:

```text
Is this method required by production behavior,
or only by test setup/cleanup?
```

If only tests need it, place it in test support code.

## Anti-Pattern 3: Mocking Without Understanding Dependencies

Problem:

- high-level methods are mocked blindly
- required side effects are accidentally removed
- tests fail or pass for the wrong reasons

Fix:

1. Run the test against real code first.
2. Identify which dependency is slow, flaky, or external.
3. Mock only that boundary.
4. Preserve side effects the test relies on.
5. If dependency behavior is unclear, map required side effects before mocking.

Red flags:

- "I will mock this to be safe"
- "I do not know what this dependency does"
- mock setup is longer than the test behavior itself

## Anti-Pattern 4: Incomplete Data Mocks

Problem:

- mocked payloads include only fields used by the current assertion
- downstream code later depends on missing fields

Fix:

- include all required fields, metadata, and nested defaults from real schemas
- prefer fixture builders/factories so tests override only fields under test
- centralize canonical fixtures when the structure is reused

Gate check:

```text
Does this mock represent the real schema,
or only the subset I remembered?
```

## Anti-Pattern 5: Tests as a Final Step

Problem:

- implementation is marked "done"
- tests are added afterward for confirmation

Fix:

- return to strict RED-GREEN-REFACTOR
- write the failing test first for every behavior change

If a test did not fail first, it did not drive the implementation.

## When Mocks Become Too Complex

Warning signs:

- mock setup is longer than the test behavior
- multiple layers of mocks or fakes are required just to run the test
- the test fails when mock internals change but behavior stays the same
- you cannot explain why each mock is needed

Response:

- prefer an integration test with real collaborators
- mock only true external boundaries (network, process, filesystem, time)
- keep assertions focused on observable behavior

Gate check:

```text
Are mocks helping isolate the behavior,
or replacing the behavior under test?
```

If mocks are replacing behavior, reduce mocking or move to an integration test.

## Quick Diagnostic

If any answer is "yes", revisit your test design:

- Are assertions mostly about mocks?
- Are you introducing test-only production methods?
- Are you mocking dependencies without mapping side effects?
- Are your mocked payloads incomplete vs real schemas?
- Is mock setup larger than the behavior under test?
- Were tests added only after implementation finished?

## Bottom Line

```text
Use mocks to isolate boundaries, not to fake confidence.
Behavior-first tests + strict TDD prevent most test anti-patterns.
```
