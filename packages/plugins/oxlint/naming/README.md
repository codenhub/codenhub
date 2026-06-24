# @codenhub/eslint-plugin-naming

ESLint plugin enforcing naming guidelines for variables and properties in CodenHub, specifically boolean prefix and array plural naming conventions.

## Installation

```sh
pnpm add -D @codenhub/eslint-plugin-naming
```

## Usage

Register the plugin and rules in your ESLint configuration file.

```js
import namingPlugin from "@codenhub/eslint-plugin-naming";

export default [
  {
    plugins: {
      "@codenhub/naming": namingPlugin,
    },
    rules: {
      "@codenhub/naming/boolean-prefix": "error",
      "@codenhub/naming/array-plural": "warn",
    },
  },
];
```

## Reference

### `@codenhub/eslint-plugin-naming`

The default export is the ESLint plugin object.

```ts
import namingPlugin from "@codenhub/eslint-plugin-naming";
```

#### Rules

##### `boolean-prefix`

Enforces that boolean variable or property declarations start with `is`, `has`, `can`, or `should`.

- **Scope**: Checks `VariableDeclarator` (variables) and `Property` / `PropertyDefinition` (properties).
- **Triggers**: Checks declarations initialized with:
  - Boolean literals (`true` or `false`)
  - Comparison operators (`===`, `!==`, `==`, `!=`, `<`, `<=`, `>`, `>=`)
  - Logical operators (`&&`, `||`) or unary logical NOT (`!`)
- **Format**: The variable or property name must start with `is`, `has`, `can`, or `should` followed by an uppercase letter or number/underscore (e.g. `isLoading`, `hasPermission`), or be the exact words themselves.

##### `array-plural`

Enforces that array variable declarations end with `s`.

- **Scope**: Checks `VariableDeclarator`.
- **Triggers**: Checks declarations initialized with:
  - Array expressions (`[ ... ]`)
  - `new Array(...)` or `Array(...)` constructor
  - `Array.from(...)` or `Array.of(...)` static methods
  - Or variables having TypeScript type annotations indicating arrays (e.g., `Type[]` or `Array<Type>`).
- **Format**: The variable name must end with `s` or `S` (case-insensitive).

## Examples

### `boolean-prefix` Examples

```ts
// Valid
const isLoading = true;
const hasPermission = user.role === "admin";
const canWrite = !readOnly;
const shouldUpdate = a && b;

// Invalid
const loading = true;
const permission = user.role === "admin";
const write = !readOnly;
const update = a && b;
```

### `array-plural` Examples

```ts
// Valid
const users = ["Alice", "Bob"];
const activeItems = new Array(5);
const selectedIds: string[] = getIds();

// Invalid
const user = ["Alice", "Bob"];
const activeItem = new Array(5);
const selectedId: string[] = getIds();
```

## Requirements

- Node.js (v18+)
- ESLint (v8 or v9)

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
