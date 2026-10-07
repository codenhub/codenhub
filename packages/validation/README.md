# @codenhub/validation

Validation for data you do not control: a request body, a query string, a form, a message from another origin. A validator gives you either the typed value or every reason it is not one, and is built for input that may be hostile:

- **Formats return what a parser read.** `email()` and `url()` produce the address the platform's URL parser sees, so what you store and check is what a request or a mail server will use.
- **Work is bounded.** A long list of bad items or deeply nested input is reported as an issue, in bounded time and memory, and never as a stack overflow.
- **Issues never hold the input**, so logging a failed validation cannot log a password.

Each validator is a function you import on its own, so a program ships only the checks it uses: a lone `boolean()` is 1.2 kB gzipped and an object with a string, an email and a number 5.8 kB. Works for a single value such as an email or a port, and for whole objects such as a form. No dependencies. [Compared with valibot, zod and yup](docs/comparison.md) has the measurements, and says when one of them is the better choice.

> **Experimental:** pre-1.0. The API of 0.4.0 is meant to hold for every 0.4.x release; a change that breaks callers, if one proves necessary, ships as the next minor and is listed in the [changelog](docs/changelog/index.md).
>
> **Migrating from 0.3.0:** the [0.4.0 changelog](docs/changelog/0.4.0.md#migrating-from-030) lists the two changes to the types.
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

Invalid input never throws, with one exception noted below. Every problem a validator reports is in `result.error.issues`, each with a `code`, a `path` to the offending value and `params` describing the failure. Turn an issue into text with `formatIssue`, or group them by field for a form with `flatten`, passing `englishMessages` or a map of your own.

Every validator takes options, then checks, which are rules for the rarer cases, and a `message` option for a sentence of its own:

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

`checkFields` is a rule across properties that runs as soon as the ones it names have passed, so a form shows it beside the other fields' problems and not after them. Write a rule of your own with `check`, including one that needs to `await` something, a format with `format`, and a validator for any type with `guard`; what they make behaves exactly as the built-in ones do.

When invalid input is a caller's mistake, such as an options object passed to your function, `assert(validator, input, { subject, messages })` returns the value or throws a `TypeError` naming the first problem and where it is. `objectLike` validates class instances and other objects that are not plain, which `object` rejects.

## Documentation

- [Documentation overview](docs/index.md)
- [API reference](docs/reference/index.md)
- [Validator reference](docs/validators.md)
- [Custom validators](docs/custom-validators.md)
- [Issues and messages](docs/errors.md)
- [Coercion](docs/coercion.md)
- [Standard Schema](docs/standard-schema.md)
- [JSON Schema](docs/json-schema.md)
- [Compared with valibot, zod and yup](docs/comparison.md)
- [Changelog](docs/changelog/index.md)

## Requirements

- Node.js 24 or newer, or a current browser, worker or edge runtime. The code relies on `Object.hasOwn`, and `url()`, `email()`, `domain()` and `hostname()` on `URL.canParse`, which a runtime without it, such as Safari before 17, lacks, so they throw there. `ip()` and `cidr()` use the `URL` parser too.
- ESM-aware package resolution. The package is ESM only and marked `sideEffects: false`, so a bundler removes the validators you do not import. CommonJS code can `require()` it, since every supported Node.js version loads ES modules that way.
- TypeScript 5.0 or newer, for the types. The declarations use `const` type parameters, which TypeScript 4.9 cannot read.

Runtime code uses only standard JavaScript and the standard `URL` global, and nothing specific to a browser or to Node.js, so it runs in the browser, on the server and in workers.

## Notes

- A validator returns `{ ok: true, value }` or `{ ok: false, error }`. Bad input is never thrown, except by code the input carries, below; a bad option, such as `string({ min: -1 })`, throws when the validator is created.
- Issues never contain an input value, and messages name types (`Expected number, received string`) instead of echoing values. Text for an issue is built only when you ask for it with `formatIssue`, from a message map you pass: `englishMessages` for the built-in English or `portugueseMessages` for Portuguese, each a separate import so a program bundles only the wording it uses, or your own to reword or localize. Keys are another matter: a path leads through the input's own keys, and a strict `object` names each key it does not recognize.
- Rules never rewrite the value unless you ask: `trim`, `case` and `clamp` are the options that do. Formats with several spellings are the exception, and produce one: `email()` and `url()` produce what the URL parser reads, such as `https://example.com/admin` for `https://Example.com/public/../admin`, so a check made later on the value sees what a request or a mail server will, `domain()` produces lowercase ASCII with internationalized labels in punycode, and `ip()`, `cidr()`, `hostname()`, `uuid()`, `ulid()`, `phone()`, `mac()` and `creditCard()` produce a canonical spelling.
- Validation is synchronous until a rule returns a promise. The types then say the result must be awaited, and the compiler keeps you from reading it as if it were ready.
- `email()` and `url()` accept public host names only: not `localhost`, IP addresses, or special-use names such as `db.internal`, `printer.local` and `nas.home`. Whether the top-level domain exists is not checked. A validator for the host replaces that rule: `url({ host: hostname() })` accepts any hostname and `url({ host: union([domain(), ip()]) })` any public domain or IP address, of any range. Neither resolves the name, so a public name can still point at a private address.
- Exceptions thrown by your own callbacks propagate. They are bugs, not invalid input. So do exceptions from code inside the input itself: a getter or a `Proxy` trap that throws while a validator reads the value, except under `objectLike`, which reports a property it could not read as an issue. Data parsed from JSON holds neither.
- A recursive `lazy` validator stops at `maxDepth` levels, 128 by default, and fails with `too_big` instead of exhausting the stack, so deeply nested or cyclic input is reported like any other bad input, as long as the recursion is synchronous. An asynchronous rule inside a recursive schema starts each level it awaits before from a fresh stack, which `maxDepth` does not count, but `maxCalls` does: each level is a `lazy` call, and the count lasts across the awaits of this package, such as an asynchronous `check`'s, so such a schema, given a cyclic object, stops too. An await inside a validator you write yourself is not seen, and what it calls after it is counted afresh, so put asynchronous work in a `check`, or bound such a validator yourself. `lazy` stops after `maxCalls` calls in one validation, 10,000 by default, as a backstop for work that grows faster than the input. A `lazy` gives the result it found for an object at a path again when the same object is reached there again in one validation, so the options of a recursive `union` of objects share the children's result and the work grows with the input; a schema that makes a new object at every level, such as with a `transform` that copies its value, cannot share it, and could otherwise run for hours on a few hundred bytes. At that default a validation it stops holds about 10 MB of issues for each `lazy`. Raise it for trusted recursive data with more nodes, or use `tagged` for objects told apart by a property. Nothing else limits how much input is checked: a large input that passes is validated in full, and asynchronous rules of every item start at once. What a failing input reports is limited, as the last note here says. Cap the size of untrusted input, and give `array`, `set`, `map`, `record` and a `tuple` with `rest` a `max`, before validating it. A byte limit is not enough for a value received by structured clone, such as `event.data` from `postMessage`, a worker or Electron IPC: it can hold a sparse array whose length costs nothing to send, or the same array at many places, so a message of a few bytes holds millions of items. Only `max` bounds those.
- A collection stops once its items have reported 1,000 issues, and adds one `too_big` issue that says so, so a long list of bad items costs a bounded amount of memory and time instead of about a thousand times its size. Input that passes is still validated in full: cap the size of untrusted input and give collections a `max`.

## License

Licensed under Apache-2.0.
