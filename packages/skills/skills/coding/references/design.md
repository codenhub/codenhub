# Design and Architecture

Defaults for structuring software when nobody else is deciding. The project's existing architecture and the user's stated constraints come first; where they are silent, take the default here, build the smallest version of it, and record the choice (see Recording Decisions).

## Contents

- Start From the Requirements
- Choose the Boring Default
- Shape of a Program
- Modules
- Data
- State and Concurrency
- Interfaces and APIs
- Failure Strategy
- Configuration and Secrets
- Dependencies
- Testing Strategy
- Growing the Design
- Recording Decisions

## Start From the Requirements

Before choosing structure, write down in a few lines: who uses the software and how (a person at a terminal, a browser, another program), what data it keeps and for how long, what must never happen (losing or leaking data, charging twice), and the expected scale in numbers (users, records, requests per second). When the user cannot answer, assume small scale and say so. Design for the numbers you have, with one step of headroom, not for imagined growth.

## Choose the Boring Default

- Use the language, framework, and tools the ecosystem treats as standard for this kind of program, and the versions currently supported. A user who cannot judge a choice is best served by the one with the most documentation and the most people who can maintain it.
- Build one program, deployed as one unit, until a measured need says otherwise.
- Prefer the standard library, then the platform, then your own code for what a few lines do, then one well-known dependency.
- Store application data in a database, not in hand-rolled files. SQLite for data on one machine, including several local processes; PostgreSQL when several servers write or the write load outgrows one file. Files are for documents, media, exports, and configuration.

## Shape of a Program

Split a program that will be kept and grow into three parts, and keep the dependencies pointing inward. A small single-purpose tool can stay one file with its I/O at the top level and its logic in plain functions.

1. **Entry points** (CLI command, HTTP handler, UI event, scheduled job) parse and validate input, call the core, and turn its result into output or an error message. They hold no business rules.
2. **Core** holds the rules: calculations, decisions, state transitions. It takes plain values and returns plain values; it does not read files, call the network, read the clock, or print. This is what most tests cover.
3. **Adapters** do I/O: database, file system, network, clock, email. Each exposes a few functions in the core's terms (`saveOrder(order)`), not the library's.

Wire the parts together in one place at startup, passing adapters into the code that needs them. Validate untrusted input once, at the entry point; inside the core, trust the types.

## Modules

- Group by feature, not by kind: `orders/` holds the order handler, rules, storage, and tests, rather than spreading them across `controllers/`, `models/`, and `services/`.
- Never import another module's internals; go through its entry point.
- A module is too big when its parts change for unrelated reasons, or when a reader cannot say in one sentence what it does. Split along those reasons.
- Shared code lives in its own module. Keep it small: code is shared once two features use it, not before.

## Data

- Design the data model before the code: the entities, their fields, which are required, and how they relate. Write it as types or a schema first.
- Keep one source of truth for each fact. Derive totals, counts, and display values from it instead of storing copies that drift.
- Give records stable IDs that never change meaning. Store times in UTC with the zone or offset when it matters, and convert only for display.
- Represent money as integer minor units (cents) or a decimal type, never binary floating point. Round once, at a documented step.
- Change stored data through versioned migrations that run forward in order. Never edit a stored format in place without a way to read the old one.
- Make invalid states impossible to build: a required field is not optional in the type, and a value with a fixed set of options is an enum or union, not a free string.

## State and Concurrency

- Give every piece of mutable state one owner, and change it only through that owner.
- When two requests, processes, or tabs can change the same data, use the database's transactions or constraints, or a single writer, not checks in application code that race.
- Make operations that can be retried idempotent: an order request carries an ID so a repeated request does not charge twice.
- Put a timeout on every call that waits on something outside the process.

## Interfaces and APIs

- Make the interface small and hard to misuse: required inputs are required, options have safe defaults, and invalid combinations are rejected.
- Errors are part of the interface. Document which errors each operation returns and when, and keep their codes or types stable.
- Add, do not change: a new optional field or endpoint keeps existing callers working. Removing or changing the meaning of a field, default, or error is a breaking change and needs a new version, a migration path, and a note to callers.
- Return the same shapes for the same concepts across the whole interface: one date format, one error shape, one naming style.
- For HTTP APIs: nouns for resources, the standard methods and status codes, pagination on every list, and input validated against a schema at the edge.

## Failure Strategy

Classify each failure by who can fix it, and respond accordingly:

| Failure                                             | Response                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Bad input from the person or caller                 | Reject it with a message that says what to change.                     |
| Temporary environment problem (timeout, rate limit) | Retry with backoff and a limit, only when the operation is idempotent. |
| Bug or misconfiguration                             | Fail loudly, log the details, and show people a generic message.       |

- Check configuration at startup and refuse to start when it is invalid, instead of failing on the first request.
- Never leave data half-written: use a transaction, or write to a new location and switch to it once complete.

## Configuration and Secrets

- Read configuration from environment variables or one config file, validate all of it at startup, and give every setting a name, a type, and a documented default.
- Never put secrets (API keys, passwords, tokens) in code, in the repository, in logs, or in error messages. Commit an example file with placeholder values, and add the real file to the ignore list.
- Keep configuration that differs between environments out of the code; keep everything else in the code.

## Dependencies

- Before adding one, check that it is maintained (issues and security reports get responses), widely used, has a license compatible with the project, and does not pull in many transitive dependencies. Prefer one library per job.
- Commit the lockfile so every install gets the same versions.
- When a library and the application that uses it must share one copy of a dependency, use the ecosystem's mechanism for that and check the versions are compatible.

## Testing Strategy

- Most tests cover the core with plain inputs and outputs; they are fast and need no fakes.
- Fewer tests cover adapters against the real thing where practical (a temporary database or directory), or against a faithful fake.
- A few end-to-end tests cover the journeys that matter most, such as signing up or paying.
- Every bug fix starts with a test that reproduces the bug and fails.

## Growing the Design

- Refactor when the code fights the change you need to make, not in advance.
- Split a module when its parts change for different reasons. Split a program into separate services only when parts need to scale, deploy, or fail independently, and the cost of running several is worth it.
- When a design decision turns out wrong, change it and its record together.

## Recording Decisions

Write each decision a later reader would question, such as the storage choice, the module layout, or a rejected alternative, in the project's README or a `docs/decisions` file: what was decided, why, and what was weighed. The next session, human or agent, follows it instead of guessing.
