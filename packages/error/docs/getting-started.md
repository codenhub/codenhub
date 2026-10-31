---
title: Getting started
description: Set up a registry for a real application, normalize failures where they enter, and show the result.
order: 1
---

# Getting started

This page builds the error handling for a small web application that signs people in with Supabase and calls its own API with `fetch`. By the end, every failure the application catches turns into a message a person can act on, and every failure nobody planned for still reaches your logs intact.

## 1. Install the package

```sh
pnpm add @codenhub/error
```

## 2. Create one module that configures errors

Put all registry setup in one module and import it once, before anything else runs. The registry is ordinary module state: whatever you register is visible to every later `createAppError` call in the same JavaScript runtime.

```ts
// src/errors.ts
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";
import { supabaseErrorRegistry } from "@codenhub/error/registries/supabase";

const registry = getErrorRegistry();

// 1. Presets first: they describe failures that come from the platform and from Supabase.
registry.merge(browserErrorRegistry);
registry.merge(supabaseErrorRegistry);

// 2. Your own mappings last, so they win wherever they overlap with a preset.
registry.codes.addList([
  [
    "cart.out_of_stock",
    {
      message: "One of the items in your cart just sold out. Review your cart, then check out again.",
      messageKey: "error.cart.outOfStock",
      source: "my-app.cart",
    },
  ],
  [
    "23505",
    {
      message: "That name is already taken. Choose a different one.",
      messageKey: "error.project.nameTaken",
      source: "my-app.projects",
    },
  ],
]);
```

```ts
// src/main.ts
import "./errors";
// …the rest of your application
```

Order matters. When two mappings use the same identifier, the one added last replaces the other, so the `23505` mapping above replaces the generic "unique violation" message the Supabase preset ships with something specific to this application.

Pick presets for where the code runs: the browser preset for code in a browser, the Node.js preset for code on a server, and the Supabase preset wherever you call Supabase. [Presets](presets.md) lists exactly what each one covers.

## 3. Normalize where failures enter your code

Call `createAppError` at the boundary where a failure reaches code that has to decide what to do with it, usually an event handler, a route handler, or a data loader:

```ts
import { createAppError } from "@codenhub/error";

async function onSubmit(form: FormData) {
  try {
    await saveProject(form);
    showToast("Project saved.");
  } catch (caught) {
    const error = createAppError(caught);

    showToast(error.message);
    reportIfUnexpected(error);
  }
}
```

You do not need to unwrap anything first. `createAppError` looks inside the value for wrapped errors, in `cause`, `originalError`, `error`, `err`, `inner`, `innerError`, and the first ten entries of an `errors` list, so a `23505` buried two `cause`s deep still resolves to "That name is already taken."

## 4. Decide what to show

Every `AppError` has a `message`, and it is always safe to show:

- When a mapping matched, it is the message you or the preset registered.
- When nothing matched, it is `"An unexpected error occurred."`, never the raw text of the failure. Raw messages often contain table names, stack details, or user data, so ErrorKit refuses to surface them.

You can replace that generic text where you know more about the context:

```ts
const error = createAppError(caught, {
  fallbackMessage: "We couldn't save your project. Try again in a moment.",
});
```

## 5. Decide what to report

`error.type` says how the error was matched:

| `type`        | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `"known"`     | A code, name, exact message, or message prefix matched.                     |
| `"heuristic"` | Only a regular expression matched, such as the browser's "Failed to fetch". |
| `"unknown"`   | Nothing matched. The message is the fallback.                               |

An `"unknown"` error is the one you most want in your error tracker, because it is a failure nobody described yet. The raw value is on `error.originalError`, and also on `error.cause`, which most error trackers already follow:

```ts
import type { AppError } from "@codenhub/error";

function reportIfUnexpected(error: AppError) {
  if (error.type === "unknown") {
    errorTracker.captureException(error.originalError);
  }
}
```

`type` says how the error matched, not how serious it is. A missing database table is `"known"` once its code is registered, and it is still a bug. [Recipes](recipes.md#report-to-an-error-tracker) shows how to report those too.

## Where to go next

- [The AppError](app-error.md) explains every field, including `code` for branching and `isRetryable` for retries.
- [Registries](registries.md) explains which match wins when several could.
- [Recipes](recipes.md) covers `fetch` status codes, Supabase calls, retries, and translations.
