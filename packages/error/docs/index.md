---
title: Overview
description: What ErrorKit is for, the idea it is built on, a five-minute tour, and the order to read the rest of the docs in.
---

# Turn whatever you caught into an error you can use

`@codenhub/error` (ErrorKit) takes whatever value your code caught and gives you back one predictable `AppError`. That error has a message you can show a person, a key you can translate, a code you can branch on, and a flag that says whether repeating the call is safe. The original value stays attached for your logs.

## The problem

In TypeScript, a `catch` block hands you `unknown`, which is the type system's polite way of saying "good luck". In practice that value can be anything:

- A failed `fetch` is a `TypeError`, and its message depends on which browser you ask.
- A Supabase call returns an object with a `code` such as `"invalid_credentials"`.
- A database driver throws an error whose `code` is `"23505"`, which is PostgreSQL for "that value is already taken".
- A library wraps the real failure three levels deep in `cause`.
- And somewhere, somebody throws a plain string. They had their reasons.

So every place that catches an error ends up with its own little translator, and over time those translators drift apart. One screen shows a customer `duplicate key value violates unique constraint "projects_name_key"`, so now they know your table names and still have no idea what to do. Another screen shows "Something went wrong" for a failure that could have said exactly how to fix it.

## The idea

ErrorKit splits the job in two:

1. **A registry describes the failures you know about.** You fill it once, when the application starts. Each entry maps something that identifies a failure (a code, an error name, an exact message, a message prefix, or a regular expression) to the feedback you want people to see.
2. **`createAppError` normalizes anything** against that registry. It looks through the value and the errors wrapped inside it, picks the best match, and returns an `AppError`. When nothing matches, you still get an `AppError`, with a safe generic message, so the raw text of an unexpected failure never reaches the screen.

Ready-made registries, called presets, cover common browser, Node.js, HTTP, and Supabase failures. They are opt-in: importing one changes nothing until you merge it.

On top of that sit the result helpers (`ok`, `err`, `attempt`, `attemptAsync`, and friends), for code that would rather return a failure than throw it.

## Installation

```sh
pnpm add @codenhub/error
```

The package is ESM and has no runtime dependencies. It has eight entrypoints, so you import only what you use:

| Import path                           | What it holds                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `@codenhub/error`                     | `createAppError`, the registry functions, and the result helpers                  |
| `@codenhub/error/registries/browser`  | The browser and Web API preset                                                    |
| `@codenhub/error/registries/node`     | The Node.js network preset                                                        |
| `@codenhub/error/registries/http`     | The HTTP response status preset                                                   |
| `@codenhub/error/registries/supabase` | The Supabase preset                                                               |
| `@codenhub/error/registries`          | All four presets from one import                                                  |
| `@codenhub/error/react`               | `AppErrorBoundary`, a React error boundary; see [Error boundaries](frameworks.md) |
| `@codenhub/error/svelte`              | `createAppErrorBoundary`, for a Svelte `<svelte:boundary>`                        |

## A five-minute tour

The examples in these docs all belong to one small application: a project tracker where people sign in with Supabase, create projects, and the browser calls the app's own API with `fetch`. Each page adds a piece to it.

First, describe the failures you know about, once, at startup:

```ts
// src/errors.ts, imported once when the application starts
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

const registry = getErrorRegistry();

registry.merge(browserErrorRegistry);
registry.codes.add("project.limit_reached", {
  message: "You've reached the project limit on your plan. Archive a project, then try again.",
  messageKey: "error.project.limitReached",
  source: "my-app.projects",
});
```

Then normalize wherever a failure enters your code:

```ts
import { createAppError } from "@codenhub/error";

try {
  await createProject(draft);
} catch (caught) {
  const error = createAppError(caught);

  showToast(error.message); // Safe to show: it came from the registry or the fallback.
  console.error(error.originalError); // The raw value, for you, not for the reader.
}
```

Here is what the toast says in each case:

- `createProject` threw `{ code: "project.limit_reached" }`: the toast explains the plan limit.
- The network dropped: the browser preset recognizes the failed `fetch` and says so.
- Something nobody planned for: the toast says `"An unexpected error occurred."`, and your log still has the whole story.

If you prefer returning failures to throwing them, the same normalization powers the result helpers:

```ts
import { attemptAsync } from "@codenhub/error";

const result = await attemptAsync(() => createProject(draft));

if (!result.ok) {
  showToast(result.error.message);
}
```

## Requirements

- Node.js 24 or newer, or an ES2022-compatible browser, worker, or edge runtime.
- Native `Error` `cause` support, which every runtime above has.
- ESM. CommonJS code can load the package with `require()` on runtimes that support requiring ES modules, such as Node.js 24.
- For the adapters only: React 18 or newer for `@codenhub/error/react`, and Svelte 5.3 or newer for `@codenhub/error/svelte`. Both are optional peer dependencies, so the rest of the package installs without them.

The package never touches browser or Node.js globals, so it runs the same in a browser, on a server, during server-side rendering, in a worker, or on an edge runtime. Importing a preset contacts no service and needs no other package.

## What it does not do

ErrorKit decides what a failure means. What happens next is up to you:

- **It does not report errors.** It gives you the fields to decide which ones are worth reporting, and keeps the raw value for your error tracker; see [Recipes](recipes.md#report-to-an-error-tracker).
- **It does not retry.** `isRetryable` says when a retry is safe, and [Recipes](recipes.md#retry-safely) shows a small loop that uses it.
- **It does not ship translations.** Every preset message has a stable translation key for your own catalog; see [Recipes](recipes.md#translate-messages).
- **It does not read HTTP statuses on its own.** `fetch` resolves on a `404`, so you pass the status in; see [Recipes](recipes.md#classify-http-responses).

[Caveats and limitations](caveats.md) covers the rest of the surprises.

## Reading path

Read these in order the first time; each page builds on the ones before it.

1. [Getting started](getting-started.md): set up the registry for the project tracker, normalize failures where they enter, and decide what to show and what to report.
2. [The AppError](app-error.md): every field and what it promises, what happens when an error is normalized twice, and how to send one from a server to a client.
3. [Registries](registries.md): the five ways a failure is recognized, which match wins, and when a registry of your own beats the global one.
4. [Presets](presets.md): every failure the browser, Node.js, HTTP, and Supabase presets recognize, with its translation key and retry flag.
5. [Results](results.md): return failures instead of throwing them, with `Result`, `attempt`, and the helpers that chain them.
6. [Error boundaries](frameworks.md): show a safe message when a React or Svelte component fails to render, and report it once.
7. [Recipes](recipes.md): complete solutions for HTTP statuses, Supabase calls, your own error codes, retries, translations, error reporting, and tests.
8. [Caveats and limitations](caveats.md): everything that surprises people, why it works that way, and what to do instead.

The [API reference](reference/index.md) lists every export with its signature, generated from the source. It is the place to look something up, not the place to start.
