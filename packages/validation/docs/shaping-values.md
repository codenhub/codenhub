---
title: Shaping values
description: Chain validators, convert values, write them back, mark and freeze them, describe them, replace a failure with a fallback, and reuse the shape of an object.
order: 8
---

# Shaping values

A validator does more than accept or reject. It can clean a value, convert it into another type, and later write it back. This page covers the tools that change what a validator produces, or how it is described, and the ways to build one object from another. In the sign-up, they read the time an invitation expires as a `Date`, mark a user's id so that no other string passes for one, and derive the profile update from the sign-up object.

## `pipe`

`pipe(a, b, ...)` runs validators in order. Each is given the value the previous one produced, and `pipe` produces what the last produces:

```ts
import { coerceNumber, email, pipe, string } from "@codenhub/validation";

const address = pipe(string({ trim: true, max: 254 }), email());
const age = pipe(string({ trim: true }), coerceNumber({ int: true, min: 13 }));
```

The first failure stops it, because a later step has nothing valid to work on. Use it to clean a value before checking a format, or to check one rule after another.

Its input type is the input type of its first validator.

## `transform`

`transform(validator, convert)` changes the value a validator produced into another, such as text into its length:

```ts
import { string, transform } from "@codenhub/validation";

const length = transform(string(), (text) => text.length);

length("Ada"); // { ok: true, value: 3 }
```

- `convert` runs only when `validator` succeeded, and cannot reject the value. To reject what it produced, put a validator with checks after it with `pipe`. A conversion that can fail is a validator of its own, as [Custom validators](custom-validators.md#a-conversion-that-can-fail) shows.
- A `convert` that throws is a bug, and the exception propagates.
- A `transform` goes one way. [`encode`](#encode) cannot write its value back, and throws, naming where it is. Where a value must go back, use a [`codec`](#codec).

A `convert` that returns a promise makes the result asynchronous. So does one typed as possibly returning one, including one typed as returning `unknown`. So does any value with a `then` method, since `await` would treat it as a promise. Wrap such a value in an object before it is returned.

A `convert` typed as returning `any`, such as `JSON.parse`, has opted out of type checking, and is typed synchronous. So `transform(string(), JSON.parse)` needs no `await`. If it can return a promise, say so in its return type.

## `codec`

`codec(input, output, { decode, encode })` reads a value in the form it is sent, and returns the value a program uses, and can write it back. It validates with `input`, gives what that produced to `decode`, and validates the result with `output`. So both ends are checked:

```ts
import { bigint, codec, date, datetime, pattern, string } from "@codenhub/validation";

const expiresAt = codec(datetime(), date(), {
  decode: (text) => new Date(text),
  encode: (value) => value.toISOString(),
});

// The input accepts only the text BigInt reads, so decode never throws.
const amount = codec(string({ max: 40 }, pattern(/^-?\d+$/)), bigint(), {
  decode: (text) => BigInt(text),
  encode: (value) => value.toString(),
});
```

- `decode` is given what `input` produced, and returns what `output` validates. `encode` is given what `output` produced, and returns what `input` validates. Each is typed so, and `Conversions<typeof input, typeof output>` is the type of the pair.
- A function that throws is a bug and propagates, as the function of a `transform` does. To fail, return a value the other validator refuses: a `decode` that gives an invalid `Date` fails `date()`. Or let `input` accept only what `decode` can read, as `amount` does, since `BigInt` throws for other text.
- Both are synchronous. One that returns a promise throws a `TypeError` when it is called, since the codec is typed as not waiting. A rule that waits goes in a check.
- It is written as a JSON Schema as its `input`, or as its `output` with `io: "output"`. An output JSON Schema cannot express, such as the `Date` of `expiresAt`, throws there unless `unrepresentable: "any"` is given, as [JSON Schema](json-schema.md) says.

## `encode`

`encode(validator, value)` writes a value of the type a validator produces back to what the validator accepts: the `Date` a `codec` read back to its text, an object of them back to an object of text, and what `json` parsed back to JSON. It returns a result, as a validator does:

```ts
import { codec, date, datetime, encode, object, string } from "@codenhub/validation";

const expiresAt = codec(datetime(), date(), {
  decode: (text) => new Date(text),
  encode: (value) => value.toISOString(),
});
const invitation = object({ code: string(), expiresAt });

encode(invitation, { code: "AB12", expiresAt: new Date(0) });
// { ok: true, value: { code: "AB12", expiresAt: "1970-01-01T00:00:00.000Z" } }
```

`Encoded<typeof validator>` is the type of what it returns: a result, to be awaited when the validator is asynchronous. Each kind of part is written back its own way:

- **A `codec`** writes the value back through its `output` first. A codec inside the output writes its part first. An output written by hand checks the value and passes it on unchanged. Then the codec runs its `encode` on the result, and checks that its `input` accepts what that returns.
- **A part that produces what it accepts**, such as `string`, `number`, a format or a coercion, validates the value and gives what it produced. `email()` gives the address as the parser reads it, and `coerceNumber()` gives the number, which it accepts.
- **A composer**, such as `object`, `array`, `tuple`, `record`, `map`, `set`, `union` or `tagged`, writes back each of its parts with its own options, and runs its checks on the value once its parts passed. `optional`, `nullable` and `nullish` keep what they let through, and a `pipe` writes its steps back from the last.
- **`json` and `searchParams`** write text: `JSON.stringify` of what their validator wrote back, and a query string with each value as text and each item of a list as a repeated key. The validator it came from then reads the text back, so text it would refuse fails: a list written as a repeated key, which `searchParams` reads only with `repeated: true`, and `undefined`, which is no JSON. What `JSON.stringify` changes is changed: `NaN` is written as `null`, and a property that is `undefined` is left out.
- **`optional` with a default** writes the default back as `undefined` when its inner part refuses it, since only `undefined` produced it: `optional(string({ min: 3 }), "")` writes `""` back as `undefined`. A default made by a function cannot be compared. A `fallback` value its inner part refuses fails, since every input its inner part refuses produces it, and which one was given is not known.

**What cannot go back throws** a `TypeError` that names its place, as in `TypeError: encode cannot write back a transform at the root. Use a codec there`. That is a `transform`, whose function goes one way, a validator written by hand, and a `codec` with a `transform` in its output. `formData` is refused too.

So a value the validator could not have produced fails with the issues it has, at their paths: `encode(expiresAt, new Date(Number.NaN))` fails as `date()` would.

- It is synchronous unless a part waits.
- A coercion writes back the value it produced, which it accepts. So inside `json`, a `bigint` from `coerceBigint()` cannot be written as JSON, and throws a `TypeError` that names its place. Use a codec that writes it as text, as `amount` above does.
- On each call, it builds a validator of each part of the schema the other way, from the same factories. So a program that calls it bundles every composer.

## `brand`

`brand(validator, name)` marks what a validator produces with a name, in the types alone. TypeScript treats two types of the same shape as one, so a function that takes a `string` it calls a user id also takes an email, or text nobody validated. With a brand, the only way to a value of the type is through the validator:

```ts
import { brand, uuid, type Infer } from "@codenhub/validation";

const userId = brand(uuid(), "UserId");
type UserId = Infer<typeof userId>;

declare function loadUser(id: UserId): Promise<unknown>;

const result = userId(input);
if (result.ok) {
  await loadUser(result.value);
}
// loadUser("not validated") is a compile error
```

- Nothing changes at run time. `brand` returns the validator it was given, so it validates, is described, and is written as a JSON Schema as before. `pick` and its kin still read a branded `object`.
- The input type is not marked, since what is given to a validator has not passed it yet.
- `null` and `undefined` are left unmarked, so `brand(optional(string()), "Id")` produces a marked string or `undefined`.
- Brands add up, so `brand(brand(string(), "A"), "B")` produces a type with both.
- `Branded<T, "Name">` is the marked type, for when you need to write it.

## `readonly`

`readonly(validator)` makes what a validator produces read-only: in its type, and by freezing the object or array. `ReadonlyOutput<T>` is the type it gives.

```ts
import { array, object, readonly, string, type Infer } from "@codenhub/validation";

const settings = readonly(object({ theme: string(), tags: readonly(array(string())) }));
type Settings = Infer<typeof settings>; // { readonly theme: string; readonly tags: readonly string[] }
```

- It freezes the value itself and not what is inside it, as `Object.freeze` does and as the type says. Wrap an inner validator too where its value must not change, as `tags` above.
- A value that is the input itself is never frozen, since the caller owns it. `instanceOf`, `guard` and `unknown` produce what they were given, so `readonly` changes only their type. `object`, `objectLike`, `array`, `tuple`, `record`, `set` and `map` produce a new value, which is frozen.
- A `Map` or a `Set` is typed `ReadonlyMap` or `ReadonlySet`, and only the type protects it: freezing one does not stop `set` or `add`. A typed array cannot be frozen, and is left unfrozen, and so is a `DataView`. The type covers properties and not methods, so a `Date` keeps its setters.
- A value counts as the caller's only when it is the input itself. When a `transform` returns a value from inside the input, such as `(value) => value.tags`, that value is frozen. Copy it there when the caller must keep it changeable. The same goes for an object it returns from your own data: `readonly(transform(string(), (key) => cache[key]))` freezes the entry in `cache`, so return a copy there too.
- `pick`, `omit`, `required` and `partial` read an `object`, so reshape first and wrap after: `readonly(pick(user, ["name"]))`.

## `meta`

`meta(validator, { title, description, examples, deprecated })` says what a validator is for, to whoever reads the schema: a person reading the documentation of an API, or a language model choosing a tool and filling in its arguments. [`toJsonSchema`](json-schema.md#saying-what-a-value-is-for) writes each key beside the types, under the name JSON Schema has for it. `Meta` is the type of the second argument.

```ts
import { meta, number, object, string } from "@codenhub/validation";

const forecast = meta(
  object({
    city: meta(string({ min: 1 }), { description: "The city to get the weather for", examples: ["Lisbon"] }),
    days: meta(number({ int: true, min: 1, max: 7 }), { description: "How many days ahead" }),
  }),
  { title: "Forecast", description: "The weather for the coming days" },
);
```

- It returns a new validator that validates exactly as the one given. Its description is that of the one given, with `meta` added. The validator given is not changed, so the same one can be described differently in two places.
- A `meta` given to a validator that has one replaces the keys it names and keeps the others. A key given as `undefined` counts as not given.
- `title` and `description` are text. `examples` is a list of JSON values: `null`, booleans, finite numbers, text, and lists and plain objects of them. `deprecated` is `true` or `false`. Any other value, or any other key, is a `TypeError` when the validator is made.
- A JSON Schema is JSON, so an example of a `Date` is written as its text. Examples are kept as given and not validated, since they may show the input or the output.
- `pick`, `omit`, `required`, `partial` and `extend` read through it to the object it describes. What they make has no `meta`, since a title written for one object is rarely right for another: give it one of its own.
- What `standard` made stays a Standard Schema under `meta`.

## `fallback`

`fallback(validator, value)` replaces a value that fails `validator` with a fallback, so the result never fails:

```ts
import { fallback, oneOf } from "@codenhub/validation";

const theme = fallback(oneOf(["light", "dark"]), "light");

theme("purple"); // { ok: true, value: "light" }
```

This turns bad input into a value that looks valid. Keep it for data where a sensible default is safer than an error, such as a stored preference that may be out of date.

- The fallback is trusted, and is not validated.
- A function is called with the issues that were found, which is the place to log them. So a fallback that is itself a function is returned from one: `fallback(validator, () => callback)`. The types reject the callback itself whenever the validator inside can produce a function. For the same reason, a function that reads an argument, such as `Array` or `String`, would be given the issues: write `() => []`, not `Array`.
- A primitive is used directly. An array or an object must come from a function, such as `fallback(array(string()), () => [])`. One value would be shared by every result, and a change to one would show up in the next. The types reject it, and `fallback` throws a `TypeError` when it is created from JavaScript.
- A value whose validation `lazy` stopped at one of its limits, such as cyclic input or input nested past `maxDepth`, fails too, so it is replaced like any other failure. When those limits must be reported, keep `fallback` off a recursive schema.

Its input type is `unknown`, since it accepts anything.

## Reusing shapes

### Spreading a shape

A shape is an ordinary object, so it is reused with ordinary JavaScript. Spread one into another to extend it, and leave keys out with destructuring. `partial(shape)` returns a new shape with every property wrapped in `optional`, for an update where any field may be left out:

```ts
import { email, number, object, partial, string } from "@codenhub/validation";

const account = { name: string({ trim: true, min: 2, max: 100 }), email: email() };

const createAccount = object(account);
const updateAccount = object(partial(account)); // every property optional
const withAge = object({ ...account, age: number({ int: true, min: 13 }) });
```

- The original shape is unchanged, so the required version is still there to use.
- A property left out stays out. So a default given with `optional(validator, value)` in the shape is not applied by its `partial` version: an update leaves out what it does not change.
- A shape holds enumerable text keys only. `object`, `partial` and `tagged` throw a `TypeError` when they are created with a symbol key or a key that is not enumerable, since its validator would never run.

`PartialShape<TShape>` is the type `partial(shape)` returns.

### `pick`, `omit`, `required`, `partial` and `extend`

When what you have is the validator and not its shape, such as one another module exports, these functions take the validator. Each takes a validator `object` made, and returns a new one. The one it was given is not changed:

```ts
import { boolean, email, extend, number, object, omit, optional, partial, pick, required, string } from "@codenhub/validation";

const user = object({ id: number(), name: string({ min: 2 }), email: email(), bio: optional(string()) });

const contact = pick(user, ["name", "email"]); // { name: string; email: string }
const draft = omit(user, ["id"]); // everything but the id
const patch = partial(user); // every property optional
const complete = required(user); // bio is required too
const admin = extend(user, { admin: boolean() }); // every property of user, and admin
```

- `pick(validator, keys)` keeps the named properties, and `omit(validator, keys)` leaves them out. A key the object does not have is a `TypeError` when the validator is created, since it is a misspelling.
- `partial(validator)` wraps every property in `optional`, as `partial(shape)` does.
- `extend(validator, shape)` adds the properties of `shape`, as spreading one shape into another does. A property the object has is replaced by the one given, in its place.
- `required(validator)` makes every property required. A property made with `optional` becomes the validator it wrapped, so its default is removed too, and a missing property fails. One made with `nullish` becomes `nullable`, which still accepts `null`. A property that accepts `undefined` some other way, such as `unknown()`, is kept unchanged.

The new object keeps the options of the one it came from, `unknownKeys` and `message`. It takes options and checks of its own after its arguments, as `object` does: `pick(user, ["name"], { unknownKeys: "strict" }, check(...))`.

- Each option given replaces the one of its name, and leaves the others. So a strict object picked from with only a `message` stays strict.
- An option given as `undefined` counts as not given, and keeps the one of the original. So `pick(strictUser, ["name"], { unknownKeys: undefined })` stays strict.

An object with checks is refused with a `TypeError`. A check reads the whole object, so it may read a property the new object lacks. Kept, it could fail every value. Dropped without a word, the new object would accept what the first was written to refuse. Make the object without its checks, derive from that, and give each result the checks it needs.

They need a validator `object` made, since that is how they know its shape. `objectLike`, a `pipe` or a `transform` around an object, and a validator written by hand are a `TypeError`. They read the shape through [`describe`](json-schema.md#reading-a-schema), which is how you would write one of your own.

The types they return have names, for a library that exports what it derives:

- `Picked<T, K>` and `Omitted<T, K>`: the object type with only the named properties, or without them.
- `AllOptional<T>` and `AllRequired<T>`: the object type with every property optional, or every property present and none of them `undefined`.
- `Extended<T, TShape>`: the object type `T` with the properties of `TShape` added or replaced.
- `Reshaped<TValidator, T, TInput?>`: a validator of `T` that is synchronous when the validator it was made from is.

## Next

A validator made from these tools is still one validator, so the libraries that take a schema take it directly. [Standard Schema](standard-schema.md) covers how.
