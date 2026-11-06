# @codenhub/validation

Validation for data you do not control: a request body, a query string, a form, a message from another origin. A validator gives you either the typed value or the reasons it is not one, and is built for input that may be hostile:

- **Formats return what a parser read.** `email()` and `url()` produce what the URL parser of the platform sees, so the value you store is the one a request or a mail server will use.
- **What a failing input reports is bounded.** Each collection stops reporting at 1,000 issues, as [Limits](docs/limits.md#a-failing-input-has-a-bounded-cost) explains, and input nested too deep is one issue, not a stack overflow, as long as the depth limit of a recursive schema, [`maxDepth`](docs/limits.md#maxdepth), fits the stack.
- **Issues never hold a value of the input**, so logging a failed validation cannot log a password that was sent. They do hold what the schema was configured with, such as the values a `oneOf` accepts or the prefix of a `startsWith`, and the input's keys, in `path`, as [The issue](docs/errors.md#the-issue) says.

Each validator is a function you import on its own, so a program bundles only the validators it uses. No dependencies, so the only code to audit is ours.

> [!WARNING]
>
> **Experimental:** pre-1.0. The API is meant to hold for every patch release of a minor version, such as each 0.4.x. A change that breaks callers, if one proves necessary, ships in the next minor version, and the [changelog](docs/changelog/index.md) lists it, with the migrations from earlier versions.

## Installation

```sh
pnpm add @codenhub/validation
```

## Usage

A validator is a function. That is most of the design. Build one for the shape you expect, call it with any value, and read the result:

```ts
import { email, flatten, object, string, type Infer } from "@codenhub/validation";

const signup = object({
  name: string({ trim: true, min: 2, max: 100 }),
  email: email(),
});

type Signup = Infer<typeof signup>; // { name: string; email: string }

const result = signup(requestBody);

if (result.ok) {
  result.value.name; // a string, trimmed
} else {
  flatten(result.error).fieldErrors; // for example { email: ["Invalid email address"] }
}
```

Invalid input does not throw: the result says why it failed. `signup` is also a [Standard Schema](docs/standard-schema.md), so a form library or a router that takes one takes it directly.

## Documentation

- [Documentation overview](docs/index.md), with the reading path from a first validator to the limits of untrusted input
- [Getting started](docs/getting-started.md)
- [Forms](docs/forms.md) and [Request bodies](docs/request-bodies.md)
- [Issues and messages](docs/errors.md)
- [API reference](docs/reference/index.md)
- [Changelog](docs/changelog/index.md)

## Requirements

- Node.js 24 or newer, or a current browser, worker or edge runtime. `url()`, `email()`, `domain()` and `hostname()` need `URL.canParse`, which Safari before 17 lacks, so they throw there. `ip()` and `cidr()` use the `URL` parser too.
- ESM-aware package resolution. The package is ESM only and marked `sideEffects: false`. CommonJS code can `require()` it on every supported Node.js version.
- TypeScript 5.0 or newer, for the types, which use `const` type parameters.

## Notes

- **Invalid input never throws.** A bad option, such as `string({ min: -1 })`, throws when the validator is created. Exceptions from your own callbacks propagate, and so do those of a getter or a `Proxy` trap in the input, except under `objectLike`. [Reading the result](docs/getting-started.md#reading-the-result) has the details.
- **Values change only when you ask**, with `trim`, `case` or `clamp`, or when a format has several spellings of one value. `email()` and `url()` produce what the URL parser read, and `ip()`, `uuid()`, `phone()` and the rest produce one canonical spelling. See [Formats](docs/formats.md).
- **`email()` and `url()` accept public host names only**, not `localhost`, IP addresses or names such as `db.internal`. `url({ host: hostname() })` accepts any host. Neither resolves the name. See [`url`](docs/formats.md#url).
- **Validation is synchronous until a rule returns a promise**, and the types then say the result must be awaited. See [Sync and async](docs/getting-started.md#sync-and-async).
- **Input that passes is checked in full.** Cap the size of untrusted input, give every collection a `max`, and use `audit(validator)` in a test to list what a schema leaves open. A message received by structured clone, such as from `postMessage`, can hold millions of items in a few bytes, which only `max` bounds. [Limits](docs/limits.md) has the details, and [what hostile input gets](docs/limits.md#what-hostile-input-gets).

## License

Licensed under [Apache-2.0](LICENSE).
