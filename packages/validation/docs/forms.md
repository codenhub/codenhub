---
title: Forms
description: Rules across fields, optional fields and defaults, errors shown beside each field, files, and the types a form holds.
order: 2
---

# Forms

A form is where invalid input is most common, and where the person who typed it needs to know what to fix. This page grows the sign-up into a form: a password typed twice, optional fields with defaults, an avatar file, and errors shown beside each field. It ends with the types a form library needs.

## Fields that must agree

A check given to an `object` runs once every property has passed, and sees the whole object, typed. So it can compare fields. Point its issue at the field to fix with `path`:

```ts
import { check, object, string } from "@codenhub/validation";

const passwords = object(
  { password: string({ min: 12, max: 200 }), confirm: string({ max: 200 }) },
  check((data) => data.password === data.confirm, { path: ["confirm"], message: "Passwords must match" }),
);

passwords({ password: "correct horse battery", confirm: "nope" }); // { ok: false, ... }, code "custom"
```

`data` needs no annotation: its type comes from the object. [Custom validators](custom-validators.md#adding-a-rule-with-check) explains what else a check can report.

### A rule that does not wait for the other fields

That check says nothing while any property fails, since there is no whole object to give it. On a form that is often too late: with the name still empty, the user learns the passwords differ only after fixing everything else.

`checkFields(keys, test, issue?)` is a check that names the properties it needs. It runs once those properties have passed, whether the others did or not, and its test is given an object of those properties alone:

```ts
import { checkFields, email, object, string } from "@codenhub/validation";

const signupForm = object(
  {
    name: string({ trim: true, min: 2, max: 100 }),
    email: email(),
    password: string({ min: 12, max: 200 }),
    confirm: string({ max: 200 }),
  },
  checkFields(["password", "confirm"], (data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "Passwords must match",
  }),
);

signupForm({ name: "", email: "ada@example.com", password: "correct horse battery", confirm: "nope" });
// { ok: false, ... }, code "too_small"
```

That call reports two issues: the one of `name`, and "Passwords must match" at `confirm`. Some details:

- It still waits for the properties it names. While `password` is too short, nothing is said about `confirm`, since the test would compare a value that is not valid.
- Its issues come after those of the properties, in the order the checks were given.
- `data` holds the named properties and no others, so the test cannot come to rely on one that may have failed. A named property that is absent, as an optional one may be, is absent from `data` too.
- It takes its issue as `check` does, and a test that returns a promise makes the object asynchronous.
- A validation still gives one result. When another property waits, as one that asks a server does, the test of `checkFields` runs as soon as it can, and its issue comes with the rest once every property has answered.
- A name the object does not have throws a `TypeError` when the object is created, since it is a misspelling. So does a list of no names, when the check is created.

It works on `object` and `objectLike`. Keep `check` for a rule that needs the whole object, and use both on one object when you have both kinds.

## Optional fields and defaults

Three wrappers accept an absent value as well as what the validator inside accepts:

- `optional(validator)` accepts `undefined`.
- `nullable(validator)` accepts `null`.
- `nullish(validator)` accepts both.

The accepted value is passed through, and every other value goes to the validator inside. So `optional` does not treat `null` or the empty string as absent. The wrappers report no issue of their own, so they take no options or checks: give those to the validator they wrap.

Inside an `object`, a property whose validator can produce `undefined` is optional in the type, and is left out of the output when the input does not have it.

### Defaults

`optional(validator, value)` replaces `undefined` with a default, and gives every other value to the validator. So an invalid value is still rejected, and only a missing one is replaced:

```ts
import { array, oneOf, optional, string } from "@codenhub/validation";

const plan = optional(oneOf(["free", "pro"]), "free");
const interests = optional(array(string({ max: 50 }), { max: 10 }), () => []);

plan(undefined); // { ok: true, value: "free" }
plan("gold"); // { ok: false, ... }, code "invalid_value"
```

Inside an `object`, a property with a default is always present in the output type. Some rules:

- The default is trusted, and is not validated.
- A primitive is used directly. A function is called each time, with no argument, to make the default.
- An array or an object must come from a function, such as `() => []`. One value would be shared by every result, and a change to one would show up in the next. The types reject it, and `optional` throws a `TypeError` when it is given one from JavaScript.
- For the same reason, a default that is itself a function, such as a callback for `func()`, is returned from one: `optional(func(), () => noop)`. Given `noop` directly, `optional` would call it and use what it returns, so the types reject it whenever the validator inside can produce a function.
- The type assumes the validator never produces `undefined` for a value that is present, which every built-in validator keeps. A `transform` that returns `undefined` is let through, and the default replaces only a missing value.

## Errors beside each field

`flatten` groups the messages of a failed result by field, which is what a form shows:

```ts
import { checkFields, flatten, object, string } from "@codenhub/validation";

const signupForm = object(
  { name: string({ min: 2 }), password: string({ min: 12 }), confirm: string() },
  checkFields(["password", "confirm"], (data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "Passwords must match",
  }),
);

const result = signupForm({ name: "A", password: "correct horse battery", confirm: "nope" });
if (!result.ok) {
  flatten(result.error).fieldErrors; // { name: ["Must be at least 2 characters"], confirm: ["Passwords must match"] }
}
```

Issues at the root of the value go to `formErrors`, and the rest are keyed by their path in `fieldErrors`. [Issues and messages](errors.md#errors-for-a-form) covers `flatten` in full, and how to word the messages in another language.

## Files

A form that sends a file arrives as a `FormData`, from `request.formData()` on a server or `new FormData(form)` in the browser. `formData` reads it, and `file` checks each file in it:

```ts
import { contentType, file, formData, object, optional, string } from "@codenhub/validation";

const signupUpload = formData(
  object({
    name: string({ trim: true, min: 2, max: 100 }),
    avatar: optional(file({ maxSize: 1_000_000 }, contentType(["image/png", "image/jpeg"]))),
  }),
);

export const readSignup = async (request: Request) => signupUpload(await request.formData());
```

### `formData`

`formData(validator, options?, ...checks)` reads a `FormData`, from this realm or another, into an object of its fields, each a string or a `File`. It then produces what `validator` makes of that object.

- A key given more than once fails at its path with `invalid_key`, unless the `repeated` option is set. A check that saw one of the two values while the server read the other would pass a value nobody checked.
- With `repeated: true`, every key gives a list, as a field of several files or several checked boxes of one name needs: `formData(object({ photos: array(file({ maxSize: 5_000_000 }), { max: 10 }) }), { repeated: true })`.
- Anything else, a `URLSearchParams` or a plain object included, fails with `invalid_type` and `{ expected: "form data", received }`.

The form is read before it reaches the validator, and reading it reads the whole body. So cap the size of the body where the request is read, and give each `file` a `maxSize`.

`audit` reads through `formData` to what it holds. `toJsonSchema` and `encode` refuse `formData`, as they refuse any validator they cannot write.

### `file`

`file(options?, ...checks)` accepts a `File`, from this realm or another, and produces it. A `Blob` is no file, since a form sends a file with its name, and neither is an object that only claims to be one. The options never read the file's content, and no issue holds its name, its type or a byte of it.

| Option    | Fails with                                                     |
| --------- | -------------------------------------------------------------- |
| `minSize` | `too_small`, `{ minimum, type: "file" }`, in bytes             |
| `maxSize` | `too_big`, `{ maximum, type: "file" }`, in bytes               |
| `types`   | `invalid_value`, `{ options, type: "file" }`, the types listed |

`types` compares the media type the file declares, without letter case and without parameters such as `;charset=utf-8`. The client declares whatever it likes, so `types` alone lets through a script named `photo.png` with the type `image/png`. To check what the file holds, use `contentType`.

[`audit`](limits.md#checking-a-schema-for-the-bounds-it-needs) reports a `file` without a `maxSize`, since the program holds whatever size it accepts.

### `contentType`

`contentType(types, message?)` is a check for `file`. It reads the first bytes of the file, and passes when they are those of one of the types given, whatever the file declares.

- It knows `image/png`, `image/jpeg`, `image/gif`, `image/webp` and `application/pdf`, and throws for any other type when the check is made.
- The first bytes are the signature of a format, not proof that the rest is well formed. A program that decodes the file still handles one it cannot decode.
- Reading is asynchronous, so a `file` given this check is an `AsyncValidator`.
- It runs once every option of the `file` passed, so `maxSize` refuses a large file before a byte of it is read.
- Content that does not match fails with `invalid_value` and `{ options, content: true }`. A file that cannot be read fails with `{ unreadable: true }`.

## The types of a form

A form holds what the user typed, before it is validated. That is the validator's input type, which differs from the type it produces wherever the validator changes its value. `InferInput<typeof validator>` reads the input type, and `Infer` the output:

```ts
import { coerceNumber, object, oneOf, optional, type Infer, type InferInput } from "@codenhub/validation";

const preferences = object({ age: coerceNumber(), plan: optional(oneOf(["free", "pro"]), "free") });

type Preferences = Infer<typeof preferences>; // { age: number; plan: "free" | "pro" }
type PreferencesInput = InferInput<typeof preferences>; // { age: string | number; plan?: "free" | "pro" | undefined }
```

The two types differ for:

- `optional` with a default, whose input may be absent.
- The `coerce` validators, which accept text, as [Text input](text-input.md) explains.
- `transform`, and `pipe`, which accepts what its first validator accepts.
- `json`, which accepts text, and `searchParams`, which accepts text or a `URLSearchParams`. The type of `searchParams` is `string | Iterable<[string, string]>`, so that it names no global of one runtime.
- `fallback`, which accepts anything.

Clean-up is no difference: `string({ trim: true })` accepts and produces a `string`.

A validator is still called with any value at all. The input type says what can pass, for the types of a form or of a caller, and never limits the argument. A validator you write by hand has the input type `unknown`, unless its type says otherwise, as `Validator<number, string>` does for one that reads a number from text.

A form library that takes a [Standard Schema](standard-schema.md) reads both types from the validator. [Integrations](integrations.md#forms) shows react-hook-form and TanStack Form.

## Next

The sign-up form is ready for the browser. The server receives the same data as a JSON body, and often more than a form sends: lists, dictionaries and shapes that vary. [Request bodies](request-bodies.md) covers those.
