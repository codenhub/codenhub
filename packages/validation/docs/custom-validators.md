---
title: Custom validators
description: Add rules with checks, build validators that behave like the built-in ones, and validate asynchronously.
---

# Custom validators

The built-in validators cover common cases. For everything else there are two things to write, and neither needs registration:

- A **check** adds a rule to a validator you already have, such as two fields having to match or a name not being taken.
- A **validator** checks a type or a format of your own, such as a `File` or a postcode.

The helpers `check`, `format` and `guard` build both on the same internals as the built-in ones, so what you build behaves exactly as they do: the same issue shapes, a `message` option, and checks of its own.

## Adding a rule with `check`

`check(test, issue?)` makes a check from a test of a typed value. Give it to a validator after its options:

```ts
import { check, number, string } from "@codenhub/validation";

const even = check((n: number) => n % 2 === 0, "Must be even");

number({ int: true }, even);
string(
  { trim: true },
  check((name) => name !== "admin", { code: "reserved_name", message: "That name is reserved" }),
);
```

The test receives the value the validator produced, after its clean-up, and returns `true` when the value is acceptable. The second argument is the issue to report when it returns `false`: a string is its message, and an object can set a `code`, `path`, `params` and `message`. Without it the issue has code `custom` at the value's own location.

A check runs once the value has its type. For an object that means once every property has passed, so a check can compare them and rely on their types. Point the issue at the field the user should fix with `path`:

```ts
import { check, object, string } from "@codenhub/validation";

const signup = object(
  { password: string({ min: 8 }), confirm: string() },
  check((data) => data.password === data.confirm, { code: "mismatch", path: ["confirm"], message: "Passwords must match" }),
);
```

`data` needs no annotation: its type comes from the object. A check of the wrong type, such as a number check given to `string`, is a compile error.

A check can also be written by hand, as a function that returns nothing for a value it accepts or the issues it found. Type it as `Check<T>`, which is how it reports several issues at once or chooses a path per failure:

```ts
import { string, type Check } from "@codenhub/validation";

const strongPassword: Check<string> = (password) => {
  const issues = [];
  if (!/\d/.test(password)) {
    issues.push({ code: "missing_digit", path: [] });
  }
  if (!/[A-Z]/.test(password)) {
    issues.push({ code: "missing_uppercase", path: [] });
  }
  return issues.length > 0 ? issues : undefined;
};

const password = string({ min: 12 }, strongPassword);
```

## Making a validator

### A format with `format`

`format(name, test)` makes the factory of a string format, which behaves as `email()` or `uuid()` do: a non-string fails with `invalid_type`, and a string the test rejects with `invalid_format` and `params.format` set to `name`. The string is produced as written.

```ts
import { format } from "@codenhub/validation";

export const postcode = format("postcode", (text) => /^\d{5}(?:-\d{4})?$/.test(text));

postcode()("12345"); // { ok: true, value: "12345" }
postcode({ message: "Enter a ZIP code" })("abc"); // { ok: false, ... }
```

`name` is part of the format's contract: callers branch on it and message maps word it, so choose it once.

### A type with `guard`

`guard(expected, typeGuard)` makes the factory of a validator for any type from a type guard. A value the guard rejects fails with `invalid_type` and `params.expected` set to `expected`:

```ts
import { guard, object } from "@codenhub/validation";

export const file = guard("File", (input): input is File => input instanceof File);

const upload = object({ avatar: file({ message: "Choose an image" }) });
```

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

A validator is any function that takes an input and returns a result. Return `pass(value)` when the input is acceptable and `fail(...)` when it is not:

```ts
import { fail, pass, type Validator } from "@codenhub/validation";

const even: Validator<number> = (input) => (typeof input === "number" && input % 2 === 0 ? pass(input) : fail({ code: "not_even" }));
```

The parameter is `unknown` because a validator exists to check data you do not trust yet. The `Validator<number>` annotation makes the compiler check your function against the contract and tells `Infer` what it produces. A hand-written validator works everywhere a built-in does, inside `object`, `optional` and `pipe`, but has no `message` option or checks unless you write them, which is what the builders are for.

`fail` takes one or more issues, and throws a `TypeError` for none, since a failure with no issue says nothing. Each can set:

| Field     | Meaning                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `code`    | A stable string callers branch on. Defaults to `"custom"`. Pick your own, such as `"username_taken"`.                                      |
| `path`    | Where the problem is, relative to the value you were given. Defaults to the value itself. A parent adds its own segments in front.         |
| `params`  | Facts about the failure, for building a message or for callers to inspect. Never put the input in here: an issue is something callers log. |
| `message` | Fixed message text. Without it, [`formatIssue`](errors.md#turning-an-issue-into-text) builds text from the `code` and `params`.            |

## Converting a value

`transform(validator, convert)` changes the value a validator produced into another, and cannot reject it. A conversion that can fail, such as reading a day as a `Date`, is a validator of its own placed after the first with `pipe`:

```ts
import { fail, isoDate, pass, pipe, type Validator } from "@codenhub/validation";

// isoDate has already checked the text is a day such as 2026-09-28, so this reads it as UTC midnight
// the same way on every runtime. `new Date(text)` on free-form text would not.
const startOfDay: Validator<Date> = (input) => {
  const date = new Date(`${String(input)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? fail({ code: "invalid_date" }) : pass(date);
};

const birthday = pipe(isoDate(), startOfDay);
```

For dates in general, [`coerceDate`](coercion.md) already does this conversion.

## Asynchronous rules

A rule that needs to wait, such as checking a username against a database, is a check whose test returns a promise:

```ts
import { check, email, object, string } from "@codenhub/validation";

const username = string(
  { trim: true, min: 3 },
  check(async (name) => !(await isTaken(name)), { code: "username_taken" }),
);

const signup = object({ username, email: email() });

const result = await signup(input);
```

Nothing else changes. A validator given an asynchronous check becomes an `AsyncValidator`, and so does everything that contains it: `signup` above is one because `username` is. The type tells the compiler the result must be awaited, so reading `signup(input).ok` without `await` is an error you find while writing, not a bug you find in production. A hand-written check that may wait is typed `AsyncCheck<T>`; typing it `Check<T>` keeps its validators synchronous, and the compiler holds you to it.

You can also write an asynchronous validator directly:

```ts
import { fail, pass, type AsyncValidator } from "@codenhub/validation";

const existingUser: AsyncValidator<User> = async (input) => {
  const user = typeof input === "string" ? await findUser(input) : undefined;
  return user ? pass(user) : fail({ code: "unknown_user" });
};
```

Things to know about asynchronous validation:

- **Always `await` the result of an `AsyncValidator`.** It may be a promise, or a plain result when the validator could answer without waiting, for instance `optional(existingUser)` given `undefined`. `await` handles both.
- **Independent properties and items run their rules concurrently.** In `signup` above, the username lookup and the email check start together, and so does the rule of every item of an array, with no limit. Give the array a `max` before validating a list you did not write, so it cannot start thousands of lookups at once.
- **Issues stay in a fixed order.** They follow the order of the shape and of the checks, not the order in which the promises finished.
- **`is` needs a synchronous validator.** It throws a `TypeError` for one that turns out to return a promise.
- **A rejected promise is a bug, not invalid input.** If your test throws or rejects, the exception propagates. Report invalid input by returning `false` or an issue.

## What you must not do

- **Do not put the input in an issue.** No `params` value, no `message` built from the input. Issues are logged, and inputs are passwords and tokens.
- **Do not throw for bad input.** Return `false` from a test, issues from a check, or `fail` from a validator. Throw only for a mistake in how a validator was set up, and do it when it is created, not when it runs.
- **Do not modify the input.** Return a new value from `pass` when a validator changes it.
- **Do not make a validator when a module loads unless the call is marked pure.** `export const postcode = format(...)` runs when the module loads, so a bundler keeps it even in a program that never uses it. That is harmless in an app, but a library of validators that wants each to be dropped when unused writes `export const postcode = /* @__PURE__ */ format(...)`.

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
