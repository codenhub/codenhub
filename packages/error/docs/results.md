---
title: Results
description: Return failures instead of throwing them, with Result, attempt, and the helpers that chain them.
order: 5
---

# Results

A thrown error is invisible in a function's type. `loadProject(id): Promise<Project>` says nothing about the ways it can fail, so every caller has to remember its own `try`/`catch`, and the one who forgets finds out in production. A `Result` puts the failure in the type, so the compiler does the remembering.

This page shows how to make results, read them, wrap code that throws, and chain several steps together. Everything here is optional: if your code is happy with `try`/`catch` and `createAppError`, skip ahead to [Error boundaries](frameworks.md).

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

The failure side is always an `AppError`, normalized through the same registry as `createAppError`. A `Result` is the same error handling in a different shape, not a second system to configure.

## Making results

`ok(value)` wraps a success, and `ok()` with no argument makes an `Ok<void>` for operations that return nothing. `err(error, options?)` normalizes a failure exactly as `createAppError(error, options)` would. Here is the project tracker checking a project name before saving it:

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

Raise your own failures by code, as above, rather than by message. A string passed to `err` is matched as message text against the `messages`, `prefixes`, and `patterns` buckets, never against `codes`. And an unmatched string does not become the message: `err("Name is required")` gives you `"An unexpected error occurred."` unless a registered message, prefix, or pattern matches it. It is the same rule that keeps raw text off the screen, applied to your own strings too. ErrorKit does not play favorites, not even with you.

## Reading results

Check `ok`, and TypeScript narrows the rest:

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

- **`attempt` is for synchronous callbacks only.** A callback that returns a promise is a type error. At runtime, where the type checker cannot see it (a callback typed `any`, or plain JavaScript), `attempt` throws `TypeError` instead of returning an `Ok` that holds a promise whose rejection nobody would ever catch. Use `attemptAsync` for anything asynchronous.
- **Inside a generic function, pass the type argument instead of casting.** The type check above has to know what the callback returns, so a callback returning a value of a type parameter is a type error too: `attempt(() => JSON.parse(text) as T)` does not compile. Write `attempt<T>(() => JSON.parse(text))` instead. For a callback that returns a `T` it got from elsewhere, cast its result to `never`: `attempt<T>(() => read() as never)`. The runtime check still rejects a promise.
- **`attemptAsync` never rejects for something the callback did.** Its promise always resolves to a `Result`.
- **Both check their arguments before running the callback.** A callback that is not a function, or an invalid option, throws `TypeError` without running anything. For `attemptAsync`, the promise rejects with it instead.

## Chaining results

Most of the remaining helpers work on the success side and pass an `Err` through untouched. `orElse` and `orElseAsync` work on the failure side:

| Helper                           | What it does                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `map(result, mapper)`            | Transforms an `Ok` value. Returns the `Err` unchanged.                                            |
| `mapAsync(result, mapper)`       | Like `map`, with a mapper that may return a promise. Always returns a promise.                    |
| `andThen(result, mapper)`        | Runs a mapper that returns another `Result`, so you get `Result<U>`, not `Result<Result<U>>`.     |
| `andThenAsync(result, mapper)`   | Like `andThen`, with a mapper that may return a promise of a `Result`. Always returns a promise.  |
| `orElse(result, recover)`        | Runs `recover` on an `Err` and returns the `Result` it returns. Returns the `Ok` unchanged.       |
| `orElseAsync(result, recover)`   | Like `orElse`, with a recovery that may return a promise of a `Result`. Always returns a promise. |
| `all(results)`                   | One `Ok` holding every value in order, or the first `Err`.                                        |
| `match(result, { onOk, onErr })` | Calls exactly one of the two callbacks and returns what it returns.                               |
| `unwrap(result)`                 | Returns the `Ok` value, or throws the `AppError`.                                                 |
| `unwrapOr(result, fallback)`     | Returns the `Ok` value, or `fallback`.                                                            |

Put together, a small pipeline reads top to bottom. This one reads the port from a config file:

```ts
import { andThen, attempt, err, map, match, ok } from "@codenhub/error";

const port = andThen(
  attempt(() => JSON.parse(text) as { port?: unknown } | null),
  (config) => (typeof config?.port === "number" ? ok(config.port) : err({ code: "config.port_missing" })),
);

const label = match(
  map(port, (value) => `Listening on ${value}`),
  {
    onOk: (text) => text,
    onErr: (error) => error.message,
  },
);
```

`orElse` handles the failures you can do something about and passes the rest on. Return `err(error)` for every failure the recovery does not handle; it is already an `AppError`, so it comes back as it is. Here the project tracker falls back to its cached project list when the browser reports a failed fetch:

```ts
import { attemptAsync, err, ok, orElse } from "@codenhub/error";

const projects = orElse(await attemptAsync(() => api.listProjects()), (error) => (error.messageKey === "error.browser.requestFailed" ? ok(cache.projects) : err(error)));
```

`all` turns several results into one, and keeps each position's type when you pass a tuple. For calls that run in parallel, await them together first:

```ts
import { all, attemptAsync } from "@codenhub/error";

const loaded = all(await Promise.all([attemptAsync(() => api.user(id)), attemptAsync(() => api.projects(id))]));

if (loaded.ok) {
  const [user, projects] = loaded.value;
}
```

The helpers do not catch. If a mapper or a `match` callback throws, the exception propagates as it would from any other function. When a step can throw, wrap that step in `attempt` or `attemptAsync`.

Use `unwrap` at the edge where your code goes back to throwing, such as a framework that expects a loader to throw, and keep `Result` everywhere in between.

## Next

Results handle failures in code you call. Failures can also happen while a component renders, where no `try` of yours is around. [Error boundaries](frameworks.md) covers those, for React and Svelte.
