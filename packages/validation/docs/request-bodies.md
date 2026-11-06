---
title: Request bodies
description: JSON text, lists, tuples, dictionaries, sets and maps, a choice between shapes, and recursive data.
order: 3
---

# Request bodies

A server receives what any client chose to send, and clients have range. This page covers the shapes a request body holds beyond one flat object: JSON text, lists, dictionaries, a choice between shapes, and data that nests inside itself. The sign-up API gets a list of interests, a referral that can take two shapes, and a body that is still JSON text.

## JSON text

`json(validator?, options?, ...checks)` accepts text that holds JSON, parses it, and gives the parsed value to `validator`:

```ts
import { array, email, json, object, pipe, string, unique } from "@codenhub/validation";

const signupBody = pipe(
  string({ max: 100_000 }),
  json(
    object({
      name: string({ trim: true, min: 2, max: 100 }),
      email: email(),
      interests: array(string({ max: 50 }), { max: 10 }, unique()),
    }),
  ),
);

signupBody('{"name":"Ada","email":"ada@example.com","interests":["math"]}'); // ok
signupBody("{"); // { ok: false, ... }, code "invalid_format"
```

- A non-string fails with `invalid_type`, and text that is not JSON fails with `invalid_format` and `{ format: "json" }`.
- Without a validator, the result is `unknown`.
- Issue paths from `validator` are relative to the parsed value.
- A function in the first place is the validator, so checks need one: `json(object(shape), {}, check(...))`.
- Anything else in the first place but options throws a `TypeError` when created, `undefined` included. So a validator that is missing, such as one read from a key that does not exist, never makes a `json` that accepts any JSON.

The text is parsed by `JSON.parse`, so two of its rules apply:

- A key given twice keeps its last value: `{"a":1,"a":2}` gives `{ a: 2 }`.
- A number beyond what a double holds exactly loses digits: `12345678901234567890` becomes `12345678901234567000`, an ID that now belongs to someone else. Send such numbers as strings, and read them with `coerceBigint`.

The `string({ max: 100_000 })` in front bounds the text before it is parsed. [Limits](limits.md) explains why a body needs a bound like it.

## Lists and other collections

Every collection validator takes the validator for its items, then options and checks. It checks every item, and reports each issue with a path that leads through the item's position.

The size options are `min`, `max` and `length`, all non-negative integers, and `min` and `max` are inclusive:

- A size failure is `too_small` with `{ minimum, type }` or `too_big` with `{ maximum, type }`, where `type` is `"array"`, `"set"`, `"map"` or `"record"`. `exact: true` is added for `length`.
- A wrong size is reported at once, without validating the items, so the items of a huge input are never validated only to be rejected. A `record` still lists the input's keys, to count them.
- A size that is not a number, such as `"3"`, throws a `TypeError` when the validator is created. A number that is not a non-negative integer throws a `RangeError`, and so do limits no size can satisfy together, such as `min` above `max`, or a `length` outside them.

A collection also stops once its items have reported 1,000 issues. [Limits](limits.md#a-failing-input-has-a-bounded-cost) explains that limit.

### `array`

`array(item, options?, ...checks)` accepts arrays whose every item passes `item`, and produces a new array of what `item` produced. It takes `min`, `max` and `length`.

A sparse array's holes are validated as `undefined`, so the work grows with the array's `length`, not with the items it holds. Give untrusted input a `max`, which is checked before any item.

The `unique(by?, message?)` check rejects repeats:

```ts
import { array, string, unique } from "@codenhub/validation";

const interests = array(string({ trim: true, min: 1, max: 50 }), { max: 10 }, unique());

interests(["math", "music"]); // ok
interests(["math", "math"]); // { ok: false, ... }, code "invalid_value"
```

- It compares the validated items the way a `Set` does, or the key `by` returns for each item: `unique((user) => user.id)` makes ids unique.
- Each repeat is reported at its own index, as `invalid_value` with `{ unique: true }`, and the first occurrence is kept.
- Like every check, it runs only once every item is valid.
- A `Set` finds two objects equal only when they are the same object. Every object or list a composer such as `object` or `array` produces is new, and two `Date`s of one moment are two objects. So without `by`, `unique()` would find no repeat among them. Its types accept it only for an array of primitives; an array of objects, lists or dates needs `by`, such as `unique((day) => day.getTime())`.

### `tuple`

`tuple(items, options?)` accepts an array of fixed length in which each position has its own validator, and produces a tuple type:

```ts
import { number, string, tuple } from "@codenhub/validation";

const point = tuple([number(), number()]); // [number, number]
const call = tuple([string()], { rest: number(), max: 10 }); // [string, ...number[]], at most 10 items
```

- Without `rest`, the array must be exactly as long as `items`. A wrong length fails with `too_small` and `{ minimum, type: "array", exact: true }`, or `too_big` and `{ maximum, type: "array", exact: true }`.
- The `rest` option is a validator for every position after the fixed ones, so the array can be longer. It must still have at least as many items as `items`, and fails with `too_small`, without `exact`, when it has fewer.
- `max` is allowed only with `rest`, and caps the whole length, the fixed items included. A longer array fails at once with `too_big` and `{ maximum, type: "array" }`, without validating the items. Give untrusted input a `max`, as you would an `array`.

### `record`

`record(key, value, options?)` accepts a plain object used as a dictionary: any number of keys, each passing `key`, each value passing `value`.

```ts
import { number, oneOf, record, string } from "@codenhub/validation";

const scores = record(string({ max: 50 }), number(), { max: 100 });
const hours = record(oneOf(["mon", "tue"]), number()); // { mon?: number; tue?: number }
```

- An issue's path ends at the key it belongs to.
- A key that fails is reported as one `invalid_key` issue, whose `params.issues` holds what the key validator found, so it is not mistaken for a problem with the value. A bad key still has its value checked.
- A key that the key validator changes, such as by lowercasing, must stay distinct. `{ A: 1, a: 2 }` under `string({ case: "lower" })` reports the second key as `invalid_key` with one `invalid_value` issue inside, `{ unique: true }`, instead of dropping a value.
- The output type has every key when `key` produces `string`, and is partial when `key` produces a fixed set of strings, such as `oneOf(["mon", "tue"])`.
- A `__proto__` key, which parsed JSON can hold, is reported as `invalid_key`, with one `invalid_value` issue inside, `{ reserved: true }`. That holds whether the input has the key or the key validator produces it. Kept, it would become the prototype of any copy of the output made by assignment, such as `Object.assign({}, output)`.
- `min`, `max` and `length` count keys, so `record(string(), number(), { max: 100 })` rejects a dictionary of more than 100 keys before it checks any of them.

### `set` and `map`

`set(item, options?)` accepts a `Set` and produces a new `Set` of the validated values. `map(key, value, options?)` accepts a `Map` and produces a new `Map`. Arrays and plain objects are not accepted for them. Both take `min`, `max` and `length`.

- In a set, a path leads through the value's position, in iteration order.
- In a map, a path leads through the entry's key when the key is a string, and through its position, a number, for any other key. So a number key and an object key never share a path.
- A map key that fails is reported as `invalid_key`, as for `record`. So is a key that another entry already has once the key validator changed it.
- A set value that `item` makes equal to an earlier one, such as `"A"` and `"a"` under `string({ case: "lower" })`, is reported as `invalid_value` with `{ unique: true }` at its position, instead of being merged. So the output never holds fewer values than the size options allow.

## A choice between shapes

### `union`

`union(options)` accepts a value that passes any one of several validators, and produces what the first one that accepts it produced. First come, first served, so put the more specific options first:

```ts
import { coerceNumber, number, string, union } from "@codenhub/validation";

const id = union([string({ min: 1 }), number({ int: true })]);

union([coerceNumber(), string()])("5"); // { ok: true, value: 5 }
union([string(), coerceNumber()])("5"); // { ok: true, value: "5" }
```

A value that no option accepts fails with one `invalid_union` issue at the value's own path. Its `params.issues` lists, for each option in order, the issues that option found, with paths relative to the value the union received.

- A union that failed inside an option, such as one for a property of an object option, is listed with its code and path, without the issues of its own options. [Issues behind an issue](errors.md#issues-behind-an-issue) explains why. To see those issues, call the inner union on the value.
- Every option runs until one accepts the value. So in a recursive union of objects, every option reaches the children. Use `tagged` for objects told apart by a property, which validates only the matching variant.
- A limit of `lazy` that stopped the validation is kept, as [Limits](limits.md#recursive-data) explains.

### `tagged`

`tagged(key, variants, options?, ...checks)` is for objects that share a tag property and differ in the rest, such as events with a `type`. It takes the name of the tag property and a record with a validator for each tag value. The input's tag chooses the variant, and the variant validates the rest of the input. A failure reports that variant's own issues, not a list of everything that did not match.

The sign-up accepts a referral from a friend or from a campaign:

```ts
import { email, object, string, tagged, type Infer } from "@codenhub/validation";

const referral = tagged("source", {
  friend: object({ email: email() }),
  campaign: object({ code: string({ min: 3, max: 20 }) }),
});

type Referral = Infer<typeof referral>;
// { source: "friend"; email: string } | { source: "campaign"; code: string }

referral({ source: "campaign", code: "SPRING" }); // { ok: true, value: { source: "campaign", code: "SPRING" } }
referral({ source: "ad" }); // { ok: false, ... }, code "invalid_union"
```

**A variant must not list the tag.** In some other libraries each variant is written `object({ source: literal("friend"), ... })`. Here a variant is given the input without its tag, so a variant that lists the tag could never pass. Its type is rejected, so the mistake is a compile error at that variant. The record key already says which tag the variant is for.

Because a variant never sees the tag:

- A strict `object` works as a variant, and so does a `record`, which checks every key but the tag.
- An output that declares the tag beside an index signature is still rejected, since the variant is never given it.
- The type of a `record` variant has an index signature beside the tag. Reading it and narrowing on the tag work, but TypeScript rejects writing such an object by hand when the tag is not of the record's value type.

The tag is added back to the output, so the result is a proper tagged union, and checking `referral.source` narrows the type. A missing, unknown or non-string tag fails with `invalid_union` at the tag's path, with `params: { discriminator, options }` listing the accepted tags.

Each variant must produce a plain object, since that is what can carry the tag. A variant typed to produce an array or a function is a compile error. A variant that produces any other value that is not a plain object at run time, such as a `Date` or a class instance from a `transform`, throws a `TypeError` that names the variant, since it is a mistake in the schema. `tagged` reads the tag of a plain object only, so it rejects a class instance before any variant sees it. To choose between instances, put `objectLike` validators in a `union`.

### `intersection`

`intersection(left, right)` accepts a value only when it passes both validators. It reports the issues of both together, and produces the two outputs merged:

- Plain objects are merged key by key, and arrays of the same length item by item, recursively.
- Two `Map`s or two `Set`s of the same size are merged entry by entry in iteration order, which both validators keep from the input. So a map keyed by objects, or a set of objects, merges too. A conflict inside one is reported at the entry's key when it is a string, and otherwise at its position.
- Cyclic or shared objects in the outputs are merged once, and the merged output keeps their shape.
- Any other pair must be the same value, `0` and `-0` merging as `0`, or two dates of the same moment.

Where the outputs differ otherwise, as `"  ab "` does when one side trims it and the other uppercases it, no value satisfies both. Each such place fails with `invalid_intersection` at its path, instead of one side silently winning.

The merged object is new. So an own `__proto__` key that one side passed on unchecked, as `unknown()` does, is reported as `invalid_key` with one issue inside, `{ reserved: true }`, as `record` reports it. Two cases keep the key:

- **A side whose shape lists `__proto__` at that place, and made the value there.** The shape has to be the last thing that touched the value. It is not when something after it made a new value:
  - A shape inside a `transform`. The value is what the transform's function returned, not what the shape checked.
  - A shape in a `pipe` step that a later step replaces with a new object.
  - The key validator of a `map` entry. It made the key, not the entry's value.
- **A value both sides passed on whole,** such as through `unknown()` on both. It is the input's own object, and is kept unchanged.

So `intersection(object({ ["__proto__"]: unknown() }), unknown())` keeps a `__proto__` key, since the left shape lists it and made the value. Wrap that `object` in a `transform` and the key is reported instead, unless the transform hands back the input object itself. The computed key matters: written as `{ __proto__: unknown() }`, the literal sets the shape's prototype and lists no key at all. Yes, really.

Both validators see the whole input, so two `object`s with `unknownKeys: "strict"` pass together only when every key of the input is listed in both shapes: each rejects the keys only the other lists. To combine strict shapes, spread them into one: `object({ ...named, ...aged }, { unknownKeys: "strict" })`.

## Recursive data

`lazy(getter, options?, ...checks)` looks up another validator the first time it runs, so a validator can refer to itself. TypeScript cannot infer a type that refers to itself, so annotate the variable with the type it produces:

```ts
import { array, lazy, object, string, type Validator } from "@codenhub/validation";

interface Category {
  name: string;
  children: Category[];
}

const category: Validator<Category> = object({
  name: string({ max: 100 }),
  children: array(
    lazy(() => category),
    { max: 50 },
  ),
});

category({ name: "Science", children: [{ name: "Math", children: [] }] }); // ok
```

Recursive input can be deep enough to overflow the stack, or wide enough to make the work grow faster than the input. `lazy` has two limits for those cases:

- `maxDepth`, 128 by default: the most levels of `lazy` that may be open at once. Deeper input fails with `too_big` and `{ maximum, type: "depth" }`.
- `maxCalls`, 10,000 by default: the most calls one `lazy` may make in one validation. Past it, each call fails with `too_big` and `{ maximum, type: "calls" }`.

Input nested thousands of levels deep, or a cyclic object, comes back as one of those failures and does not throw, as long as `maxDepth` fits the stack. A schema with many validators at each level can overflow the stack of a worker first, so [lower `maxDepth`](limits.md#maxdepth) for it there. [Limits](limits.md#recursive-data) explains both limits, when to change them, and how to build a recursive schema so that they hold.

## Next

The body of a request is JSON, but much of what a server reads is text: a query string, an environment variable, a form field. [Text input](text-input.md) reads numbers, flags and dates from text.
