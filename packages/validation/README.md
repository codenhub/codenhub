# @codenhub/validation

Zero-dependency schema validation for TypeScript. Describe the data you expect, ask a schema whether some unknown input satisfies it, and get either the typed value or every reason it does not. Ships common validators for strings, numbers, objects, arrays and unions, and is built to be extended: custom checks, transforms, async rules and localizable messages compose with everything else.

> **Experimental:** the API is still settling before a 1.0. Breaking changes land in minor releases and are listed in the [changelog](docs/changelog/index.md). What is most likely to move: the shape of `params` on built-in issues, the set of string formats, and object helpers such as `partial` and `required`.
>
> **Migrating from 0.0.1:** validators are now built first and run later. `val.string(x).min(3)` becomes `val.string().min(3).validate(x)`, and `validate` returns `{ ok, value }` or `{ ok, error }` with every issue instead of the first failure. The 0.0.1 immediate helpers are removed; the [0.1.0 changelog](docs/changelog/0.1.0.md) maps each old call to its replacement.

## Installation

```sh
pnpm add @codenhub/validation
```

## Usage

```ts
import { val, type Infer } from "@codenhub/validation";

const user = val.object({
  name: val.string().trim().min(2),
  email: val.string().email(),
  role: val.enum(["admin", "user"]).default("user"),
  age: val.number().int().min(18).optional(),
});

type User = Infer<typeof user>;

const result = user.validate(unknownInput);

if (result.ok) {
  result.value; // User
} else {
  result.error.issues; // every problem, each with a code, a path and a message
}
```

`validate` never throws for invalid input. Use `parse` when you would rather throw a `ValidationError`, and `validateAsync` or `parseAsync` when a schema has async checks.

Add your own rules to any schema:

```ts
const signup = val.object({ password: val.string().min(8), confirm: val.string() }).refine((data) => data.password === data.confirm, { message: "Passwords must match", path: ["confirm"] });

const username = val.string().refine(async (name) => !(await isTaken(name)), "Username is taken");
```

## Documentation

- [Documentation overview](docs/index.md)
- [Validator reference](docs/validators.md)
- [Customization](docs/customization.md)
- [Errors and messages](docs/errors.md)
- [Coercion](docs/coercion.md)
- [Changelog](docs/changelog/index.md)

## Requirements

- Node.js 22 or newer, or a current browser, worker or edge runtime. The code relies on `Object.hasOwn` and `URL.canParse`.
- ESM-aware package resolution.
- No runtime dependencies.

Runtime code does not touch browser or Node.js globals, so it runs in the browser, on the server and in workers.

## Notes

- Every schema implements [Standard Schema v1](https://standardschema.dev/), so form and API libraries that accept one can take it directly.
- Validation is synchronous until a `refine`, `check` or `transform` callback returns a promise. The sync methods then throw and tell you to use the async ones, instead of guessing.
- Issues never contain the input unless you pass `includeInput: true`, and messages name types (`Expected number, received string`) instead of echoing values.
- Rules never rewrite the value. `trim()`, `toLowerCase()`, `toUpperCase()`, `clamp()`, `transform()` and `default()` are the explicit ways to change it.
- `email()` and `url()` accept public host names only by default; `url({ allowLocal: true })` opens up `localhost` and IP addresses.
- Exceptions thrown by your own callbacks propagate. They are bugs, not invalid input.

## License

Licensed under Apache-2.0.
