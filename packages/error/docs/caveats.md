---
title: Caveats and limitations
description: What ErrorKit does not do, the surprises it can cause, and how to work around each one.
order: 7
---

# Caveats and limitations

Everything on this page is deliberate, but each item has surprised someone. Each one says what happens, why, and what to do instead.

## Unmatched text never becomes the message

**What happens:** `createAppError(new Error("Email is required"))` has the message `"An unexpected error occurred."`, not `"Email is required"`. So does `err("Email is required")`.

**Why:** raw error messages are written for developers and often contain table names, file paths, query fragments, or other people's data. ErrorKit only shows text that someone registered on purpose.

**Instead:** raise your own failures with a registered code, `err({ code: "signup.email_missing" })`, or pass a `fallbackMessage` that fits the place you are in.

## The global registry is shared state

**What happens:** `getErrorRegistry()` returns one registry per copy of the package, shared by everything that imports that copy. On a server, every request sees the same mappings.

**Why:** it lets you configure errors once, at startup, and normalize anywhere without passing a registry around.

**Instead:** configure the global registry once, before handling any request, and never change it per request; two concurrent requests would see each other's changes. For mappings that only apply in one place, pass `{ registry }` to that call. In tests, reset it with `setErrorRegistry` (see [Recipes](recipes.md#set-up-errors-in-tests)).

## Two copies of the package do not know each other

**What happens:** if your application ends up with two copies of `@codenhub/error`, such as two versions installed side by side, each copy has its own global registry, and `isAppError` from one copy returns `false` for an error made by the other.

**Why:** `isAppError` recognizes only errors this copy created, so that objects shaped like an `AppError`, including ones built from untrusted JSON, are never mistaken for one.

**Instead:** keep one version installed. `pnpm why @codenhub/error` shows where a second copy comes from. An `AppError` from another copy is still normalized, as an ordinary object.

## The last mapping added wins

**What happens:** registering an identifier that already exists replaces it, and `merge` overwrites matching entries. Merging the Supabase preset after your own `23505` mapping replaces yours with the preset's.

**Instead:** merge presets first and add your own mappings last. When two sources use the same codes for different things, give each its own registry; see [Registries](registries.md#the-global-registry-or-your-own).

## Names match any error with that name

**What happens:** with the browser preset merged, any error whose `name` is `NotFoundError` or `TimeoutError` is classified as the browser's, including errors from a library that happens to use the same class name.

**Instead:** classify that library's errors against a registry without the browser preset, or register a more specific code for them.

## Cancelled requests are errors too

**What happens:** cancelling a `fetch` with an `AbortController` rejects it with an `AbortError`, which the browser preset turns into "The request was cancelled before it finished." That includes cancellations your own code made on purpose.

**Instead:** check whether you cancelled it, and skip showing anything; see [Recipes](recipes.md#ignore-cancelled-requests).

## HTTP status codes are not errors to `fetch`

**What happens:** a `fetch` that receives a `404` or `500` resolves normally. Passing the `Response` to `createAppError` produces an `"unknown"` error, because a response has no code, name, or message to match.

**Instead:** check `response.ok` and classify the status yourself; see [Recipes](recipes.md#classify-http-responses).

## Matching is case-sensitive, except in patterns

**What happens:** a registered message `"Upload failed"` does not match `"upload failed"`. Codes, names, messages, and prefixes are all compared case-sensitively.

**Instead:** register the exact text the failing code produces, or use a pattern with the `i` flag. Trailing punctuation and spaces never matter for messages and prefixes.

## Wrapped errors are searched to a limited depth

**What happens:** `createAppError` looks three levels deep into wrapper fields, and eight levels down a `cause` chain. It reads only the first ten entries of an `errors` list. A failure buried deeper resolves as if it were not there.

**Why:** every level can multiply the number of values to inspect, and the input can come from anywhere. The limits keep the work small on any input.

**Instead:** normalize closer to where the failure happens, or wrap failures with `cause`, which is followed furthest.

## Retryable is narrower than "might work next time"

**What happens:** a timeout, a reset connection, or a failed `fetch` in the browser is never marked retryable, even though trying again often works.

**Why:** each of those can happen after the server already acted on the request, and repeating a request that already ran can charge a card twice. `isRetryable` promises safety, not likelihood.

**Instead:** retry those yourself only where repeating the request is harmless, such as a `GET`. See [The AppError](app-error.md#isretryable).

## Presets do not cover everything

- The browser preset recognizes a failed `fetch` and a failed `import()` by the messages Chromium, Firefox, and Safari produce today. A browser that rewords them falls back to `"unknown"` until the preset catches up.
- The Node.js preset covers network failures only, and was observed on Node.js 24. Other server runtimes may report the same failures differently.
- The Supabase preset covers the Auth codes a person can act on, six PostgreSQL codes, and the client's own error names. Codes only a developer can fix are left unmapped on purpose, so they reach your error tracker as `"unknown"`.

Register your own mapping for anything a preset misses. [Presets](presets.md) lists exactly what each one covers.

## No translations ship with the package

Every preset mapping has a stable `messageKey`, but ErrorKit includes only the English messages. Translate the keys in your own catalog; see [Recipes](recipes.md#translate-messages).

## Structured clone drops the fields

**What happens:** sending an `AppError` through `postMessage`, `structuredClone`, or IndexedDB gives the other side a plain `Error` without `type`, `code`, or the other fields, and on some engines with the raw `cause` attached.

**Instead:** send `error.toJSON()` and rebuild it with `appErrorFromJSON` on the other side; see [The AppError](app-error.md#sending-an-error-across-a-boundary).

## Patterns you write can be slow

A pattern runs against every message `createAppError` sees, and a message can be crafted by someone trying to slow your server down. A pattern with nested repetition, such as `/(a+)+$/`, can take seconds on the wrong input. Keep custom patterns anchored and simple; see [Registries](registries.md#writing-patterns). The built-in patterns are all anchored alternations.
