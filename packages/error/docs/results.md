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
options?)` delegates to `createAppError`. Raw strings are treated as untrusted
diagnostic input and use the generic fallback message. Supply `fallbackMessage`
explicitly only when the text is safe for users.

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

These helpers do not catch callback errors. Use `err()` explicitly when thrown
values should be converted into normalized failures.
