# @codenhub/eslint-plugin-max-params

ESLint plugin to enforce the repository's guideline for maximum parameters in functions.

## Installation

```sh
pnpm add -D @codenhub/eslint-plugin-max-params
```

## Usage

Register the plugin and enable the rule in your ESLint configuration (e.g., `eslint.config.js` or `.eslintrc.json`):

```js
import maxParamsPlugin from "@codenhub/eslint-plugin-max-params";

export default [
  {
    plugins: {
      "@codenhub/max-params": maxParamsPlugin,
    },
    rules: {
      "@codenhub/max-params/max-params": "error",
    },
  },
];
```

## Reference

### `@codenhub/eslint-plugin-max-params`

Primary entrypoint for the ESLint plugin.

#### Rules

##### `@codenhub/max-params/max-params`

Enforces a limit of 3 or more parameters for functions (recommending refactoring into a typed object).

- **Type**: Suggestion / Code Quality
- **Fixable**: No
- **Configuration**: None

## Examples

### Invalid

Function declarations, expressions, or arrow functions with 3 or more parameters:

```ts
// 3 parameters is invalid
function calculateTotal(price: number, tax: number, discount: number) {
  return price + tax - discount;
}

// 4 parameters is invalid
const handleRequest = (req: Request, res: Response, next: NextFunction, log: Logger) => {
  // ...
};
```

### Valid

Functions with less than 3 parameters, or when refactored into a typed object:

```ts
// 2 parameters is valid
function calculateTotal(price: number, options: { tax: number; discount: number }) {
  return price + options.tax - options.discount;
}
```

### Exclusions

The following patterns are excluded from the rule:

1. **Test Files**: Files ending with `.test.ts`, `.spec.ts` or inside `__tests__` directories.
2. **Callbacks**: Functions passed as arguments (callbacks):
   ```ts
   // Valid because it is passed as a callback argument
   [1, 2, 3].reduce((acc, current, index) => acc + current, 0);
   ```

## Requirements

- Node.js (ES Modules)
- ESLint v8 or newer

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
