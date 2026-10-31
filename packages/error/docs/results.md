---
title: Results
description: Return failures instead of throwing them, with Result, attempt, and the helpers that chain them.
order: 5
---

# Results

A thrown error is invisible in a function's type: `loadProject(id): Promise<Project>` says nothing about the ways it can fail, and every caller has to remember its own `try`/`catch`. A `Result` puts the failure in the type, so the compiler reminds the caller to handle it.

```ts
type Result<T> = Ok<T> | Err;

interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

interface Err {
  readonly ok: false;
  readonly error: AppError;
}
```

The failure side is always an `AppError`, normalized through the same registry as `createAppError`, so a `Result` is the same error handling in a different shape.

## Making results

`ok(value)` wraps a success, and `ok()` makes an `Ok<void>` for operations that return nothing. `err(error, options?)` normalizes a failure, exactly as `createAppError(error, options)` would:

```ts
import { err, getErrorRegistry, ok, type Result } from "@codenhub/error";

getErrorRegistry().codes.add("project.name_missing", {
  message: "Give the project a name, then save again.",
  source: "my-app.projects",
});

function validateName(name: string): Result<string> {
  const trimmed = name.trim();
  return trimmed === "" ? err({ code: "project.name_missing" }) : ok(trimmed);
}
```

Both return frozen objects.

Raise your own failures by code, as above, rather than by message. A string passed to `err` is matched as message text against the `messages`, `prefixes`, and `patterns` buckets, never against `codes`, and an unmatched string does not become the message: `err("Name is required")` gives you `"An unexpected error occurred."` unless that exact message is registered. That is the rule that keeps raw text off the screen, applied to your own strings too.

## Reading results

Check `ok` and TypeScript narrows the rest:

```ts
const name = validateName(input);

if (!name.ok) {
  showFieldError(name.error.message);
  return;
}

save(name.value); // name.value is a string here
```

## Wrapping code that throws

Most code you call throws instead of returning results: `JSON.parse`, `fetch`, database clients. `attempt` and `attemptAsync` run a callback and turn anything it throws into an `Err`:

```ts
import { attempt, attemptAsync } from "@codenhub/error";

const config = attempt(() => JSON.parse(text) as Config);
const project = await attemptAsync(() => api.loadProject(id));
```

Both take the same options as `createAppError` as their second argument, such as a `fallbackMessage` for this call or a `registry`.

A few rules keep them honest:

- `attempt` is for synchronous callbacks only. A callback that returns a promise is a type error, and at runtime, where the type checker cannot see it (a callback typed `any`, or plain JavaScript), `attempt` throws `TypeError` instead of returning an `Ok` that holds a promise whose rejection nobody would catch. Use `attemptAsync` for anything asynchronous.
- `attemptAsync` never rejects for something the callback did. Its promise always resolves to a `Result`.
- Both check their arguments before running the callback. A callback that is not a function, or an invalid option, throws `TypeError` (for `attemptAsync`, rejects with it) without running anything.

## Chaining results

The remaining helpers work on the success side and pass an `Err` through untouched:

| Helper                           | What it does                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `map(result, mapper)`            | Transforms an `Ok` value. Returns the `Err` unchanged.                                           |
| `mapAsync(result, mapper)`       | Like `map`, with a mapper that may return a promise. Always returns a promise.                   |
| `andThen(result, mapper)`        | Runs a mapper that returns another `Result`, so you get `Result<U>`, not `Result<Result<U>>`.    |
| `andThenAsync(result, mapper)`   | Like `andThen`, with a mapper that may return a promise of a `Result`. Always returns a promise. |
| `match(result, { onOk, onErr })` | Calls exactly one of the two callbacks and returns what it returns.                              |
| `unwrap(result)`                 | Returns the `Ok` value, or throws the `AppError`.                                                |
| `unwrapOr(result, fallback)`     | Returns the `Ok` value, or `fallback`.                                                           |

Put together, a small pipeline reads top to bottom:

```ts
import { andThen, attempt, err, map, match, ok } from "@codenhub/error";

const port = andThen(
  attempt(() => JSON.parse(text) as { port?: unknown }),
  (config) => (typeof config.port === "number" ? ok(config.port) : err({ code: "config.port_missing" })),
);

const label = match(
  map(port, (value) => `Listening on ${value}`),
  {
    onOk: (text) => text,
    onErr: (error) => error.message,
  },
);
```

The helpers do not catch: if a mapper or a `match` callback throws, the exception propagates as it would from any function. When a step can throw, wrap that step in `attempt` or `attemptAsync`.

Use `unwrap` at the edge where your code goes back to throwing, such as a framework that expects a loader to throw, and keep `Result` everywhere in between.
