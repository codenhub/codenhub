---
title: Formats
description: Email addresses, URLs, domain names, IP addresses, dates, times and the other string formats, what each accepts, and the value it produces.
order: 7
---

# Formats

A format is a validator for a string of a particular shape, such as an email address or a URL. The sign-up needs one for its email, and many rules you might write yourself are a format the package already has. This page lists them, what each accepts, and the value each produces. It spends the most time on `email` and `url`, since an address or a link a server follows is where a careless check costs the most.

Each format is imported on its own, so a program bundles the ones it uses and no other. Each takes a `message` option and checks.

## What a format produces

Most formats produce the string unchanged. So trim or lowercase it first with `pipe` when the input may need it:

```ts
import { email, pipe, string } from "@codenhub/validation";

const address = pipe(string({ trim: true }), email());

address(" Ada@Example.com "); // { ok: true, value: "Ada@example.com" }
```

A format whose meaning has several spellings produces one canonical spelling instead, so one value is one string however it was written. The table below says which. For `email`, `url` and `domain`, the standard URL parser decides what they name, not the text. So they produce what the parser reads.

A non-string fails with `invalid_type` and `{ expected: "string", received }`. A string that does not match fails with `invalid_format` and `{ format }`, and `format` names it as the table shows.

## The formats

| Validator      | Accepts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Produces                                              | `format`                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------- |
| `email()`      | An email address with a public domain name. [Below](#email).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The domain as the parser reads it                     | `"email"`                          |
| `url()`        | An absolute URL with an allowed protocol and a public host. [Below](#url).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The URL as the parser writes it                       | `"url"`                            |
| `domain()`     | A public domain name. [Below](#domain-and-hostname).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Lowercase ASCII, internationalized labels in punycode | `"domain"`                         |
| `hostname()`   | A hostname of ASCII letters, digits and hyphens. [Below](#domain-and-hostname).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Lowercase                                             | `"hostname"`                       |
| `ip()`         | An IPv4 or IPv6 address. [Below](#ip).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | IPv6 in its canonical form                            | `"ip"`, `"ipv4"` or `"ipv6"`       |
| `cidr()`       | An address and a prefix length, such as `10.0.0.0/8`, the prefix at most 32 for IPv4 and 128 for IPv6. Takes `version` as `ip` does. Bits set past the prefix are accepted.                                                                                                                                                                                                                                                                                                                                                                                                                      | The address as `ip` produces it                       | `"cidr"`, `"cidrv4"` or `"cidrv6"` |
| `mac()`        | A MAC address: six pairs of hex digits, separated by colons throughout or by hyphens throughout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Lowercase, with colons                                | `"mac"`                            |
| `phone()`      | An international number in E.164 form: `+`, a country code and the number, 7 to 15 digits. Spaces, hyphens or dots may separate digits, and at most one group may be in parentheses, as in `+55 (11) 98765-4321`. A national trunk prefix in parentheses, as in `+44 (0)20 7946 0958`, is rejected, since it is no digit of the international number. The number is not checked against the country's numbering plan, so a trunk prefix written without parentheses stays in it: `+44 020 7946 0958` produces `+4402079460958`, which no one can dial. Whether the number exists is not checked. | `+` and the digits                                    | `"phone"`                          |
| `creditCard()` | A payment card number: 12 to 19 digits passing the Luhn checksum, optionally grouped by spaces or by hyphens. Whether it was issued is not checked.                                                                                                                                                                                                                                                                                                                                                                                                                                              | The digits alone                                      | `"creditCard"`                     |
| `uuid()`       | A UUID of version 1 to 8, or the nil or max UUID, hyphenated, in any case. `uuid({ version: 7 })` requires one version, and then rejects the nil and max UUIDs.                                                                                                                                                                                                                                                                                                                                                                                                                                  | Lowercase                                             | `"uuid"`                           |
| `datetime()`   | An ISO 8601 date-time such as `2026-09-28T14:30:00Z`, on a day that exists. [Below](#datetime-and-time).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | As written                                            | `"datetime"`                       |
| `isoDate()`    | An ISO 8601 calendar date such as `2026-09-28`, on a day that exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | As written                                            | `"isoDate"`                        |
| `time()`       | A time of day such as `14:30`, `14:30:00` or `14:30:00.250`, without an offset. [Below](#datetime-and-time).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | As written                                            | `"time"`                           |
| `duration()`   | An ISO 8601 duration such as `P1Y2M`, `PT30M` or `P1DT12H`, with at least one component. Only the seconds may have a fraction, written with a dot, so `PT0.5H` and `PT1,5S` are rejected. That is stricter than ISO 8601 and than `Temporal.Duration`, which accept both. Weeks may be combined with other units, as in `P1W2D`, which ISO 8601-2 and `Temporal` allow. A negative duration such as `-P1D` is rejected. A consumer with a limit, such as the nine digits of `Temporal.Duration`, checks it with a check.                                                                         | As written                                            | `"duration"`                       |
| `semver()`     | A Semantic Versioning 2.0.0 version such as `1.4.0-beta.2`, without a leading `v`. Neither the specification nor `semver()` limits a number or the length. Some libraries refuse a number past `Number.MAX_SAFE_INTEGER` or a version longer than 256 characters: put `string({ max: 256 })` in front with `pipe` when the value goes to one.                                                                                                                                                                                                                                                    | As written                                            | `"semver"`                         |
| `slug()`       | Lowercase ASCII letters and digits in words joined by single hyphens, such as `hello-world-2`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | As written                                            | `"slug"`                           |
| `jwt()`        | A JSON Web Token in compact form: three base64url segments whose header and payload are JSON objects, with no key twice in any object, and a header that names `alg` as text that is not empty. A key given twice, as in `{"alg":"none","alg":"HS256"}`, is rejected, since JSON parsers disagree on which one it means. **The signature is not verified and the claims are not read**, so a token that passes may be forged or expired. An unsigned one, with `alg` `none` and an empty signature, passes too. Verify a token with a JWT library before trusting it.                            | As written                                            | `"jwt"`                            |
| `hex()`        | One or more hexadecimal digits of any case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | As written                                            | `"hex"`                            |
| `base64()`     | Standard base64 with correct padding, as an encoder writes it. There may be no white space or line breaks, so base64 wrapped at 64 or 76 columns, as PEM and MIME write it, fails. The bits a last character holds beyond the data must be zero, so `YWJ=`, which `Buffer.from` decodes as `ab`, fails too. The empty string, which encodes nothing, is rejected. `base64({ url: true })` requires the URL-safe alphabet, `-` and `_`, with the padding optional.                                                                                                                                | As written                                            | `"base64"` or `"base64url"`        |
| `ulid()`       | A ULID, in any case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Uppercase                                             | `"ulid"`                           |
| `nanoid()`     | A Nano ID in its default form: 21 characters of `A-Za-z0-9_-`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | As written                                            | `"nanoid"`                         |
| `cuid2()`      | A CUID2 identifier: 24 to 32 lowercase ASCII letters and digits, the first a letter. Uppercase is rejected, not lowercased.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | As written                                            | `"cuid2"`                          |

`isoDate()` produces a string. To get a `Date`, use [`coerceDate()`](text-input.md#dates), which reads the same text as midnight UTC.

### `port`

`port()` is a format of numbers rather than text: a whole number from 1 to 65535.

- Port 0, which asks a system for any free port, cannot be connected to and is rejected.
- A non-number fails with `invalid_type`, and a number that is not a port with `invalid_format` and `{ format: "port" }`.
- Read a port from text with `pipe(coerceNumber(), port())`.

## `email`

`email(options?, ...checks)` accepts an email address with a public domain name. The value is the address as mail is delivered to it.

The options are `allowPlus`, default `true`, which controls whether `+` is accepted before the `@`, as in `ada+news@example.com`, and the parts described in [Parts of an email or a URL](#parts-of-an-email-or-a-url).

### The local part

The local part, before the `@`, must be a dot-atom, as the email input of HTML accepts:

- ASCII letters, digits and ``!#$%&'*+/=?^_`{|}~-``, with single dots between them.
- A quoted local part, such as `"a b"@example.com`, is rejected.
- So is an address with other letters before the `@` (RFC 6531).
- The local part is limited to 64 characters, and the whole address, as delivered, to 254.

The local part is produced as written.

### The domain

The domain is produced as the URL parser reads it: lowercase ASCII, with an internationalized label in punycode. So `Ada@München.DE` produces `Ada@xn--mnchen-3ya.de`. Every spelling the parser reads as one domain produces the same address, such as fullwidth letters in `ada@ｅxample.com` or an invisible variation selector. So a check made later on the value, such as a list of blocked domains or a uniqueness check, sees the domain mail will reach.

A domain is written with these characters only:

- Letters, marks, digits, dots and hyphens.
- The zero-width non-joiner and joiner, where IDNA allows them, as in `ada@می‌خواهم.com` or `ada@ශ්‍රී.lk`.
- The ideographic, fullwidth and halfwidth full stops (`。`, `．`, `｡`), which count as dots, as `url` reads them too.

A percent escape such as `ex%61mple.com` is URL syntax, which `url` decodes in a host. It is not part of an email domain, so `email` rejects it.

The domain must be a public domain name, as [`domain()`](#domain-and-hostname) requires. These are rejected:

- `localhost`, single-label hosts and IP addresses.
- Special-use names that never reach a public host: those ending in `localhost`, `localdomain`, `local`, `internal`, `home`, `corp`, `mail`, `arpa`, `test`, `example`, `invalid`, `alt` or `onion`, or in one of the eleven IDN test top-level domains IANA reserved, such as `テスト` or `测试`.
- Internationalized labels that are not valid in every browser, so `ada@example.xn--zz` and `ada@٠.com`.
- A domain that ends in a dot, `ada@example.com.`.
- A domain written with more than 759 characters, three for each one a domain can have. It is rejected before the parser reads it.

## `url`

`url(options?)` accepts an absolute URL with an allowed protocol and a public host:

```ts
import { hostname, url } from "@codenhub/validation";

url()("https://example.com/a?b=1"); // ok
url()("http://localhost:3000"); // fails: not a public host
url({ host: hostname() })("http://localhost:3000"); // ok
url({ protocols: ["ftp"] })("ftp://example.com"); // ok
```

`protocols` lists the accepted protocols, without the colon, in any letter case. The default is `["http", "https"]`. The list is copied when the validator is created. A protocol that is not a scheme name, such as `"https:"`, throws a `TypeError` then, since it would match nothing. So do `javascript`, `vbscript` and `data`, whose URLs run script. The other options are the parts described in [Parts of an email or a URL](#parts-of-an-email-or-a-url).

### What it rejects

- A relative URL: `example.com` and `//example.com` are rejected, and no scheme is guessed.
- Embedded credentials, such as `https://user:password@example.com`, unless a `credentials` validator accepts them, as one for `DATABASE_URL` would. A URL without a host, such as `mailto`, never takes them.
- Port 0, `https://example.com:0/`, which nothing can connect to, unless a `port` validator accepts it.
- Text with white space or control characters, such as a line break. A written URL never contains them, so the text is rejected, not cleaned. Trim first with `pipe(string({ trim: true }), url())` when the input may have surrounding spaces.

### The host

These hosts are rejected, whatever the `host` validator:

- A host longer than 253 characters, the most a domain name can have.
- The host of `http`, `https` or another scheme the URL Standard has rules for, when it is written with more than 759 characters. It is refused before the parser reads it.
- An absolute host such as `example.com.`. It is a second spelling of `example.com`, and would let one host past a list of blocked hosts.
- A host with an internationalized label that is not valid in every browser, such as `xn--zz.com` or `٠.com`.
- A host Node.js cannot read again once it is written in punycode, such as `éxn--.com`. So a URL that passes is read the same in every runtime.

A `host` validator replaces the rule that the host is public, and no other. For `http`, `https` and the other schemes the URL Standard has rules for, it is given only a host of lowercase letters, digits, `.`, `-` and `_`, an IPv4 address, or an IPv6 address. `http://a*b.com`, `http://a%20.com` and `http://[::01.2.3.4]`, which runtimes read differently, are rejected whatever it accepts.

A host that only looks like another, such as `exаmple.com` with a Cyrillic `а`, is a host of its own. It passes in its punycode form, `xn--exmple-4nf.com`. Compare the value, never the text, against a list of hosts.

### The value it produces

The standard URL parser reads the text. Every check is made on what it read: the scheme, the credentials and the host. The value is that reading, written back as the parser writes it. So a check made later on the value, such as an allowed path prefix or a list of blocked hosts, sees the URL a request will reach:

- `https://Example.com/public/../admin` produces `https://example.com/admin`.
- A host spelled with fullwidth letters or invisible characters produces the host they spell.
- An internationalized host is in punycode.
- An IPv4 host written as `0x7f.1` or `127.1` is `127.0.0.1`.
- The host of a scheme the parser has no rules for, such as `ssh://Example.COM`, is in lowercase.
- Characters such as `"` and `<` in the path are percent-encoded.

That is URL encoding, not HTML escaping. Other characters, such as `'` and `&`, are kept. Escape the value for the place you write it into, as any text, before you put it in HTML.

### `mailto`, `tel` and `urn`

Three schemes have no host. When `protocols` lists one, a URL of it is checked by its own rules, even when it is written with a host, as in `mailto://example.com`, which names no recipient:

```ts
import { url } from "@codenhub/validation";

url({ protocols: ["mailto"] })("mailto:ada@example.com?cc=bob@example.org"); // ok
url({ protocols: ["mailto"] })("mailto:ada@localhost"); // fails: not a public host
url({ protocols: ["tel"] })("tel:+1-201-555-0123"); // ok
url({ protocols: ["urn"] })("urn:isbn:0451450523"); // ok
```

A `mailto` URL is accepted when:

- It names at least one recipient.
- Every recipient, in the path and in `to`, `cc` or `bcc`, is an address `email()` accepts, on a public domain whatever `host` is. `host` checks the host of a URL, and a mailto has none.
- The query holds only `to`, `cc`, `bcc`, `subject` and `body`, each as `name=value`. Any other field, such as `from` or `reply-to`, fails.
- `subject` and `body` hold what RFC 6068 allows: letters, digits, `-._~!$'()*+,;:@` and `%` escapes, so a line break is `%0D%0A`. They also allow `/` and `?`, which a URL query allows, so `body=https://example.com/a?b` passes. `&`, `=`, `#` and a malformed escape such as `%zz` fail.
- A line break, `%0D` or `%0A`, is only in `body`. In `subject` it would end the header line, so a mail program that writes it into the message unescaped would read what follows, such as `Bcc: …`, as another header. `subject` also refuses every other encoded control character, such as `%00` or a tab, and the line and paragraph separators, `%E2%80%A8` and `%E2%80%A9`, since a subject is one line of text.
- `subject` and `body` appear at most once each. `to`, `cc` and `bcc` may repeat, since each adds recipients.

Each recipient is produced as `email()` produces it, with its local part escaped where a mailto needs it. So `mailto:Ada@EXAMPLE.com` produces `mailto:Ada@example.com`, and `mailto:ada@exa%6dple.com` produces `mailto:ada@example.com`. Field names are produced in lowercase, and `subject` and `body` as written.

A `tel` URL is accepted when it is a global number: `+`, digits with `-`, `.`, `(` or `)` between them, then optional `;name=value` parameters. A value holds only the characters RFC 3966 allows: letters, digits, `-_.!~*'()[]/:&+$` and `%` escapes, so never `"` or `<`. A local number with `phone-context` is rejected.

A `urn` is accepted when it follows RFC 8141: a namespace of 2 to 32 letters, digits and inner hyphens, a colon, and a name that is not empty.

Any other scheme without a host, such as `file:///etc/passwd` or `about:blank`, is rejected even when it is listed, and whatever `host` is. So listing a protocol never lets a URL without a host through unchecked. Any other listed scheme written with a host, such as `file://server/share` or `ftp://example.com`, gets the host checks every URL gets.

`javascript`, `vbscript` and `data` cannot be listed at all. A host does not make them safe: `javascript://example.com/%0aalert(1)` has a public host, and still runs as script when followed.

## `domain` and `hostname`

`domain()` accepts a public domain name. It is the rule `email` and `url` apply to a host by default:

- Two or more labels, and a last label of 2 to 63 letters, or a punycode label.
- No special-use name, such as `localhost`, `.local`, `.internal`, `.test`, `.arpa`, `.home`, `.corp`, `.mail`, `.localdomain`, the `.svc` and `.cluster` of Kubernetes, or an IDN test top-level domain such as `.テスト`.
- Internationalized labels that are valid in every browser. A punycode label must decode to the label it spells. A name with a right-to-left label must keep the bidi rule (RFC 5893), so `٠.com` and `1.ب` are rejected, as browsers reject them, in every runtime.
- The zero-width non-joiner and joiner where IDNA allows them, as in `می‌خواهم.com`.
- No absolute name such as `example.com.`, and no name written with more than 759 characters, three for each one a name can have. The second is rejected before the parser reads it.

It produces the name in lowercase ASCII, with internationalized labels in punycode.

Whether the top-level domain exists is not checked. So a name under any other label passes, private ones in common use included, such as `nas.lan`, `a.private` or `a.intranet`. Block those with a check of your own when they matter. A public name can also resolve to a private address.

`hostname()` accepts a hostname: labels of ASCII letters, digits and hyphens, separated by dots.

- The last label is not a number: all digits, or `0x` and hex digits, which the URL parser reads as an IPv4 address.
- Punycode (`xn--`) labels must decode to the label they spell and keep the bidi rule, as `domain()` requires.
- Other letters are rejected. So `hostname()` rejects `münchen.de` and accepts its punycode, `xn--mnchen-3ya.de`. To accept both, use `union([domain(), hostname()])`.
- An absolute name ending in a dot, as in `example.com.`, is rejected. It names the same host as `example.com`, and a second spelling would let one host past a check that compares the value as a string, such as a list of blocked hosts.

It produces the name in lowercase. Unlike `domain()`, it accepts `localhost` and private names.

## `ip`

`ip(options?)` accepts an IPv4 or IPv6 address. `version`, `"v4"` or `"v6"`, accepts one address family only. Without it both are accepted, and any other value throws a `TypeError` when the validator is created. The `format` in the issue is `"ipv4"` or `"ipv6"` when a version is given, and `"ip"` otherwise.

The addresses it accepts:

- IPv4 is four decimal parts from 0 to 255, without leading zeros, which some parsers read as octal.
- IPv6 is written as RFC 4291 allows: eight groups of one to four hex digits, with one run of zero groups shortened to `::`, and an IPv4 address in place of the last two groups, as in `::ffff:192.0.2.1`, whose parts follow the IPv4 rule.
- A zone such as `%eth0` is accepted only after a link-local address (`fe80::/10`), the one place it means something.

An IPv4 address has one spelling, and is produced as written. An IPv6 address is produced in its canonical form, so that one address is one string:

- Lowercase, with the longest run of zero groups shortened to `::`, as RFC 5952 and the URL parser write it. So `0:0:0:0:0:0:0:1` produces `::1`.
- An IPv4-mapped address (`::ffff:0:0/96`), or one under the NAT64 well-known prefix (`64:ff9b::/96`), comes out with its IPv4 part dotted, as RFC 5952 section 5 recommends: `::ffff:c000:201` produces `::ffff:192.0.2.1`.
- Every other IPv6 address comes out in hex groups, the deprecated IPv4-compatible ones included, since that range also holds `::1`: `::1.2.3.4` produces `::102:304`.

`cidr()` writes its address the same way.

## `datetime` and `time`

`datetime(options?)` accepts a date-time such as `2026-09-28T14:30:00Z`:

- It requires the `T` separator, a time, and `Z`, both in uppercase. The lowercase `t` and `z`, and the space for the `T` that RFC 3339 also allows, fail.
- It rejects days that do not exist, so `2026-02-30T00:00:00Z` fails.
- It rejects leap seconds (`23:59:60`).

| Option      | Default | Meaning                                                                                                                                                                                                                                  |
| ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offset`    | `false` | Also accepts a UTC offset such as `+02:00` in place of `Z`. `+00:00` needs it, as Python's `isoformat()` and Java's `OffsetDateTime` write UTC.                                                                                          |
| `local`     | `false` | Also accepts a date-time without a zone, a time on a local clock such as `2026-09-28T14:30` from an HTML `datetime-local` input. Its seconds may be left out, as that input leaves them out. A time with a zone still needs its seconds. |
| `precision` | none    | An integer from 0 to 9: exactly that many digits of a fraction of a second. `0` forbids a fraction. Without it, a fraction is optional. With `local`, it also requires the seconds.                                                      |

A `precision` that is not a number throws a `TypeError` when the validator is created, and one outside that range a `RangeError`.

`coerceDate` reads more spellings than this, such as a space for the `T`, an offset without its colon, or, with `zoneless: "utc"`, no zone at all. It converts text, and does not check its form. [Text input](text-input.md#dates) lists them.

`time(options?)` accepts `HH:MM`, as an HTML time input writes it, and `HH:MM:SS` with an optional fraction. It takes `precision` as `datetime` does, which also makes the seconds required.

## Parts of an email or a URL

`url` and `email` are built from parts, and each part can be checked with a validator of your own. A part validator receives what the parser read, not the text. It replaces the format's default rule for that part, and never its syntax:

| Option                 | Receives                                                                                                                                                                                                                                                                                                  | Default rule               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `url({ credentials })` | `{ username, password }` as the parser writes them, percent-encoded, with `password` empty when only a user is written. `undefined` when the URL names neither. The URL produced keeps them.                                                                                                              | No credentials             |
| `url({ host })`        | The host: a domain in lowercase ASCII with internationalized labels in punycode, an IPv4 address as four decimal parts, or an IPv6 address without its brackets, spelled as `ip()` spells it. The URL produced keeps the spelling of the parser. For other schemes, [see below](#hosts-of-other-schemes). | A public domain name       |
| `url({ port })`        | The port as a number. `undefined` when the URL names none, or names the default of its scheme, which the parser drops.                                                                                                                                                                                    | Any port but 0             |
| `url({ path })`        | The path as the parser writes it, with dot segments resolved and characters such as spaces percent-encoded, starting with `/`. Empty for a URL of a scheme the parser has no rules for, such as `ssh://example.com`, that names no path.                                                                  | Any path                   |
| `url({ query })`       | The query as an object of its decoded parameters, the value of each key a string. With `repeated: true`, every value of every key, as an array.                                                                                                                                                           | Any query                  |
| `email({ domain })`    | The domain as `email` produces it, lowercase ASCII with internationalized labels in punycode. It must still be a hostname, so never an IP address.                                                                                                                                                        | A public domain name       |
| `email({ local })`     | The local part, before the `@`, as written.                                                                                                                                                                                                                                                               | The syntax of a local part |

```ts
import { domain, email, hostname, ip, object, oneOf, optional, port, startsWith, string, union, url } from "@codenhub/validation";

url({ host: hostname() }); // any hostname, localhost included
url({ protocols: ["postgres"], host: hostname(), credentials: optional(object({ username: string(), password: string() })) }); // a DATABASE_URL
url({ host: union([domain(), ip()]) }); // IP addresses too, but not localhost
url({ host: oneOf(["api.example.com"]), port: optional(port()) });
url({ protocols: ["https"], path: string(startsWith("/api/")) });
url({ query: object({ page: optional(string()) }, { unknownKeys: "strict" }) }); // no other parameters
email({ domain: oneOf(["company.com"]), message: "Use your company address" });
```

A part that fails is reported as the issue of the format, at the place of the URL or the address, so a form shows it beside the field the text was typed in. It is `invalid_format`, with `params` `{ format: "url", part: "host", issues }` or `{ format: "email", part: "domain", issues }`. `issues` holds what the part validator found, with paths relative to the part, such as `["page"]` inside the query.

- The `message` of the format words it, as it words every other issue of the format. So `email({ domain: oneOf(["company.com"]), message: "Use your company address" })` says that sentence for an address at another domain.
- `englishMessages` words it with what the part found first, as in "Invalid email address domain: Expected one of "company.com"".
- A part only decides. The value is still the whole URL or address, so a part that converts its value, such as `coerceNumber` inside `query`, changes nothing in the output. To read typed values from a query, use [`searchParams`](text-input.md#a-query-string).
- A part validator that is asynchronous makes the format asynchronous.
- The parts apply to a URL with a host. A `mailto`, `tel` or `urn` URL keeps [its own rules](#mailto-tel-and-urn).

A query key given more than once, as in `?id=1&id=2`, fails unless `repeated` is set. It fails as the query part, whose `issues` hold `invalid_key` at `[key]`. A check that saw one of the two values while a server read the other would pass a value nobody checked.

### Hosts of other schemes

For a scheme the parser has no rules for, such as `ssh`, `url({ host })` receives the name as written, with its letters in lowercase and its escapes in uppercase. The parser does not read such a host as an address. So `redis://2130706433/`, `redis://0x7f.1/` and `redis://%31%32%37.0.0.1/` reach the validator as written, while a client may connect to `127.0.0.1`. Check such a host with `hostname()`, `domain()` or `ip()`, which reject those spellings, never with a list of strings.

### Paths a server reads otherwise

A server may read a path in ways the URL Standard does not: decoding `%61` to `a`, merging `//` into `/`, or dropping `;` and what follows from a segment. So write a `path` validator as an allowlist, a description of the paths that may pass, such as `string(startsWith("/api/"))`. A denylist such as "not under `/admin`" passes `/;/admin`, `//admin` and `/%61dmin`. An allowlist still holds for each of those readings. It does not hold for a server that decodes the path twice. Such a server reads `/api/%252e%252e/admin` as `/api/../admin`, which is `/admin`, and `startsWith("/api/")` accepts it. For such a server, write an allowlist that leaves out `%`, such as `pattern(/^\/api\/[\w/-]*$/)`.

With a `path` validator, two kinds of path fail before any part runs. Each fails as the path part, whose `issues` hold `invalid_value`:

- A path with an encoded `/` or `\`, `%2F` or `%5C` in either case, with `{ encodedSeparator: true }`. The parser, and a check on the path, read `/api/..%2fadmin` as one segment under `/api/`. A server that decodes the separator before routing reads `/admin`, so a prefix check would pass a path it does not cover.
- A path with a segment `.` or `..`, a dot written plain or as `%2E`, followed by `;` or `%3B`, with `{ dotSegment: true }`. The parser reads `/api/..;/admin` as a segment named `..;` under `/api/`. A server that drops the parameters before resolving dot segments, as Tomcat and Jetty do, reads `/admin`. A proxy that decodes the path, such as nginx, passes `..%3B` on to it as `..;`.

A `;` anywhere else, as in `/api/a;v=1`, is accepted. Without a `path` validator, such a URL is accepted, since nothing checks its path.

For a scheme the parser has no rules for, such as `ssh`, a `\` in the path is kept as it was written, and is no separator to the parser. So `foo://host/api/..\admin` passes `startsWith("/api/")`. A consumer that reads `\` as a separator, as one on Windows may, needs an allowlist that leaves it out, such as `pattern(/^\/api\/[\w/-]*$/)`.

## Next

A format checks a value. Sometimes the value should also change on its way through: trimmed text read as a number, a string turned into a `Date`, a field kept from one shape in another. [Shaping values](shaping-values.md) covers those.
