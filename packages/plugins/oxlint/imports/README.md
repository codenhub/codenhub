# @codenhub/eslint-plugin-imports

ESLint plugin to enforce package boundaries and restrict deep internal imports across workspace packages.

## Installation

```sh
pnpm add -D @codenhub/eslint-plugin-imports
```

## Usage

Add the plugin to your ESLint configuration and enable the rule:

```json
{
  "plugins": ["@codenhub/imports"],
  "rules": {
    "@codenhub/imports/no-deep-package-imports": "error"
  }
}
```

## Reference

### `@codenhub/eslint-plugin-imports`

Primary entrypoint for the ESLint plugin.

#### `plugin`

The default export and named export `plugin` containing the rules map.

```ts
import plugin from "@codenhub/eslint-plugin-imports";
```

#### Rules

##### `@codenhub/imports/no-deep-package-imports`

Prevents deep internal imports across package boundaries unless explicitly allowed in the target package's `exports` map in `package.json`.

- **Incorrect**:

  ```ts
  import { Normalizer } from "@codenhub/error/src/normalizer";
  ```

- **Correct**:
  ```ts
  import { Normalizer } from "@codenhub/error";
  ```

## Requirements

- **Node.js**: `^18.0.0 || >=20.0.0`
- **ESLint**: `>=8.0.0`

## Notes

- This rule is designed for workspace packages (scoped under `@codenhub/`) and resolves their boundaries via workspace structure or local resolution.
- It verifies import paths against the target package's standard `exports` map, ensuring consumers do not depend on internal file layouts that can change without warning.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
