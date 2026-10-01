---
title: Validator reference
description: Every validator and combinator, with its options, what it produces and the issue it reports.
---

# Validator reference

Every validator here is created by calling a function and is then called with the value to check. Every one returns `{ ok: true, value }` or `{ ok: false, error: { issues } }`, and never throws for invalid input, unless the input runs code of its own, such as a getter or a `Proxy` trap that throws while it is read, whose exception propagates. The code and `params` each failure reports are listed with the validator; [Issues and messages](errors.md) explains what they mean and how to turn them into text.

Every validator takes its arguments in the same order: its own, such as the shape of `object` or the item of `array`, then an options object, then any number of [checks](#checks). The options can be left out when there are checks: `string(startsWith("a"))`. Every validator that reports an issue of its own takes a `message` option, [below](#wording-one-validator).

Options are read once, when the validator is created. An option that makes no sense, such as a negative length, a `NaN` bound, or limits no value can satisfy together such as `{ min: 5, max: 2 }`, throws a `RangeError` or `TypeError` at that point, because it is a mistake in your code and not in the input. So do options that are not a plain object, such as `string(/^a/)` where `string(pattern(/^a/))` was meant, which would otherwise be ignored and accept every string, and a shape that is a list. So does a child that is not a function, such as `object({ name: undefined })` after an import that resolved to nothing: every combinator checks the validators and callbacks it is given, and names the one that is wrong. An option name a validator does not know, such as `string({ mni: 2 })`, is not checked when the code runs and is ignored: TypeScript reports it, and checking it at runtime would make every validator carry the names of its options.

## Strings

`string(options?)` accepts strings and produces a string. Anything else fails with `invalid_type`, naming the type it received.

```ts
import { string } from "@codenhub/validation";

const username = string({ trim: true, min: 3, max: 30 });

username("  ada  "); // { ok: true, value: "ada" }
username("ab"); // { ok: false, ... }, code "too_small"
```

The options, all optional:

| Option    | Meaning                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `trim`    | Remove leading and trailing whitespace before the constraints run, and from the output.                                    |
| `case`    | `"lower"` or `"upper"`: convert the string before the constraints run, and in the output.                                  |
| `min`     | At least this many characters. Counted in UTF-16 code units, as `String.length` counts them, so an emoji can count as two. |
| `max`     | At most this many characters.                                                                                              |
| `length`  | Exactly this many characters.                                                                                              |
| `message` | Wording for the issues it reports itself.                                                                                  |

Rarer rules are [checks](#checks): `pattern`, `startsWith`, `endsWith`, `includes`, and `lowercase` and `uppercase`, which require a case where the `case` option converts to one.

```ts
import { pattern, string } from "@codenhub/validation";

const handle = string({ trim: true, min: 3, max: 30 }, pattern(/^[a-z0-9_]+$/));
```

Clean-up (`trim`, `case`) always happens first, and every constraint and check then sees the cleaned string, so `string({ trim: true, min: 1 })` rejects a string of spaces. Every constraint that fails reports its own issue.

| Failure               | `code`         | `params`                                   |
| --------------------- | -------------- | ------------------------------------------ |
| Not a string          | `invalid_type` | `{ expected: "string", received }`         |
| Shorter than `min`    | `too_small`    | `{ minimum, type: "string" }`              |
| Longer than `max`     | `too_big`      | `{ maximum, type: "string" }`              |
| Shorter than `length` | `too_small`    | `{ minimum, exact: true, type: "string" }` |
| Longer than `length`  | `too_big`      | `{ maximum, exact: true, type: "string" }` |

## Numbers

`number(options?)` accepts finite numbers and produces a number. `NaN`, the infinities and every other type fail with `invalid_type`.

```ts
import { number } from "@codenhub/validation";

const age = number({ int: true, min: 0, max: 130 });

age(42); // { ok: true, value: 42 }
age(1.5); // { ok: false, ... }, code "invalid_value"
```

The options, all optional:

| Option       | Meaning                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `clamp`      | `{ min, max }`. Move the value into the range instead of rejecting it, before the constraints run and in the output. |
| `min`, `max` | At least or at most this value, inclusive.                                                                           |
| `gt`, `lt`   | Strictly greater than or less than this value.                                                                       |
| `int`        | A whole number.                                                                                                      |
| `safeInt`    | A whole number a double can represent exactly, that is within `Number.MAX_SAFE_INTEGER`.                             |
| `message`    | Wording for the issues it reports itself.                                                                            |

`multipleOf(step)` and `nonZero()` are [checks](#checks): `number({ min: 0 }, multipleOf(0.01))`.

Positive, negative and their "non-" variants are bounds: positive is `gt: 0`, non-negative is `min: 0`, negative is `lt: 0` and non-positive is `max: 0`. A `NaN` bound, or bounds no finite number can satisfy such as `{ min: 5, max: 2 }`, `{ gt: 1, lt: 1 }` or `{ min: Infinity }`, throws a `RangeError` rather than being ignored, and a bound that is not a number, or a `clamp` that is not a range with a number `min` and `max`, a `TypeError`. `clamp` throws a `RangeError` for a `NaN` bound, a minimum above its maximum, or a range every value of which breaks a bound, such as `{ clamp: { min: 0, max: 10 }, min: 11 }`. Bounds that hold numbers but no whole one, such as `{ int: true, gt: 1, lt: 2 }`, are not caught when the validator is created, since checking would add to every consumer of `number`; such a validator rejects every input.

| Failure             | `code`          | `params`                                         |
| ------------------- | --------------- | ------------------------------------------------ |
| Not a finite number | `invalid_type`  | `{ expected: "number", received }`               |
| Below `min` or `gt` | `too_small`     | `{ minimum, inclusive, type: "number" }`         |
| Above `max` or `lt` | `too_big`       | `{ maximum, inclusive, type: "number" }`         |
| `int` or `safeInt`  | `invalid_value` | `{ type: "number", format: "int" \| "safeInt" }` |

## Booleans and symbols

`boolean()` accepts `true` and `false` and produces a boolean. Truthy and falsy values, and text such as `"true"`, fail with `invalid_type` and `{ expected: "boolean", received }`. `symbol()` accepts symbols and fails likewise with `expected: "symbol"`; to accept one symbol only, use `literal`.

## Bigints

`bigint(options?)` accepts bigints and produces a bigint. Numbers, including whole ones, fail with `invalid_type`. The options `min` and `max` are inclusive and `gt` and `lt` are exclusive, all bigints, and fail like the number bounds: `too_small` with `{ minimum, inclusive, type: "bigint" }`, or `too_big` with `{ maximum, inclusive, type: "bigint" }`. Positive is `gt: 0n`, non-negative is `min: 0n` and negative is `lt: 0n`.

Bounds appear in `params` as bigints, which `JSON.stringify` cannot serialize. Convert them first if you send issues as JSON.

## Dates

`date(options?)` accepts valid `Date` objects and produces the same `Date`. An invalid date such as `new Date("nope")`, a timestamp or a string fails with `invalid_type` and `{ expected: "valid date", received }`. To check date text, use [`isoDate` or `datetime`](#formats).

The options `min` and `max` are `Date`s, both inclusive, and throw a `TypeError` when created with anything but a `Date`, such as a date string, and a `RangeError` when created with an invalid `Date` or with `min` after `max`. They are read when the validator is created, so changing the `Date` objects later has no effect. A date before `min` fails with `too_small` and `{ minimum, inclusive: true, type: "date" }`, and one after `max` with `too_big` and `{ maximum, inclusive: true, type: "date" }`, the bound being a `Date`.

## Fixed values

- `literal(value)` accepts exactly one value, compared with `===`, and produces that value with its exact type, so `literal("admin")` produces `"admin"` and not `string`. Any primitive works, and this is how `null` and `undefined` are validated: `literal(null)`. The one exception is `NaN`: `NaN === NaN` is false, so `literal(NaN)` could accept nothing, and it throws a `RangeError` when created.
- `oneOf(values)` accepts any one value of a list and produces their union: `oneOf(["admin", "user"])` produces `"admin" | "user"`. The values may be any primitives `literal` accepts, so `oneOf([true, false, null])` is a three-state flag. It also takes a TypeScript `enum`, and then ignores the reverse-mapping names TypeScript adds to a numeric enum, so only the numbers are values. The values are copied when the validator is created. No values throws a `TypeError` and one holding `NaN`, which no value equals, a `RangeError`, since either is a mistake in the schema.

Both fail with `invalid_value`. `literal` reports `{ expected }` and `oneOf` reports `{ options }`, the list of accepted values.

```ts
import { literal, oneOf } from "@codenhub/validation";

const role = oneOf(["admin", "user"]);
const version = literal("v1", { message: "Only v1 is supported" });

enum Status {
  Active = "active",
  Archived = "archived",
}
const status = oneOf(Status);
```

## Any value, no value, functions and instances

- `unknown()` accepts every value and passes it through unchanged. Use it for a property you do not check, or as the base for checks on a value of no particular type: `unknown(check((value) => JSON.stringify(value) !== undefined))`.
- `never()` rejects every value with `invalid_type` and `{ expected: "never", received }`. Use it to forbid a property, or for a branch that must never match.
- `func()` accepts any function, from any realm, classes and async and generator functions included, and produces it unchanged. It fails with `invalid_type` and `{ expected: "function", received }`. Only that the value is a function can be checked, not the parameters it takes or what it returns, so name the signature you expect as the type argument, `func<(value: string) => void>()`, and it becomes the output type on trust, as a cast would; without one the output takes any arguments and returns `unknown`.
- `instanceOf(Class)` accepts instances of a class, subclasses and abstract classes included, checked with `instanceof`, so an instance from another realm such as an iframe is not recognized. `date`, `map`, `set` and `object` do not have that limit and accept values from any realm. It fails with `invalid_type` and `{ expected: "instance of Class", received }`. A target that is not a function, such as an import that resolved to nothing, throws a `TypeError` when the validator is created.

## Formats

A format is a validator for a string of a particular shape. Each is imported on its own, so you only ship the ones you use, and each takes a `message` option and checks. Most produce the string unchanged, so trim or lowercase first with `pipe` when the input may need it. A format whose meaning has several spellings produces one canonical spelling instead, so one value is one string however it was written: the table says which. For `email`, `url` and `domain`, the URL parser, not the text, decides what they name, so they produce what the parser reads.

A non-string fails with `invalid_type` and `{ expected: "string", received }`. A string that does not match fails with `invalid_format` and `{ format }`, and `format` names it as the table shows.

| Validator      | Accepts                                                                                                                                                                                                                                                                                                                                                                                                                         | Produces                                              | `format`                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------- |
| `email()`      | An email address with a public domain name. [Below](#email).                                                                                                                                                                                                                                                                                                                                                                    | The domain as the parser reads it                     | `"email"`                          |
| `url()`        | An absolute URL with an allowed protocol and a public host. [Below](#url).                                                                                                                                                                                                                                                                                                                                                      | The URL as the parser writes it                       | `"url"`                            |
| `domain()`     | A public domain name: two or more labels, a real top-level domain, and no special-use name such as `localhost`, `.local`, `.internal`, `.test`, `.arpa` or an IDN test top-level domain such as `.テスト`. An absolute name such as `example.com.` is accepted and keeps its dot, which the 253-character limit does not count. The rule `email` and `url` apply by default, except that an email address has no absolute form. | Lowercase ASCII, internationalized labels in punycode | `"domain"`                         |
| `hostname()`   | A hostname: dot-separated labels of letters, digits and hyphens, the last not a number (all digits, or `0x` and hex digits, which the URL parser reads as an IPv4 address), and punycode (`xn--`) labels that decode. One trailing dot, as in `example.com.`, is allowed.                                                                                                                                                       | Lowercase, a final dot kept                           | `"hostname"`                       |
| `ip()`         | An IPv4 or IPv6 address. [Below](#ip).                                                                                                                                                                                                                                                                                                                                                                                          | IPv6 in its canonical form                            | `"ip"`, `"ipv4"` or `"ipv6"`       |
| `cidr()`       | An address and a prefix length, such as `10.0.0.0/8`, the prefix at most 32 for IPv4 and 128 for IPv6. Takes `version` as `ip` does. Bits set past the prefix are accepted.                                                                                                                                                                                                                                                     | The address as `ip` produces it                       | `"cidr"`, `"cidrv4"` or `"cidrv6"` |
| `mac()`        | A MAC address: six pairs of hex digits separated by colons throughout or by hyphens throughout.                                                                                                                                                                                                                                                                                                                                 | Lowercase, with colons                                | `"mac"`                            |
| `phone()`      | An international number in E.164 form: `+`, a country code and the number, 7 to 15 digits, with optional spaces, hyphens, dots or parentheses between digits. Whether it exists is not checked.                                                                                                                                                                                                                                 | `+` and the digits                                    | `"phone"`                          |
| `creditCard()` | A payment card number: 12 to 19 digits passing the Luhn checksum, optionally grouped by spaces or by hyphens. Whether it was issued is not checked.                                                                                                                                                                                                                                                                             | The digits alone                                      | `"creditCard"`                     |
| `uuid()`       | A UUID of version 1 to 8, or the nil or max UUID, hyphenated, in any case. `uuid({ version: 7 })` requires one version, and then rejects the nil and max UUIDs.                                                                                                                                                                                                                                                                 | Lowercase                                             | `"uuid"`                           |
| `datetime()`   | An ISO 8601 date-time such as `2026-09-28T14:30:00Z`, on a day that exists. [Below](#datetime-and-time).                                                                                                                                                                                                                                                                                                                        | As written                                            | `"datetime"`                       |
| `isoDate()`    | An ISO 8601 calendar date such as `2026-09-28`, on a day that exists.                                                                                                                                                                                                                                                                                                                                                           | As written                                            | `"isoDate"`                        |
| `time()`       | A time of day such as `14:30`, `14:30:00` or `14:30:00.250`, without an offset. [Below](#datetime-and-time).                                                                                                                                                                                                                                                                                                                    | As written                                            | `"time"`                           |
| `duration()`   | An ISO 8601 duration such as `P1Y2M`, `PT30M` or `P1DT12H`, with at least one component; only the seconds may have a fraction.                                                                                                                                                                                                                                                                                                  | As written                                            | `"duration"`                       |
| `semver()`     | A Semantic Versioning 2.0.0 version such as `1.4.0-beta.2`, without a leading `v`.                                                                                                                                                                                                                                                                                                                                              | As written                                            | `"semver"`                         |
| `slug()`       | Lowercase ASCII letters and digits in words joined by single hyphens, such as `hello-world-2`.                                                                                                                                                                                                                                                                                                                                  | As written                                            | `"slug"`                           |
| `jwt()`        | A JSON Web Token in compact form: three base64url segments whose header and payload are JSON objects, the header naming `alg`. The signature is not verified and the claims are not read, so a token that passes may be forged or expired.                                                                                                                                                                                      | As written                                            | `"jwt"`                            |
| `hex()`        | One or more hexadecimal digits of any case.                                                                                                                                                                                                                                                                                                                                                                                     | As written                                            | `"hex"`                            |
| `base64()`     | Standard base64 with correct padding, as an encoder writes it. The empty string, which encodes nothing, is rejected. `base64({ url: true })` requires the URL-safe alphabet, `-` and `_`, with the padding optional.                                                                                                                                                                                                            | As written                                            | `"base64"` or `"base64url"`        |
| `ulid()`       | A ULID, in any case.                                                                                                                                                                                                                                                                                                                                                                                                            | Uppercase                                             | `"ulid"`                           |
| `nanoid()`     | A Nano ID in its default form: 21 characters of `A-Za-z0-9_-`.                                                                                                                                                                                                                                                                                                                                                                  | As written                                            | `"nanoid"`                         |
| `cuid2()`      | A CUID2 identifier.                                                                                                                                                                                                                                                                                                                                                                                                             | As written                                            | `"cuid2"`                          |

`port()` is a format of numbers rather than text: a whole number from 1 to 65535. Port 0, which asks a system for any free port, cannot be connected to and is rejected. A non-number fails with `invalid_type`, and a number that is not a port with `invalid_format` and `{ format: "port" }`. Read a port from text with `pipe(coerceNumber(), port())`.

`isoDate()` produces a string. To get a `Date`, use `coerceDate()`, which reads the same text as midnight UTC.

### `email`

`email(options?, ...checks)` takes `allowPlus`, default `true`, which controls whether `+` is accepted before the `@`, as in `ada+news@example.com`, and the parts described [below](#parts-of-an-email-or-a-url). The value is the address as mail is delivered to it: the local part as written, and the domain as the URL parser reads it, lowercase ASCII with an internationalized label in punycode. So `Ada@München.DE` produces `Ada@xn--mnchen-3ya.de`, and every spelling the parser reads as one domain, such as fullwidth letters in `ada@ｅxample.com` or an invisible variation selector, produces the same address, so a check made later on the value, such as a list of blocked domains or a uniqueness check, sees the domain mail will reach. The local part must be ASCII: an address with other letters before the `@` (RFC 6531) is rejected. The local part is limited to 64 characters and the whole address, as delivered, to 254. A domain is written with letters, marks, digits, dots and hyphens only, the ideographic, fullwidth and halfwidth full stops (`。`, `．`, `｡`) counting as dots, as `url` reads them too, and one in punycode must decode, so `ada@example.xn--zz` is rejected. A percent escape such as `ex%61mple.com` is URL syntax, which `url` decodes in a host, and is not part of an email domain, so `email` rejects it. Hosts that are not public domain names are rejected: `localhost`, single-label hosts, IP addresses, and special-use names that never reach a public host, which are those ending in `localhost`, `local`, `internal`, `arpa`, `test`, `example`, `invalid`, `alt` or `onion`, or in one of the eleven IDN test top-level domains IANA reserved, such as `テスト` or `测试`. A domain ending in a dot, `ada@example.com.`, is rejected.

```ts
import { email, pipe, string } from "@codenhub/validation";

const address = pipe(string({ trim: true }), email());

address("  Ada@Example.com "); // { ok: true, value: "Ada@example.com" }
```

### `url`

`url(options?)` requires an absolute URL, so `example.com` and `//example.com` are rejected and no scheme is guessed. It rejects embedded credentials such as `https://user:password@example.com`, always. The text is read by the standard URL parser, every check is made on what it read (the scheme, the credentials and the host), and the value is that reading, written back as the parser writes it. So a check made later on the value, such as an allowed path prefix or a list of blocked hosts, sees the URL a request will reach: `https://Example.com/public/../admin` produces `https://example.com/admin`, a host spelled with fullwidth letters or invisible characters produces the host they spell, an internationalized host is in punycode, an IPv4 host written as `0x7f.1` or `127.1` is `127.0.0.1`, the host of a scheme the parser has no rules for, such as `ssh://Example.COM`, is in lowercase, and characters such as `"` and `<` in the path are percent-encoded. That is URL encoding, not HTML escaping: others, such as `'` and `&`, are kept, so escape the value for the context you write it into, as any text, before putting it in HTML. Text holding whitespace or control characters, such as a line break, is rejected rather than cleaned, since a written URL never contains them: trim first with `pipe(string({ trim: true }), url())` when the input may have surrounding spaces. A host longer than 253 characters, the most a domain name can have, not counting the final dot of an absolute host such as `example.com.`, which is accepted and kept, is rejected as well, whatever the host validator. The options, besides the parts described [below](#parts-of-an-email-or-a-url), are:

| Option      | Meaning                                                                                                                                                                                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protocols` | Accepted protocols without the colon, in any letter case. Default `["http", "https"]`. The list is copied when the validator is created, and a protocol that is not a scheme name, such as `"https:"`, throws a `TypeError` then, since it would match nothing. So do `javascript`, `vbscript` and `data`, whose URLs run script. |

```ts
import { hostname, url } from "@codenhub/validation";

url()("https://example.com/a?b=1"); // ok
url()("http://localhost:3000"); // fails: not a public host
url({ host: hostname() })("http://localhost:3000"); // ok
url({ protocols: ["ftp"] })("ftp://example.com"); // ok
```

Three schemes have no host, and each is checked by its own rules when listed in `protocols`, even when the URL is written with one, as in `mailto://example.com`, which names no recipient:

| Scheme   | Accepted when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mailto` | It names at least one recipient, and every recipient, in the path and in `to`, `cc` or `bcc`, is an address `email()` accepts, on a public domain whatever `host` is, since `host` checks a URL's host and a mailto has none. Each recipient is produced as `email()` produces it, with its local part escaped where a mailto needs it, so `mailto:Ada@EXAMPLE.com` produces `mailto:Ada@example.com` and `mailto:ada@exa%6dple.com` produces `mailto:ada@example.com`; field names are produced in lowercase. The query may hold only `to`, `cc`, `bcc`, `subject` and `body`, each as `name=value`: any other field, such as `from` or `reply-to`, fails. `subject` and `body` hold what RFC 6068 allows, letters, digits, `-._~!$'()*+,;:@` and `%` escapes, so a line break is `%0D%0A`, and also `/` and `?`, which a URL query allows, so `body=https://example.com/a?b` passes. `&`, `=`, `#` and a malformed escape such as `%zz` fail. A line break, `%0D` or `%0A`, is allowed in `body` only: in `subject` it would end the header line, so a mail program that writes it into the message unescaped would read what follows, such as `Bcc: …`, as another header. `subject` and `body` may each appear once, while `to`, `cc` and `bcc` may repeat, since each adds recipients. They are produced as written. |
| `tel`    | It is a global number: `+`, digits with `-`, `.`, `(` or `)` between them, then optional `;name=value` parameters whose value holds only the characters RFC 3966 allows (letters, digits, `-_.!~*'()[]/:&+$` and `%` escapes), so never `"` or `<`. A local number with `phone-context` is rejected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `urn`    | It follows RFC 8141: a namespace of 2 to 32 letters, digits and inner hyphens, a colon, and a non-empty name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Any other scheme without a host, such as `file:///etc/passwd` or `about:blank`, is rejected even when listed and whatever `host` is, so listing a protocol never lets a hostless URL through unchecked. Any other listed scheme written with a host, such as `file://server/share` or `ftp://example.com`, gets the host checks every URL does.

`javascript`, `vbscript` and `data` cannot be listed at all: `url` throws a `TypeError` when created with one. A host does not make them safe, since `javascript://example.com/%0aalert(1)` has a public host and still runs as script when followed.

```ts
url({ protocols: ["mailto"] })("mailto:ada@example.com?cc=bob@example.org"); // ok
url({ protocols: ["mailto"] })("mailto:ada@localhost"); // fails: not a public host
url({ protocols: ["tel"] })("tel:+1-201-555-0123"); // ok
url({ protocols: ["urn"] })("urn:isbn:0451450523"); // ok
```

### `ip`

`ip(options?)` takes `version`, `"v4"` or `"v6"`, to accept one address family only, and produces an IPv6 address in its canonical form: lowercase, with the longest run of zero groups shortened to `::`, as RFC 5952 and the URL parser write it, so `0:0:0:0:0:0:0:1` produces `::1` and one address is one string. An IPv6 address embedding an IPv4 one comes out in hex groups, as the parser writes it: `::ffff:192.0.2.1` produces `::ffff:c000:201`. An IPv4 address has one spelling and is produced as written. Without it both are accepted, and any other value throws a `TypeError` when the validator is created. The `format` in the issue is `"ipv4"` or `"ipv6"` when a version is given, and `"ip"` otherwise.

IPv4 is four decimal parts from 0 to 255 without leading zeros, which some parsers read as octal. IPv6 is written as RFC 4291 allows: eight groups of one to four hex digits, one run of zero groups shortened to `::`, and an IPv4 address in place of the last two groups, as in `::ffff:192.0.2.1`, whose parts follow the IPv4 rule. A zone such as `%eth0` is accepted only after a link-local address (`fe80::/10`), the one place it means something.

### `datetime` and `time`

`datetime(options?)` requires the `T` separator, a time, and `Z`, and rejects days that do not exist, so `2026-02-30T00:00:00Z` fails. The options are `offset`, default `false`, which accepts a UTC offset such as `+02:00` instead of only `Z`, `local`, default `false`, which also accepts a date-time without a zone, a time on a local clock such as `2026-09-28T14:30` from an HTML `datetime-local` input, whose seconds may be left out as that input leaves them out, and `precision`, an integer from 0 to 9, which requires exactly that many fractional-second digits (`0` forbids them; without it they are optional) and, with `local`, the seconds. A `precision` that is not a number throws a `TypeError` when the validator is created, and one outside that range a `RangeError`. Leap seconds (`23:59:60`) are rejected. `coerceDate` reads more spellings than this, such as a space for the `T`, an offset without its colon or no zone at all, because it converts text rather than checks its form; [Coercion](coercion.md) lists them.

`time(options?)` accepts `HH:MM`, as an HTML time input writes it, and `HH:MM:SS` with an optional fraction. It takes `precision` as `datetime` does, which also makes the seconds required.

### Parts of an email or a URL

`url` and `email` are built from parts, and each part can be checked with a validator of your own. A part validator receives what the parser read, not the text, and replaces the format's default rule for that part, never its syntax:

| Option              | Receives                                                                                                                                                                                                                                                                                                   | Default rule               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `url({ host })`     | The host: a domain in lowercase ASCII with internationalized labels in punycode, an IPv4 address as four decimal parts, or an IPv6 address without its brackets. For a scheme the parser has no rules for, such as `ssh`, the name as written, with its letters in lowercase and its escapes in uppercase. | A public domain name       |
| `url({ port })`     | The port as a number, or `undefined` when the URL names none or names its scheme's default, which the parser drops.                                                                                                                                                                                        | Any port                   |
| `url({ path })`     | The path as the parser writes it, dot segments resolved and characters such as spaces percent-encoded, starting with `/`, or empty for a URL of a scheme the parser has no rules for, such as `ssh://example.com`, that names no path.                                                                     | Any path                   |
| `url({ query })`    | The query as an object of its decoded parameters, each key's value a string, or with `repeated: true` every value of every key as an array.                                                                                                                                                                | Any query                  |
| `email({ domain })` | The domain as `email` produces it, lowercase ASCII with internationalized labels in punycode. It must still be a hostname, so never an IP address.                                                                                                                                                         | A public domain name       |
| `email({ local })`  | The local part, before the `@`, as written.                                                                                                                                                                                                                                                                | The syntax of a local part |

```ts
import { domain, email, hostname, ip, object, oneOf, optional, port, startsWith, string, union, url } from "@codenhub/validation";

url({ host: hostname() }); // any hostname, localhost included
url({ host: union([domain(), ip()]) }); // IP addresses too, but not localhost
url({ host: oneOf(["api.example.com"]), port: optional(port()) });
url({ protocols: ["https"], path: string(startsWith("/api/")) });
url({ query: object({ page: optional(string()) }, { unknownKeys: "strict" }) }); // no other parameters
email({ domain: oneOf(["company.com"]), message: "Use your company address" });
```

A part that fails is reported as the format's own issue, at the place of the URL or address, so a form shows it beside the field the text was typed in: `invalid_format` with `params` `{ format: "url", part: "host", issues }` or `{ format: "email", part: "domain", issues }`, where `issues` holds what the part validator found, with paths relative to the part, such as `["page"]` inside the query. The format's `message` words it, as it words every other issue of the format, so `email({ domain: oneOf(["company.com"]), message: "Use your company address" })` says that sentence for an address at another domain, and `englishMessages` words it with what the part found first, as in "Invalid email address domain: Expected one of "company.com"". A part only decides: the value is still the whole URL or address, so a part that converts its value, such as `coerceNumber` inside `query`, changes nothing in the output. To read typed values from a query, use [`searchParams`](#searchparams). A part validator that is asynchronous makes the format asynchronous.

The parts apply to a URL with a host. A `mailto`, `tel` or `urn` URL keeps its own rules above.

A query key given more than once, as in `?id=1&id=2`, fails unless `repeated` is set, as a failure of the query part whose `issues` hold `invalid_key` at `[key]`. A check that saw one of the two values while a server read the other would pass a value nobody checked, so repeated keys are accepted only when you ask for every value.

With a `path` validator, a path that holds an encoded `/` or `\`, `%2F` or `%5C` in either case, fails before any part runs, as a failure of the path part whose `issues` hold `invalid_value` with `{ encodedSeparator: true }`. The parser and a check on the path read `/api/..%2fadmin` as one segment under `/api/`, while a server that decodes the separator before routing reads `/admin`, so a prefix check would pass a path it does not cover. Without a `path` validator such a URL is accepted, since nothing checks its path.

### `searchParams`

`searchParams(validator, options?, ...checks)` reads a query string, with or without its `?`, or a `URLSearchParams`, from this realm or another such as an iframe, into an object of its decoded parameters, and produces what `validator` makes of it. It reads the parameters as `url`'s `query` part does, `+` as a space and escapes decoded, and rejects a repeated key the same way unless `repeated` is set. Anything else fails with `invalid_type` and `{ expected: "query string", received }`.

```ts
import { array, coerceNumber, object, optional, searchParams, string } from "@codenhub/validation";

const filters = searchParams(object({ page: coerceNumber({ int: true, min: 1 }), q: optional(string()) }));
filters("?page=2&q=red+shoes"); // { ok: true, value: { page: 2, q: "red shoes" } }

const tags = searchParams(object({ tag: array(string()) }), { repeated: true });
tags("tag=a&tag=b"); // { ok: true, value: { tag: ["a", "b"] } }
```

## Objects

`object(shape, options?, ...checks)` takes a shape, an object whose values are validators, and produces an object with the same keys and the output of each validator.

```ts
import { number, object, optional, string } from "@codenhub/validation";

const user = object({ name: string(), age: optional(number()) });

user({ name: "Ada" }); // { ok: true, value: { name: "Ada" } }
user({ age: "x" }); // two issues: ["name"] and ["age"]
```

- Only plain objects are accepted, whichever realm made them. Arrays, class instances, objects with a prototype of their own, `Map`s, `Date`s and `null` fail with `invalid_type` and `{ expected: "object", received }`.
- Only own properties are read, so a value inherited through the prototype never satisfies a required property.
- Every property is validated, even after an earlier one failed, and each issue's path leads down to it.
- A property whose validator accepts `undefined`, such as one wrapped in `optional`, is optional in the inferred type, and is left out of the output when absent from the input.
- The output is a new object and the input is never modified.

The `unknownKeys` option decides what happens to input properties the shape does not list:

| `unknownKeys`   | Effect                                                                                 |
| --------------- | -------------------------------------------------------------------------------------- |
| `"strip"`       | Drop them from the output. This is the default.                                        |
| `"strict"`      | Reject each with an `unrecognized_key` issue at the key's path, and `params: { key }`. |
| `"passthrough"` | Copy them to the output unchanged and unchecked.                                       |

Any other `unknownKeys` value, such as a misspelled `"Strict"`, throws a `TypeError` when the validator is created, instead of falling back to `"strip"`.

A check given to `object` runs once every property has passed, and sees the whole object, so it can compare fields. Point its issue at the field to fix with `path`:

```ts
import { check, object, string } from "@codenhub/validation";

const signup = object(
  { password: string({ min: 8 }), confirm: string() },
  check((data) => data.password === data.confirm, { path: ["confirm"], message: "Passwords must match" }),
);
```

See [Reusing shapes](#reusing-shapes) for extending, omitting and making properties optional.

## Collections

Every collection validator takes the validator for its items, then options and checks, checks every item, and reports each issue with a path that leads through the item's position. A wrong size is reported at once, without validating the items, so a huge input is never worked through only to be rejected.

The size options `min`, `max` and `length` are non-negative integers. Each throws a `TypeError` when created with a value that is not a number, such as `"3"`, and a `RangeError` with a number that is not a non-negative integer, as do limits no size can satisfy together, such as `min` above `max` or a `length` outside them. `min` and `max` are inclusive. A size failure is `too_small` with `{ minimum, type }` or `too_big` with `{ maximum, type }`, where `type` is `"array"`, `"set"`, `"map"` or `"record"`, and `exact: true` is added for `length`. A record's size is its number of keys.

### `array`

`array(item, options?, ...checks)` accepts arrays whose every item passes `item` and produces a new array of what it produced. It takes `min`, `max` and `length`. A sparse array's holes are validated as `undefined`.

The `unique(by?, message?)` check rejects repeats, comparing the validated items the way a `Set` does, or the key `by` returns for each, so `unique((user) => user.id)` makes ids unique. Each repeat is reported at its own index as `invalid_value` with `{ unique: true }`, and the first occurrence is kept. Like every check, it runs only once every item is valid.

```ts
import { array, string, unique } from "@codenhub/validation";

const tags = array(string({ trim: true, min: 1 }), { max: 5 }, unique());

tags(["a", "b"]); // ok
tags(["a", "a"]); // fails: invalid_value at path [1]
```

### `tuple`

`tuple(items, options?)` accepts arrays of fixed length in which each position has its own validator, and produces a tuple type. Without `rest` the array must be exactly as long as `items`, and a wrong length fails with `too_small` and `{ minimum, type: "array", exact: true }`, or `too_big` and `{ maximum, type: "array", exact: true }`. With `rest` the array must still have at least as many items as `items`, and fails with `too_small` without `exact` when it has fewer. The `rest` option is a validator for every position after the fixed ones, which lets the array be longer, and `max`, allowed only with `rest`, caps how long, the fixed items included: a longer array fails at once with `too_big` and `{ maximum, type: "array" }`, without validating the items. Give untrusted input a `max`, as you would an `array`.

```ts
import { number, string, tuple } from "@codenhub/validation";

const point = tuple([number(), number()]); // [number, number]
const call = tuple([string()], { rest: number(), max: 10 }); // [string, ...number[]], at most 10 items
```

### `record`

`record(key, value, options?)` accepts plain objects used as a dictionary: any number of keys, each passing `key`, each value passing `value`. An issue's path ends at the key it belongs to. A key that fails is reported as one `invalid_key` issue whose `params.issues` holds what the key validator found, so it is not mistaken for a problem with the value, and a bad key still has its value checked. A key that the key validator changes, such as by lowercasing, must stay distinct: `{ A: 1, a: 2 }` under `string({ case: "lower" })` reports the second as `invalid_key` whose `params.issues` holds one `invalid_value` issue with `{ unique: true }`, rather than dropping a value. The output type has every key when `key` produces `string`, and is partial when it produces a fixed set of strings, such as `oneOf(["mon", "tue"])`. A `__proto__` key from parsed JSON is kept as data and never writes to a prototype. It takes `min`, `max` and `length`, which count keys, so `record(string(), number(), { max: 100 })` rejects a dictionary of more than 100 keys before checking any of them.

### `set` and `map`

`set(item, options?)` accepts `Set`s and produces a new `Set` of the validated values, and `map(key, value, options?)` accepts `Map`s and produces a new `Map`. Arrays and plain objects are not accepted for them. Paths lead through the position in iteration order for a set, and through the entry's key for a map when it is a string and its position, a number, for any other key, so a number key and an object key never share a path. A map key that fails is reported as `invalid_key`, as for `record`, and so is one that another entry has already taken once the key validator has changed it. Likewise a set value that `item` makes equal to an earlier one, such as `"A"` and `"a"` under `string({ case: "lower" })`, is reported as `invalid_value` with `{ unique: true }` at its position rather than merged, so the output never holds fewer values than the size options allow. Both take `min`, `max` and `length`.

## Combining validators

### `optional`, `nullable` and `nullish`

- `optional(validator)` accepts `undefined`, and `optional(validator, value)` replaces it with a default, [below](#defaults).
- `nullable(validator)` accepts `null`.
- `nullish(validator)` accepts both.

The accepted value is passed through, and every other value goes to `validator`, so `null` and the empty string are not treated as absent by `optional`. These wrappers report no issue of their own, so they take no options or checks; give those to the validator they wrap. Inside an `object`, a property whose validator can produce `undefined` becomes optional in the inferred type, and is left out of the output when absent from the input.

### Defaults

`optional(validator, value)` replaces `undefined` with a default, and gives every other value to `validator`, so an invalid value is still rejected and only a missing one is replaced. The default is trusted and is not validated. A function is called every time to produce the default, so pass one for an array or object, which would otherwise be shared by every result. For the same reason, a default that is itself a function, such as a callback for `func()`, has to be returned from one: `optional(func(), () => noop)`. Passing `noop` directly would call it and use what it returns, so the types reject it whenever the wrapped validator can produce a function. Inside an `object`, the property is then always present in the output type.

```ts
import { array, oneOf, optional, string } from "@codenhub/validation";

const role = optional(oneOf(["admin", "user"]), "user");
const tags = optional(array(string()), () => []);
```

### `fallback`

`fallback(validator, value)` replaces a value that fails `validator` with a fallback, so the result never fails. The fallback is trusted and is not validated, and a function receives the issues that were found, which is the place to log them. A fallback that is not a function is the same value in every result, so pass a function for an array or object, such as `fallback(array(string()), () => [])`, or a change to one result shows up in the next. A function is called with the issues, so a fallback that is itself a function has to be returned from one: `fallback(validator, () => callback)`, and the types reject the callback itself whenever the wrapped validator can produce a function. This turns bad input into a valid-looking value, so reserve it for data where a sensible default is safer than an error, such as a stored preference that may be out of date.

### `pipe`

`pipe(a, b, ...)` runs validators in order, giving each the value the previous one produced, and produces what the last produces. The first failure stops it, because a later step has nothing valid to work on. Use it to clean a value before checking a format, or to check one rule after another.

### `transform`

`transform(validator, convert)` changes the value a validator produced into another, such as text into a `Date`. `convert` runs only when `validator` succeeded and cannot reject the value: to reject what it produced, put a validator with checks after it with `pipe`. A `convert` that returns a promise, or is typed as possibly returning one, including one typed as returning `unknown`, makes the result asynchronous, and so does any value with a `then` method, as `await` would treat it, so a value that has one for another reason has to be wrapped in an object before it is returned. One typed as returning `any`, such as `JSON.parse`, has opted out of type checking and is typed synchronous, so `transform(string(), JSON.parse)` needs no `await`; if it can return a promise, say so in its return type. A `convert` that throws is a bug and propagates.

```ts
import { string, transform } from "@codenhub/validation";

const length = transform(string(), (text) => text.length);
```

## Checks

A check is a rule about a value that already has its type, given to a validator after its options. It runs once the value has its type: for a leaf, right after the type test, beside the options; for a format, once the text is of the format, so a check given to `ip()` or `uuid()` never sees text that is not an address or a UUID; for an object or a collection, once every child has passed, since before that there is no value of the type to check. Every check runs and every issue is reported.

```ts
import { check, number, string, startsWith, uppercase } from "@codenhub/validation";

string({ min: 2 }, startsWith("A"), uppercase());
number(check((n: number) => n % 2 === 0, "Must be even"));
```

The built-in checks, each its own import, take their message last:

| Check              | For     | Requires                                                                                                            | `code` and `params`                                                |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pattern(regex)`   | strings | A match. The `g` and `y` flags are ignored, so the same check gives the same answer each time.                      | `invalid_format`, `{ format: "regex", pattern }`                   |
| `startsWith(text)` | strings | This prefix.                                                                                                        | `invalid_format`, `{ format: "startsWith", value }`                |
| `endsWith(text)`   | strings | This suffix.                                                                                                        | `invalid_format`, `{ format: "endsWith", value }`                  |
| `includes(text)`   | strings | This text anywhere.                                                                                                 | `invalid_format`, `{ format: "includes", value }`                  |
| `lowercase()`      | strings | No uppercase letters, so a string with no letters passes. It changes nothing; `string({ case: "lower" })` converts. | `invalid_format`, `{ format: "lowercase" }`                        |
| `uppercase()`      | strings | No lowercase letters.                                                                                               | `invalid_format`, `{ format: "uppercase" }`                        |
| `multipleOf(step)` | numbers | A multiple of the step, compared as the decimals both are written as, so `0.3` is a multiple of `0.1` at any size.  | `invalid_value`, `{ type: "number", format: "multipleOf", value }` |
| `nonZero()`        | numbers | Anything but zero.                                                                                                  | `invalid_value`, `{ type: "number", format: "nonZero" }`           |
| `unique(by?)`      | arrays  | Distinct items, [above](#array).                                                                                    | `invalid_value`, `{ unique: true }`, at each repeat's index        |

A `pattern` that is not a regular expression, and a `multipleOf` step that is not a positive finite number, throw when the check is made. `multipleOf` is exact for every number as it is written, the shortest text that reads back as it, which is what JSON carries. Past `Number.MAX_SAFE_INTEGER` that text is not always the number the double holds: `2 ** 60` is written `1152921504606847000`, so it is not a multiple of `1024`, though `1e23` is one of `10`. A number computed in floating point is not always the decimal it looks like: `0.1 + 0.2` is `0.30000000000000004`, which is not a multiple of `0.1`.

`check(test, issue?)` makes a check of your own; [Custom validators](custom-validators.md) covers it and the other builders. A check that returns a promise makes its validator asynchronous.

## Choosing between validators

### `union`

`union(options)` accepts a value that passes any one of several validators and produces what the first one that accepts it produced, so put the more specific options first. A value that none accepts fails with one `invalid_union` issue at the value's own location, and `params.issues` lists, for each option in order, the issues it found. Those paths are relative to the value the union received. Every option runs until one accepts, so a recursive union of objects does its work again for each option at every level; use [`tagged`](#tagged) for objects told apart by a property, and see [`lazy`](#lazy) for the limit on that work.

```ts
import { number, string, union } from "@codenhub/validation";

const id = union([string({ min: 1 }), number({ int: true })]);
```

### `tagged`

`tagged(key, variants, options?, ...checks)` is for objects that share a tag property and differ in the rest, such as events with a `type`. It takes the name of the tag property and a record with a validator for each tag value. The input's tag chooses the variant, the variant validates the rest of the input, and a failure reports that variant's own issues instead of a list of everything that did not match.

```ts
import { number, object, string, tagged, type Infer } from "@codenhub/validation";

const event = tagged("type", {
  click: object({ x: number(), y: number() }),
  key: object({ key: string({ min: 1 }) }),
});

type Event = Infer<typeof event>;
// { type: "click"; x: number; y: number } | { type: "key"; key: string }

event({ type: "key", key: "a" }); // { ok: true, value: { type: "key", key: "a" } }
```

**A variant must not list the tag.** Unlike some other libraries, where each variant is `object({ type: literal("click"), ... })`, a variant here is given the input without its tag, so one that lists it could never pass. Its type is rejected, so the mistake is a compile error at that variant. The record key already says which tag the variant is for.

Because a variant never sees the tag, a strict `object` works as a variant, and so does a `record`, which checks every key but the tag. An output that declares the tag beside an index signature is still rejected, since the variant is never given it. The type of a record variant has an index signature beside the tag, so reading it and narrowing on the tag work, but TypeScript rejects writing such an object out by hand when the tag is not of the record's value type. The tag is added back to the output, so the result is a proper tagged union and checking `event.type` narrows the type. A missing, unknown or non-string tag fails with `invalid_union`, at the tag's path, with `params: { discriminator, options }` listing the accepted tags.

Each variant must produce a plain object, since that is what can carry the tag. A variant typed to produce an array or a function is a compile error. One that produces any other non-plain value at runtime, such as a `Date` or a class instance from a `transform`, throws a `TypeError` naming the variant, rather than being taken apart into a plain object, because it is a mistake in the schema and not in the input.

### `intersection`

`intersection(left, right)` accepts a value only when it passes both validators, reports the issues of both together, and produces the two outputs merged. Plain objects are merged key by key and arrays of the same length item by item, recursively. Two `Map`s or two `Set`s of the same size are merged entry by entry in iteration order, which both validators keep from the input, so a map keyed by objects or a set of objects merges too, and a conflict inside one is reported at the entry's string key or, for any other key and for a set, at its position. Cyclic or shared objects in the outputs are merged once, and the merged output keeps their shape. Any other pair must be the same value, `0` and `-0` merging as `0`, or two dates holding the same moment: where the outputs differ otherwise, as `"  ab "` does trimmed on one side and uppercased on the other, no value satisfies both, so each such place fails with `invalid_intersection` at its path instead of one side silently winning.

Both validators see the whole input, so two `object`s with `unknownKeys: "strict"` can never pass together: each rejects the keys only the other lists. To combine strict shapes, spread them into one: `object({ ...named, ...aged }, { unknownKeys: "strict" })`.

## Recursive data and JSON

### `lazy`

`lazy(getter, options?, ...checks)` looks up another validator the first time it runs, so a validator can refer to itself. TypeScript cannot infer a type that refers to itself, so annotate the variable with the type it produces:

```ts
import { array, lazy, object, string, type Validator } from "@codenhub/validation";

interface Category {
  name: string;
  children: Category[];
}

const category: Validator<Category> = object({
  name: string(),
  children: array(lazy(() => category)),
});
```

Each level of nesting is one level of recursion, which the JavaScript stack can only hold so many of, so `lazy` counts them. `lazy(getter, { maxDepth })` takes the most levels of `lazy` that may be open at once, 128 by default, counting every `lazy` validator and not only that one, and a value found deeper fails with `too_big` and `{ maximum, type: "depth" }` at its own path. One count for every `lazy` is what bounds the stack when two recursive validators call each other, and it means a limit is checked against every level already open: `lazy(getter, { maxDepth: 1 })` used inside any other `lazy` fails at once, because the outer one is already one level deep. Set `maxDepth` for the whole nesting, not for one validator's share of it. A request body of thousands of nested arrays and a cyclic object, which a recursive validator would follow forever, both come back as that failure and never throw. The count is of `lazy` calls on the stack, so it bounds recursion that happens in one synchronous run, where the stack can overflow. A rule that awaits before it reaches the next level starts that level from a fresh stack and is not counted, so `maxDepth` does not bound an asynchronous recursive schema at all: it follows input nested to any depth, and a cyclic object forever, until the process runs out of memory, while it keeps other work from running. Give such a schema a bound of its own. Input parsed from JSON cannot be cyclic, so a schema that only ever sees parsed JSON needs a size cap on the text, below; one that can be handed live objects needs a cycle check before it runs. Raise `maxDepth` only for data you know is deeper, and only as far as the stack of your runtime holds for the validators you wrote. `maxDepth` must be a positive integer, or `lazy` throws when created.

Work can also grow faster than the input. A `union` tries every option and an `object` checks every property even after one has failed, so in a recursive `union` of objects the options that do not match still recurse into the children, at every level, and the work doubles with each: a valid input of 500 bytes, 22 levels deep, takes seconds, and one a little deeper takes hours. `lazy(getter, { maxCalls })` stops that: it is the most `lazy` calls one outermost `lazy` call may make, 100,000 by default, counting every `lazy` validator, and past it every further call fails with `too_big` and `{ maximum, type: "calls" }`. Unlike `maxDepth`, it is read from the outermost `lazy` call alone, and holds its whole run: the `maxCalls` of a `lazy` called inside another is not read. Like `maxDepth`, it counts one synchronous run. Each outermost `lazy` call counts afresh, so a root that reaches several before any is open, such as an `array` of recursive items or the options of a `union` at the root, gives each its own count: ten such items of 574 bytes each still take about 3.6 seconds. For untrusted input, wrap the root in `lazy`, so the whole validation is one count, which brings those ten items to under 0.2 seconds:

```ts
import { array, lazy, literal, object, union, type Validator } from "@codenhub/validation";

const node: Validator<unknown> = union([object({ type: literal("a"), kids: array(lazy(() => node)) }), object({ type: literal("b"), kids: array(lazy(() => node)) })]);
const body = lazy(() => array(node, { max: 100 }), { maxCalls: 50_000 }); // one limit for the whole request body
```

Raise `maxCalls` on the root for recursive data with more nodes than that under one root. Like `maxDepth`, it must be a positive integer, or `lazy` throws when created. For objects told apart by a property, use [`tagged`](#tagged), which reads the property first and validates only the matching variant, so its work grows with the input.

The limits are about the stack and the work per node and not about size, so they do not stop a large flat input: cap the size of untrusted input, for instance with `pipe(string({ max: 100_000 }), json(category))`, and give `array` a `max`.

### `json`

`json(validator?, options?, ...checks)` accepts text that holds JSON, parses it, and then gives the parsed value to `validator` when there is one. A non-string fails with `invalid_type`, and text that is not JSON fails with `invalid_format` and `{ format: "json" }`. Without a validator the result is `unknown`. Paths of issues from `validator` are relative to the parsed value. A function in first place is the validator, so checks need one: `json(object(shape), {}, check(...))`.

## Reusing shapes

A shape is an ordinary object, so it is reused with ordinary JavaScript: spread one into another to extend it, and leave keys out with destructuring. `partial(shape)` returns a new shape with every property wrapped in `optional`, for an update where any field may be left out. The original shape is unchanged, so the required version is still there to use.

```ts
import { email, number, object, partial, string } from "@codenhub/validation";

const user = { name: string({ min: 2 }), email: email() };

const create = object(user);
const update = object(partial(user)); // every property optional
const withAge = object({ ...user, age: number() });
```

## Coercing text input

The coercing validators accept text that holds a value, convert it, and then apply the constraints of their strict counterpart: `coerceString` and `string`, `coerceNumber` and `number`, `coerceBoolean` and `boolean`, `coerceBigint` and `bigint`, `coerceDate` and `date`. They take the same options, and fail with `invalid_type` and `coerced: true` in `params` when the value cannot be converted. [Coercion](coercion.md) lists exactly what each accepts and refuses, and how to read a whole environment or form with them.

## Exposing a validator to other libraries

`standard(validator, messages)` returns the validator with the `~standard` property that [Standard Schema](standard-schema.md) asks for, so libraries that accept one can take it directly. Its `messages` map, such as `englishMessages`, supplies the text that specification requires on every issue.

## Wording one validator

Every validator that reports an issue of its own takes a `message` option: the text, or a function that words an issue from its `code` and `params`. It words every issue that validator reports itself, and every issue one of its checks reports without a message of its own, and none a child reports, so `object(shape, { message })` words an input that is not an object and leaves each property's issues to that property. Every built-in check takes a message as its last argument, which a check that needs its own sentence is given: `string({ message: "Invalid username" }, pattern(/^\w+$/))` says "Invalid username" for either failure, never the pattern.

```ts
import { email, object, startsWith, string } from "@codenhub/validation";

const form = object({
  name: string({ min: 2, message: "Enter your full name" }),
  email: email({ message: (issue) => t(`errors.${issue.code}`) }),
  code: string(startsWith("INV-", "Invoice codes start with INV-")),
});
```

An issue that carries a message is worded by it first, before any message map, so this is how one field gets its own sentence while a map words the rest. [Issues and messages](errors.md) has the order.

## Working with results

### `formatIssue`, `flatten`, `formatPath` and `englishMessages`

`formatIssue(issue, messages?)` turns an issue into text, `flatten(failure, messages?)` groups the text of a failure by field for a form, and `formatPath(path)` writes a path as `user.addresses[0].street`. The text comes from the issue's own `message`, then a message map you pass, then "Invalid value". `englishMessages` is the built-in English map, a separate value so that a program that words its own issues does not bundle it. [Issues and messages](errors.md) explains all four.

### `Infer`

`Infer<typeof validator>` is the type a validator produces. It reads the output of either a synchronous or an asynchronous validator.

### `is`

`is(validator, input)` returns whether `input` passes, and narrows it to the validator's output type. It accepts synchronous validators only, and throws a `TypeError` if the validator turns out to return a promise. The narrowing is exact for a validator that does not change the value; for one that trims, clamps or transforms, read `result.value` from calling the validator.

### `pass` and `fail`

`pass(value)` and `fail(...issues)` build results, and are what a validator you write returns. See [Custom validators](custom-validators.md).

### Types

The types you write in everyday use are `Validator<T>` and `AsyncValidator<T>`, `Check<T>` and `AsyncCheck<T>`, `Infer`, `ValidationResult<T>`, `ValidationIssue`, `Message`, `Messages` and the options interface of each validator, such as `StringOptions` or `UrlOptions`. The others exported, such as `Composed`, `Factory`, `Rest`, `InferShape` and `InferTagged`, are the machinery of the signatures: they are exported so that a validator you export from a library of your own can be named in its declarations. Each is documented in the source and listed in the [API reference](reference/index.md).
