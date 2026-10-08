---
name: test-driven-development
description: Enforces test-first development on code changes. Use when implementing a feature, fixing a bug, refactoring, or otherwise changing behavior in code.
metadata:
  short-description: Enforce test-first development
---

# Test-Driven Development

## Overview

Use strict test-first development: write a failing test, make it pass with the smallest possible implementation, then refactor while keeping tests green.

**Core principle:** If the test did not fail first for the expected reason, the test does not prove the behavior.

## When To Use

Apply this workflow for:

- new features
- bug fixes
- behavior changes
- refactors that can affect behavior

Exceptions need the user's explicit approval for that exact change in this conversation. Never approve one yourself; urgency is not approval.

- throwaway prototypes
- generated code
- edits no tool reads: comments, whitespace, key order, or descriptive text

Anything a runtime, build, or deploy reads, such as flags, permissions, routes, dependency pins, or environment keys, is behavior and needs a test. When a change looks like an exception, ask once. Without a yes, or when unsure whether tooling reads it, run full TDD.

## Removing Code

Removing code or a feature needs no new test: delete the tests that covered it, and the remaining tests, build, and type checks passing are the proof. Never add a test asserting that a removed name, file, option, or route no longer exists; it passes forever and records history, not behavior.

A test that output leaves something out is different when it states a contract, such as a response that must never include a password hash or a log line that must omit a token. Those follow the normal cycle.

## The Iron Law

```text
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

If production code is written before a failing test:

1. Remove that code from the intended delivery change set.
2. Write the failing test.
3. Re-implement from the test.

No exceptions:

- Do not keep the old code as "reference".
- Do not adapt pre-written code while pretending to do RED.
- Do not use destructive version-control operations just to enforce this rule.
- Delete means delete from the delivery path.

## Red-Green-Refactor Loop

### 1) RED - Write a Failing Test

Write one small test for one behavior.

Requirements:

- one behavior per test
- clear, behavior-focused test name
- test real behavior, not mock wiring
- avoid mocks unless isolation is truly required

### 2) Verify RED - Watch It Fail

**MANDATORY. Never skip this step.**

Run the targeted test.

Confirm:

- test fails for the expected missing-behavior reason
- failure is not caused by setup, typos, stale fixtures, or harness issues

If the failure is a setup or harness error, fix setup and re-run until the failure reflects the expected missing behavior.

If the test passes immediately, it is not proving new behavior. Fix the test or choose a different scenario.

### 3) GREEN - Write Minimal Code

Implement the smallest change that makes the failing test pass.

Rules:

- no speculative abstractions
- no unrelated refactors
- no extra features beyond the current test

### 4) Verify GREEN - Watch It Pass

**MANDATORY. Never skip this step.**

Each cycle, run the targeted test and the tests beside it, in the same file or module. Confirm the new test passes and those stay green. Broader suites wait for the end: their output repeats every cycle and stays in context.

Before finishing, run:

- tests in changed modules or packages
- tests that cover touched public interfaces and integration boundaries
- repo-required smoke or pre-merge suites

If baseline failures exist before coding (flaky or not), run the exact verification commands before coding and capture failing test IDs plus error signatures as baseline evidence.

If uncertain whether the change reaches beyond its module, run the broader suite before finishing.

Confirm before finishing:

- new tests pass
- existing tests remain green, or only baseline failures with matching test IDs and error signatures remain
- no new warnings or runtime errors

For baseline handling and flaky failure triage, use [references/verification-baselines.md](references/verification-baselines.md).

### 5) REFACTOR - Improve Design Safely

Refactor only while all tests are green.

Allowed work:

- remove duplication
- improve naming
- extract helpers
- simplify design

Do not change behavior during refactor. If behavior changes, start another RED cycle first.

### 6) Repeat

Move to the next behavior with a new failing test.

## Test Quality Rules

| Quality      | Good                                  | Bad                                      |
| ------------ | ------------------------------------- | ---------------------------------------- |
| Focus        | One behavior per test                 | Multiple behaviors in one test           |
| Naming       | Describes expected behavior           | Vague names like `test1`                 |
| Intent       | Validates externally visible behavior | Validates private implementation details |
| Dependencies | Real collaborators when practical     | Heavy mocking without clear need         |

## Common Rationalizations

| Excuse                                   | Reality                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| "It is too small to test."               | Small code breaks too. The test is cheap insurance.                     |
| "I will add tests after coding."         | Passing tests written after code do not prove they can fail correctly.  |
| "I already tested manually."             | Manual checks are not repeatable regression protection.                 |
| "Deleting work is wasteful."             | Keeping unverified code creates future bugs and rework.                 |
| "Tests after are equivalent."            | Tests-after ask what code does; tests-first define what code should do. |
| "TDD is dogmatic. I am being pragmatic." | Pragmatic delivery includes repeatable tests that fail first.           |

If these appear, stop and return to RED.

## Red Flags

Stop and restart the cycle when you see:

- production code added before a failing test
- tests written after implementation "for coverage"
- tests that pass on first run when adding new behavior
- inability to explain why the test failed
- mock-heavy tests that do not validate real behavior
- phrases like "just this once" or "I already manually tested it"
- phrases that rationalize skipping fail-first behavior

## Bug Fix Pattern

For bugs, start by writing a failing regression test that reproduces the issue.

If deterministic reproduction is not immediately possible, write the smallest deterministic characterization test (contract, property, or boundary case) that captures the observed failure before changing production code.

If you cannot produce a failing automated test, stop and ask the user before shipping a bug fix.

Then run the normal RED-GREEN-REFACTOR cycle. Never ship a bug fix without a reproduction or characterization test.

## Testing Anti-Patterns

When adding or changing tests, especially with mocks, review [references/testing-anti-patterns.md](references/testing-anti-patterns.md).

When baseline failures or flaky tests appear during verification, review [references/verification-baselines.md](references/verification-baselines.md).

## Verification Checklist

Before marking work complete:

- [ ] Every added or changed behavior has a test
- [ ] Each new test was observed failing first
- [ ] Failures happened for the expected reason
- [ ] Implementation was minimal for each GREEN step
- [ ] All relevant tests are passing
- [ ] Refactors preserved behavior
- [ ] Edge cases and error paths were covered

If any box is unchecked, the workflow is incomplete.
