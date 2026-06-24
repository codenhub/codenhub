# @codenhub/eslint-plugin-magic-strings

ESLint plugin to detect and restrict magic strings in function bodies, enforcing their extraction to constants.

## Installation

```sh
pnpm add -D @codenhub/eslint-plugin-magic-strings
```

## Usage

Register the plugin and configure the `no-magic-strings` rule in your ESLint configuration file:

```js
import magicStrings from "@codenhub/eslint-plugin-magic-strings";

export default [
  {
    plugins: {
      "magic-strings": magicStrings,
    },
    rules: {
      "magic-strings/no-magic-strings": "error",
    },
  },
];
```

## Reference

### `@codenhub/eslint-plugin-magic-strings`

Exposes the plugin configuration and custom rules.

#### `no-magic-strings`

Rule that disallows hardcoded string literals inside functions, except in allowed contexts.

##### Options

None.

##### Allowed Contexts

String literals are permitted and not flagged if they are:

- Assigned directly to a `const` declaration.
- Located within a JSX/TSX tag attribute or child.
- Part of an import/export source path or a `require` call.
- Used as object property keys (e.g. `obj["key"]` or `{ "key": value }`).
- Standard exceptions such as the empty string `""`.

## Examples

### Flagged Cases

```ts
function greet() {
  const name = "Alice"; // Allowed (assigned directly to const)
  let prefix = "Hello"; // Flagged: Assigning to non-const variable

  console.log("Welcome!"); // Flagged: Magic string in call expression
}
```

### Allowed Cases

```ts
const GLOBAL_MESSAGE = "Welcome!";

function greet() {
  const localMessage = "Hello World";

  return (
    <div className="container">
      {localMessage}
    </div>
  );
}
```

## Requirements

- Node.js: `^18.0.0 || >=20.0.0`
- ESLint: `^8.0.0 || ^9.0.0`

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
