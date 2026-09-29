---
title: Customization
description: Writing your own rules, async checks, transforms and reusable validators on top of the built-in ones.
order: 15
---

# Customization

The built-in validators cover the common cases. Everything beyond them is built from a handful of pieces that combine with each other and with every built-in: `refine`, `check`, `transform`, `pipe`, `custom`, and the ability to make any of them async. This page shows what each one is for and how to pick.

## Choosing a tool

| You want to...                                                            | Use                                       |
| ------------------------------------------------------------------------- | ----------------------------------------- |
| Reject values that fail a yes-or-no test                                  | `refine(predicate, message)`              |
| Report several issues, point at nested fields, or use your own error code | `check((value, ctx) => ...)`              |
| Turn the value into something else                                        | `transform((value) => ...)`               |
| Run one validator on the output of another                                | `a.pipe(b)`                               |
| Validate a type none of the built-ins describe                            | `val.custom<T>(predicate)`                |
| Compare two properties of the same object                                 | `refine` or `check` on the object         |
| Call a database or an API                                                 | any of the above with an `async` function |

## refine: a yes-or-no rule

`refine` takes a predicate. If it returns `false`, the value is rejected with the message you give.

```ts
const evenNumber = val.number().refine((n) => n % 2 === 0, "Must be even");
```

The second argument is a message string, a [message function](errors.md#changing-the-wording), or an options object that also sets the `path`, `code` and `params` of the issue:

```ts
const signup = val.object({ password: val.string().min(8), confirm: val.string() }).refine((data) => data.password === data.confirm, {
  message: "Passwords must match",
  path: ["confirm"],
  code: "password_mismatch",
});
```

`path` is relative to the value being refined: on an object, `["confirm"]` points at its `confirm` property. Without one, the issue points at the value itself.

A refinement runs only when the value already has the right structure. On the object above, if `password` is missing the schema reports that and does not run the comparison, so your predicate can rely on `data.password` being a string.

## check: full control over issues

`check` receives the value and a context. It reports problems with `ctx.addIssue` and returns nothing. Use it when one rule can find several problems, when a problem belongs to a nested path, or when you want your own error code.

```ts
const order = val.object({ items: val.array(val.object({ sku: val.string(), qty: val.number().int() })) }).check((order, ctx) => {
  const seen = new Set<string>();
  order.items.forEach((item, index) => {
    if (seen.has(item.sku)) {
      ctx.addIssue({
        code: "duplicate_sku",
        message: `SKU ${item.sku} appears twice`,
        path: ["items", index, "sku"],
      });
    }
    seen.add(item.sku);
  });
});
```

`ctx.addIssue` accepts `code` (defaults to `"custom"`), `message` (a string or a message function), `path` (relative to the checked value), `params`, and `input`, which is kept only with `includeInput`. Reporting any issue makes the validation fail, and reporting several reports them all.

The context also carries `ctx.path`, the full location of the value being checked, and `ctx.options`, the options of the running call.

## transform: change the value

`transform` maps the validated value to another, and the output type follows:

```ts
const csv = val.string().transform((text) => text.split(",").map((part) => part.trim()));
type Csv = Infer<typeof csv>; // string[]
```

It runs after everything before it has passed, so its input is already valid. To reject a value from inside a transform, report an issue and return `NEVER`, which stands in for a value you cannot produce:

```ts
import { NEVER } from "@codenhub/validation";

const percent = val.string().transform((text, ctx) => {
  const parsed = Number.parseFloat(text);
  if (Number.isNaN(parsed)) {
    ctx.addIssue({ code: "invalid_format", message: "Not a number" });
    return NEVER;
  }
  return parsed / 100;
});
```

To validate what a transform produced, follow it with `pipe`.

## pipe: validate the output again

`a.pipe(b)` runs `a`, then runs `b` on `a`'s output. It is how a transform gets rules of its own:

```ts
const age = val
  .string()
  .transform((text) => Number(text))
  .pipe(val.number().int().min(0));
```

If `a` fails, `b` does not run.

## custom: a validator from a predicate

`val.custom<T>(predicate, options?)` builds a validator for a type the built-ins do not describe. The type argument is a claim: the predicate must only return `true` for values that really are a `T`. A type guard lets the compiler check that claim:

```ts
type Slug = string & { readonly __brand: "slug" };

const isSlug = (input: unknown): input is Slug => typeof input === "string" && /^[a-z0-9-]+$/.test(input);

const slug = val.custom<Slug>(isSlug, "Use lowercase letters, digits and hyphens");
```

The result composes like any validator: inside objects, arrays, unions, with `.optional()`.

## Async rules

Any callback can be `async`, or return a promise:

```ts
const username = val
  .string()
  .min(3)
  .refine(async (name) => !(await db.users.exists(name)), "Username is taken");

const result = await username.validateAsync(input);
```

A schema that contains async work must be run with `validateAsync` or `parseAsync`. The sync methods (`validate`, `parse`, `is`) throw an `Error` when they reach it, so a forgotten `await` is a loud mistake instead of a silent pass. Async callbacks only run once the value has the right structure, so an async check never sees a wrong type. Rules of the same validator all run and report together, so do not rely on an earlier rule having passed to keep an expensive lookup from running.

Async checks inside one object or array run concurrently. Issue order is still the order of the schema, not of completion. With `abortEarly` they run one at a time and stop at the first failure.

## Reusable rules

Rules are functions, so a rule you use twice is a function you name. A `check` function does not have to be written inline:

```ts
import { type CheckFn } from "@codenhub/validation";

const noWhitespace: CheckFn<string> = (value, ctx) => {
  if (/\s/.test(value)) {
    ctx.addIssue({ code: "whitespace", message: "Must not contain whitespace" });
  }
};

const handle = val.string().min(3).check(noWhitespace);
const tag = val.string().max(20).check(noWhitespace);
```

For a reusable rule with arguments, return the function:

```ts
const oneOf =
  (allowed: readonly string[]): CheckFn<string> =>
  (value, ctx) => {
    if (!allowed.includes(value)) {
      ctx.addIssue({ code: "not_allowed", message: "Not an allowed value", params: { allowed } });
    }
  };
```

To reuse a whole schema fragment, keep it in a constant and compose it: `val.object({ id: uuid })`, `.extend(timestamps.shape)`, `.and(auditFields)`.

## Passing data to checks

Checks often need something that is not in the input: the current user, a database handle, a locale. Pass it as `context` and read it back in the check:

```ts
const schema = val.string().check(async (name, ctx) => {
  const { db } = ctx.options.context as { db: Db };
  if (await db.users.exists(name)) {
    ctx.addIssue({ code: "username_taken", message: "Username is taken" });
  }
});

await schema.validateAsync(input, { context: { db } });
```

`context` is typed `unknown`, so narrow it where you read it, as above.

## Cross-field rules and where issues appear

Put a rule on the object that owns all the fields it needs. Whether you use `refine` with a `path` or `check` with `ctx.addIssue`, point the issue at the field the person should fix, not at the object, so a form can show the message next to it. Issues whose path is empty are "form errors" in [`flatten()`](errors.md#showing-errors-next-to-form-fields).

## Exceptions are bugs

An exception thrown inside your callback is not treated as invalid input: it propagates out of `validate` like any other bug, and `catch()` does not swallow it. If a callback can fail for reasons that are the input's fault, report that with `ctx.addIssue` or a `false` return, and let real bugs surface.
