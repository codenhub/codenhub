# @codenhub/validation

Checks that a value is what you need it to be, and gives you either the typed value or every reason it is not. Each validator is a small function you import on its own, so a package or app ships only the checks it uses. Works for a single value such as an email or a port, and for whole objects such as a form. No dependencies.

> **Experimental:** pre-1.0. The API of 0.2.0 is meant to hold for every 0.2.x release; a change that breaks callers, if one proves necessary, ships as 0.3.0 and is listed in the [changelog](docs/changelog/index.md).
>
> **Migrating from 0.1.0:** the [0.2.0 changelog](docs/changelog/0.2.0.md) maps each changed call to its replacement. From 0.0.1, start with the [0.1.0 changelog](docs/changelog/0.1.0.md).

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

Invalid input never throws, with one exception noted below. Every problem is in `result.error.issues`, each with a `code`, a `path` to the offending value and `params` describing the failure. Turn an issue into text with `formatIssue`, or group them by field for a form with `flatten`, passing `englishMessages` or a map of your own.

Every validator takes options, then checks, which are rules for the rarer cases, and a `message` option for a sentence of its own:

```ts
import { check, object, pattern, string } from "@codenhub/validation";

const account = object(
  {
    handle: string({ trim: true, min: 3, message: "At least 3 characters" }, pattern(/^[a-z0-9_]+$/)),
    password: string({ min: 12 }),
    confirm: string(),
  },
  check((data) => data.password === data.confirm, { path: ["confirm"], message: "Passwords must match" }),
);
```

Write a rule of your own with `check`, including one that needs to `await` something, a format with `format`, and a validator for any type with `guard`; what they make behaves exactly as the built-in ones do.

## Documentation

- [Documentation overview](docs/index.md)
- [API reference](docs/reference/index.md)
- [Validator reference](docs/validators.md)
- [Custom validators](docs/custom-validators.md)
- [Issues and messages](docs/errors.md)
- [Coercion](docs/coercion.md)
- [Standard Schema](docs/standard-schema.md)
- [Changelog](docs/changelog/index.md)

## Requirements

- Node.js 22 or newer, or a current browser, worker or edge runtime. The code relies on `Object.hasOwn`, and `url()`, `email()`, `domain()` and `hostname()` on `URL.canParse`, which a runtime without it, such as Safari before 17, lacks, so they throw there. `ip()` and `cidr()` use the `URL` parser too.
- ESM-aware package resolution. The package is ESM only and marked `sideEffects: false`, so a bundler removes the validators you do not import. CommonJS code can `require()` it on Node.js 22.12 or newer, which load ES modules that way.

Runtime code uses only standard JavaScript and the standard `URL` global, and nothing specific to a browser or to Node.js, so it runs in the browser, on the server and in workers.

## Notes

- A validator returns `{ ok: true, value }` or `{ ok: false, error }`. Bad input is never thrown, except by code the input carries, below; a bad option, such as `string({ min: -1 })`, throws when the validator is created.
- Issues never contain an input value, and messages name types (`Expected number, received string`) instead of echoing values. Text for an issue is built only when you ask for it with `formatIssue`, from a message map you pass: `englishMessages` for the built-in English, which is a separate import so a program that words its own issues does not bundle it, or your own to reword or localize. Keys are another matter: a path leads through the input's own keys, and a strict `object` names each key it does not recognize.
- Rules never rewrite the value unless you ask: `trim`, `case` and `clamp` are the options that do. Formats with several spellings are the exception, and produce one: `email()` and `url()` produce what the URL parser reads, such as `https://example.com/admin` for `https://Example.com/public/../admin`, so a check made later on the value sees what a request or a mail server will, and `ip()`, `phone()`, `mac()` and `creditCard()` produce a canonical spelling.
- Validation is synchronous until a rule returns a promise. The types then say the result must be awaited, and the compiler keeps you from reading it as if it were ready.
- `email()` and `url()` accept public host names only: not `localhost`, IP addresses, or special-use names such as `db.internal` and `printer.local`. A validator for the host replaces that rule: `url({ host: hostname() })` accepts any hostname and `url({ host: union([domain(), ip()]) })` any public domain or IP address, of any range. Neither resolves the name, so a public name can still point at a private address.
- Exceptions thrown by your own callbacks propagate. They are bugs, not invalid input. So do exceptions from code inside the input itself: a getter or a `Proxy` trap that throws while a validator reads the value. Data parsed from JSON holds neither.
- A recursive `lazy` validator stops at `maxDepth` levels, 128 by default, and fails with `too_big` instead of exhausting the stack, so deeply nested or cyclic input is reported like any other bad input, as long as the recursion is synchronous. An asynchronous rule inside a recursive schema starts each level it awaits before from a fresh stack, which `maxDepth` does not count: such a schema follows input of any depth, and a cyclic object until memory runs out. Give it a bound of its own, such as rejecting input that is not parsed from JSON, which cannot be cyclic. `lazy` also stops after `maxCalls` calls in one validation, 10,000 by default, since a recursive `union` of objects does its work again for every option at every level and could otherwise run for hours on a few hundred bytes; at that default a validation it stops holds about 10 MB of issues. Raise it for trusted recursive data with more nodes, or use `tagged`, which does no such work. Nothing else limits how much input is checked: every issue found is kept, so a large list of wrong items is as many issues, and asynchronous rules of every item start at once. Cap the size of untrusted input, and give `array`, `set`, `map`, `record` and a `tuple` with `rest` a `max`, before validating it.

## License

Licensed under Apache-2.0.
