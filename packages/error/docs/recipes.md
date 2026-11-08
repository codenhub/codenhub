---
title: Recipes
description: Worked examples for fetch and HTTP status codes, Supabase calls, your own error codes, safe retries, translations, error reporting, and tests.
order: 7
---

# Recipes

Each recipe here solves one problem from start to finish, using the pieces from the earlier pages. They are the questions that come up in the first week of using ErrorKit, usually in this order. Copy the parts you need; none of them depends on another.

## Classify HTTP responses

`fetch` rejects only when no response arrived. A response with status `404` or `500` resolves normally: the server answered, and `fetch` considers its job done. So `createAppError(response)` has nothing to recognize and returns an `"unknown"` error. Status codes need a mapping of their own.

Pass the status as the `code` and classify it against the HTTP preset. Keep that preset out of the global registry: status codes are short numbers that could collide with other services' codes, and they only mean something for responses.

```ts
import { attemptAsync, err, type Result } from "@codenhub/error";
import { httpErrorRegistry } from "@codenhub/error/registries/http";

export async function getJson<T>(url: string): Promise<Result<T>> {
  const sent = await attemptAsync(() => fetch(url));

  if (!sent.ok) {
    return sent; // The request never completed; the global registry classified it.
  }

  const response = sent.value;

  if (!response.ok) {
    return err({ code: response.status }, { registry: httpErrorRegistry });
  }

  return attemptAsync(() => response.json() as Promise<T>);
}
```

No response can mean a network failure, a CORS block, or an abort, and in each of those the request may still have reached the server. Every response that did arrive resolves, so the status check is yours.

The body is left out on purpose: it ends up on `originalError`, and from there in your error tracker, so add it as `body` only when it is safe to log. Never pass it as `cause`: `createAppError` looks inside `cause`, and a `code` in the body could then win over the status. A status the preset does not map, such as `418`, resolves to the fallback message. [Presets](presets.md#http) lists what it maps. To word a status for one endpoint, such as a `401` from a sign-in form, build a registry from the preset and add your own: `createErrorRegistry([httpErrorRegistry])`, then `.codes.add("401", …)`.

When the server is your own and sends `{ error: error.toJSON() }`, rebuild its error instead: `appErrorFromJSON(body.error)`. When the whole body is the serialized error, pass `appErrorFromJSON(body)`. See [The AppError](app-error.md#sending-an-error-across-a-boundary).

Pick one of the two per endpoint, not both. `appErrorFromJSON` cannot tell you whether it recognized the shape: a value it does not recognize is classified as raw input and lands on `originalError` as it is, which is the very thing the status-only call above keeps out of your tracker. Use `appErrorFromJSON` for endpoints that always send a serialized error, and the status for everything else.

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

## Raise your own errors

An error you raise with a code is only as good as its registration. `err({ code: "project.name_mising" })`, with a typo or a mapping nobody added, is an `"unknown"` error whose `code` is `null`, and a check for `error.code === "project.name_missing"` never fires. Nothing warns you, and a one-letter typo sails straight through code review.

Keep your codes and their feedback in one object, register it from there, and raise errors through a function that only accepts its keys. A typo is then a type error, and every code you can raise is registered:

```ts
// src/project-errors.ts
import { err, type ErrorFeedback } from "@codenhub/error";

export const projectErrors = {
  "project.name_missing": { messageKey: "error.project.nameMissing", message: "Give the project a name, then save again.", source: "my-app.projects" },
  "project.not_found": { messageKey: "error.project.notFound", message: "We couldn't find that project.", source: "my-app.projects" },
} satisfies Record<string, ErrorFeedback>;

export type ProjectErrorCode = keyof typeof projectErrors;

export const projectError = (code: ProjectErrorCode, details?: Record<string, unknown>) => err({ code }, { details });
```

Register the object in the `setUpErrors` function from [Getting started](getting-started.md#2-create-one-module-that-configures-errors), with `registry.codes.addList(Object.entries(projectErrors))`. Then `projectError("project.name_missing", { field: "name" })` reads like what it is, and `error.code` can be compared with a `ProjectErrorCode`.

When codes are registered in more than one place, check them in a test instead; see [Set up errors in tests](#set-up-errors-in-tests).

## Retry safely

`isRetryable` says a failed call can be repeated without the risk that it runs twice. Retry on it only around the call that failed, not around a larger operation that contains it:

```ts
import { attemptAsync, type Result } from "@codenhub/error";

export async function withRetry<T>(call: () => Promise<T>, attempts = 3): Promise<Result<T>> {
  for (let attempt = 1; ; attempt += 1) {
    const result = await attemptAsync(call);

    if (result.ok || !result.error.isRetryable || attempt >= attempts) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
}

const users = await withRetry(() => db.query("select * from users"));
```

Wrap the single database query or the single `fetch`, not a `publish()` function that uploads a file and then saves a record. If the save fails with a retryable `ECONNREFUSED`, repeating `publish()` uploads the file a second time. [The AppError](app-error.md#isretryable) explains why the flag is this strict.

The loop waits 500 ms, then 1 s, between attempts. Add jitter if many clients can fail at the same moment, so they do not all come back at the same moment too.

## Translate messages

Every preset mapping, and any mapping you register with one, carries a `messageKey`. Look the key up in your catalog and fall back to the English message when the catalog has no entry:

```ts
import type { AppError } from "@codenhub/error";

export function errorText(error: AppError, translate: (key: string) => string | undefined): string {
  return (error.messageKey === null ? undefined : translate(error.messageKey)) ?? error.message;
}
```

The keys are stable across releases, and each keeps its meaning even when its English wording changes. [Presets](presets.md) lists every built-in key. To build a catalog in code, read them from the raw mappings:

```ts
import { browserErrorNames, browserErrorPatterns } from "@codenhub/error/registries/browser";

const browserKeys = new Set([...Object.values(browserErrorNames).map((feedback) => feedback.messageKey), ...browserErrorPatterns.map(([, feedback]) => feedback.messageKey)]);
```

An `"unknown"` error has no key: nothing matched, so nothing named it. Translate it through the message you pass in, so the most common failure is not the one left in English:

```ts
import { createAppError, DEFAULT_APP_ERROR_MESSAGE } from "@codenhub/error";

const error = createAppError(caught, { fallbackMessage: translate("error.unexpected") || DEFAULT_APP_ERROR_MESSAGE });
```

That covers only `"unknown"` errors. A mapping you registered without a `messageKey` already has a message, so `fallbackMessage` leaves it in English. Give every mapping you register a key.

ErrorKit does not ship translations. The keys are the contract; the words are yours.

## Report to an error tracker

Report what nobody described yet, plus the failures you have described that are still bugs:

```ts
import type { AppError } from "@codenhub/error";

// Failures only a developer can fix. The keys name the preset, so another service's "500" does not count.
const BUG_KEYS = new Set(["error.supabase.database.undefinedTable", "error.supabase.database.undefinedColumn", "error.supabase.auth.unexpectedFailure", "error.browser.invalidState", "error.http.serverError"]);

export function shouldReport(error: AppError): boolean {
  return error.type === "unknown" || (error.messageKey !== null && BUG_KEYS.has(error.messageKey));
}

if (shouldReport(error)) {
  errorTracker.captureException(error.originalError, { tags: { source: error.source ?? "none" } });
}
```

Report `originalError`, not the `AppError`: the original carries the real message and stack. Most trackers also follow an error's `cause`, and an `AppError`'s `cause` is the same original value, so reporting the `AppError` itself works too. The one exception is the [HTTP recipe](#classify-http-responses): its `originalError` is a plain `{ code }` object with no stack.

Do not report on `type === "heuristic"` alone. A heuristic match is usually a network failure on the reader's side, and no deploy of yours is going to fix their train going into a tunnel.

## Ignore cancelled requests

Cancelling a request with an `AbortController` makes it fail with an `AbortError`, which the browser preset turns into "The request was cancelled before it finished." When your own code cancelled it, as an effect cleanup or a newer search replacing an older one does, nobody should see that:

```ts
const result = await attemptAsync(() => fetch(url, { signal }));

if (!result.ok && signal.aborted) {
  return; // We cancelled it ourselves.
}
```

Here `signal` must come from an `AbortController` this code owns. Checking `signal.aborted` then works with or without the browser preset, and it does not hide an abort that came from somewhere else.

## Set up errors in tests

The global registry is shared by every test in the same file. Replace it in a setup hook so each test starts from the same mappings, then run your setup again on the fresh one:

```ts
import { createErrorRegistry, setErrorRegistry } from "@codenhub/error";
import { beforeEach } from "vitest";

import { setUpErrors } from "../src/errors";

beforeEach(() => {
  setErrorRegistry(createErrorRegistry());
  setUpErrors();
});
```

The second line is the one people forget. A new registry starts empty, so without it every code your application registers resolves to `"unknown"`, and tests that pass in the browser fail in the test runner for no visible reason. If your `setUpErrors` takes a runtime preset, pass the one for where your tests run.

Assert on `code`, `messageKey`, or `type` rather than on `message`. Messages are written for people and get reworded; codes and keys are the stable part. A test that breaks because someone fixed a comma is a test people learn to ignore.

To catch a code your application raises but never registered, check each one against the registry your setup builds. With the hook above in place, the codes from [Raise your own errors](#raise-your-own-errors) are one `Object.keys` away:

```ts
import { getErrorRegistry } from "@codenhub/error";
import { expect, it } from "vitest";

import { projectErrors } from "../src/project-errors";

it.each(Object.keys(projectErrors))("registers %s", (code) => {
  expect(getErrorRegistry().codes.get(code)).toBeDefined();
});
```

This checks every code in `projectErrors`. A code raised without `projectError`, such as a hand-written `err({ code })`, is outside both the type and this test, so raise every project error through it.

## Next

The recipes cover the common paths. [Caveats and limitations](caveats.md) covers the uncommon ones: each surprise the package can cause, why it works that way, and what to do instead. Read it once now, and it will save you a debugging session later.
