---
title: The AppError
description: Every field of an AppError, what each one promises, how errors are re-normalized, and how to send one from a server to a client.
order: 2
---

# The AppError

Everything in this package ends in an `AppError`. This page walks through its fields, the rules that keep it stable as it passes through layers of your code, and how to send one across a network or worker boundary.

## The fields

```ts
const error = createAppError({ code: "invalid_credentials" }, { registry: supabaseErrorRegistry });

error.name; // "AppError"
error.message; // "We couldn't sign you in. The email or password is incorrect. Check them and try again."
error.type; // "known"
error.code; // "invalid_credentials"
error.messageKey; // "error.supabase.auth.invalidCredentials"
error.source; // "supabase.auth"
error.isRetryable; // false
error.originalError; // { code: "invalid_credentials" }
```

### `message`

Text that is safe to show to the person using the application. It is the message of the mapping that matched, or the fallback message when nothing matched. It is never the raw message of the value you passed in.

### `type`

How the error was matched: `"known"` for a code, name, exact message, or prefix, `"heuristic"` for a regular expression, and `"unknown"` when nothing matched. It says nothing about severity: a missing table is `"known"` once its code is registered, and an offline user is `"heuristic"` because browsers only report that in a message.

### `code`

The identifier that classified the error, for branching on a specific failure:

```ts
if (error.code === "email_not_confirmed") {
  redirectTo("/confirm-email");
}
```

It holds the registered code that matched, or the registered name when a name matched instead. A message, prefix, or pattern match has no code, so `code` is `null` there, and also for unknown errors.

When the same failure can arrive both ways, branch on `messageKey` instead. A stale code-split chunk is a good example: webpack reports it by name, so `code` is `"ChunkLoadError"`, but a browser reports a failed `import()` only in its message, so `code` is `null`. Both resolve to `messageKey: "error.browser.moduleLoadFailed"`.

### `messageKey`

A translation key from the matched mapping, or `null`. The built-in presets give every mapping one, and they are stable: a key keeps its meaning across releases even when the English message is reworded. ErrorKit does not ship translations; [Recipes](recipes.md#translate-messages) shows how to plug in your own.

### `source`

A label for where the failure came from, such as `"supabase.auth"`, `"browser.network"`, or whatever you register for your own mappings. `null` when the mapping has none or nothing matched. It is useful for grouping in logs and dashboards.

### `isRetryable`

Whether the call that failed can be repeated as it is, without asking the person to do anything and without the risk that it runs twice. It is `false` unless the matched mapping says otherwise.

This flag is deliberately strict. A failure that may have happened after the server received the request is not retryable, however likely a second attempt is to succeed, because repeating it could charge a card twice or send an email twice. In the built-in presets, only failures that happen before a connection is made are retryable, such as `ECONNREFUSED` in the Node.js preset.

Two consequences are easy to miss:

- **The flag describes the call that failed, which can sit several wrappers down.** A `publish()` function that uploads a file and then fails to save a record with `ECONNREFUSED` produces a retryable error. That is true of the save, not of `publish()`: repeating `publish()` uploads the file again. Retry on the flag only where your code made the failing call itself.
- **The flag is about an error your own runtime raised.** A server that forwards its upstream failure as `{ "code": "ECONNREFUSED" }` in a response body matches the same mapping, but that request did reach the server. Classify response bodies against a registry that holds that service's codes and no network preset; see [Recipes](recipes.md#classify-http-responses).

### `originalError` and `cause`

The value you passed to `createAppError`, untouched, for logs and debugging. It is also the error's standard `cause`, so error trackers and Node.js's `console.error` show it without extra work. It is non-enumerable and left out of `JSON.stringify`, so raw details do not leak into a response by accident.

## An AppError cannot be changed

None of an `AppError`'s own fields can be changed or deleted; trying throws in strict mode. The error stays open to new properties, though, because some frameworks add their own to every error they catch: Koa sets `status`, and hapi's `Boom.boomify` sets `isBoom`. A fully frozen error would make those frameworks throw inside their own error handler.

`createAppError` and `appErrorFromJSON` are the only ways to make one. Use `isAppError(value)` to check for one; it recognizes only errors made by this copy of the package, not objects that merely look similar.

## Normalizing twice

Code often passes an error through several layers, and each one may call `createAppError` again. The rule is that the first layer to classify a failure keeps its wording:

```ts
const first = createAppError(caught, { registry: billingRegistry });
const again = createAppError(first, { fallbackMessage: "Checkout failed." });

again === first; // true
```

Passing an `AppError` returns the same object, and `fallbackMessage` and `maxDepth` never change it. The one exception is when you pass a `registry`: then the raw value inside is classified again, and the result can only get better. A pattern match replaces an `"unknown"` error, and a known match replaces anything it differs from. Everything else returns the same object.

An `AppError` wrapped in another error, as in `new Error("checkout failed", { cause: appError })`, follows the same rule: its classification is used as it stands unless you pass a `registry`.

## Sending an error across a boundary

An `AppError` serializes to exactly seven fields, on every JavaScript engine:

```ts
JSON.stringify(error);
// {"name":"AppError","message":"…","type":"known","code":"23505","messageKey":"…","source":"…","isRetryable":false}
```

`originalError` and `cause` are left out on purpose: they can hold secrets, personal data, or cyclic objects.

On the receiving side, `appErrorFromJSON` rebuilds an `AppError` from that shape:

```ts
// Server
return Response.json({ error: error.toJSON() }, { status: 409 });

// Client
const body = await response.json();
const error = appErrorFromJSON(body.error);
```

It consults no registry: the rebuilt error carries the message the sender chose, so use it only on data from a source you trust to word your errors, such as your own server. `isRetryable` always comes back `false`, because the sender's flag described the sender's own call, not the request that carried the error back. A value that is not exactly the serialized shape is normalized as raw input, as `createAppError` would.

To pass an error to a worker, through `postMessage`, `structuredClone`, or IndexedDB, send `error.toJSON()` too. A structured clone copies an `AppError` as a plain `Error` without its fields, and on some engines carries the raw `cause` along with it.

## Options

`createAppError(error, options)` accepts:

| Option            | Default                           | Effect                                                        |
| ----------------- | --------------------------------- | ------------------------------------------------------------- |
| `fallbackMessage` | `"An unexpected error occurred."` | The message when nothing matches. Must be a non-empty string. |
| `registry`        | The global registry               | Where to look for matches. See [Registries](registries.md).   |
| `maxDepth`        | `3`                               | How deep to look inside wrapped errors, from `0` to `3`.      |

At the default depth, a `cause` chain alone is followed further, to a depth of `8`, because a failure wrapped once per layer of an application often sits deeper than three. A lower `maxDepth` stops every field, `cause` included, at that depth.

The default message is exported as `DEFAULT_APP_ERROR_MESSAGE`. An invalid option is a programming mistake, so it throws `TypeError` before any work starts. Ordinary input never throws: `createAppError` accepts any value, including `null`, numbers, and objects whose properties throw when read.
