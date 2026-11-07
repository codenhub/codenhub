# @codenhub/error

Turn whatever your TypeScript code catches into one predictable `AppError`. Each one has a message that is safe to show, a translation key, a code to branch on, a flag that says whether retrying is safe, and the original value kept for your logs. You describe the failures you know about once, in a registry, and opt-in presets cover common browser, Node.js, HTTP, and Supabase failures. Result helpers are included for code that prefers returning failures to throwing them.

In short: `catch` gives you `unknown`, and this gives you something you can actually show a person.

## Installation

```sh
pnpm add @codenhub/error
```

## Usage

Describe your failures once, when the application starts, then normalize anything you catch:

```ts
import { createAppError, getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

const registry = getErrorRegistry();

registry.merge(browserErrorRegistry);
registry.codes.add("project.limit_reached", {
  message: "You've reached the project limit on your plan. Archive a project, then try again.",
  messageKey: "error.project.limitReached",
});

try {
  await createProject(draft);
} catch (caught) {
  const error = createAppError(caught);

  showToast(error.message);
}
```

A failure nobody registered becomes `type: "unknown"` with the message `"An unexpected error occurred."`, never its raw text. Your customers do not need to learn your table names.

## Documentation

- [Overview](docs/index.md): what the package is for, a five-minute tour, and the reading path.
- [Getting started](docs/getting-started.md): set up a real application step by step.
- [The AppError](docs/app-error.md): every field, and how to send an error from a server to a client.
- [Registries](docs/registries.md) and [Presets](docs/presets.md): how failures are recognized, and every failure the presets know.
- [Results](docs/results.md): `Result`, `attempt`, and the helpers that chain them.
- [Error boundaries](docs/frameworks.md): React and Svelte fallbacks that show a normalized error.
- [Recipes](docs/recipes.md): HTTP statuses, Supabase, retries, translations, error reporting, and tests.
- [Caveats and limitations](docs/caveats.md): what the package does not do, and the workarounds.
- [API reference](docs/reference/index.md): every export, generated from the source.
- [Changelog](docs/changelog/index.md): what changed in each release.

## Requirements

- Node.js 24 or newer, or an ES2022-compatible browser, worker, or edge runtime with native `Error` `cause` support.
- ESM. CommonJS can load it with `require()` on runtimes that support requiring ES modules.
- No runtime dependencies, and no access to browser or Node.js globals.
- The React adapter needs React 18 or newer, and the Svelte adapter needs Svelte 5.3 or newer. Both are optional peer dependencies.

## Notes

- Presets change nothing until you merge them, and the last mapping added for an identifier wins.
- The global registry is shared module state: configure it once at startup, not per request.
- `isRetryable` means repeating the failed call cannot make it run twice, not that a retry will likely work. Retry only around the call that failed.
- Built-in `messageKey` values are stable; the package ships English messages only.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
