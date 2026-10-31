---
title: Overview
description: Why ErrorKit exists, the idea it is built on, a five-minute tour, and where to go next.
---

# Turn whatever you caught into an error you can use

`@codenhub/error` (ErrorKit) takes the value your code caught, whatever it is, and gives you back one predictable `AppError`: a message you can show a person, a key you can translate, a code you can branch on, a flag that says whether repeating the call is safe, and the original value kept aside for your logs.

## The problem

In TypeScript, a `catch` hands you `unknown`, and in practice that value is anything at all. A failed `fetch` is a `TypeError` whose message depends on the browser. A Supabase call returns an object with a `code` like `"invalid_credentials"`. A database driver throws an error whose `code` is `"23505"`. A library wraps the real failure three levels deep in `cause`. Somebody somewhere throws a plain string.

Each place that catches one of these ends up writing its own little translator, and they drift apart: one screen shows `"duplicate key value violates unique constraint"` to a customer, another shows `"Something went wrong"` for an error that could have said exactly what to do.

## The idea

ErrorKit splits the job in two:

1. **A registry describes the failures you know about**, once, when the application starts. Each entry maps something that identifies a failure (a code, an error name, an exact message, a message prefix, or a regular expression) to the feedback you want people to see.
2. **`createAppError` normalizes anything** against that registry. It looks through the value and the errors wrapped inside it, picks the best match, and returns an `AppError`. When nothing matches, it returns an `AppError` too, with a safe generic message, so the raw text of an unknown failure never reaches the screen.

Ready-made registries, called presets, cover common browser, Node.js, and Supabase failures. They are opt-in: importing one changes nothing until you merge it.

On top of that sit result helpers (`ok`, `err`, `attempt`, `attemptAsync`, and friends), for code that prefers returning failures over throwing them.

## Installation

```sh
pnpm add @codenhub/error
```

The package is ESM and has no runtime dependencies. It has five entrypoints:

| Import path                           | What it holds                                                |
| ------------------------------------- | ------------------------------------------------------------ |
| `@codenhub/error`                     | `createAppError`, the registry functions, the result helpers |
| `@codenhub/error/registries/browser`  | The browser and Web API preset                               |
| `@codenhub/error/registries/node`     | The Node.js network preset                                   |
| `@codenhub/error/registries/supabase` | The Supabase preset                                          |
| `@codenhub/error/registries`          | All three presets from one import                            |

## A five-minute tour

Describe the failures you know about once, when the application starts:

```ts
// errors.ts, imported once at startup
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

const registry = getErrorRegistry();

registry.merge(browserErrorRegistry);
registry.codes.add("cart.out_of_stock", {
  message: "One of the items in your cart just sold out. Review your cart, then check out again.",
  messageKey: "error.cart.outOfStock",
  source: "my-app.cart",
});
```

Then normalize wherever a failure enters your code:

```ts
import { createAppError } from "@codenhub/error";

try {
  await checkout(cart);
} catch (caught) {
  const error = createAppError(caught);

  showToast(error.message); // Safe to show: it came from the registry or the fallback.
  console.error(error.originalError); // The raw value, for you, not for the reader.
}
```

If `checkout` threw `{ code: "cart.out_of_stock" }`, the toast says the item sold out. If the network dropped, the browser preset recognizes the failed `fetch` and says so. If it was something nobody planned for, the toast says `"An unexpected error occurred."` and the log still has the whole story.

Prefer to return failures instead of throwing them? The same normalization powers the result helpers:

```ts
import { attemptAsync } from "@codenhub/error";

const result = await attemptAsync(() => checkout(cart));

if (!result.ok) {
  showToast(result.error.message);
}
```

## Requirements

- Node.js 24 or newer, or an ES2022-compatible browser, worker, or edge runtime.
- Native `Error` `cause` support, which every runtime above has.
- ESM. CommonJS code can load the package with `require()` on runtimes that support requiring ES modules, such as Node.js 24.

The package never touches browser or Node.js globals, so it runs the same in a browser, on a server, during server-side rendering, in a worker, or on an edge runtime. Importing a preset contacts no service and needs no other package.

## Next steps

Read these in order the first time; each builds on the one before.

- [Getting started](getting-started.md): set up a registry for a real application, step by step.
- [The AppError](app-error.md): every field, what it promises, and how to send an error from a server to a client.
- [Registries](registries.md): how matching works, which match wins, and when to use your own registry instead of the global one.
- [Presets](presets.md): every failure the browser, Node.js, and Supabase presets recognize, with its translation key.
- [Results](results.md): `Result`, `attempt`, and the helpers that chain them.
- [Recipes](recipes.md): `fetch` and HTTP status codes, Supabase, retries, translations, and error reporting.
- [Caveats and limitations](caveats.md): what the package does not do, and how to work around it.
- [API reference](reference/index.md): every export with its signature, generated from the source.
