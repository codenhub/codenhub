# @codenhub/validation

Checks that a value is what you need it to be, and gives you either the typed value or every reason it is not. Each validator is a small function you import on its own, so a package or app ships only the checks it uses. Works for a single value such as an email or a port, and for whole objects such as a form. No dependencies.

> **Experimental:** pre-1.0. The API of 0.1.0 is meant to hold for every 0.1.x release; a change that breaks callers, if one proves necessary, ships as 0.2.0 and is listed in the [changelog](docs/changelog/index.md).
>
> **Migrating from 0.0.1:** 0.1.0 is a rewrite and no call carries over unchanged. The [0.1.0 changelog](docs/changelog/0.1.0.md) maps each old call to its replacement.

## Installation

```sh
pnpm add @codenhub/validation
```

## Usage

A validator is a function. Call it with any value and read the result:

```ts
import { email, englishMessages, formatIssue } from "@codenhub/validation";

const result = email()(input);

if (result.ok) {
  result.value; // string
} else {
  formatIssue(result.error.issues[0], englishMessages); // "Invalid email address"
}
```

Build objects from validators, and read the type from the validator so there is only one place to change:

```ts
import { email, number, object, optional, string, type Infer } from "@codenhub/validation";

const signup = object({
  name: string({ trim: true, min: 2 }),
  email: email(),
  age: optional(number({ int: true, min: 18 })),
});

type Signup = Infer<typeof signup>; // { name: string; email: string; age?: number | undefined }

const result = signup(requestBody);
```

Invalid input never throws. Every problem is in `result.error.issues`, each with a `code`, a `path` to the offending value and `params` describing the failure. Turn an issue into text with `formatIssue`, or group them by field for a form with `flatten`, passing `englishMessages` or a map of your own.

Write your own validator by returning `pass(value)` or `fail(...)` from any function, and add rules to an existing one with `refine`, including rules that need to `await` something.

## Documentation

- [Documentation overview](docs/index.md)
- [Validator reference](docs/validators.md)
- [Custom validators](docs/custom-validators.md)
- [Issues and messages](docs/errors.md)
- [Coercion](docs/coercion.md)
- [Standard Schema](docs/standard-schema.md)
- [Changelog](docs/changelog/index.md)

## Requirements

- Node.js 22 or newer, or a current browser, worker or edge runtime. The code relies on `Object.hasOwn`, and `url()` on `URL.canParse`.
- ESM-aware package resolution. The package is ESM only and marked `sideEffects: false`, so a bundler removes the validators you do not import.

Runtime code uses only standard JavaScript and the standard `URL` global, and nothing specific to a browser or to Node.js, so it runs in the browser, on the server and in workers.

## Notes

- A validator returns `{ ok: true, value }` or `{ ok: false, error }`. Bad input is never thrown; a bad option, such as `string({ min: -1 })`, throws when the validator is created.
- Issues never contain the input, and messages name types (`Expected number, received string`) instead of echoing values. Text for an issue is built only when you ask for it with `formatIssue`, from a message map you pass: `englishMessages` for the built-in English, which is a separate import so a program that words its own issues does not bundle it, or your own to reword or localize.
- Rules never rewrite the value unless you ask: `trim`, `lowercase`, `uppercase` and `clamp` are the options that do.
- Validation is synchronous until a rule returns a promise. The types then say the result must be awaited, and the compiler keeps you from reading it as if it were ready.
- `email()` accepts public host names only.
- Exceptions thrown by your own callbacks propagate. They are bugs, not invalid input.

## License

Licensed under Apache-2.0.
