# @codenhub/example-package

Replace this paragraph with a short description of the package's public purpose. State what the package provides, who should use it, and the main behavior consumers can rely on by default.

Use the rest of this file as a README scaffold. Keep only the sections that apply to the package, replace placeholder names with real public API names, and remove surfaces the package does not expose. For smaller packages, prefer the shortest README that still documents default behavior, the main use case, common consumer usage, requirements, and observable failure behavior.

## Installation

```sh
pnpm add @codenhub/example-package
npm install @codenhub/example-package
yarn add @codenhub/example-package
bun add @codenhub/example-package
```

Install with the package manager used by the consuming app. If the package is not installed directly by consumers, replace this section with the package name or omit the section when allowed by the spec.

## Features

Use a feature or support table only when the package has multiple public surfaces with different maturity, support, or stability levels. Remove this section when a table would not help consumers make usage decisions. Mention planned surfaces only when approved package docs cover them and they affect current adoption, migration, or integration decisions.

| Feature                | Status       | Notes                                              |
| ---------------------- | ------------ | -------------------------------------------------- |
| Primary public surface | Stable       | Default supported consumer path.                   |
| Optional integration   | Experimental | Available for early use; behavior may change.      |
| Future surface         | Planned      | Mention only when backed by approved package docs. |

## Usage

Show the smallest useful setup for the package's main use case. Explain the expected behavior before the code so the snippet demonstrates the contract instead of replacing it. Briefly state observable failure behavior when it affects normal usage.

```ts
import { createExamplePackageThing } from "@codenhub/example-package";

const thing = createExamplePackageThing({
  id: "example-id",
});

thing.run();
```

Add any required setup for the default path, such as CSS imports, provider setup, plugin registration, or environment configuration.

```ts
import "@codenhub/example-package/styles.css";
```

If the package exposes type-only entrypoints, show the expected import style.

```ts
import type { ExamplePackageOptions } from "@codenhub/example-package/types";

const options: ExamplePackageOptions = {
  id: "example-id",
};
```

## Reference

Document the public entrypoints listed in `package.json` `exports` that are part of default or common consumer usage. Remove entrypoint sections that do not apply.

### `@codenhub/example-package`

Primary entrypoint for the package's default public API.

```ts
import { createExamplePackageThing, EXAMPLE_PACKAGE_DEFAULTS } from "@codenhub/example-package";
```

#### `createExamplePackageThing()`

Creates the package's main public value.

```ts
function createExamplePackageThing(options: ExamplePackageOptions): ExamplePackageThing;
```

Use this when consumer code needs the package's default behavior.

| Parameter | Type                    | Description                          |
| --------- | ----------------------- | ------------------------------------ |
| `options` | `ExamplePackageOptions` | Configuration for the created value. |

Returns `ExamplePackageThing`.

Document observable failure behavior here, such as thrown errors, rejected promises, invalid output, fallback behavior, or no failure behavior.

#### `ExamplePackageThing`

Public value returned by `createExamplePackageThing()`.

```ts
interface ExamplePackageThing {
  run(): void;
  dispose(): void;
}
```

Describe when consumers should keep, reuse, or discard this value.

##### `run()`

Runs the package's main behavior.

```ts
function run(): void;
```

Describe whether repeated calls are allowed, ignored, cumulative, or invalid.

##### `dispose()`

Releases resources owned by the public value, when the package has cleanup behavior.

```ts
function dispose(): void;
```

Remove this method if the package has no cleanup lifecycle.

#### `ExamplePackageOptions`

Configuration passed to `createExamplePackageThing()`.

```ts
interface ExamplePackageOptions {
  id: string;
  enabled?: boolean;
}
```

| Property  | Type      | Default | Description                                  |
| --------- | --------- | ------- | -------------------------------------------- |
| `id`      | `string`  | None    | Stable identifier for consumer-owned usage.  |
| `enabled` | `boolean` | `true`  | Whether the default behavior starts enabled. |

#### `EXAMPLE_PACKAGE_DEFAULTS`

Documented default values used by the package.

```ts
const EXAMPLE_PACKAGE_DEFAULTS: Pick<ExamplePackageOptions, "enabled">;
```

Remove this item if the package does not expose defaults.

### Events

Document public events only when consumers can observe, emit, subscribe to, or handle them.

#### `example-package:event`

Emitted when the documented public condition occurs.

```ts
interface ExamplePackageEvent {
  id: string;
}
```

| Field | Type     | Description                                  |
| ----- | -------- | -------------------------------------------- |
| `id`  | `string` | Identifier associated with the public event. |

### CSS: `@codenhub/example-package/styles.css`

Document CSS entrypoints only when consumers are expected to import package CSS.

```ts
import "@codenhub/example-package/styles.css";
```

Explain what the CSS provides, whether it is required, and how consumers can opt out or customize it.

### `@codenhub/example-package/plugin`

Document plugin entrypoints only when the package exposes a public plugin.

```ts
import { createExamplePackagePlugin } from "@codenhub/example-package/plugin";
```

#### `createExamplePackagePlugin()`

Creates the package's public plugin.

```ts
function createExamplePackagePlugin(options?: ExamplePackagePluginOptions): ExamplePackagePlugin;
```

Document required plugin order, peer dependencies, generated output, and stability status.

### `@codenhub/example-package/types`

Document type-only entrypoints only when consumers are expected to import types from a subpath.

```ts
import type { ExamplePackageOptions } from "@codenhub/example-package/types";
```

This entrypoint has no runtime behavior.

### `@codenhub/example-package/tokens`

Document token or asset entrypoints only when consumers are expected to import them.

```ts
import { examplePackageTokens } from "@codenhub/example-package/tokens";
```

Describe naming, stability, customization, and consumption requirements.

## Examples

Add common workflows beyond the minimal usage path. Omit this section when there is only one meaningful workflow and `Usage` already covers it.

### Basic Workflow

Show a realistic consumer workflow using the package's default public API.

```ts
import { createExamplePackageThing } from "@codenhub/example-package";

const thing = createExamplePackageThing({ id: "example-id" });

thing.run();
thing.dispose();
```

### Optional Configuration

Show common configuration when it changes behavior consumers need to understand.

```ts
import { createExamplePackageThing } from "@codenhub/example-package";

const thing = createExamplePackageThing({
  id: "example-id",
  enabled: false,
});

thing.run();
```

### Plugin Configuration

Show plugin setup only when the package exposes a plugin entrypoint.

```ts
import { createExamplePackagePlugin } from "@codenhub/example-package/plugin";

export default {
  plugins: [createExamplePackagePlugin()],
};
```

## Requirements

- State supported runtime environments, such as Node, browser, SSR, or workers.
- State required peer dependencies and supported version ranges.
- State required CSS, DOM, storage, build-tool, bundler, or framework behavior.
- State cleanup or lifecycle requirements when the package owns listeners, timers, subscriptions, files, or other resources.

## Notes

- List important limitations, non-goals, caveats, or stability notes.
- Link to package-level `docs/` files for deeper design, advanced workflows, or edge cases.
- Remove placeholder notes before publishing the README.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.

[Optional] It includes third-party code or assets, such as SVG icons from [Lucide](https://lucide.dev) which are licensed under the [ISC License](https://github.com/lucide-dev/lucide/blob/main/LICENSE). See the [NOTICE](NOTICE) file for details.
