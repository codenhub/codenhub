# Writing Tests

How to write the tests that prove each behavior decision (hard rule 3). The project's own test layout, runner, and helpers come first.

## Contents

- Test First
- Proving a Test Written After Its Code
- Inputs That Can Fail
- Every Check Where It Applies
- What a Test Looks At
- Isolation and Flakiness

## Test First

- For each behavior decision, write the test, run it, and see it fail because the behavior is missing, not because of setup, a typo, or a missing import. Then write the code that makes it pass, and run the test file again.
- A test that passes on its first run proves nothing: change its input or assertion until it fails without the code.
- During each cycle, run only the affected test file. Run the checks the changed packages require at the end.

## Proving a Test Written After Its Code

A test written after its code, such as one that pins existing behavior before a refactor, has never been seen failing. Prove it by breaking:

1. Edit the line that implements the decision in place: delete the check, flip the branch, or remove the cleanup call.
2. Run that test file and see the test's own assertion fail. When no test fails, or only an unrelated assertion does, fix the test.
3. Reverse the edit by hand. Never undo it with `git checkout` or `git restore`, which also discard unsaved work, and never copy files to a shared temporary directory, where another process can overwrite them.

## Inputs That Can Fail

- Pick input and expected values that differ from the defaults and from each other. A test that sets a field to `undefined` and expects the default cannot tell "kept" from "reset"; a sort test whose input is already sorted passes with the sort removed; a money test whose amounts all come out to exact cents passes with the rounding removed.
- Give each test an input that breaks only the rule under test, so no other check can make it pass: a test for unknown keys uses a key whose value would otherwise be valid.
- A rejection test asserts which rule rejected the input, such as the error type or the field and reason the message names, not only that it failed or which file it named.
- A test that something is absent, such as a password hash missing from output, uses input that would produce it if the protection were removed.
- Test the exact values on both sides of each limit.
- Work expected values out by hand from the requirement or a worked example, never by running the code's own formula.

## Every Check Where It Applies

Before writing tests, list every pair of check and input source (arguments, query string, stored data, files) and give each pair a test or a reason it cannot occur. Test an edge case such as `undefined` on every field it applies to. A check tested in one place can vanish from another unnoticed. Pairs that run through the same code, such as fields checked by one validator, share one table-driven test with a row per pair, so the count of tests follows the code paths, not the fields.

## What a Test Looks At

- Observable behavior through the public interface, not internals. One behavior per test, named for the exact claim it asserts.
- The whole result, not one field of it, so an extra or missing key fails.
- Fakes only at external boundaries: network, storage, file system, clock, randomness.
- Cleanup by its effect, such as the program exiting promptly after fast work under a long timeout, not by inspecting the cleanup code.
- At least one test goes through the real entry point on realistic input and asserts what that boundary exposes, on success and on each error: for a CLI, run with its default paths in a temporary copy of the project, the output file, what it prints, and its exit code; for an HTTP handler, the status, headers, and body; for a library, the returned value and the error type.

## Isolation and Flakiness

- A test that writes files works in its own directory under the system temporary directory (`os.tmpdir()`, `tempfile`), never under the project or the current directory, and removes it afterwards.
- Poll for a condition instead of sleeping a fixed time, and leave margins far above process startup time, such as a command that sleeps 10 seconds against a 1-second timeout.
- Pass the clock, randomness, and locale in, so a test gives the same result on every run and machine.
