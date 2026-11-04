---
title: Issues and messages
description: What a failed result holds, the built-in issue codes and their params, and how to turn issues into text in English, in Portuguese or in your own words.
order: 5
---

# Issues and messages

When a value is not valid, the result says exactly why. This page describes what a failed result holds, the codes the built-in validators report, and how to turn them into text for a person: the messages of the sign-up form, in English or in Portuguese, and the error a server throws for a bad configuration.

Validators do not write text when they fail. Text is a choice you make where you show it, so a program that never shows an issue carries no wording.

## The failed result

```ts
// What a validator returned for { name: "A", email: "nope" }
const result = {
  ok: false,
  error: {
    issues: [
      { code: "too_small", path: ["name"], params: { minimum: 2, type: "string" } },
      { code: "invalid_format", path: ["email"], params: { format: "email" } },
    ],
  },
};
```

`error.issues` lists every problem the validator found, in a fixed order, and is never empty. Its type says so too, so `result.error.issues[0]` is an issue and not `undefined`, even under `noUncheckedIndexedAccess`.

- The order follows the schema, not the time each rule took. A strict `object` reports its unrecognized keys first, then the issues of its properties in the order the shape lists them.
- A collection stops at 1,000 issues, as [Limits](limits.md#a-failing-input-has-a-bounded-cost) explains.

## The issue

| Field     | Meaning                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`    | A stable string that names the kind of failure. Branch on this, never on message text.                                                      |
| `path`    | Where the invalid value is, from the root of what you validated. Keys are strings and array indexes are numbers. Empty for the root itself. |
| `params`  | The facts behind the failure, such as the limit that was crossed. Present when there are any.                                               |
| `message` | Fixed text, when the issue was given one: by a validator's `message` option, a check's message, or a validator of your own.                 |

**An issue never contains an input value.** There is no field for it, and `params` holds type names and limits, never the value under test. Inputs are often passwords or tokens, and issues get logged and shown, so this is a rule and not a default. If you need the value, you already have it.

Keys are not values, and they do appear in issues:

- A path leads through the keys of the input, so a `record` or `map` issue names the key it belongs to.
- A strict `object` reports each key it does not recognize, in its path and in `params.key`.

So do not put secrets in key names you validate. A key is also text the sender chose. `englishMessages` puts it inside the message as a quoted string, as in `Unrecognized key "…"`, with quotes and line breaks escaped. `formatPath` quotes it the same way in the field names of `flatten`. So a key cannot break a log line. Escape both when you put them into HTML.

The same goes for what your own schema names: `literal` and `oneOf` report the values they accept, in `params` and in the English message. So do not check a secret with them, as [Fixed values](getting-started.md#fixed-values) warns.

### Writing a path

`formatPath(path)` writes a path for display:

```ts
import { formatPath } from "@codenhub/validation";

formatPath(["user", "addresses", 0, "street"]); // "user.addresses[0].street"
formatPath([0, "title"]); // "[0].title"
formatPath(["a.b"]); // '["a.b"]'
```

A key is quoted in brackets when it is empty or holds `.`, `[`, `]`, `"`, a control character such as a line break, or a line separator, with those characters escaped. So a key named `a.b` and the path `a`, `b` never give the same text.

## Built-in codes

The set of codes is open: a custom validator reports whatever code it likes. These are the codes the built-in validators use. Each page lists the exact code and `params` beside the validators it covers.

| Code                   | Meaning                                                                                                                                                                                          | `params`                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invalid_type`         | The value is not the type expected, or could not be converted to it.                                                                                                                             | `expected` and `received`, both type names, and `coerced: true` when a coercing validator could not convert the value.                                                                                                   |
| `invalid_format`       | A string does not have the required format.                                                                                                                                                      | `format`, such as `"email"` or `"regex"`, plus what the rule needs. For a failed part of `url` or `email`, `part` and `issues`, what the part validator found.                                                           |
| `invalid_value`        | The value has the right type, but a value that is not allowed.                                                                                                                                   | Depends on the rule, as the list below this table says.                                                                                                                                                                  |
| `too_small`            | Below a minimum: too short, too few items, or too small a number or date.                                                                                                                        | `minimum`, `type`, and `inclusive` or `exact` where they apply.                                                                                                                                                          |
| `too_big`              | Above a maximum; nested deeper, or recursing more often, than `lazy` allows; or a collection that stopped at 1,000 issues.                                                                       | `maximum`, `type` (`"depth"` or `"calls"` for `lazy`, `"issues"` for a collection that stopped), and `inclusive` or `exact` where they apply.                                                                            |
| `unrecognized_key`     | An object has a property its shape does not list, in strict mode.                                                                                                                                | `key`. The issue's path ends at the key.                                                                                                                                                                                 |
| `invalid_key`          | A key of a `record` or `map` failed its key validator; its key validator turned it into a key an earlier entry has; a key is given twice; or a key is `__proto__` where it would be copied over. | `issues`: what the key validator found, with paths relative to the key; for a repeated key, one `invalid_value` issue with `unique: true`; for `__proto__`, one with `reserved: true`. The issue's path ends at the key. |
| `invalid_intersection` | Both validators of an `intersection` passed, but produced values that cannot be merged into one.                                                                                                 | None. The issue's path is where the two outputs differ.                                                                                                                                                                  |
| `invalid_union`        | A value matched none of the options of a `union`, or a `tagged` union got a missing or unknown tag.                                                                                              | For `union`, `issues`: the issues each option found, in order, with paths relative to the union's value. For `tagged`, `discriminator` and `options`, and the issue's path is the tag's.                                 |
| `custom`               | The default code of a `check` or `fail` call that names no code.                                                                                                                                 | Whatever the reporter set.                                                                                                                                                                                               |

The `params` of `invalid_value`:

- `expected` for a `literal`, and `options` for a list of values.
- For a number, `type` and `format` (`"int"`, `"safeInt"`, `"nonZero"` or `"multipleOf"`), with the step in `value` for `"multipleOf"`.
- `unique: true` for a repeat in an array or a set.
- `reserved: true` inside the `invalid_key` of a `__proto__` key.
- `unreadable: true` for a property of an `objectLike` input that threw while it was read, or a file `contentType` could not read.
- `content: true` beside `options` for a file whose first bytes are of none of the types `contentType` lists.
- `encodedSeparator: true` and `dotSegment: true` for the URL paths described in [Formats](formats.md#paths-a-server-reads-otherwise).

A `__proto__` key is reported where it would be copied into a new object: in a `record`, among the unlisted keys of a passthrough `object`, and in an `intersection` whose sides passed it on unchecked.

`englishMessages` has no wording for `custom`, since a failed check carries nothing to word, so `formatIssue` says "Invalid value". Give a check a message where people read what it reports.

### The type names in `received`

`received` names kinds of value the same way everywhere: `null`, `array`, `nan`, `infinity`, `date`, `invalid date` for a `Date` that holds no moment, `object` for any other object (a `Map`, a `Set` or a class instance included), or the `typeof` of anything else. It never names a class, since that would take reading the prototype of the input.

Where a plain object is expected (`object`, `record`, `tagged`), any other object is `non-plain object`. `englishMessages` words that "Expected a plain object; copy it first, as in { ...value }", since a copy, such as `{ ...process.env }`, is what passes.

## Turning an issue into text

`formatIssue(issue, messages?)` turns an issue into text, from a message map, `englishMessages` unless you pass another:

```ts
import { formatIssue, number } from "@codenhub/validation";

const result = number({ min: 18 })(15);
if (!result.ok) {
  formatIssue(result.error.issues[0]); // "Must be at least 18"
}
```

The text comes from the first of these that exists:

1. The issue's own `message`, which a validator's [`message` option](#wording-one-validator) or a check's message sets.
2. An entry for its `code` in the message map.
3. The entry `default` of that map, which words every code the map has no entry for.
4. The text "Invalid value".

`englishMessages` is a value of its own. A program bundles it when it calls `formatIssue` or `flatten`, even with another map, since it is their default. A program that never calls them does not bundle it. A program whose issues all carry their own `message` can pass `{}`. A map that is not an object, such as `null`, is a `TypeError`.

`formatIssue` words the issues validators return. An issue received from elsewhere, such as JSON from a server you do not control, is input like any other, and a malformed one may throw: validate it before you word it.

A validator also has a short English wording of its own, for the libraries that read it as a [Standard Schema](standard-schema.md). That wording is not `englishMessages`, and that page describes it.

### Issues that hold other issues

Three codes hold the issues behind them in `params.issues`: `invalid_key`, `invalid_union` from `union`, and `invalid_format` for a failed part of a URL or an email address. `englishMessages` words them with the issue behind them, so the message says why:

- `invalid_key` with the first issue the key validator found, as in "Invalid key: Must be at least 3 characters". A key given twice, in a query string or after a key validator made two keys the same, is "Must be given only once".
- A failed part the same way, as in "Invalid email address domain: Expected one of "company.com"".
- `invalid_union` with the first issue of the one option whose kind the input had, when there is exactly one: every other option found only that the input is not its type, or not one of the values a `literal` or `oneOf` accepts. So `union([literal(""), email()])` given `"nope"` says "Invalid email address". Otherwise no option is the one meant, and it says "Does not match any of the allowed types". The issues of each option are in `params.issues` for a message of your own.

The issue behind is worded with the same map. So an override of `too_small` in a copy of `englishMessages` reaches the message of a key too. A quoted issue deeper than the value the outer issue is shown at starts with its path, as in "width: Must be at least 1" for the `width` of an object option.

A list of allowed values names the first ten, and how many more there are.

### Issues behind an issue

An issue held in another's `params.issues` keeps the issues behind it only when none of them holds issues of its own. So issues nest at most three deep, whatever composes them:

- A part or a key whose issues are plain, such as a domain's `{ options: ["company.com"] }` or a repeated key's `{ unique: true }`, keeps them.
- A union's issues are its options' lists. So a union held inside another issue, as one for a property of an object option inside an outer union, keeps its code and path, without its options' issues.

Without this rule, a recursive schema would nest issues once for each level. Where the levels share a result, as the options of a recursive union do through one `lazy`, each path through that nesting would write the result out again, and a small input could give a result too large to serialize.

Wording that reaches an issue held without its issues says what it can without them, such as "Does not match any of the allowed types" for a union. A limit of `lazy` that stopped the validation behind such an issue is never dropped: the `too_big` issue, with its `maximum` and `type`, stands in its place. `flatten` and `standard` use the same wording, so neither lists nested issues apart.

## Wording one validator

Every validator that reports an issue of its own takes a `message` option: the text, or a function that words an issue from its `code` and `params`.

```ts
import { email, object, startsWith, string } from "@codenhub/validation";

const signupForm = object({
  name: string({ min: 2, message: "Enter your full name" }),
  email: email({ message: (issue) => t(`errors.${issue.code}`) }),
  invite: string(startsWith("INV-", "Invitation codes start with INV-")),
});
```

- It words every issue that validator reports itself, and every issue one of its checks reports without a message of its own.
- It words no issue a child reports. So `object(shape, { message })` words an input that is not an object, and leaves each property's issues to that property.
- Every built-in check takes a message as its last argument, for a check that needs its own sentence. `string({ message: "Invalid username" }, pattern(/^\w+$/))` says "Invalid username" for either failure, never the pattern.
- A function is given the issue as that validator reports it. So its `path` is relative to the validator's own value, `[]` for the value itself, even where the result places the issue deeper inside an object or an array. Word it from the field you gave the option to, not from the path.

An issue that carries a message is worded by it first, before any message map. That is how one field gets its own sentence while a map words the rest.

## Built-in languages

Two maps ship with the package. Each is a value of its own, so a program bundles the languages it imports and no other:

| Map                  | Language                         | `number({ min: 18 })(15)` |
| -------------------- | -------------------------------- | ------------------------- |
| `englishMessages`    | English                          | "Must be at least 18"     |
| `portugueseMessages` | Portuguese, as written in Brazil | "Deve ser no mínimo 18"   |

Both word the same nine codes, and are passed the same way to `formatIssue`, `flatten`, `standard` and `assert`. For a program in several languages, choose the map where you show the issue:

```ts
import { englishMessages, formatIssue, portugueseMessages, type Messages } from "@codenhub/validation";

const maps: Record<string, Messages> = { en: englishMessages, pt: portugueseMessages };
const wordingFor = (locale: string): Messages => maps[locale] ?? englishMessages;

formatIssue(issue, wordingFor("pt"));
```

`portugueseMessages` writes numbers as Brazil writes them:

```ts
import { formatIssue, multipleOf, number, portugueseMessages } from "@codenhub/validation";

const below = number({ min: 0.1 })(0);
if (!below.ok) {
  formatIssue(below.error.issues[0], portugueseMessages); // "Deve ser no mínimo 0,1"
}
const step = number(multipleOf(0.01))(0.001);
if (!step.ok) {
  formatIssue(step.error.issues[0], portugueseMessages); // "Deve ser múltiplo de 0,01"
}
```

- A bound or a step uses a decimal comma.
- A long list of allowed values ends "e mais N", where English says "or N more".
- The messages about keys use the feminine, since "chave" is feminine: "Chave não reconhecida".

What a map does not translate is what the issue holds as data: the names of types, as in "Esperado string, recebido number", the name of a format the package does not know, and the name of a part of a URL or an address.

An issue whose code the map lacks, such as a custom check's, is worded by the map's `default` entry, "Valor inválido" in `portugueseMessages`. `englishMessages` has no `default`, since the last wording of `formatIssue`, "Invalid value", is English already.

## Rewording and localizing

A message map is an object from code to text:

- A string is used directly.
- A function receives the issue, so it can use `params`, and the map it was found in, so it can word an issue nested in `params` with `formatIssue(nested, messages)` and the same map.

To change some of the English, copy `englishMessages` with a spread, and override the codes you want. It is frozen, so it cannot be changed in place. To translate into a language that has no map here, write a map of your own:

```ts
import { englishMessages, formatIssue, type Messages } from "@codenhub/validation";

const shorter: Messages = { ...englishMessages, too_small: "Too short" };

const pt: Messages = {
  invalid_type: (issue) => `Esperado ${String(issue.params?.expected)}`,
  too_small: (issue) => `Mínimo de ${String(issue.params?.minimum)}`,
  username_taken: "Este nome de usuário já existe",
  default: "Valor inválido",
};

formatIssue(issue, shorter);
formatIssue(issue, pt);
```

Cover the codes your validators can report, which the tables above list, and give the map a `default` entry, as text or as a function of the issue. Without one, every code you leave out says "Invalid value", in English. A custom validator's own codes belong in the map too, or the issue can carry a `message`.

An entry must be text or a function that returns text. Anything else, such as a translation lookup that returned `undefined` or an entry that is a group of translations, throws a `TypeError` when an issue of that code is worded. That holds in `formatIssue`, `flatten`, `assert` and `standard` alike, so a form never shows `undefined`.

### The wording of one code

Each code's English wording is also an export of its own. A program that can report only a few codes builds a map of those, and bundles no other wording:

| Code                   | Export                       |
| ---------------------- | ---------------------------- |
| `invalid_type`         | `invalidTypeMessage`         |
| `invalid_format`       | `invalidFormatMessage`       |
| `invalid_value`        | `invalidValueMessage`        |
| `too_small`            | `tooSmallMessage`            |
| `too_big`              | `tooBigMessage`              |
| `unrecognized_key`     | `unrecognizedKeyMessage`     |
| `invalid_key`          | `invalidKeyMessage`          |
| `invalid_intersection` | `invalidIntersectionMessage` |
| `invalid_union`        | `invalidUnionMessage`        |

```ts
import { formatIssue, invalidTypeMessage, string, tooSmallMessage, type Messages } from "@codenhub/validation";

const messages: Messages = { invalid_type: invalidTypeMessage, too_small: tooSmallMessage };

const result = string({ min: 2 })("a");
if (!result.ok) {
  formatIssue(result.error.issues[0], messages); // "Must be at least 2 characters"
}
```

`englishMessages` is the map of all nine. A wording that quotes the issue behind another, as `invalidKeyMessage`, `invalidUnionMessage` and `invalidFormatMessage` do, words it with the map it was called with. So include the codes the quoted issue can have.

## Errors for a form

`flatten(failure, messages?)` groups the messages of a failed result for display. Issues at the root go to `formErrors`, and the rest are keyed by their path, written by `formatPath`, in `fieldErrors`:

```ts
import { flatten } from "@codenhub/validation";

const result = signup(input);
if (!result.ok) {
  const { formErrors, fieldErrors } = flatten(result.error);
  fieldErrors["email"]; // ["Invalid email address"]
  fieldErrors["addresses[0].street"]; // ["Must be at least 3 characters"]
}
```

It takes the same message map as `formatIssue`, `englishMessages` unless another is given. What it returns has the type `FlattenedErrors`.

`fieldErrors` has no prototype. So a field named `constructor` or `toString` cannot be mistaken for an inherited member, and `fieldErrors["toString"]` is `undefined` when there is no such field. The cost is that it has no methods: ask with `"name" in fieldErrors` or `Object.hasOwn(fieldErrors, "name")`, not `fieldErrors.hasOwnProperty("name")`.

## Throwing for invalid configuration

Some input is not expected to be invalid. An options object another developer passes to your function, or the environment of a server, is wrong only by mistake, and a mistake is thrown where it was made. `assert(validator, input, options?)` returns the value the validator produced, or throws a `TypeError`:

```ts
import { array, assert, invalidTypeMessage, object, string, tooSmallMessage } from "@codenhub/validation";

const config = object({ locales: array(string({ trim: true, min: 1 }), { min: 1 }) });
const messages = { invalid_type: invalidTypeMessage, too_small: tooSmallMessage };

export function createI18n(input: unknown) {
  const { locales } = assert(config, input, { subject: "[I18n]", messages });
  return locales;
}

createI18n({ locales: ["en", 1] }); // TypeError: [I18n] locales[1]: Expected string, received number
```

- The message is the `subject`, written as you gave it, then the path of the first issue, then its wording. Without a `subject`, it starts at the path. An issue at the value itself has no path.
- The wording is the issue's own `message`, then the `messages` map, its `default` entry included, then "Invalid value".
- **`assert` has no default map.** Without `messages`, an issue without its own message says "Invalid value", as in `TypeError: port: Invalid value`. The path still says which option is wrong. Pass `englishMessages`, a map of a few codes as above, or a `message` on each validator, as below, for more.
- The error's `cause` is the failure, so `error.cause.issues` lists every issue the validator reported, not only the first.
- It accepts synchronous validators only, and throws `TypeError: assert() needs a synchronous validator. Call the validator and await its result instead.` for one that returns a promise.
- An option it does not know throws, as for a factory: `TypeError: Unknown option subjct`.

```ts
import { assert, englishMessages, number, object } from "@codenhub/validation";

const options = object({ port: number({ int: true, min: 1, max: 65535 }) });

assert(options, { port: 8080 }, { subject: "createServer:" }); // { port: 8080 }
assert(options, { port: 0 }, { subject: "createServer:" }); // TypeError: createServer: port: Invalid value
assert(options, { port: 0 }, { subject: "createServer:", messages: englishMessages }); // TypeError: createServer: port: Must be at least 1
```

### Keeping your own wording

A package that already throws for its options has wording its users know. Give each validator its `message`, and `assert` needs no map, so no wording of this package is bundled:

```ts
import { assert, boolean, nonBlank, objectLike, optional, string } from "@codenhub/validation";

const feedback = objectLike(
  {
    message: string({ message: "must be a non-empty string." }, nonBlank()),
    isRetryable: optional(boolean({ message: "must be a boolean when provided." })),
  },
  { message: "must be an object whose fields can be read." },
);

export function register(input: unknown) {
  return assert(feedback, input, { subject: "Registry feedback" });
}

register({ message: " " }); // TypeError: Registry feedback message: must be a non-empty string.
register({ message: "Try again", isRetryable: "yes" }); // TypeError: Registry feedback isRetryable: must be a boolean when provided.
register(null); // TypeError: Registry feedback must be an object whose fields can be read.
```

- A validator's `message` words every issue it reports itself, and every issue of its checks that has no message. So one sentence covers a wrong type, a bound and `nonBlank()`. Give a check its own message where the sentences differ.
- `assert` writes the path before the message, so the message does not name its field: it reads after `message:` or `locales[1]:`.
- `objectLike` accepts a class instance or an `Error`, and reports a getter that throws with the message of the object. `object` would accept plain objects only, and let the exception through.

Use `assert` for configuration and other arguments. For a form, a request or anything else a program expects to receive invalid, call the validator and read its result, which lists every issue instead of throwing for the first.

## Sending a result elsewhere

A failed result is plain data, so it can be logged, sent to a client or stored. No issue the package reports holds a value of the input, so doing so does not leak what was submitted. An issue does name the input's keys, in `path`, and a check you write decides what its own issue holds. A result that passed holds the value itself.

A few values do not survive JSON unchanged:

- No issue holds a bigint, which `JSON.stringify` cannot write: a bigint bound or expected value is written as its decimal digits, beside `type: "bigint"`.
- The bounds of a `date` validator are `Date`s, which `JSON.stringify` writes as ISO text. `englishMessages` words either form the same.
- A `literal` or `oneOf` of `undefined`, a symbol or an infinity holds that value, which JSON writes as `null` or leaves out. Word such issues before you send them.

## Next

The built-in validators and their messages cover the common cases. For a rule of your own, such as a name that must not be taken already, see [Custom validators](custom-validators.md).
