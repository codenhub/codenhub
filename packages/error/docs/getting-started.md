---
title: Getting started
description: Set up a registry for a real application, normalize failures where they enter, and decide what to show and what to report.
order: 1
---

# Getting started

This page builds the error handling for the project tracker from the [overview](index.md): a web application where people sign in with Supabase, create projects, and call the app's own API with `fetch`. By the end, every failure the application catches turns into a message a person can act on, and every failure nobody planned for still reaches your logs intact.

It takes five steps, and only one of them involves writing actual messages.

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
    "project.limit_reached",
    {
      message: "You've reached the project limit on your plan. Archive a project, then try again.",
      messageKey: "error.project.limitReached",
      source: "my-app.projects",
    },
  ],
  [
    "23505",
    {
      message: "You already have a project with that name. Choose a different one.",
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

Order matters here. When two mappings use the same identifier, the one added last replaces the other. That is why the `23505` mapping above comes after the Supabase preset: the preset's message for that code is a generic one about a duplicate value, since the preset cannot know which value collided, and in this application the only unique value people can collide on is a project name, so ours says so.

Pick presets for where the code runs:

- The browser preset for code that runs in a browser.
- The Node.js preset for code that runs on a server.
- The Supabase preset wherever you call Supabase.

[Presets](presets.md) lists exactly what each one covers. Merging all of them "just in case" is how a browser message about checking your Wi-Fi ends up in a server log, so pick on purpose.

## 3. Normalize where failures enter your code

Call `createAppError` at the boundary where a failure reaches code that has to decide what to do about it. That is usually an event handler, a route handler, or a data loader:

```ts
import { createAppError } from "@codenhub/error";

async function onSubmit(form: FormData) {
  try {
    await createProject(form);
    showToast("Project created.");
  } catch (caught) {
    const error = createAppError(caught);

    showToast(error.message);
    reportIfUnexpected(error);
  }
}
```

You do not need to unwrap anything first. `createAppError` looks inside the value for wrapped errors in `cause`, `originalError`, `error`, `err`, `inner`, `innerError`, and the first ten entries of an `errors` list. A `23505` buried two `cause`s deep still resolves to "You already have a project with that name."

## 4. Decide what to show

Every `AppError` has a `message`, and that message is always safe to show:

- When a mapping matched, it is the message you or the preset registered.
- When nothing matched, it is `"An unexpected error occurred."`, never the raw text of the failure.

That second rule is deliberate. Raw messages are written for developers, and they often contain table names, file paths, stack details, or somebody else's data. ErrorKit only shows text that someone registered on purpose.

Where you know more about the context than "something failed", replace the generic text:

```ts
const error = createAppError(caught, {
  fallbackMessage: "We couldn't create your project. Try again in a moment.",
});
```

## 5. Decide what to report

`error.type` says how the error was matched:

| `type`        | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `"known"`     | A code, name, exact message, or message prefix matched.                     |
| `"heuristic"` | Only a regular expression matched, such as the browser's "Failed to fetch". |
| `"unknown"`   | Nothing matched. The message is the fallback.                               |

An `"unknown"` error is the one you most want in your error tracker, because it is a failure nobody has described yet. The raw value is on `error.originalError`, and also on `error.cause`, which most error trackers already follow:

```ts
import type { AppError } from "@codenhub/error";

function reportIfUnexpected(error: AppError) {
  if (error.type === "unknown") {
    errorTracker.captureException(error.originalError);
  }
}
```

One thing to keep in mind: `type` says how the error matched, not how serious it is. A missing database table is `"known"` once its code is registered, and it is still very much a bug. [Recipes](recipes.md#report-to-an-error-tracker) shows how to report those too.

## Next

You now have the whole loop: describe, normalize, show, report. The next page, [The AppError](app-error.md), goes through every field you just used, including `code` for branching on a specific failure and `isRetryable` for deciding when a retry is safe.
