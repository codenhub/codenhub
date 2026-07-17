# Result Helpers

`Result<T>` is the union `Ok<T> | Err`. `Ok<T>` contains `{ ok: true, value }`;
`Err` contains `{ ok: false, error: AppError }`.

```ts
import { err, ok, type Result } from "@codenhub/error";

const loadName = (value: string | null): Result<string> => (value === null ? err("Name is missing") : ok(value));
```

`ok(value)` wraps a success value, and `ok()` creates `Ok<void>`. `err(error,
options?)` delegates to `createAppError`; when `error` is a string, that string
becomes the fallback message unless `options.fallbackMessage` overrides it.

The remaining helpers operate only on the success branch unless stated:

| Helper                       | Behavior                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `map(result, mapper)`        | Maps an `Ok` value and returns an existing `Err` unchanged. Mapper exceptions propagate.                                             |
| `andThen(result, mapper)`    | Runs a mapper returning another `Result`, avoiding nested results. Existing `Err` values are unchanged; mapper exceptions propagate. |
| `match(result, callbacks)`   | Calls exactly one of `onOk(value)` or `onErr(error)` and returns its value. Callback exceptions propagate.                           |
| `unwrap(result)`             | Returns an `Ok` value or throws the `AppError` held by `Err`.                                                                        |
| `unwrapOr(result, fallback)` | Returns an `Ok` value or the supplied fallback without throwing.                                                                     |

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
