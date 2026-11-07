---
title: Error boundaries
description: Show a normalized AppError when a React or Svelte component fails to render, and report it once.
order: 6
---

# Error boundaries

When a component throws while rendering, React and Svelte replace the broken part of the page with a fallback you write. The value they hand that fallback is whatever was thrown, so a fallback that shows `error.message` leaks raw text to the reader. This page covers the two adapters that fix that: they normalize the caught value into an `AppError` first, so the fallback shows a message that is safe to show, and your error tracker still gets the original value.

They use the same registry and options as `createAppError`, so nothing new to configure.

Each adapter is its own entrypoint. The framework is an optional peer dependency: install the package next to the framework you already use, and nothing else comes along.

| Import path              | What it holds                                     | Needs               |
| ------------------------ | ------------------------------------------------- | ------------------- |
| `@codenhub/error/react`  | The `AppErrorBoundary` component                  | React 18 or newer   |
| `@codenhub/error/svelte` | `createAppErrorBoundary`, for `<svelte:boundary>` | Svelte 5.3 or newer |

## React

`AppErrorBoundary` is an error boundary component. It renders its children until one of them throws, then renders `fallback` with the normalized error and a `reset` function. Here it guards the project tracker's project page:

```tsx
import { AppErrorBoundary } from "@codenhub/error/react";

export function ProjectPage({ id }: { id: string }) {
  return (
    <AppErrorBoundary
      fallback={({ error, reset }) => (
        <div role="alert">
          <p>{error.message}</p>
          {error.isRetryable && <button onClick={reset}>Try again</button>}
        </div>
      )}
      onError={(error, info) => tracker.captureException(error.originalError, { extra: info })}
      resetKeys={[id]}
    >
      <Project id={id} />
    </AppErrorBoundary>
  );
}
```

| Prop        | What it does                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| `fallback`  | Required. Renders in place of the children with `{ error, reset }`.                                             |
| `onError`   | Called once per caught error, after the fallback renders, with the same `AppError` and React's error info.      |
| `options`   | Normalization options, as for `createAppError`: `registry`, `fallbackMessage`, and the rest.                    |
| `resetKeys` | Values that reset the boundary when one of them changes, compared with `Object.is`, such as the route or an id. |
| `onReset`   | Called when the boundary resets, through `reset` or a change of `resetKeys`.                                    |

The prop types are exported as `AppErrorBoundaryProps`, and the object `fallback` receives as `AppErrorBoundaryFallbackProps`, for when you wrap the boundary in a component of your own.

A few details worth knowing:

- **`reset` renders the children again.** If whatever made them throw has not changed, they throw again and the fallback comes right back. Reset after the state that caused the failure changes, or let `resetKeys` do it when the reader navigates. In the example above, opening another project resets the boundary.
- **The fallback and `onError` get the same `AppError` instance,** so what the reader sees and what you report always agree.
- **Thrown `null` or `undefined` counts as an error too.** Throwing them is legal JavaScript, if not a good idea, and the boundary still shows the fallback with the generic message.
- **Invalid `options` throw while the boundary renders,** to the next boundary up. It is a programming mistake, so it fails loudly instead of quietly rendering a broken fallback.

## Svelte

Svelte 5 has `<svelte:boundary>` built in. `createAppErrorBoundary` returns the two pieces it needs: an `onerror` handler, and a `toAppError` function for the `failed` snippet.

```svelte
<script>
  import { createAppErrorBoundary } from "@codenhub/error/svelte";

  const boundary = createAppErrorBoundary({
    options: { fallbackMessage: "This project failed to load." },
    onError: (error) => tracker.captureException(error.originalError),
  });
</script>

<svelte:boundary onerror={boundary.onerror}>
  <Project />

  {#snippet failed(error, reset)}
    <div role="alert">
      <p>{boundary.toAppError(error).message}</p>
      <button onclick={reset}>Try again</button>
    </div>
  {/snippet}
</svelte:boundary>
```

`createAppErrorBoundary` takes an `AppErrorBoundaryConfig` and returns `AppErrorBoundaryHandlers`:

- **`options`** are the normalization options, as for `createAppError`. They are validated when you call `createAppErrorBoundary`, not when the first error arrives, so a typo fails while the component is set up rather than in the middle of an outage.
- **`onError`** receives the `AppError` and the boundary's `reset`, once per caught error. Passing something that is not a function throws `TypeError` right away.
- **`toAppError`** returns the same `AppError` instance for the error `onerror` saw, so the snippet and the reporter agree.

Create one set of handlers per boundary: each one remembers the last error it normalized. The helper does not import Svelte; it only follows the shape the boundary calls.

## What a boundary does not catch

Both frameworks catch errors thrown while rendering and, in Svelte, while running effects. Neither catches an error thrown in an event handler, a `setTimeout`, or a promise nobody awaited during rendering, and React's boundaries do not run during server rendering. Handle those where they happen, with `attempt` or `attemptAsync`:

```ts
import { attemptAsync } from "@codenhub/error";

async function save() {
  const result = await attemptAsync(() => api.saveProject(draft));

  if (!result.ok) {
    showToast(result.error.message);
  }
}
```

For a whole-page failure in a framework with its own error page, such as a SvelteKit `+error.svelte` or a Next.js `error.tsx`, call `createAppError` on the error that page receives.

## Next

That covers every piece of the package. [Recipes](recipes.md) puts them together into complete solutions for problems you will meet sooner or later: HTTP statuses, Supabase calls, retries, translations, error reporting, and tests.
