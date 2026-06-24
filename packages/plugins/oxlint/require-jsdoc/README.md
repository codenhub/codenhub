# @codenhub/eslint-plugin-require-jsdoc

An ESLint plugin providing rules to enforce that all exported declarations in public entry points have valid JSDoc/TSDoc comments, supporting the repository's docs-first development guidelines.

## Installation

```sh
pnpm add -D @codenhub/eslint-plugin-require-jsdoc
```

## Usage

Add the plugin and configure the `require-public-jsdoc` rule in your ESLint configuration.

```js
import requireJsdocPlugin from "@codenhub/eslint-plugin-require-jsdoc";

export default [
  {
    plugins: {
      "require-jsdoc": requireJsdocPlugin,
    },
    rules: {
      "require-jsdoc/require-public-jsdoc": "error",
    },
  },
];
```

## Reference

### `@codenhub/eslint-plugin-require-jsdoc`

The main entrypoint exports the ESLint plugin object.

```ts
import plugin from "@codenhub/eslint-plugin-require-jsdoc";
```

#### `plugin`

The plugin object containing custom rules.

```ts
const plugin: {
  rules: {
    "require-public-jsdoc": RuleModule;
  };
};
```

### Rules

#### `require-public-jsdoc`

Enforces JSDoc/TSDoc comments on exported declarations in public files (such as those listed in the package's exports or public entry points).

- **Default Behavior**: Checks functions, classes, interfaces, types, and variables exported from files that are considered public entry points.
- **Exclusion**: Ignores declarations marked with `@internal`.
- **Validation**: Ensures a leading block comment starting with `*` (i.e., `/** ... */`) is present.

## Requirements

- Node.js version matches repository catalog.
- ESLint compatibility for custom rules.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
