# @codenhub/validation

Validation for data you do not control: a request body, a query string, a form, a message from another origin. A validator gives you either the typed value or every reason it is not one, and is built for input that may be hostile:

- **Formats return what a parser read.** `email()` and `url()` produce what the platform's URL parser sees, so the value you store is the one a request or a mail server will use.
- **What a failing input costs is bounded.** A long list of bad items stops at 1,000 issues, and input nested too deep is one issue, never a stack overflow.
- **Issues never hold a value of the input**, so logging a failed validation cannot log a password. They do name its keys, in `path`, as [The issue](docs/errors.md#the-issue) says.

Each validator is a function you import on its own, so a program ships only what it uses: a lone `boolean()` is 1.8 kB gzipped, and an object of a string, an email and a number 6.5 kB. No dependencies.

> **Experimental:** pre-1.0. The API of 0.4.0 is meant to hold for every 0.4.x release; a change that breaks callers, if one proves necessary, ships as the next minor and is listed in the [changelog](docs/changelog/index.md), which also has the migrations from earlier versions.

## Installation

```sh
pnpm add @codenhub/validation
```

## Usage

A validator is a function. Call it with any value and read the result:

```ts
import { email, formatIssue } from "@codenhub/validation";

const result = email()(input);

if (result.ok) {
  result.value; // string
} else {
  formatIssue(result.error.issues[0]); // "Invalid email address"
}
```

Build objects from validators, and read the type from the validator:

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

`signup` is also a [Standard Schema](docs/standard-schema.md), so a form library or a router that takes one takes it as it is.

A failed result lists every problem in `result.error.issues`, each with a `code`, a `path` and `params`. `formatIssue` words one, and `flatten` groups them by field for a form, in English, in Portuguese with `portugueseMessages`, or in a message map of your own. For input that is a caller's mistake, such as an options object, `assert` returns the value or throws a `TypeError` naming the first problem.

Every validator takes options, then checks for the rarer rules, and a `message` of its own:

```ts
import { checkFields, object, pattern, string } from "@codenhub/validation";

const account = object(
  {
    handle: string({ trim: true, min: 3, message: "At least 3 characters" }, pattern(/^[a-z0-9_]+$/)),
    password: string({ min: 12 }),
    confirm: string(),
  },
  checkFields(["password", "confirm"], (data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "Passwords must match",
  }),
);
```

`checkFields` runs as soon as the fields it names pass, so a form shows it beside the other fields' problems. `check`, `format` and `guard` build rules, formats and validators of your own, which behave as the built-in ones do.

## Documentation

- [Documentation overview](docs/index.md)
- [API reference](docs/reference/index.md)
- [Validator reference](docs/validators.md)
- [Custom validators](docs/custom-validators.md)
- [Issues and messages](docs/errors.md)
- [Coercion](docs/coercion.md)
- [Standard Schema](docs/standard-schema.md)
- [JSON Schema](docs/json-schema.md)
- [Integrations](docs/integrations.md)
- [Changelog](docs/changelog/index.md)

## Requirements

- Node.js 24 or newer, or a current browser, worker or edge runtime. `url()`, `email()`, `domain()` and `hostname()` need `URL.canParse`, which Safari before 17 lacks, so they throw there; `ip()` and `cidr()` use the `URL` parser too.
- ESM-aware package resolution. The package is ESM only and marked `sideEffects: false`; CommonJS code can `require()` it on every supported Node.js version.
- TypeScript 5.0 or newer, for the types, which use `const` type parameters.

## Notes

- **Invalid input never throws.** A bad option, such as `string({ min: -1 })`, throws when the validator is created. Exceptions from your own callbacks propagate, and so do those of a getter or a `Proxy` trap in the input, except under `objectLike`. [Reading the result](docs/index.md#reading-the-result) has the details.
- **Values change only when you ask**, with `trim`, `case` or `clamp`, or when a format has several spellings of one value: `email()` and `url()` produce what the URL parser read, and `ip()`, `uuid()`, `phone()` and the rest produce a canonical spelling. See [Formats](docs/validators.md#formats).
- **`email()` and `url()` accept public host names only**, not `localhost`, IP addresses or names such as `db.internal`. `url({ host: hostname() })` accepts any host; neither resolves the name. See [`url`](docs/validators.md#url).
- **Validation is synchronous until a rule returns a promise**, and the types then say the result must be awaited. See [Sync and async](docs/index.md#sync-and-async).
- **Input that passes is checked in full.** Cap the size of untrusted input, give every collection a `max`, and use `audit(validator)` in a test to list what a schema leaves open. A message received by structured clone, such as from `postMessage`, can hold millions of items in a few bytes, which only `max` bounds. See [Collections](docs/validators.md#collections), [`lazy`](docs/validators.md#lazy) for the limits of recursive schemas, and [Checking a schema for the bounds it needs](docs/validators.md#checking-a-schema-for-the-bounds-it-needs).

## License

Licensed under Apache-2.0.
