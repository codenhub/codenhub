---
title: Limits
description: What a failing input costs, the limits of recursive schemas, the sizes untrusted input needs, and how audit finds the bounds a schema leaves open.
order: 12
---

# Limits

A sign-up endpoint receives whatever anybody sends it, including input written to make it slow, to exhaust its memory, or to crash it. This page says what the package bounds for you, what it leaves to you, and how to check that a schema sets the bounds it needs. Read it before you validate input from a public network.

In short:

- A failing input costs a bounded amount: its issues stop at 1,000, and a recursive schema stops at a depth and a number of calls.
- An input that passes is validated in full. So its size is yours to cap, with a `max` on text and on every collection.
- `audit` lists every place a schema leaves a size open, so a test can keep it closed.

## What hostile input gets

Each line below is run against the built package by the test suite, with the result its comment states:

```ts
import { array, lazy, number, object, record, string, unknown, url, type Validator } from "@codenhub/validation";

// A million bad items give 1,001 issues: a thousand of them, and one saying the list stopped there.
const flood = array(number())(Array.from({ length: 1_000_000 }, () => "x"));
String(flood.ok || flood.error.issues.length); // "1001"

// Input nested 100,000 deep gives one issue, where recursion without a limit overflows the stack.
interface Tree {
  children: Tree[];
}
const tree: Validator<Tree> = object({ children: array(lazy(() => tree)) });
let deep: Tree = { children: [] };
for (let level = 0; level < 100_000; level += 1) {
  deep = { children: [deep] };
}
tree(deep); // { ok: false, ... }, code "too_big"

// An address a server must not fetch is not a URL here.
url()("http://169.254.169.254/latest/meta-data"); // { ok: false, ... }
url()("http://localhost:3000"); // { ok: false, ... }
url()("javascript:alert(1)"); // { ok: false, ... }

// A password that failed is not in what you log.
const login = object({ password: string({ min: 12 }) })({ password: "hunter2" });
String(JSON.stringify(login).includes("hunter2")); // "false"

// A key that would become the prototype of a copy of the output is refused.
record(string(), unknown())(JSON.parse('{"__proto__":{"admin":true}}')); // { ok: false, ... }, code "invalid_key"
```

## A failing input has a bounded cost

A collection stops once its items have reported 1,000 issues. The items after that are not validated. One more issue, `too_big` with `{ maximum: 1000, type: "issues" }` at the path of the collection, says that it stopped.

- An issue that holds others in `params.issues` counts with them. So an item that fails a `union` counts once, and once more for each issue of each option. A key that fails counts with the issue behind it.
- The unknown keys of a strict `object`, the repeats `unique` and `set` find, the keys a query string repeats, and the conflicts of an `intersection` are listed up to the same limit.
- Only issues are counted. So input that passes is never affected, and input that fails still fails. What changes is that a long list of bad items is not reported in full, and does not cost the memory and time of reporting it.
- To report every bad row of a long list, such as an import, call the item validator on each row yourself.
- Items that are validated asynchronously have all started before any is counted. So the limit cuts what they report, and not their work: give such a collection a `max`.

A wrong size is reported at once, without validating the items. So a huge input that breaks a `max` is never worked through only to be rejected.

## Recursive data

A recursive schema uses `lazy`, as [Request bodies](request-bodies.md#recursive-data) shows. Recursion is where a small input can cost the most, so `lazy` has two limits:

| Option     | Default | Counts                                           | Past it                                     |
| ---------- | ------- | ------------------------------------------------ | ------------------------------------------- |
| `maxDepth` | 128     | The levels of `lazy` open at once, of any `lazy` | `too_big` with `{ maximum, type: "depth" }` |
| `maxCalls` | 10,000  | The calls one `lazy` makes in one validation     | `too_big` with `{ maximum, type: "calls" }` |

Each must be a positive integer, or `lazy` throws when it is created.

### `maxDepth`

Each level of nesting is one level of recursion, and the JavaScript stack holds only so many. So `lazy` counts them, and a value found deeper than `maxDepth` fails at its own path:

- A request body of thousands of nested arrays, and a cyclic object, which a recursive validator would follow forever, both come back as that failure, and never throw.
- The count is shared by every `lazy`, not kept for each one. That is what bounds the stack when two recursive validators call each other. It means a limit is checked against every level already open: `lazy(getter, { maxDepth: 1 })` used inside any other `lazy` fails at once, because the outer one is already one level deep. Set `maxDepth` for the whole nesting, not for the share of one validator.
- A level opened before an `await` is still open after it. So an asynchronous recursive schema is held to `maxDepth` too, given a cyclic object as well.

Raise `maxDepth` only for data you know is deeper. For a schema that does not wait at every level, raise it only as far as the stack of your runtime holds for the validators you wrote. How much a stack holds depends on the runtime. A worker has about half the stack of a page in Chromium and Firefox. A schema with many validators at each level needs more of it, so lower `maxDepth` for such a schema where it runs in a worker.

### `maxCalls`

Work can grow faster than the input. A `union` tries every option, and an `object` checks every property even after one has failed. So in a recursive `union` of objects, the options that do not match still reach the children, at every level.

A `lazy` keeps what it found for each object at each path in one validation, and gives it again when the same object is reached at the same path. So those options share the result of the children, and the work grows with the input. An asynchronous check under it runs once for each such object and path, however many options reach it. A primitive is not kept, since it has no children to multiply the work.

Work that makes a new object at every level, such as a `transform` that copies its value before a `lazy`, cannot be shared. Its work doubles with each level, so a small valid input can take a very long time. `maxCalls` stops that: past it, every further call of that `lazy` fails.

```ts
import { array, lazy, literal, object, union, type Validator } from "@codenhub/validation";

const kids = array(lazy(() => node, { maxCalls: 5_000 })); // one limit for every node of the request body
const node: Validator<unknown> = union([object({ type: literal("a"), kids }), object({ type: literal("b"), kids })]);
const body = array(node, { max: 100 });
```

What counts as one validation:

- A call such as `body(input)`, and everything it reaches until its result settles, whatever validator is at its root. So the items of an `array` of recursive values share the count of each `lazy`, and validations made one after another, such as one per request, have counts of their own.
- Each `lazy` counts its own calls against its own limit. So a limit set on one is never overridden by another the validation reaches.
- A validation made from a callback you wrote is counted apart from the validation that ran the callback: the test of a `check`, the function of a `transform`, a `guard`, the test of a `format`, the default of `optional` or `fallback`, or the getter of a `lazy`. A validator given as a child, even one written by hand, is part of the validation that reaches it.
- Like `maxDepth`, it lasts across the awaits of this package, such as those of an asynchronous `check`. An `await` inside a validator you write yourself is not seen: what that validator calls after it starts a validation of its own, with fresh counts and levels, so neither limit bounds recursion through it. Put asynchronous work in a `check`, or bound such a validator yourself.

What counts as one call:

- Every object, array or other value with parts that reaches the `lazy`, not only every level. So a schema for any JSON value, whose arrays and records hold `lazy` items, stops at 10,000 of them, however flat they are.
- Not a primitive that reaches the `lazy` and ends the recursion there, such as a number in a list. So a list of a million numbers is held to no limit but its `max`.
- A primitive the recursion goes on through, such as text a `json` or a `transform` reads the next level from, and one whose result is pending, as under an asynchronous `check`.

A validation stopped by the limit keeps the issues found on the way, each with a path no deeper than `maxDepth` allows. Set the limit on every `lazy` of the schema, lower for small untrusted input, and raise it for recursive data with more nodes than that in one validation.

A `lazy` under a `union` fails as that option. So the code the caller sees is the `invalid_union` of the union, with the `too_big` issue inside `params.issues`. `englishMessages` words the union with it, "Too complex to check within 10000 recursive steps", whatever the other options found, since the input may be valid and only too large. For objects told apart by a property, use [`tagged`](request-bodies.md#tagged), which reads the property first and validates only the matching variant.

### Build a recursive schema once

A `lazy` made while the getter of another `lazy` runs shares the count of that one, and each holds the count to its own `maxCalls`. That is what bounds a schema built anew at every level, by a getter that calls the function that builds it, as in `const node = () => union([object({ kids: array(lazy(node)) }), …])`. Every level makes new `lazy` validators, which would otherwise each get a count of their own, and its work would have no bound.

Such a schema shares no results either, since every level is a new validator. So its work doubles with each level until the limit stops it, and it rejects deep valid input that a schema built once accepts. `audit` and `toJsonSchema` throw a `TypeError` for it. Build a recursive schema once and refer to it, also inside a function that builds it for you:

```ts
import { array, lazy, object, string, type Validator } from "@codenhub/validation";

interface Comment {
  text: string;
  replies: Comment[];
}

const thread = (maxCalls: number): Validator<Comment> => {
  const comment: Validator<Comment> = object({ text: string(), replies: array(lazy(() => comment, { maxCalls })) });
  return comment;
};
```

## Sizes are yours to cap

The limits above are about the stack, and the work for each node. They are not about size, so they do not stop a large flat input. The issues of a failing value do not grow with it, since each collection stops at 1,000 of them, and those of a recursive value are bounded by `maxDepth` and `maxCalls`. But the work on a value that passes, or that fails only near its end, still grows with its size. So:

- Cap the size of untrusted text before you parse it, as in `pipe(string({ max: 100_000 }), json(category))`.
- Give every `array`, `set`, `map` and `record` a `max`.
- Give every `file` a `maxSize`, and cap the size of a request body where the request is read.

A value received by structured clone, such as `event.data` from `postMessage`, needs the `max` whatever its size in bytes. It can hold a sparse array, or one array at many places, so a message of a few bytes can hold millions of items.

## Checking a schema for the bounds it needs

Input that passes a validator is validated in full. So a body of a million items, or of text a gigabyte long, costs what its size costs, and is what you store. `audit(validator)` reads a schema, without calling it, and lists every place where the size of what it accepts is left open:

```ts
import { array, audit, email, object, string } from "@codenhub/validation";

const signupBody = object({ name: string({ max: 100 }), email: email(), interests: array(string({ max: 50 })) });

audit(signupBody); // [{ rule: "unbounded_size", path: "interests", kind: "array" }]
```

Give `interests` a `max`, and the list is empty, which a test asserts:

```ts
import { array, audit, email, object, string } from "@codenhub/validation";

const signupBody = object({ name: string({ max: 100 }), email: email(), interests: array(string({ max: 50 }), { max: 10 }) });

audit(signupBody); // []
```

Each finding is an `AuditFinding`, with a `rule`, the `path` of the part in the schema, and its `kind`:

| `rule`             | Reported for                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"unbounded_size"` | An `array`, `set`, `map` or `record` without a `max` or `length`, a `tuple` with `rest` and no `max`, and a `file` without a `maxSize`                                                           |
| `"unbounded_text"` | A `string` or `coerceString` without a `max` or `length`, a format that does not bound its own text, `json` or `searchParams` given open text, and a `coerceBigint` without a bound on each side |
| `"raised_limit"`   | A `lazy` whose `maxDepth` or `maxCalls` is above its default                                                                                                                                     |
| `"unreadable"`     | A validator it cannot read, such as one written by hand, whose bound it cannot tell                                                                                                              |

How it reads a schema:

- **Formats whose input is bounded by what they accept** need no `max`: `email`, `uuid`, `ulid`, `cuid2`, `nanoid`, `ip`, `cidr`, `mac`, `port`, `phone`, `creditCard`, `isoDate`, `hostname` and `domain`. Any other, such as `url`, `hex`, `jwt` or one made with `format`, is text like any other. Bound it with a `pipe`, as below.
- **A bound before it counts.** A `pipe` step reads what the steps before it produced. So after a step that bounds its value, nothing needs a bound of its own. In `pipe(string({ max: 10_000 }), json(object({ tags: array(string()) })))`, the text is at most 10,000 characters, and so is everything parsed from it. `pipe(string({ max: 2048 }), url())` bounds a URL the same way. The `max` of a collection bounds how many items it has, not what each holds, so the items after it still need their own bounds, unless the items before were bounded too or are numbers, booleans, dates or literals, which hold nothing more.
- **Text read as a bigint** takes longer than linear time to convert. So `coerceBigint` needs `min` or `gt`, and `max` or `lt`. They limit the digits it converts, and text with more is refused without being converted.
- **A path** joins property names with `.`. It writes `[]` for the items of an array or a set, `[0]` for an item of a tuple, `{}` for the keys and values of a record or a map, and `""` for the validator itself.
- **A recursive schema** is read once at each place it is used, and not again where it refers to itself. One built anew at every level, as `lazy(() => build())` builds it, never repeats, so `audit` throws a `TypeError` for it, as `toJsonSchema` does.
- **`formData`** is read through, to what it holds.

What it does not judge:

- Whether a `max` is small enough. Any number says someone decided.
- Checks, since they run on a value that already passed, and anything a `guard` or a validator written by hand does inside.
- What no option bounds. The keys an `object` with `unknownKeys: "passthrough"` keeps, and what `unknown()` accepts, are not reported. Use `"strip"` or `"strict"` for keys the schema does not name, and a validator of the type you expect in place of `unknown()`.

## Next

That is the end of the reading path. For the exact signature of every export, see the [API reference](reference/index.md). For what changed between versions, and how to upgrade, see the [changelog](changelog/index.md).
