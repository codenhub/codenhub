---
title: Registries
description: The five buckets, how identifiers are matched, which match wins, and when to use your own registry instead of the global one.
order: 3
---

# Registries

A registry is where you describe the failures you know about. This page explains how to fill one, how `createAppError` searches it, and how to choose between the global registry and registries of your own.

## Feedback: what a match produces

Every entry maps an identifier to feedback:

```ts
registry.codes.add("E_RATE_LIMIT", {
  message: "We've received too many requests. Wait a few minutes, then try again.",
  messageKey: "error.myApp.api.rateLimit",
  source: "my-app.api",
  isRetryable: false,
});
```

| Field         | Required | Meaning                                                                                                                 |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `message`     | Yes      | The text people see. Write what happened and what to do next.                                                           |
| `messageKey`  | No       | A translation key. Any non-empty string, so you can reuse the keys your catalog already has.                            |
| `source`      | No       | A label for where the failure came from. Any non-empty string.                                                          |
| `isRetryable` | No       | Whether the failing call is safe to repeat as it is. Defaults to `false`; see [The AppError](app-error.md#isretryable). |

Entries are checked and copied when you add them. An empty `message`, or a field of the wrong type, throws `TypeError` right there, not later when an error is being handled.

## The five buckets

A registry has five buckets, one for each way a failure can be recognized:

| Bucket     | Matches                                    | Example identifier             | Result type   |
| ---------- | ------------------------------------------ | ------------------------------ | ------------- |
| `codes`    | The error's `code` property                | `"23505"`, `"ECONNREFUSED"`    | `"known"`     |
| `names`    | The error's `name` property                | `"AbortError"`                 | `"known"`     |
| `messages` | The whole `message`                        | `"Upload failed"`              | `"known"`     |
| `prefixes` | The start of the `message`                 | `"Quota exceeded for bucket"`  | `"known"`     |
| `patterns` | A regular expression against the `message` | `/^request to .+ timed out$/i` | `"heuristic"` |

Prefer the buckets near the top. A code or name is chosen by whoever wrote the failing code and rarely changes; a message is prose, and the next library release can reword it.

Each bucket has `add(identifier, feedback)`, `addList(entries)`, `delete(identifier)`, `clear()`, and `values()`. The `codes`, `names`, and `messages` buckets also have `get(identifier)`. `addList` checks the whole list before adding anything, so a mistake in the fifth entry leaves the bucket unchanged.

### How identifiers are compared

- **Codes and names** are trimmed of surrounding whitespace and otherwise compared exactly, including case and punctuation. A numeric `code`, such as an HTTP status, is compared as text: `{ code: 404 }` matches a registered `"404"`.
- **Messages and prefixes** are trimmed, and every trailing `.`, `!`, `?`, and space is removed, so `"Upload failed"`, `"Upload failed."`, and `"Upload failed!! "` are the same identifier. Comparison is case-sensitive: `"upload failed"` does not match.
- **Prefixes** match when the message starts with the prefix. When several match, the longest wins.
- **Patterns** run against the raw message, in the order they were added; the first that matches wins. The `g` and `y` flags are removed when a pattern is added, because they make `test()` remember its last position and give different answers on the same text. Use the `i` flag for case-insensitive matching.

A `DOMException` is matched by its name only. It also carries an old numeric `code`, `20` for `AbortError`, which would otherwise match unrelated codes.

Adding an identifier that already exists replaces its feedback. For patterns, "the same" means the same source and flags.

## Which match wins

`createAppError` collects the value you passed and every error wrapped inside it, starting with the outermost and working inward. It then picks one result in this order:

1. A **known** match anywhere: a code, name, exact message, or prefix, or an `AppError` that is already `"known"`. The outermost one wins, with one exception: when you pass a `registry`, a known match from that registry wins over a known `AppError` found inside the value, however deep the match is, because passing a registry asks for its wording.
2. Otherwise, a **heuristic** match anywhere: a pattern, or an `AppError` that is already `"heuristic"`.
3. Otherwise, any `AppError` found inside the value.
4. Otherwise, an `"unknown"` error with the fallback message.

Within one wrapped value, the order is code, then name, then exact message, then prefix, then pattern.

The first rule is what makes deeply wrapped failures work. A `fetch` that fails on Node.js throws `TypeError: fetch failed`, which matches a pattern, but its `cause` carries `code: "ECONNREFUSED"`, which matches a code. The deeper known match wins over the shallower heuristic one, so you get the more specific message.

Wrapped errors are found in `cause`, `originalError`, `error`, `err`, `inner`, and `innerError`, and in the first ten entries of an `errors` list, as on `AggregateError`. The search goes three levels deep, and a `cause` chain continues to eight; see [The AppError](app-error.md#options) for `maxDepth`. Objects already visited are skipped, so a cycle cannot loop forever.

## The global registry, or your own

`getErrorRegistry()` returns the global registry, which starts empty and is what `createAppError` uses when you pass no `registry`. For most applications, one global registry configured at startup is all you need.

Create your own with `createErrorRegistry()` when one set of mappings should not apply everywhere:

```ts
import { createAppError, createErrorRegistry } from "@codenhub/error";

const billingRegistry = createErrorRegistry();
billingRegistry.codes.add("card_declined", {
  message: "Your card was declined. Try a different card.",
  source: "my-app.billing",
});

const error = createAppError(caught, { registry: billingRegistry });
```

Reach for a separate registry when:

- **Two services use the same code for different things.** The `codes` bucket is one namespace, so if your payment provider and your database both use `"P0001"`, whichever was added last wins. Give each service its own registry and classify its errors against it.
- **A preset's names are too broad for some code.** The `names` bucket matches any value with that name. With the browser preset merged, a library's own `TimeoutError` class is classified as the browser's.
- **You classify data from somewhere else.** Response bodies from another service should be classified against that service's codes, not against network presets meant for your own runtime.

`createErrorRegistry(presets)` starts a registry from a list of others, merged in order:

```ts
import { createErrorRegistry } from "@codenhub/error";
import { nodeErrorRegistry } from "@codenhub/error/registries/node";

const apiRegistry = createErrorRegistry([nodeErrorRegistry, myApiRegistry]);
```

`setErrorRegistry(registry)` replaces the global registry outright. It is mostly useful in tests, to start each test from a known state.

## Combining and freezing

`registry.merge(other)` copies every entry of `other` into `registry`, replacing entries with the same identifier. It checks the whole source first, so a bad entry leaves the target unchanged. `registry.clear()` empties every bucket.

`freezeRegistry(registry)` returns a read-only snapshot. It has only the reading methods, `get` and `values`, even through reflection, and later changes to the original do not reach it. The built-in presets are frozen snapshots, and freezing is the way to share a set of mappings between packages or teams without anyone changing it by accident:

```ts
import { createErrorRegistry, freezeRegistry } from "@codenhub/error";

const registry = createErrorRegistry();
registry.codes.add("cart.out_of_stock", { message: "One of the items in your cart just sold out." });

export const cartErrors = freezeRegistry(registry);
```

Everything a bucket returns is frozen: `values()` returns the same frozen list until the bucket changes, and its entries, feedback objects, and regular expressions are frozen too. Spread one into a new object when you need a copy you can change.

## Writing patterns

A pattern runs against the message of every failure that reaches `createAppError`, and messages can come from anywhere, including someone trying to slow your server down. A pattern that backtracks heavily, such as `/(a+)+$/`, can stall on a crafted message. Keep patterns simple: anchor them with `^` and `$`, avoid nested repetition, and use a code, name, message, or prefix whenever one exists.

Anchoring also stops a pattern from matching too much. `/load failed/i` matches `"Config load failed"`; `/^load failed\.?$/i` matches only the browser's own message.
