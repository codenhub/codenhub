---
title: Custom validators
description: Write your own validator, add rules to an existing one, and validate asynchronously.
---

# Custom validators

The built-in validators cover common cases. For everything else you write a validator yourself, and it takes no helper and no registration: a validator is any function that takes an input and returns a result.

## Writing a validator

Return `pass(value)` when the input is acceptable and `fail(...)` when it is not:

```ts
import { fail, pass, type Validator } from "@codenhub/validation";

const even: Validator<number> = (input) => (typeof input === "number" && input % 2 === 0 ? pass(input) : fail({ code: "not_even" }));

even(4); // { ok: true, value: 4 }
even(3); // { ok: false, error: { issues: [{ code: "not_even", path: [] }] } }
```

The parameter is `unknown` because a validator exists to check data you do not trust yet, so check the type before you use it. The `Validator<number>` annotation is optional, but it makes the compiler check your function against the contract and tells `Infer` what the validator produces.

Because a validator is only a function, yours works everywhere a built-in does: inside `object`, `optional` and `pipe`, and as the first argument of `refine`.

```ts
import { object } from "@codenhub/validation";

// `even` is the validator written above.
const pairs = object({ count: even });
```

### Reporting failures

`fail` takes one or more issues, and throws a `TypeError` for none, since a failure with no issue says nothing. Each can set:

| Field     | Meaning                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `code`    | A stable string callers branch on. Defaults to `"custom"`. Pick your own, such as `"username_taken"`.                                      |
| `path`    | Where the problem is, relative to the value you were given. Defaults to the value itself. A parent adds its own segments in front.         |
| `params`  | Facts about the failure, for building a message or for callers to inspect. Never put the input in here: an issue is something callers log. |
| `message` | Fixed message text. Without it, [`formatIssue`](errors.md#turning-an-issue-into-text) builds text from the `code` and `params`.            |

To report several problems at once, pass several issues:

```ts
import { fail, pass, type IssueInput, type Validator } from "@codenhub/validation";

const strongPassword: Validator<string> = (input) => {
  if (typeof input !== "string") {
    return fail({ code: "invalid_type", params: { expected: "string", received: typeof input } });
  }
  const issues: IssueInput[] = [];
  if (!/\d/.test(input)) {
    issues.push({ code: "missing_digit" });
  }
  if (!/[A-Z]/.test(input)) {
    issues.push({ code: "missing_uppercase" });
  }
  const [first, ...rest] = issues;
  return first ? fail(first, ...rest) : pass(input);
};
```

### Building on an existing validator

To reuse a built-in validator and add to it, call it and look at the result. Return its failure unchanged, or continue with the value it produced:

```ts
import { email, fail, pass, type Validator } from "@codenhub/validation";

const workEmail: Validator<string> = (input) => {
  const result = email()(input);
  if (!result.ok) {
    return result;
  }
  return result.value.endsWith("@example.com") ? pass(result.value) : fail({ code: "not_work_email" });
};
```

For a single extra rule, `refine` does this for you, and `transform` changes the value. A `transform` cannot reject, so a conversion that can fail, such as turning a day into a `Date`, is a validator of your own placed after the wrapped one with `pipe`:

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

## Adding a rule with `refine`

`refine(validator, check, issue?)` runs `check` on the value `validator` produced, and only when `validator` succeeded. It returns a validator of the same type.

```ts
import { refine, string } from "@codenhub/validation";

const notReserved = refine(string({ trim: true }), (name) => name !== "admin", {
  code: "reserved_name",
  message: "That name is reserved",
});
```

The third argument is the issue reported when `check` returns `false`. A string is shorthand for `{ message }`. Without it the issue has code `custom`.

Use `refine` for rules that involve several fields as well, and point the issue at the field the user should fix with `path`:

```ts
import { object, refine, string } from "@codenhub/validation";

const signup = refine(object({ password: string({ min: 8 }), confirm: string() }), (data) => data.password === data.confirm, { code: "mismatch", path: ["confirm"] });
```

`check` only runs when the whole object is valid, so it can rely on `data.password` being a string.

## Asynchronous rules

A rule that needs to wait, such as checking a username against a database, is a function that returns a promise. A `refine` check may return one:

```ts
import { email, object, refine, string } from "@codenhub/validation";

const username = refine(string({ trim: true, min: 3 }), async (name) => !(await isTaken(name)), {
  code: "username_taken",
});

const signup = object({ username, email: email() });

const result = await signup(input);
```

Nothing else changes. A validator that holds an asynchronous rule becomes an `AsyncValidator`, and so does everything that contains it: `signup` above is one because `username` is. The type tells the compiler the result must be awaited, so reading `signup(input).ok` without `await` is an error you find while writing, not a bug you find in production.

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
- **Independent properties run their rules concurrently.** In `signup` above, the username lookup and the email check start together.
- **Issues stay in a fixed order.** They follow the order of the shape, not the order in which the promises finished.
- **`is` needs a synchronous validator.** It throws a `TypeError` for one that turns out to return a promise.
- **A rejected promise is a bug, not invalid input.** If your callback throws or rejects, the exception propagates. Report invalid input with `fail`.

## What you must not do

- **Do not put the input in an issue.** No `params` value, no `message` built from the input. Issues are logged, and inputs are passwords and tokens.
- **Do not throw for bad input.** Return `fail`. Throw only for a mistake in how the validator was set up, and do it when it is created, not when it runs.
- **Do not modify the input.** Return a new value from `pass` when a validator changes it.

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
