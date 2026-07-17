# @codenhub/validation

Zero-dependency validation and primitive coercion helpers for TypeScript
application boundaries.

> **Experimental:** Validator coverage, normalization rules, error details, and
> the public API may change before a stable release.

## Installation

```sh
pnpm add @codenhub/validation
```

## Usage

Validators and coercers return discriminated results instead of throwing for
invalid input.

```ts
import { coerce, val } from "@codenhub/validation";

const coerced = coerce.int("3000", { path: ["port"] });
const port = coerced.ok ? val.number(coerced.value).port() : coerced;

if (!port.ok) {
  console.error(port.error.code, port.error.path);
}
```

## Documentation

- [Documentation overview](docs/index.md)
- [Results and coercion](docs/results-and-coercion.md)
- [Validator reference](docs/validators.md)

## Requirements

- ESM-aware package resolution.
- Browser, Node.js, and SSR runtimes are supported.
- No runtime dependencies.

## Notes

- `includeInput` defaults to `false`; enable it only when retaining input is
  safe.
- URL and email validators intentionally accept public host shapes only.

## License

Licensed under Apache-2.0.
