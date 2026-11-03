---
title: Recipes
description: Worked examples for fetch and HTTP status codes, Supabase calls, your own error codes, safe retries, translations, error reporting, and tests.
order: 7
---

# Recipes

Each recipe here solves one problem from start to finish. Copy the parts you need; none of them depends on another.

## Classify HTTP responses

`fetch` only rejects when the request could not be made at all. A response with status `404` or `500` resolves normally, so `createAppError(response)` has nothing to recognize and returns an `"unknown"` error. Status codes need a mapping of their own.

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
    const body: unknown = await response.json().catch(() => null);
    return err({ code: response.status, cause: body }, { registry: httpErrorRegistry });
  }

  return attemptAsync(() => response.json() as Promise<T>);
}
```

Passing the body as `cause` keeps it on `originalError` for your logs. A status the preset does not map, such as `418`, resolves to the fallback message. [Presets](presets.md#http) lists what it maps. To word a status for one endpoint, such as a `401` from a sign-in form, build a registry from the preset and add your own: `createErrorRegistry([httpErrorRegistry])`, then `.codes.add("401", …)`.

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

## Raise your own errors

An error you raise with a code is only as good as its registration: `err({ code: "project.name_mising" })`, with a typo or a mapping nobody added, is an `"unknown"` error whose `code` is `null`, and a check for `error.code === "project.name_missing"` never fires. Nothing warns you.

Keep your codes and their feedback in one object, register it from there, and raise errors through a function that only accepts its keys. A typo is then a type error, and every code you can raise is registered:

```ts
import { err, getErrorRegistry, type ErrorFeedback } from "@codenhub/error";

export const projectErrors = {
  "project.name_missing": { message: "Give the project a name, then save again.", source: "my-app.projects" },
  "project.not_found": { message: "We couldn't find that project.", source: "my-app.projects" },
} satisfies Record<string, ErrorFeedback>;

export type ProjectErrorCode = keyof typeof projectErrors;

getErrorRegistry().codes.addList(Object.entries(projectErrors));

export const projectError = (code: ProjectErrorCode, details?: Record<string, unknown>) => err({ code }, { details });
```

Then `projectError("project.name_missing", { field: "name" })` reads like what it is, and `error.code` can be compared with a `ProjectErrorCode`.

When codes are registered in more than one place, check them in a test instead; see [Set up errors in tests](#set-up-errors-in-tests).

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

To catch a code your application raises but never registered, list them and check each one against the registry your application builds at startup:

```ts
import { getErrorRegistry } from "@codenhub/error";
import { expect, it } from "vitest";

import { RAISED_CODES } from "../src/errors";
import { setUpErrors } from "../src/setup-errors";

it.each(RAISED_CODES)("registers %s", (code) => {
  setUpErrors();
  expect(getErrorRegistry().codes.get(code)).toBeDefined();
});
```
