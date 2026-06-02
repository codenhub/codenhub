# @codenhub/helpers

Small TypeScript helpers for app errors, validation, and result-style control flow.

```ts
import { AppError } from "@codenhub/helpers/error";
import { ok } from "@codenhub/helpers/result";
import { coerce, val } from "@codenhub/helpers/validation";
```

Root imports also work when you need multiple helpers:

```ts
import { AppError, coerce, ok, val } from "@codenhub/helpers";
```

## Error

`AppError` normalizes unknown errors into one app-friendly shape: `type`, `message`, `messageKey`, `source`, `retryable`, and `originalError`.

Use it when external libraries, APIs, browser APIs, or app code throw different error formats. Register only errors your app knows how to explain; everything else falls back to `"An unexpected error occurred."` or your `fallbackMessage`.

Registry matches by `code`, `name`, exact message, message prefix, or message pattern. Code, name, message, and prefix matches are classified as `known`; pattern matches are classified as `unexpected` because they are heuristic.

```ts
import { AppError, AppErrorRegistry } from "@codenhub/helpers/error";

AppErrorRegistry.codes.add("invalid_credentials", {
  message: "Invalid email or password.",
  messageKey: "error.auth.invalidCredentials",
  source: "auth",
});

AppErrorRegistry.patterns.add(/network|fetch/i, {
  message: "Connection failed. Try again.",
  source: "network",
  retryable: true,
});

const res = await signIn();

if (!res.ok) {
  const err = new AppError(res.error, {
    fallbackMessage: "Could not sign in.",
  });

  alert(err.message);
  console.error(err.type, err.source, err.originalError);
}
```

## Validation

`val` gives small validators for common input checks. `coerce` converts primitive input to `int`, `number`, `bool`, or `string` before validation when you expect strings from forms, env vars, query params, or config.

Use it at boundaries: forms, env vars, request payloads, config, and anything typed as `unknown`. It returns `Result<T>`, so failures stay explicit instead of throwing.

```ts
import { coerce, val } from "@codenhub/helpers/validation";

const email = val.string("user@example.com").email();
const port = val.number(3000).port();
const payload = val.object({ name: "Ada" }).hasKeys(["name"]);
const items = val.array(["a", "b"]).notEmpty();

const rawPort = process.env.PORT;
const coercedPort = coerce.int(rawPort);

if (coercedPort.ok) {
  const validPort = val.number(coercedPort.value).port();

  if (!validPort.ok) throw validPort.error;
}

const enabled = coerce.bool("yes"); // ok(true)
```

## Result

`Result<T>` represents success or failure without exceptions: `{ ok: true, value }` or `{ ok: false, error }`.

Use it when a function can fail and callers should handle both paths directly. `err()` wraps failures in `AppError`, so error handling stays consistent across validation, coercion, and app code.

```ts
import { err, ok, type Result } from "@codenhub/helpers/result";

interface User {
  id: string;
  name: string;
}

const findUser = (id: string): Result<User> => {
  if (id.length === 0) return err("Missing user id");
  if (id !== "user_1") return err("User not found");

  return ok({ id, name: "Ada" });
};

const user = findUser("user_1");

if (user.ok) {
  console.log(user.value.name);
} else {
  console.error(user.error.message);
}
```
