---
title: Results
---

# Result Helpers

`Result<T>` is the union `Ok<T> | Err`. `Ok<T>` contains `{ ok: true, value }`;
`Err` contains `{ ok: false, error: AppError }`.

```ts
import { err, ok, type Result } from "@codenhub/error";

const loadName = (value: string | null): Result<string> =>
  value === null ? err("missing_name", { fallbackMessage: "Name is missing." }) : ok(value);
```

`ok(value)` wraps a success value, and `ok()` creates `Ok<void>`. `err(error,
options?)` normalizes failures through the same pipeline as `createAppError`.
Both return frozen result objects.

String values are matched against the registry like any other value, at every
wrapper depth. An unmatched string never becomes the message, so raw diagnostic
text is not surfaced to users; supply `fallbackMessage` when user-facing text is
needed.

Use `attempt` and `attemptAsync` at boundaries where existing code throws:

```ts
import { attempt, attemptAsync } from "@codenhub/error";

const parsed = attempt(() => JSON.parse(payload) as Config);
const loaded = await attemptAsync(() => fetch(url).then((response) => response.json()));
```

Both run the supplied callback and convert anything it throws or rejects with
into a normalized `Err`, so the returned promise from `attemptAsync` does not
reject for callback failures. Invalid options throw `TypeError` before the
callback runs.

The remaining helpers operate only on the success branch unless stated:

| Helper                         | Behavior                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `map(result, mapper)`          | Maps an `Ok` value and returns an existing `Err` unchanged. Mapper exceptions propagate.                                             |
| `mapAsync(result, mapper)`     | Maps an `Ok` value with an async function returning a Promise. Existing `Err` values return unchanged as a resolved Promise.         |
| `andThen(result, mapper)`      | Runs a mapper returning another `Result`, avoiding nested results. Existing `Err` values are unchanged; mapper exceptions propagate. |
| `andThenAsync(result, mapper)` | Runs an async mapper returning `Promise<Result<U>>`. Existing `Err` values return unchanged as a resolved Promise.                   |
| `match(result, callbacks)`     | Calls exactly one of `onOk(value)` or `onErr(error)` and returns its value. Callback exceptions propagate.                           |
| `unwrap(result)`               | Returns an `Ok` value or throws the `AppError` held by `Err`.                                                                        |
| `unwrapOr(result, fallback)`   | Returns an `Ok` value or the supplied fallback without throwing.                                                                     |

```ts
import { andThen, map, match, ok } from "@codenhub/error";

const result = andThen(ok("42"), (text) => ok(Number(text)));
const doubled = map(result, (value) => value * 2);
const output = match(doubled, {
  onOk: String,
  onErr: (error) => error.message,
});
```

`map`, `mapAsync`, `andThen`, `andThenAsync`, and `match` do not catch callback
errors. Use `attempt` or `attemptAsync` when thrown values should become
normalized failures.
