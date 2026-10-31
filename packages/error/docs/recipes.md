---
title: Recipes
description: Worked examples for fetch and HTTP status codes, Supabase calls, safe retries, translations, error reporting, and tests.
order: 6
---

# Recipes

Each recipe here solves one problem from start to finish. Copy the parts you need; none of them depends on another.

## Classify HTTP responses

`fetch` only rejects when the request could not be made at all. A response with status `404` or `500` resolves normally, so `createAppError(response)` has nothing to recognize and returns an `"unknown"` error. Status codes need a mapping of their own.

A numeric `code` is compared as text, so a registry keyed by status works directly. Keep it separate from the global registry: status codes are short numbers that could collide with other services' codes, and they only mean something for responses.

```ts
import { attemptAsync, createErrorRegistry, err, type Result } from "@codenhub/error";

const httpRegistry = createErrorRegistry();

httpRegistry.codes.addList([
  ["401", { message: "Your session has ended. Sign in again to continue.", messageKey: "error.http.unauthorized" }],
  ["403", { message: "You don't have access to this.", messageKey: "error.http.forbidden" }],
  ["404", { message: "We couldn't find what you were looking for.", messageKey: "error.http.notFound" }],
  ["429", { message: "Too many requests. Wait a minute, then try again.", messageKey: "error.http.rateLimited" }],
]);

export async function getJson<T>(url: string): Promise<Result<T>> {
  const sent = await attemptAsync(() => fetch(url));

  if (!sent.ok) {
    return sent; // The request never completed; the global registry classified it.
  }

  const response = sent.value;

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    return err({ code: response.status, cause: body }, { registry: httpRegistry });
  }

  return attemptAsync(() => response.json() as Promise<T>);
}
```

Passing the body as `cause` keeps it on `originalError` for your logs. An unmapped status, such as `500`, resolves to the fallback message.

When the server is your own and sends `error.toJSON()`, rebuild its error instead: `appErrorFromJSON(body.error)`. See [The AppError](app-error.md#sending-an-error-across-a-boundary).

## Handle Supabase calls

The Supabase client returns failures instead of throwing them, as `{ data, error }`. Pass the `error` to `err` and the Supabase preset does the rest:

```ts
import { err, ok, type Result } from "@codenhub/error";

export async function signIn(email: string, password: string): Promise<Result<Session>> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  return error ? err(error) : ok(data.session);
}
```

This assumes the Supabase preset is merged into the global registry, as in [Getting started](getting-started.md). The result's `code` tells you which failure it was when you need to act on it:

```ts
const result = await signIn(email, password);

if (!result.ok && result.error.code === "email_not_confirmed") {
  redirectTo("/confirm-email");
}
```

Database errors work the same way: `supabase.from("projects").insert(row)` returns an `error` whose `code` is a PostgreSQL code such as `"23505"`.

## Retry safely

`isRetryable` says a failed call can be repeated without the risk that it runs twice. Retry on it only around the call that failed, not around a larger operation that contains it:

```ts
import { attemptAsync, type Result } from "@codenhub/error";

export async function withRetry<T>(call: () => Promise<T>, attempts = 3): Promise<Result<T>> {
  for (let attempt = 1; ; attempt += 1) {
    const result = await attemptAsync(call);

    if (result.ok || !result.error.isRetryable || attempt === attempts) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
}

const users = await withRetry(() => db.query("select * from users"));
```

Wrap the single database query or the single `fetch`, not a `publish()` function that uploads a file and then saves a record. If the save fails with a retryable `ECONNREFUSED`, repeating `publish()` uploads the file a second time. [The AppError](app-error.md#isretryable) explains why the flag is this strict.

## Translate messages

Every preset mapping, and any mapping you register with one, carries a `messageKey`. Look the key up in your catalog and fall back to the English message when the catalog has no entry:

```ts
import type { AppError } from "@codenhub/error";

export function errorText(error: AppError, translate: (key: string) => string | undefined): string {
  return (error.messageKey === null ? undefined : translate(error.messageKey)) ?? error.message;
}
```

The keys are stable across releases, and each always carries the same message. [Presets](presets.md) lists every built-in key. To build a catalog in code, read them from the raw mappings:

```ts
import { browserErrorNames, browserErrorPatterns } from "@codenhub/error/registries/browser";

const browserKeys = new Set([...Object.values(browserErrorNames).map((feedback) => feedback.messageKey), ...browserErrorPatterns.map(([, feedback]) => feedback.messageKey)]);
```

ErrorKit does not ship translations.

## Report to an error tracker

Report what nobody described yet, plus the failures you have described that are still bugs:

```ts
import type { AppError } from "@codenhub/error";

// Failures only a developer can fix. The presets give them all one shared message.
const BUG_CODES = new Set(["42P01", "42703", "unexpected_failure", "InvalidStateError"]);

export function shouldReport(error: AppError): boolean {
  return error.type === "unknown" || (error.code !== null && BUG_CODES.has(error.code));
}

if (shouldReport(error)) {
  errorTracker.captureException(error.originalError, { tags: { source: error.source ?? "none" } });
}
```

Report `originalError`, not the `AppError`: the original carries the real message and stack. Most trackers also follow an error's `cause`, and an `AppError`'s `cause` is the same original value, so reporting the `AppError` itself works too.

Do not report on `type === "heuristic"` alone. A heuristic match is usually a network failure on the reader's side, which is not something you can fix.

## Ignore cancelled requests

Cancelling a request with an `AbortController` makes it fail with an `AbortError`, which the browser preset turns into "The request was cancelled before it finished." When your own code cancelled it, as an effect cleanup or a newer search replacing an older one does, nobody should see that:

```ts
const result = await attemptAsync(() => fetch(url, { signal }));

if (!result.ok && signal.aborted) {
  return; // We cancelled it ourselves.
}
```

Checking `signal.aborted` works with or without the browser preset, and it does not hide an abort that came from somewhere else.

## Set up errors in tests

The global registry is shared by every test in the same file. Replace it in a setup hook so each test starts from the same mappings:

```ts
import { createErrorRegistry, setErrorRegistry } from "@codenhub/error";
import { supabaseErrorRegistry } from "@codenhub/error/registries/supabase";
import { beforeEach } from "vitest";

beforeEach(() => {
  setErrorRegistry(createErrorRegistry([supabaseErrorRegistry]));
});
```

Assert on `code`, `messageKey`, or `type` rather than on `message`. Messages are written for people and get reworded; codes and keys are the stable part.
