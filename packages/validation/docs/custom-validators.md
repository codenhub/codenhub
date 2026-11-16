---
title: Custom validators
description: Add rules with checks, build validators that behave like the built-in ones, validate asynchronously, and name the types a library of validators exports.
order: 6
---

# Custom validators

The built-in validators cover common cases. A real sign-up has rules of its own: a name that is reserved, a username somebody already took, a product code your company invented years ago that nobody dares to change. This page shows how to write those. Neither kind needs registration:

- A **check** adds a rule to a validator you already have, such as a name not being taken.
- A **validator** checks a type or a format of your own, such as a postcode.

The helpers `check`, `format` and `guard` build both on the same internals as the built-in ones. So what you build behaves as they do: the same issue shapes, a `message` option, and checks of its own.

## Adding a rule with `check`

`check(test, issue?)` makes a check from a test of a typed value. Give it to a validator after its options:

```ts
import { check, number, string } from "@codenhub/validation";

const mustBeEven = check((n: number) => n % 2 === 0, "Must be even");

const seats = number({ int: true }, mustBeEven);
const username = string(
  { trim: true, max: 30 },
  check((name) => name !== "admin", { code: "reserved_name", message: "That name is reserved" }),
);

username("admin"); // { ok: false, ... }, code "reserved_name"
```

The test receives the value the validator produced, after its clean-up. It returns `true` when the value is acceptable. A check of the wrong type, such as a number check given to `string`, is a compile error.

The second argument is the issue to report when the test returns `false`:

- A string is its message.
- A function of the issue words it when it is reported, as the message of a built-in check does. It must return text, or the validator throws a `TypeError` when it reports the issue.
- An object can set a `code`, `path`, `params` and `message`. A `path` is a list of keys and indexes, each index an integer of zero or more, and `params` is a plain object. A path of text, one holding a symbol or an index such as `-1`, `params` that is not a plain object, and a list given as the issue each throw a `TypeError` when the check is made.

Without a code, the issue has code `custom`, at the value's own location. An issue without a message of its own is worded by the `message` option of the validator the check is given to, when it has one. Otherwise only its code is left, and `formatIssue` says "Invalid value". So give a check a message wherever people read what it reports.

A check runs once the value has its type and has passed the validator's own options. So `username` above never tests a name longer than 30 characters. For an object, that means once every property has passed, so a check can compare them. [Forms](forms.md#fields-that-must-agree) shows two passwords that must match, and [`checkFields`](forms.md#a-rule-that-does-not-wait-for-the-other-fields), a check that runs before the other fields have passed.

### A check that reports several issues

A test can also return the issues it found, and an empty list for a value it accepts. That is how a check reports several issues at once, or chooses a path for each failure:

```ts
import { check, string, type IssueInput } from "@codenhub/validation";

const strongPassword = check((password: string) => {
  const issues: IssueInput[] = [];
  if (!/\d/.test(password)) {
    issues.push({ code: "missing_digit" });
  }
  if (!/[A-Z]/.test(password)) {
    issues.push({ code: "missing_uppercase" });
  }
  return issues;
});

const password = string({ min: 12, max: 200 }, strongPassword);

password("correct horse battery"); // { ok: false, ... }, code "missing_digit"
```

Each issue in the list is an object, as `fail()` takes one:

- An issue without a `code` has code `custom`, and one without a `path` is at the value's own location.
- An issue without a `message` is worded by the second argument of `check`, when that is a message or an issue with one.
- Anything else in the list, such as `null` or text, throws a `TypeError` when the check reports it. So do a `path` that is not a list, such as `"confirm"`, an index in a path that is negative or not an integer, such as `-1`, and `params` that is not a plain object.

A test that returns anything but a boolean or a list throws a `TypeError` when the check runs. That includes the `undefined` of a test that forgot to return: read as a pass, it would accept every value.

A validator takes as a check only what `check`, [`checkFields`](forms.md#a-rule-that-does-not-wait-for-the-other-fields) or a built-in check such as `nonBlank()` made. A function given in the place of a check throws a `TypeError` when the validator is created. The code that runs a test and reads its answer comes with `check`, so a schema without one carries none of it.

## Making a validator

### A format with `format`

`format(name, test)` makes the factory of a string format, which behaves as `email()` or `uuid()` do:

- A non-string fails with `invalid_type`.
- A string the test rejects fails with `invalid_format`, and `params.format` set to `name`.
- A string the test accepts is produced as written.

```ts
import { format } from "@codenhub/validation";

export const postcode = format("postcode", (text) => /^\d{5}(?:-\d{4})?$/.test(text));

postcode()("12345"); // { ok: true, value: "12345" }
postcode({ message: "Enter a ZIP code" })("abc"); // { ok: false, ... }
```

The test must answer at once. A test that returns a promise throws a `TypeError` when the validator runs, since a pending answer would pass every value. A rule that waits is a check, as [Asynchronous rules](#asynchronous-rules) shows.

`name` is part of the format's contract: callers branch on it and message maps word it, so choose it once: renaming it later breaks every caller that branched on it. [JSON Schema](json-schema.md) writes no `format` for it, since JSON Schema does not know the name.

### A type with `guard`

`guard(expected, typeGuard)` makes the factory of a validator for any type, from a type guard. A value the guard rejects fails with `invalid_type`, and `params.expected` set to `expected`. The guard must answer at once, as the test of `format` must:

```ts
import { guard, object } from "@codenhub/validation";

export const blob = guard("Blob", (input): input is Blob => input instanceof Blob);

const attachment = object({ content: blob({ message: "Choose a file" }) });
```

For a `File` from a form, use the package's own [`file`](forms.md#file), which also checks the size and the type.

### A validator with options of its own

A validator with options is a function that checks its options and returns what a builder or a built-in makes. Check the options when it is called, not when the validator runs, so a mistake in a schema is found at once:

```ts
import { check, string, type Validator } from "@codenhub/validation";

export function sku(prefix: string): Validator<string> {
  if (!/^[A-Z]{2,4}$/.test(prefix)) {
    throw new RangeError(`prefix must be 2 to 4 capital letters, received "${prefix}"`);
  }
  return string(check((text) => new RegExp(`^${prefix}-\\d{6}$`).test(text), { code: "invalid_sku", params: { prefix } }));
}
```

### By hand

`validator(validate)` makes a validator from a function that takes an input and returns a result. Return `pass(value)` when the input is acceptable, and `fail(...)` when it is not:

```ts
import { fail, pass, validator } from "@codenhub/validation";

const even = validator((input) => (typeof input === "number" && input % 2 === 0 ? pass(input) : fail({ code: "not_even" })));

even(4); // { ok: true, value: 4 }
even(3); // { ok: false, ... }, code "not_even"
```

The parameter is `unknown`, because a validator exists to check data you do not trust yet. The type the validator produces is read from what the function returns, so `even` is a validator of `number`, and `Infer` says so.

- To name a type the body does not show, type what the function returns: `validator((input): ValidationResult<User> => ...)`.
- To say what it accepts, for [`InferInput`](forms.md#the-types-of-a-form), type the function as a validator before giving it: one typed `Validator<number, string>` reads a number from text. Without that, the input type is `unknown`.
- An issue keeps only its `code`, `path`, `params` and `message`, as one made with `fail()` does, so a property you add to it by hand, such as the input, never reaches the result.

What `validator` returns works everywhere a built-in one does, such as inside `object`, `optional` and `pipe`, and is a [Standard Schema](standard-schema.md) as they are. It has no `message` option or checks unless you write them, which is what the builders are for.

A composer takes a function written by hand only through `validator`. The code that calls such a function, checks what it returned and waits for it comes with `validator`, so a schema without one carries none of it.

`fail` takes one or more issues. Each can set:

| Field     | Meaning                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `code`    | A stable string callers branch on. Defaults to `"custom"`. Pick your own, such as `"username_taken"`.                                      |
| `path`    | Where the problem is, relative to the value you were given. Defaults to the value itself. A parent adds its own segments in front.         |
| `params`  | Facts about the failure, for building a message or for callers to inspect. Never put the input in here: an issue is something callers log. |
| `message` | Fixed message text. Without it, [`formatIssue`](errors.md#turning-an-issue-into-text) builds text from the `code` and `params`.            |

`fail` throws a `TypeError` for no issue, since a failure with no issue says nothing. It also throws for a `path` that is not a list, such as `"confirm"` where `["confirm"]` was meant, which would be split into one segment per letter, for an index in a path that is negative or not an integer, such as `-1`, for `params` that is not a plain object, and for a list given as an issue, as `fail(issues)` where `fail(...issues)` was meant, which would be read as one issue that says nothing.

### A function that is no validator

A function this package did not make is refused where a validator belongs, with a `TypeError` that names the argument when the composer is created:

```ts
import { object, string, type Validator } from "@codenhub/validation";

object({ name: string as unknown as Validator<string> }); // TypeError: shape.name is not a validator of this copy of the package. A factory is called first, as in string(), and any other function is given to validator()
```

The common cause is a factory given where its validator belongs, as `string` instead of `string()`. The types reject that, so it happens in JavaScript, or past a cast. The other is a function written by hand that was not given to `validator`, which the types accept when it is typed as a `Validator`. The name is the argument's: `shape.name`, `item`, `options[1]` of a `union`, `key` of a `record`. A `lazy` reads its validator when it first runs, so it throws then.

A validator made by another installed copy of this package is refused the same way, and so is one of its checks: it happens when two packages depend on versions of `@codenhub/validation` that do not overlap, and one is given a schema of the other. Each copy reports issues to itself, so one cannot run the validators of the other as its own. Install one version for both, or give the validator to `validator`, which runs it as any function written by hand and keeps its issues, though no longer what `describe` and `toJsonSchema` read of it.

A function given to `validator` that returns anything other than a result is a bug too: nothing, the input itself, or a failure without issues. The validator throws a `TypeError` when it runs, "A validator written by hand must return pass(value) or fail(issue)". A failure it built by hand rather than with `fail` is checked as `fail` checks its issues, so a `path` such as `"confirm"` or `[-1]`, or `params` that is not a plain object, throws there too.

### A conversion that can fail

[`transform`](shaping-values.md#transform) changes the value a validator produced into another, and cannot reject it. A conversion that can fail, such as reading a day as a `Date`, is a validator of its own, placed after the first with `pipe`:

```ts
import { fail, isoDate, pass, pipe, validator } from "@codenhub/validation";

// isoDate has already checked the text is a day such as 2026-09-28, so this reads it as UTC midnight
// the same way on every runtime. `new Date(text)` on free-form text would not.
const startOfDay = validator((input) => {
  const date = new Date(`${String(input)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? fail({ code: "invalid_date" }) : pass(date);
});

const birthday = pipe(isoDate(), startOfDay);
```

For dates in general, [`coerceDate`](text-input.md#dates) already does this conversion.

## Asynchronous rules

A rule that needs to wait, such as checking a username against a database, is a check whose test returns a promise:

```ts
import { check, email, object, string } from "@codenhub/validation";

const username = string(
  { trim: true, min: 3, max: 30 },
  check(async (name) => !(await isTaken(name)), { code: "username_taken" }),
);

const signup = object({ username, email: email() });

const result = await signup(input);
```

Nothing else changes. A validator given an asynchronous check becomes an `AsyncValidator`, and so does everything that contains it: `signup` above is one because `username` is.

The type tells the compiler the result must be awaited. So reading `signup(input).ok` without `await` is an error you find while writing, not a bug you find in production, where a promise has no `ok`: `!result.ok` would turn every sign-up away, and `result.ok === false` would let every one through. A check whose test may wait is an `AsyncCheck<T>`, and one whose test answers at once is a `Check<T>`, which keeps its validators synchronous.

You can also write an asynchronous validator directly:

```ts
import { fail, pass, validator } from "@codenhub/validation";

const existingUser = validator(async (input) => {
  const user = typeof input === "string" ? await findUser(input) : undefined;
  return user ? pass(user) : fail({ code: "unknown_user" });
});
```

What such a validator calls after its own `await` is a separate validation, since the package cannot follow an `await` it did not make. A `lazy` it reaches counts its `maxCalls` again from zero, so recursion through it is not bounded. Keep the `await` in a check, whose awaits the package makes, when the validator leads back to a recursive schema.

Things to know about asynchronous validation:

- **Always `await` the result of an `AsyncValidator`.** It may be a promise, or a plain result when the validator could answer without waiting, for instance `optional(existingUser)` given `undefined`. `await` handles both.
- **Independent properties and items run their rules concurrently.** In `signup` above, the username lookup and the email check start together. So does the rule of every item of an array, with no limit. Give the array a `max` before validating a list you did not write, so it cannot start thousands of lookups at once.
- **Issues stay in a fixed order.** They follow the order of the shape and of the checks, not the order in which the promises finished.
- **`is` and `assert` need a synchronous validator.** They throw a `TypeError` for one that returns a promise.
- **A rejected promise is a bug, not invalid input.** If your test throws or rejects, the exception propagates. Report invalid input by returning `false` or an issue. Only `instanceOf` turns a throw into a failure: a `Symbol.hasInstance` of the class, or a prototype trap of the value, that throws fails the value with `invalid_type`, as `objectLike` reports a property it could not read.

## What you must not do

- **Do not put the input in an issue.** No `params` value, and no `message` built from the input. Issues are logged, and inputs are passwords and tokens.
- **Do not throw for bad input.** Return `false` or a list of issues from a test, or `fail` from a validator. Throw only for a mistake in how a validator was set up, and do it when it is created, not when it runs.
- **Do not modify the input.** Return a new value from `pass` when a validator changes it.
- **Do not make a validator when a module loads unless the call is marked pure.** `export const postcode = format(...)` runs when the module loads, so a bundler keeps it even in a program that never uses it. That is harmless in an app. A library of validators that wants each one dropped when unused writes `export const postcode = /* @__PURE__ */ format(...)`.

## Testing a validator

A validator is a function, so a test calls it and looks at the result:

```ts
import { expect, it } from "vitest";

// `even` is the validator written above.
it("rejects odd numbers with the not_even code", () => {
  const result = even(3);
  expect(result.ok).toBe(false);
  expect(!result.ok && result.error.issues[0]?.code).toBe("not_even");
});
```

## Types

A library that exports validators of its own names them in its declarations. These are the types the package exports for that. Each is documented in its source, and listed in the [API reference](reference/index.md).

The types you write most:

- `Validator<T, TInput?>` and `AsyncValidator<T, TInput?>`: a validator, synchronous or not. `AnyValidator` is either one.
- `Schema<T, TInput?>` and `AsyncSchema<T, TInput?>`: a validator a factory of this package made, which is also a [Standard Schema](standard-schema.md). What `validator` returns is one too. A function only typed as a `Validator` is not, and no composer takes it.
- `Check<T>` and `AsyncCheck<T>`: a check.
- `Infer` and `InferInput`: the type a validator produces, and the type that can pass it.
- `ValidationResult<T>`, which is `ValidationOk<T>` or `ValidationErr`. A `ValidationErr` holds a `ValidationFailure`, whose `issues` are `ValidationIssue`s.
- `ValidationIssueCode`, the built-in codes, open to any other string, and `ValidationPathSegment`, a key or an index of a `path`.
- `IssueInput`, an issue as `fail` takes it, and `CheckAnswer`, what the test of a `check` returns.
- `Validated`, what a function given to `validator` returns, and `ValidatedValue`, the type of the value in it.
- `Message`, the text or function of a `message` option, and `MessageOptions`, the options every validator takes.

The options of each validator are named after it: `StringOptions`, `NumberOptions`, `BigintOptions`, `DateOptions`, `FileOptions`, `ArrayOptions`, `TupleOptions`, `LazyOptions`, `FormDataOptions`, `SearchParamsOptions`, `CoerceDateOptions`, `EmailOptions`, `UrlOptions`, `IpOptions`, `UuidOptions`, `DatetimeOptions`, `TimeOptions` and `Base64Options`. `SizeOptions` holds the `min`, `max` and `length` that `set`, `map` and `record` take. `AssertOptions`, `JsonSchemaOptions` and the rest belong to the pages of their functions.

The types of shapes, which name what a composer produces and accepts:

- `Shape`, the properties of an `object`, with `InferShape` and `InferShapeInput`.
- `InferRecord` and `InferRecordInput`, for a `record`.
- `InferTuple` and `InferTupleInput`, for a `tuple`.
- `Variants`, the variants of a `tagged` union, with `InferTagged` and `InferTaggedInput`.
- The types of `pick` and its kin, in [Shaping values](shaping-values.md#reusing-shapes).

The machinery of the signatures, which you mostly meet in your editor's tooltips:

- `Factory<T, TOptions, TInput?>`, the factory a builder such as `format` returns: options first, then checks.
- `Rest<T, TOptions>` and `AsyncRest<T, TOptions>`, what follows a validator's own arguments: options, then checks.
- `Composed<TChildren, TOutput, TInput?>`, the validator a composer returns: synchronous while every child is.
- `LiteralValue`, a value `literal` takes. `EnumLike`, an object made by a TypeScript `enum`, which `oneOf` takes. `AnyFunction`, any function, for `func`. `Constructor`, a class, for `instanceOf`.

## Next

Many rules of your own are formats of text. Before you write one, check whether the package has it, since every email regex on the internet is wrong in its own way. [Formats](formats.md) lists email addresses, URLs, IP addresses, dates and the rest.
