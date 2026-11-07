---
title: The AppError
description: Every field of an AppError, what each one promises, what happens when an error is normalized twice, and how to send one from a server to a client.
order: 2
---

# The AppError

Everything in this package ends in an `AppError`. This page goes through its fields, the rules that keep it stable as it passes through layers of your code, and how to send one across a network or worker boundary. If you only read one page carefully, make it this one, and take your time on `isRetryable`.

## The fields

Here is the error the project tracker gets when someone signs in with the wrong password:

```ts
const error = createAppError({ code: "invalid_credentials" }, { registry: supabaseErrorRegistry });

error.name; // "AppError"
error.message; // "We couldn't sign you in. The email or password is incorrect. Check them and try again."
error.type; // "known"
error.code; // "invalid_credentials"
error.messageKey; // "error.supabase.auth.invalidCredentials"
error.source; // "supabase.auth"
error.isRetryable; // false
error.details; // null
error.originalError; // { code: "invalid_credentials" }
```

`AppError` is exported as a type. You never construct one yourself; the next sections say where they come from.

### `message`

Text that is safe to show to the person using the application. It is the message of the mapping that matched, or the fallback message when nothing matched. It is never the raw message of the value you passed in.

### `type`

How the error was matched, typed as `AppErrorType`:

- `"known"`: a code, name, exact message, or prefix matched.
- `"heuristic"`: only a regular expression matched.
- `"unknown"`: nothing matched.

It says nothing about severity. A missing table is `"known"` once its code is registered, and an offline user is `"heuristic"` because browsers only report that in a message.

### `code`

The identifier that classified the error, for branching on a specific failure:

```ts
if (error.code === "email_not_confirmed") {
  redirectTo("/confirm-email");
}
```

It holds the registered code that matched, or the registered name when a name matched instead. A message, prefix, or pattern match has no code, so `code` is `null` there, and also for unknown errors.

When the same failure can arrive by more than one route, branch on `messageKey` instead. A stale code-split chunk is the classic case. Webpack reports it by name, so `code` is `"ChunkLoadError"`. A browser reports a failed `import()` only in its message, so `code` is `null`. Both resolve to `messageKey: "error.browser.moduleLoadFailed"`.

### `messageKey`

A translation key from the matched mapping, or `null`. The built-in presets give every mapping one, and the keys are stable: a key keeps its meaning across releases even when the English message is reworded. ErrorKit does not ship translations; [Recipes](recipes.md#translate-messages) shows how to plug in your own.

### `source`

A label for where the failure came from, typed as `AppErrorSource`: `"supabase.auth"`, `"browser.network"`, or whatever you register for your own mappings. It is `null` when the mapping has none or nothing matched. It is handy for grouping in logs and dashboards, so the 3 a.m. graph says "supabase.auth" instead of "errors, generally".

### `isRetryable`

Whether the call that failed can be repeated as it is, without asking the person to do anything and without the risk that it runs twice. It is `false` unless the matched mapping says otherwise.

The flag is deliberately strict. A failure that may have happened after the server received the request is not retryable, however likely a second attempt is to succeed, because repeating it could charge a card twice or send an email twice. In the built-in presets, only failures that happen before a connection is made are retryable, such as `ECONNREFUSED` in the Node.js preset.

Two consequences are easy to miss:

- **The flag describes the call that failed, which can sit several wrappers down.** Say a `publish()` function uploads a file, then fails to save a record with `ECONNREFUSED`. The error is retryable, but that is true of the save, not of `publish()`: repeating `publish()` uploads the file again. Retry on the flag only where your code made the failing call itself.
- **The flag is about an error your own runtime raised.** A server that forwards its upstream failure as `{ "code": "ECONNREFUSED" }` in a response body matches the same mapping, but that request did reach the server. Classify response bodies against a registry that holds that service's codes and no network preset; see [Recipes](recipes.md#classify-http-responses).

### `details`

Data your code attached on purpose, such as the form field that failed, or `null`. Pass it with the `details` option of `createAppError`, `err`, `attempt`, or `attemptAsync`:

```ts
getErrorRegistry().codes.add("project.name_missing", { message: "Give the project a name, then save again." });

const result = err({ code: "project.name_missing" }, { details: { field: "name" } });

result.error.details; // { field: "name" }
```

The rules for what it can hold:

- **JSON values only:** strings, finite numbers, booleans, `null`, lists, and plain objects, nested at most eight levels deep.
- **`undefined` keys are dropped,** as `JSON.stringify` drops them, so you do not have to check an optional field first.
- **Anything else throws `TypeError`,** such as a `Date` or an `undefined` list entry.
- **It is copied and frozen,** so changing the object you passed afterwards changes nothing.

Unlike the raw error, `details` is part of `toJSON()`, so it reaches a client. It is never read from the value being normalized, only from the option, so nothing gets into it that your code did not put there. Keep anything secret out of it.

When an error passes through several layers, each one can add keys. A key the error already has keeps its value, so an outer layer never overwrites what an inner one recorded.

### `originalError` and `cause`

The value you passed to `createAppError`, untouched, for logs and debugging. It is also the error's standard `cause`, so error trackers and Node.js's `console.error` show it without extra work. It is non-enumerable and left out of `JSON.stringify`, so raw details do not leak into a response by accident.

## An AppError cannot be changed

None of an `AppError`'s own fields can be changed or deleted, and trying throws in strict mode. The `stack` is the one exception: it describes where the error was made, not what it means, and libraries that rethrow an error they caught call `Error.captureStackTrace` on it, which would throw on a locked stack.

The error stays open to new properties, though, because some frameworks add their own to every error they catch: Koa sets `status`, and hapi's `Boom.boomify` sets `isBoom`. A fully frozen error would make those frameworks throw inside their own error handler, which is an error handler having an error, and nobody wants to debug that.

`createAppError` and `appErrorFromJSON` are the only ways to make one. Use `isAppError(value)` to check for one. It recognizes only errors made by this copy of the package, not objects that merely look similar, so a hand-written `{ name: "AppError", … }` does not pass.

## Normalizing twice

Code often passes an error through several layers, and each layer may call `createAppError` again. The rule is that the first layer to classify a failure keeps its wording:

```ts
const first = createAppError(caught, { registry: billingRegistry });
const again = createAppError(first, { fallbackMessage: "Checkout failed." });

again === first; // true, when billingRegistry matched `caught`
```

Passing an `AppError` returns the same object, and `fallbackMessage` and `maxDepth` never change its classification. The wording can still be filled in, once: a `fallbackMessage` does word an `"unknown"` error that still carries the default message, because no layer before it chose any wording. Once a layer has, its message stays:

```ts
const inner = await attemptAsync(() => db.loadProject(id)); // no fallback here
const outer = await attemptAsync(() => unwrap(inner), { fallbackMessage: "Couldn't load the project." });

outer.ok || outer.error.message; // "Couldn't load the project."
```

Passing a `registry` is the only way to change the classification. Then the raw value inside is classified again, and the result can only get better:

- A pattern match replaces an `"unknown"` error.
- A known match replaces anything it differs from.
- Everything else returns the same object.

An `AppError` wrapped inside another error, as in `new Error("checkout failed", { cause: appError })`, follows the same rule: its classification is used as it stands unless you pass a `registry`.

## Sending an error across a boundary

An `AppError` serializes to exactly eight fields, on every JavaScript engine:

```ts
JSON.stringify(error);
// {"name":"AppError","message":"…","type":"known","code":"23505","messageKey":"…","source":"…","isRetryable":false,"details":null}
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

Three rules apply:

- **It consults no registry.** The rebuilt error carries the message the sender chose, so use it only on data from a source you trust to word your errors, such as your own server.
- **`isRetryable` always comes back `false`.** The sender's flag described the sender's own call, not the request that carried the error back.
- **Anything that is not exactly the serialized shape** is normalized as raw input, as `createAppError` would do.

To pass an error to a worker, through `postMessage`, `structuredClone`, or IndexedDB, send `error.toJSON()` too. A structured clone copies an `AppError` as a plain `Error` without its fields, and on some engines it carries the raw `cause` along with it.

## Options

`createAppError(error, options)` accepts an `AppErrorOptions` object:

| Option            | Default                           | Effect                                                        |
| ----------------- | --------------------------------- | ------------------------------------------------------------- |
| `fallbackMessage` | `"An unexpected error occurred."` | The message when nothing matches. Must be a non-empty string. |
| `registry`        | The global registry               | Where to look for matches. See [Registries](registries.md).   |
| `maxDepth`        | `3`                               | How deep to look inside wrapped errors, from `0` to `3`.      |
| `details`         | None                              | Data to attach as `details`. See [`details`](#details).       |

At the default depth, a `cause` chain alone is followed further, to a depth of `8`, because a failure wrapped once per layer of an application often sits deeper than three. A lower `maxDepth` stops every field, `cause` included, at that depth.

The default message is exported as `DEFAULT_APP_ERROR_MESSAGE`, for tests and for comparing against.

An invalid option is a programming mistake, so it throws `TypeError` before any work starts. Ordinary input never throws: `createAppError` accepts any value, including `null`, numbers, and objects whose properties throw when read. Normalizing an error should not be a new way to fail.

## Next

You know what an `AppError` carries. [Registries](registries.md) explains where its message, key, and flag come from: how a registry is filled, how `createAppError` searches it, and which match wins when several could.
