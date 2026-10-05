---
status: IMPLEMENTED
last_updated: 2026-10-05
scope: How the validation package is built and why, for whoever changes it next.
---

# Validation architecture

This records the invariants of `@codenhub/validation` and the reasoning behind decisions that are not obvious from the code. Public behavior lives in the package docs; this is for changing the package without breaking what it relies on. The release conditions of the next release live in [roadmap.md](roadmap.md).

## What the package is for

The package answers one question, "is this value what I need it to be?", for any package or app that has to ask it and does not want validation to become its business. The unit is a **value**: a URL, an email, a number, a port. A schema for an object or a form is a composition of value validators, never a different kind of thing.

Two consequences shape every decision below:

- **A consumer pays only for what it imports.** Whatever a consumer imports lands in the bundle of the application that uses it, and a package that validates a few options brings the core with its first validator. Anything that makes every validator heavier is a regression, and the size budgets in `tests/integration/bundle-size.test.ts` enforce that.
- **The contract is ours.** Results, issues and paths are plain data defined here. Nothing depends on another validator's shape or on another workspace package, which is what lets any workspace package depend on this one.

## What the package defends against

A validator is a boundary check on data a program did not make. This section says which input that covers, so a finding can be sorted before anyone writes a fix. It changes only by decision, and a change to it comes before the code that follows from it.

In scope, and the package must get right:

- **Any value JSON can hold, of any shape.** Wrong types, missing and extra keys, `__proto__` and other keys named like prototype members, and nesting of any depth reached through `lazy`. For this input, bad input is a failure and never an exception.
- **Text crafted to be read one way by the validator and another by what uses it.** A format either describes its text completely with a pattern or grammar, or, where a standard parser decides what the text means, returns what that parser read (see [Formats are allowlists](#formats-are-allowlists)). A value that passes means the same thing to the validator and to its consumer.
- **The input leaking through issues.** An issue holds type names and constraint values, never the value under test.
- **Work that grows faster than the input.** A schema whose work multiplies with each level of nesting, such as a recursive `union` of objects, where every option recurses into the children even after it has failed, turns a few hundred bytes into hours. Capping the input cannot help. `lazy` keeps, for one validation, the result it found for each object at each path, keyed by the object, the last segment of the place and then the whole place, compared only when the object and the segment match, and gives it again when the same object is reached at the same path, so the options of a recursive `union` share the children's result and its work grows with the input. The path is part of the key because the issues are written at it. A primitive is not kept, since it has no children, and keeping every one would cost a map entry for each. A result is reused, never copied, which holds because no composer changes an issue list a child returned. A schema that makes a new object at every level, such as a `transform` that copies its value, defeats the sharing, so `lazy` also bounds the calls one validation makes (`maxCalls`), as it bounds the depth. A validation is the call of a composer from outside, such as `schema(input)`, and everything it reaches until its result settles: the composer opens a validation when none is running, and `chain` carries it into every continuation after an await, so waiting never restarts the count and an asynchronous recursive schema is bounded too. Only the awaits `chain` makes are carried: a validator the consumer writes by hand that awaits and then calls a composer reaches it with no validation current, so that composer starts one with fresh counts. Carrying a context through code the package does not control takes `AsyncLocalStorage`, which is Node.js only, and the package runs anywhere, so the docs state the limit and point asynchronous work at checks, whose awaits `chain` does carry. So a root that fans out before any `lazy` is open, such as an `array` of recursive items, is held to one count per `lazy`, which a count per outermost `lazy` call was not: fifty items of 150 bytes each made fifty counts, and the issues they kept ran the process out of memory. Validations run one after another in a loop each open their own, so they never share a count; so does a validation made from a callback the consumer wrote, such as a check's test, a `transform`'s function, a `guard`, a `format`'s test, a default or a `lazy` getter, which `detached` runs with no validation current, where it would otherwise spend, and be held to, the counts of the validation running the callback; and concurrent asynchronous validations each keep their own, since each continuation restores the validation it belongs to. Each `lazy` counts its own calls in the validation against its own `maxCalls`, keyed by the `lazy`, so a schema's limit holds wherever it is composed: one shared count read from the first `lazy` reached let an unrelated `lazy` listed earlier in an `object` replace a limit raised for a large tree, and reject the tree. A `lazy` made while another's getter runs counts its calls with that one, and holds the shared count to its own `maxCalls`. A schema built anew at every level, by a getter that calls the function that builds it, as `const node = () => union([object({ kids: array(lazy(node)) }), …])` does, makes new `lazy` validators at every level, and with a count of their own each, nothing bounded it: 240 bytes took a second, and 450 ran the process out of memory. The results a `lazy` keeps stay its own, since two validators one getter made may reach the same object at the same path and must not give each other's answer, so such a schema shares no work, doubles to the limit and rejects deep valid input; the docs say to build a recursive schema once and refer to it. The work of a validation is then bounded by the sum of the limits of the `lazy` validators it reaches outside a getter, a number fixed by the schema. The count bounds the issues kept as well as the time: each call can keep about 1 KB of the options that failed, so the default, 10,000, holds each `lazy` of a validation the limit stops to about 10 MB and a few tenths of a second. At 100,000 it held about 100 MB, a cost a public endpoint would pay for each hostile request of a few kilobytes; recursive data of more than 10,000 nodes in one validation is rarer than that, and it raises the limit where it is set. The work of a flat input, which grows with it, is a matter of size, below.

Out of scope, and documented rather than defended:

- **Code inside the input.** A getter, a `Proxy` trap or a `then` method runs when read, and its exception propagates, as a callback's does.
- **Size.** Time and memory that grow with the input and with the issues it produces. The caller caps untrusted input and gives collections a `max`.
- **The world behind a value.** Whether a domain resolves, where it points, whether a mailbox exists, and which IP ranges are private. A host that looks like another, such as `exаmple.com` with a Cyrillic `а`, is a host of its own and passes as its punycode.
- **Issues the package did not make.** `formatIssue` and `flatten` word the issues validators return, whose shape the types state; an issue received from elsewhere, such as JSON from a server, is input, and a malformed one, such as one with `params: null`, may throw. Validate it before wording it.

### When a finding is a blocker

A finding blocks a release when, for input in scope, a value that should fail passes or one that should pass fails, a passing value means something different to its consumer than to the validator, bad input throws, or an issue holds the input. Anything else is recorded in the roadmap's backlog and does not reopen a release. A finding about input out of scope is a question about this section, not a bug: it becomes a fix only after this section is changed to take it in. Documentation that disagrees with the code is fixed when found, and blocks nothing on its own.

## A validator is a function

```ts
type Validator<T> = (input: unknown) => ValidationResult<T>;
type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: { issues: ValidationIssue[] } };
```

There are no classes, no base type, no registry and no method chains. Anything with that shape is a validator, so a custom one needs no helper and no import. Composers take validators and return validators.

The reasons, in order of weight:

- **Tree-shaking.** Each validator is a function in its own module. A bundler keeps exactly the ones a consumer references. A class hierarchy, or a `val` namespace object, drags the shared base and every method along, which is what the previous design did: 4 kB gzipped for one string rule, 19.8 kB for the package.
- **No hidden state.** A function of `unknown` has nothing to configure after construction, so there is nothing to share, mutate or clone. Immutability is free.
- **It is the contract.** `(input: unknown) => result` is small enough to state in one line and to implement in a hand-written check.

### Factories, always

Every pre-made validator is created by calling a function, options optional: `email()`, `string({ min: 2 })`, `url({ host: hostname() })`. There is no validator that is used bare, because a bare validator cannot grow an option without a breaking change, and because one rule with no exceptions is easier to remember than two. A single value therefore reads `email()(input)`.

Every factory has the same signature: `validator(options?, ...checks)`, where a composer's own arguments, such as the shape of `object` or the item of `array`, come first. Options are an object and checks are functions, so the factory tells them apart with `typeof` and `string(startsWith("a"))` needs no empty options. Every factory that reports an issue of its own accepts a `message` option, so its validators have an options object that can grow without a breaking change. Each factory names the options it reads to `split`, which throws a `TypeError` for any other name: a misspelled limit, `array(item, { maxx: 3 })`, would otherwise leave the limit unset and accept what it was written to reject. This was first left to TypeScript, to keep the names out of every validator, but TypeScript does not see options passed through a loosely typed variable, read from configuration or written in JavaScript, and the options 0.1.0 removed already threw for the same reason. Measured, the check costs 68 bytes gzipped on `boolean()`, about 7%, and the error names only the option, not the ones there are, which the types list.

The wrappers are the exception: `optional`, `nullable`, `nullish`, `fallback`, `transform`, `pipe` and `partial` report no issue of their own, only their child's, so they take neither options nor checks. `optional` could not take checks in any case, since its second argument is a default, which may itself be a function. `json` takes the validator of the parsed value first and optionally, so its checks follow options and need the validator: `json(object(shape), {}, check(...))`.

### Options, checks, formats and composition

- **Options** carry the common constraints and the clean-up of one type: `string({ min, max, length, trim, case })`, `number({ min, max, gt, lt, int, safeInt, clamp })`, and `min`, `max` and `length` on collections. They are the short way to say the usual thing, and each costs one small branch in its validator.
- **Checks** carry the rarer constraints, each in its own module: `pattern`, `startsWith`, `endsWith`, `includes`, `lowercase`, `uppercase`, `multipleOf`, `nonZero`, `unique`. Each takes its message last; `unique(by?, message?)` takes what to compare first, since a function in first place is what to compare, not a message. A consumer that never requires a prefix does not bundle the code that checks one. See [Checks](#checks).
- **Formats** are separate validators: `email()`, `url()`, `uuid()`. Each is its own module, so a consumer that wants `email` does not pay for `uuid`.
- **Composition** carries everything else, by function: `object`, `optional`, `pipe`, `transform`. Cleaning a string before checking a format is `pipe(string({ trim: true }), email())`, not an option on `email`.

Which constraints are options is a judgment of how often they are used, weighed against what they add to every use of their validator. A constraint moves between the two only in a breaking release.

Options that change the value are named as changes, and checks never change it: `string({ case: "lower" })` lowercases, where the `lowercase()` check requires lowercase and changes nothing. Clean-up (`trim`, `case`, `clamp`) runs first, then every option constraint and every check on the cleaned value. Every failing constraint reports its own issue.

### Checks

A check is a rule about a value that already has its type. It is not a validator: it receives the typed value, and returns nothing when the value passes, or the issues it found.

```ts
type Check<T> = (value: T) => readonly ValidationIssue[] | undefined;
type AsyncCheck<T> = (value: T) => readonly ValidationIssue[] | undefined | PromiseLike<readonly ValidationIssue[] | undefined>;
```

The two mirror `Validator` and `AsyncValidator`: a check a consumer writes and types as `Check` keeps its validator synchronous, where one typed as the broader `AsyncCheck` would make every validator given it asynchronous.

A check is given to a validator after its options: `string({ min: 3 }, startsWith("ab"))`, `object(shape, check((data) => data.password === data.confirm, { path: ["confirm"] }))`. It runs once the value has its type: for a leaf, once the input has passed the type test and every option constraint, so a bound such as `max` keeps a long value from a costly check and an invalid one from an asynchronous lookup; for a format, once the input is of the format, since the format is what its value is; for a composer, once every child has passed, since before that there is no value of the type to check. A check on an object therefore reports nothing while a property fails, which is the price of giving it a typed value, and a check on `ip()` never sees text that is not an address, so it can parse the value without guarding against that.

Every check of a validator runs and every issue is reported, as for options. A check that returns a promise makes its validator asynchronous, and the types say so: each factory has overloads for synchronous checks, which return `Validator<T>`, and for any checks, which return `AsyncValidator<T>`. Overloads, not a generic list of checks, because a generic rest parameter loses the contextual type that lets `check((data) => …)` infer `data`. One shared helper runs the checks of every validator, so this costs each validator one call.

Checks replace `refine`, which wrapped a validator to add one rule. A check attaches to the validator instead, reports every issue with the others, and needs no second concept.

### Builders

Three public helpers make validators and checks on the same internals as the built-in ones, `leaf` and `split` in `core/checks.ts`, so a custom one behaves exactly as a built-in does, with the same issue shapes, the same `message` option and the same checks. A built-in made by a call when its module loads, such as `export const hex = /* @__PURE__ */ formatFactory(...)`, carries the pure annotation, without which a bundler keeps the call and every consumer carries the validator (see [Tree-shaking is a contract](#tree-shaking-is-a-contract)):

- `check(predicate, issue?)` makes a check of any type. The issue is an issue to report, or a string as its message, and defaults to code `custom`.
- `format(name, predicate)` makes a factory for a string format, such as `slug()`: a non-string fails with `invalid_type`, and a string the predicate rejects with `invalid_format` and `params.format` set to `name`.
- `guard(expected, typeGuard)` makes a factory for a validator of any type from a type guard: `const file = guard("File", (value): value is File => value instanceof File)`, used as `file()`. A value the guard rejects fails with `invalid_type` and `params.expected` set to `expected`.

A validator with options of its own is a function that checks its options and returns one of these. No further helper exists for it, because a function already does it.

### Formats are allowlists

A format accepts text that matches a complete, positive description of it, a pattern or a grammar, and rejects everything else. It never accepts text for avoiding a list of known problems: such a list is finished only when nobody finds the next problem, and every finding adds to it.

Where a standard parser decides what the text means, the parser is the description. `url` hands the text to the URL parser, checks what it read (the scheme against a list, the absence of credentials unless a `credentials` validator accepts them, the host against the public-host rule), and returns that reading serialized, never the text it was given. `email` does the same for its domain, and a `mailto` URL gives each recipient as `email` does. The value then cannot mean one thing to the validator and another to the request or mail server that uses it, whatever spelling the text used: dot segments, fullwidth or invisible characters, IPv4 shorthand, escapes in a host. That holds for what the URL Standard defines. A path is the parser's too, and a server may still route it as another: it may decode an escape such as `%61` for `a`, merge `//` into `/`, or drop `;` and the parameters after it from every segment, as Tomcat and Jetty do. So a `path` part is an allowlist, a description of the paths that may pass, which every such reading of a path it accepts still satisfies; a denylist such as "not under `/admin`" passes `/;/admin`, `//admin` and `/%61dmin`. Where a reading would carry a path an allowlist accepts outside it, the path fails before the part runs, below. The rules these validators apply to raw text are positive descriptions too: a written URL holds no whitespace and no control characters, and a domain is written with letters, marks, digits, dots and hyphens, none of which can end a host. Text a format checks without a parser, such as a UUID, is described completely by its pattern and is returned as written.

The parser is the runtime's own, and runtimes read some hosts differently, while a schema often runs in two of them, on a form and on a server, and must give one answer. Where they differ, the package checks what the parser read itself, by the rule browsers apply, so every runtime gives the browsers' answer: a punycode label must decode to the label it spells, which Node.js and Firefox require and Chromium and WebKit do not, and a name with a right-to-left label must keep the bidi rule of RFC 5893, which every browser applies and Node.js 24 does not. Both are in `formats/punycode.ts` and `formats/bidi.ts`. `tests/browser/agreement.spec.ts` runs generated text through the built package in Node.js and in Chromium, Firefox and WebKit, and fails on any difference, so a new difference is found rather than shipped. A host validator replaces the rule of which hosts are public and none of this: for a scheme the URL Standard has rules for, `url` gives it only a host of lowercase letters, digits, `.`, `-` and `_`, an IPv4 address not written with a bare `0x` part, or an IPv6 address without a leading zero in its IPv4 tail, since Chromium writes `a*b.com` as `a%2Ab.com`, Firefox refuses it and `0x`, and Chromium reads `a%20.com` and `[::01.2.3.4]`, which Node.js refuses. No DNS name holds the characters left out. The spec runs `url({ host: unknown() })` too, so the rule is tested against the engines it exists for.

A format whose meaning has more than one spelling returns one canonical spelling, so a later comparison or lookup on the value treats one meaning as one value:

- `url`, `email` and `domain` return what the URL parser read. For a scheme the parser has no rules for, such as `ssh`, it reads the host as written, so `url` normalizes that host as RFC 3986 does, letters in lowercase and escapes in uppercase.
- `ip` returns an IPv4 address as written, which has one spelling, and an IPv6 address as the URL parser writes it, lowercase with the longest run of zero groups shortened (RFC 5952), its IPv4 part dotted when it is IPv4-mapped or NAT64, as RFC 5952 section 5 recommends, and its zone as written. `cidr` returns its address as `ip` does. `url` gives a `host` validator an IPv6 host in that spelling, so `host: ip()` and a list of addresses `ip()` produced agree, but its value keeps the hex groups the parser writes, since a URL is the URL Standard's to spell, and `new URL(value).href` must give the value back.
- `mac` returns lowercase pairs separated by colons.
- `hostname` and `uuid` return lowercase, and `ulid` uppercase, the spelling each one's specification writes. An absolute name ending in a dot, `example.com.`, names the same host as `example.com`, so `hostname`, `domain`, `email` and `url`, whatever its host validator, reject it rather than produce a second value for one host, which a list of blocked hosts or a uniqueness check comparing strings would miss. It was accepted and kept during 0.2.0's development, as the parser keeps it, and rejected before release for that reason, found in the pre-release audit; an option to accept it can be added without breaking anyone.
- `phone` returns E.164, `+` and the digits (`+5511987654321`), and `creditCard` the digits alone, however either was grouped.

### Formats are made of parts

A composite format is built from parts that are validators on their own. `hostname()`, `domain()` (a public domain name), `ip()` and `port()` each validate a value alone, and `url` and `email` take them as options that check what the parser read:

```ts
url({ protocols, host, path, port, query, repeated });
email({ domain, local, allowPlus });
```

- Without a part option the format applies its own default rule: `url` and `email` require a public domain name, and a URL with no port or path passes those. The default rule is the shared predicate, never the public validator, so a default `url()` builds no issue it throws away and costs what it did without parts.
- A part given as an option replaces the default rule, never the syntax: `url({ host: hostname() })` accepts any hostname, `localhost` included, `url({ host: unknown() })` accepts any host the parser reads, which is what `allowLocal` did, and `url({ host: union([domain(), ip()]) })` accepts IP addresses but not `localhost`. `email({ domain })` still requires a hostname. The protocol is not a part: a list, `protocols`, says it better than a validator would.
- The parts apply to a URL with a host. A `mailto`, `tel` or `urn` URL keeps its own rules, and a `mailto` recipient's domain must be public, as for `email()`: `host` checks a URL's host, and a `mailto` has none.
- The port is given as a number, or as `undefined` when the URL names none or names its scheme's default, which the parser drops. `port()` accepts 1 to 65535: 0 asks a system for any port and cannot be connected to.
- A repeated query key is structure, checked before content: it fails before any part runs, as a failure of the query part whose `issues` hold `invalid_key` at `[key]`. `searchParams`, which is the reader itself, reports it at `[key]` as its own.
- An encoded path separator is structure too: with a `path` part, a path holding `%2F` or `%5C` fails before any part runs, as a failure of the path part whose `issues` hold `invalid_value` with `{ encodedSeparator: true }`. The parser keeps it encoded, so a check on the path reads one segment where a server that decodes it before routing reads two, and `/api/..%2fadmin` would pass a check for `/api/` and reach `/admin`. A segment `.` or `..` followed by `;`, such as `/api/..;/admin`, or by `%3B`, which a proxy that decodes the path, such as nginx, hands on as `;`, fails the same way with `{ dotSegment: true }`: the parser reads one segment named `..;`, and a server that drops path parameters before resolving dot segments, as Tomcat and Jetty do, reads `..`. Only a dot segment is rejected, since that is the one place parameters turn a path an allowlist accepts into one outside it: dropping them from any other segment, as in `/api/a;v=1` or `/;/api`, leaves a path under the same prefix, and rejecting every `;` would reject paths that are valid and in use. Without a `path` part nothing checks the path, so the URL is accepted.
- A part validator receives what the parser read, not the text: the host in its ASCII form, the path after dot segments are resolved, the port as a number.
- A part that fails is the format's own issue, not a child's: one `invalid_format` at the place of the URL or address, `{ format, part, issues }`, with what the part validator found in `issues`, its paths relative to the part. The value is text, so a path into it, such as `["email", "domain"]`, would name a field no form has, and the error would show nowhere; at the format's place it shows beside the field. Being the format's own, it is worded by the format's `message`, which is what makes `email({ domain: oneOf(["company.com"]), message: "Use your company address" })` say that sentence. `englishMessages` words it with the part and what the part found first.
- A part validator only decides; the format still returns the URL or address as the parser writes it, and a part that transforms its value changes nothing in the output. To read typed values out of a URL, validate the part itself.
- An asynchronous part makes the format asynchronous, as a child makes a composer asynchronous.

`query` is given an object built from the decoded search parameters, the values a server reading them with `URLSearchParams` sees. A key that appears more than once fails, as a failure of the query part, unless `repeated` is set, in which case every value of every key is given as an array. The default is the defense against parameter pollution: a validator that saw one of two values while the server read the other would pass a value nobody checked. `repeated` is an option, so the type a validator receives is one or the other and never depends on the input. `searchParams(validator, { repeated })` is the same reading on its own: it takes a query string or a `URLSearchParams` and returns what the validator produces, so `searchParams(object({ page: coerceNumber() }))` reads a typed query.

`email` has no `query`: the `+tag` of `me+tag@example.com` is part of the local part, and `allowPlus: false` rejects it, since refusing `+` aliases is the one common restriction on a local part and is clumsy to write as a `local` validator.

### Compatibility of a format

A format is a contract with three parts, and changing any of them breaks a caller even when the module around it is untouched:

- **Its issue.** `invalid_format` with `params.format` set to its name. The name is frozen once released; params may be added.
- **What it returns.** As written or canonical, and which canonical form. Changing it changes values callers have stored and compare.
- **What it accepts.** Accepting more can let through a value a caller relied on being rejected, and accepting less rejects values that were valid. The accepted set changes only to fix a bug by the rules of [When a finding is a blocker](#when-a-finding-is-a-blocker). New leniency comes behind an option that is off by default, such as a `country` for national phone numbers.

A new format, and a new option on one, are additive. A format that needs data too large for every consumer, such as per-country phone rules, keeps it in a module of its own, so plain use never bundles it.

## Results, not exceptions

Invalid input is a normal outcome, so it is a return value: `{ ok: true, value }` or `{ ok: false, error: { issues } }`. The shape matches the `Result<T>` used elsewhere in the repository on purpose, and is defined locally so the package depends on nothing. `docs/specs/errors.md` asks packages without an error dependency to return a package-local result, and asks that throwing and returning not be mixed for the same failure, which is why no validator throws for its input.

`assert(validator, input, { subject, messages })` is the one entry point that does: it returns the value or throws a `TypeError` naming the subject, the path of the first issue and its wording, with the failure as its `cause`. It is for input whose being invalid is a programmer error, such as a configuration object, which the same spec says must throw. Until 0.3.0 it was left out, on the reasoning that a caller who wants to throw writes `if (!result.ok) throw …`. That did not weigh what the first adopter showed: every package that validates configuration writes the same dozen lines, with its own choice of which issue to name and how to write its path, which is the duplication this package exists to end. It is not a second way to read a form or a request: it names one issue and throws, where the result lists all of them. Its `messages` are optional, unlike those of `formatIssue`, because the path still says which option is wrong when the wording is the generic one.

Two things do throw, and both are programmer errors: an invalid option when a validator is created (`string({ min: -1 })` is a `RangeError`, `object(shape, { unknownKeys: "loose" })` is a `TypeError`, and so is an option of the wrong type, such as `number({ int: "yes" })`, an option name the factory does not read, a part validator that is not a function, an empty `protocols`, or checks passed as a list, every one of which would otherwise be ignored or read as something else), and a callback the consumer wrote that throws, which propagates as the bug it is, or that returns what it may not, a message function anything but text or a check anything but issue objects, which throws a `TypeError` saying so rather than letting a form show `undefined`. When it throws while the result of a sibling is pending, as a hand-written child of `object` may after an asynchronous one, the rejection of that result is handled before the exception propagates (`runEach` in `core/async`): nothing waits for it any more, and unhandled it is reported apart from the exception and ends a Node.js process by default. Every composer and the checks of every validator build their children's results through it, which costs a leaf 54 bytes gzipped. Code inside the input is treated as a callback too: reading a property runs a getter, and a `Proxy` runs a trap, and an exception from either propagates rather than being reported, which would take a `try` around every read in `object`, `record` and `tagged`. `objectLike` is the exception, since it exists for values that carry code: it reads each listed property as `input[key]`, so an inherited one, a non-enumerable one or a getter counts, and a read that throws is an `invalid_value` issue with `params.unreadable`. It is a validator of its own and not an option of `object`, so `object` carries none of it, and it has no `unknownKeys`, since the keys of an instance and its prototypes are not a list a schema can be strict about. Data parsed from JSON carries no code, so validation never throws for it. The one place it could is recursion, since each level of nesting is a level of the JavaScript stack: `lazy` is the only way a schema refers to itself, so `lazy` alone counts. It keeps one module-level counter of the `lazy` calls open on the stack, incremented on entry and decremented in a `finally`, and fails with `too_big` and `{ type: "depth" }` past `maxDepth`. A second, in `core/async`, counts the calls of each `lazy` in one validation, keyed by the `lazy`, from the composer called from outside until its result settles, the continuations after its awaits included; `chain` captures the validation running when it is called and restores it in the continuation, so the count lasts the whole validation, whether or not a `lazy` call is open, and fails with `too_big` and `{ type: "calls" }` past that `lazy`'s `maxCalls`, so work that multiplies with each level, as in a recursive `union` of objects, stops after a bounded number of calls. A counter of calls still on the stack is the right measure of what can overflow, because a promise's continuation runs from a shallow stack. It is not a bound on asynchronous recursion: a continuation starts from a shallow stack, so an asynchronous recursive schema is not held to `maxDepth`. The count of calls is what bounds it, cyclic input included, since every level is a `lazy` call. No composer takes a depth parameter or holds state. Size is a separate matter that the docs leave to the consumer: nothing here caps how much flat input is checked. That rests on the work of a flat input growing with its bytes, which holds for JSON and not for a value received by structured clone, such as `event.data` from `postMessage`: it keeps a sparse array's length and the same array at many places, so a 28-byte message held an array of 10 million holes that `array` took 14 seconds over, and 5 KB held 10 million items through shared arrays. A collection's `max` bounds both, since it is checked before any item, so the docs say a structured-clone value needs it whatever its size. Rejecting a hole was weighed and left out: it would change the documented treatment of holes, which JSON never produces, and it would not bound the shared arrays, which only `max` does.

`is(validator, input)` is the boolean projection. It returns a `boolean` and does not narrow: a guard typed `input is T` would be false for every validator that produces another value than it was given, a coercion, a `transform` or `json`, which can say a string is an object, and the type of a plain function cannot tell those apart. A consumer whose validator keeps the value writes the guard around it.

## Issues

An issue is `{ code, path, params?, message? }` and nothing else.

- `code` is an open set of strings. The built-in codes are `invalid_type`, `invalid_value`, `invalid_format`, `too_small`, `too_big`, `unrecognized_key`, `invalid_key`, `invalid_union` and `invalid_intersection`; a custom validator adds its own, such as `username_taken`, and callers branch on them.
- `path` is absolute: from the root of what was validated down to the offending value. A validator called on its own reports an issue at its own location (an empty path, or a path relative to its value). A composer calling one of this package's composers passes it the place of the value instead, a chain of segments one link per level, and the inner one writes each path in full once; any other validator, such as one written by hand, is called on its own, and its issues are moved under the place once. Prefixing every issue's path at every level, as composers once did, copied each path once per level, which cost the square of the depth for each issue, and recursive input chooses the depth: 400 KB took eight seconds. So a validator called directly, by a consumer, a hand-written validator or an option such as a `union`'s, returns paths relative to its input, while a composer reached through `call` returns paths from the outermost input, which only the composer that passed the place receives. No issue is changed after it is returned. Nothing else edits paths, which is what keeps them predictable.
- `params` holds the facts behind the failure (`{ minimum: 3, type: "string" }`, `{ expected: "string", received: "number" }`), enough to build a message and to branch on.
- An issue held in another's `params.issues`, as `invalid_union`, `invalid_key` and a failed part hold them, keeps the issues behind it only when none of them carries issues of its own (`nested` in `core/result.ts`). Every issue a composer holds passes through it, so issues nest at most three deep. Holding them in full nested them once per level of a recursive schema, which an asynchronous one does 10,000 times, past what a serializer can write, and where levels share a result, as the options of a recursive `union` share the children's through `lazy`, the serialized result doubled with each level: 430 bytes of input, 350 MB of JSON. The cache keeps the work linear; this keeps the result so. A limit of `lazy` found behind such an issue takes its place, so `too_big` with its `maximum` is never hidden.
- `message` is optional. A built-in validator sets it only when the consumer passed a `message` option, and a check only when it was given one. A custom validator can set it when it wants fixed text.
- `params.received` of `invalid_type` names the kind of value, from `typeof` plus `null`, `array`, `date`, `invalid date`, `nan` and `infinity`, and never a class name: naming a class takes reading the prototype, which every validator would pay for, for a message that tells the reader little.

**Issues never contain an input value.** No `input` field exists, and `params` carries type names and constraint values, never the value under test. Keys are the exception by necessity: a path is made of the input's keys, and `unrecognized_key` names the key in `params.key` as well. This is a privacy invariant, not a default: inputs are passwords and tokens, and an issue is something callers log. Any new rule must keep it, and the unit tests check it per validator.

### Messages are on demand, and the English is separate

Text is not built when an issue is created. `formatIssue(issue, messages)` builds it from a message map, taking the first of: the issue's own `message`, an entry for its `code` in the map, then the generic "Invalid value". The map is required, by `formatIssue`, `flatten` and `standard` alike, because a forgotten one would word every issue "Invalid value" without a word. `flatten` groups formatted messages by path for forms.

The built-in English wording is not inside `formatIssue`. It is `englishMessages`, a map in its own module that a consumer imports and passes in. That is what keeps a program that words its own issues from bundling about 1.7 kB gzipped of English it never shows, and it makes rewording and localization the same operation: spread `englishMessages` and override some codes, or write a whole map. It is also why the map is required: with no English to fall back on, a missing map could only say "Invalid value", so leaving it out is a compile error and a `TypeError`.

The wording of each code is also an export of its own, `invalidTypeMessage`, `tooSmallMessage` and the rest, and `englishMessages` is the map of them. A program that can report three codes builds a map of those three and bundles no other wording, where before 0.3.0 the first adopter rewrote them by hand to avoid the whole map, and so kept wording of its own to maintain. They are constants of one module, not a module each: a bundler drops the ones nothing references, and the tables they share stay in one place. The three that quote the issue behind another, `invalidFormatMessage`, `invalidKeyMessage` and `invalidUnionMessage`, take the map in use as a second argument, and the others take the issue alone, so a program can call one directly. Typing all of them with the map, as an entry of a map is typed, made `invalidTypeMessage(issue)` a compile error. Making the map optional on all was rejected: a quoted issue would then read "Invalid value" without a word. `tooSmallMessage` and `tooBigMessage` each word their own direction whatever code the issue has, so a check that reports a code of its own can reuse one.

That split is what keeps validators small (no string per rule) and makes localization a data problem: a map keyed by code. A consumer that never asks for text never bundles any.

### One validator's own wording

A map words every issue of a code alike, which is wrong for a form where one field needs its own sentence. So every validator takes a `message` option, a string or a function of the issue returning one, and every built-in check takes a message as its last argument:

```ts
string({ min: 3, message: "Pick a longer name" });
email({ message: (issue) => t("errors.email") });
startsWith("ab", "Must start with ab");
```

The option words every issue the validator reports itself, every issue one of its checks reports without a message of its own, and none a child reports, so `object({...}, { message })` words an object that is not an object and leaves each property's issues to that property. A check takes its validator's wording because a field's sentence is meant for the field: `string({ message: "Invalid username" }, pattern(/^\w+$/))` would otherwise show a user the regular expression. A check that needs a sentence of its own is given one, and keeps it. A function is called when the issue is reported, so the issue carries text and stays plain data. It is given the issue as its validator reports it, with a path relative to that validator's value: a leaf is called without knowing where its value sits, and its issues are moved to their place afterwards, so the full path does not exist yet. Passing it would make every leaf take a place as composers do, a cost every validator pays, for a sentence that is written where the field is already known. The order of [`formatIssue`](#messages-are-on-demand-and-the-english-is-separate) is unchanged, since an issue that carries a message is worded by it first. There is no message per option, such as `min: [3, "Too short"]`: it would make every option a union and every validator heavier, and a constraint that needs its own wording can be written as a check, which takes one.

## Sync until proven async

There is one implementation of every composer, not a sync one and an async one. A validator is synchronous exactly when everything it runs is.

`chain` applies a function to a value that may still be pending, and `collect` gathers several such values, and both stay synchronous while nothing is a promise. A composer is written once in terms of them: it calls its children, and if any returned a promise the whole result becomes a promise, otherwise it is returned directly. `src/core/async.ts` exports a function named `chain`, never `then`: a module namespace with an export called `then` is a thenable, and importing it can hang in some loaders.

### The types say which

`Validator<T>` returns a result directly. `AsyncValidator<T>` returns a result or a promise of one. A composer's return type is computed from its children by `Composed`: `Validator` when every child is a `Validator`, `AsyncValidator` as soon as one is not. So `object({ name: string(), taken: asyncRule })` is an `AsyncValidator`, and the compiler makes the caller `await` it, while `object({ name: string() })` stays directly readable.

`AsyncValidator` is honestly a result or a promise, not always a promise, because a composer holding an async child can still answer at once for input it can reject without running it: `optional(asyncRule)` given `undefined`, or `object(...)` given a non-object. Promising a `Promise` there would be a lie, and code that chains `.then` on it would break. `await` handles both, so that is the documented contract.

Results keep the order of the children, never the order in which promises settled, so issue order is deterministic. Any callback that returns a thenable counts as async; nothing inspects the function itself, because guessing from `fn.constructor.name` fails silently when a function is wrapped.

`is` accepts only `Validator<T>`, and throws a `TypeError` naming the fix if a validator turns out to return a promise anyway (the type system prevents this unless the type was cast away). It abandons that promise so a later rejection is not reported as unhandled.

## What a function cannot do

A validator is opaque: a combinator can call it and read its result, and nothing else. Three things the previous, class-based design did follow from that, and are done differently here:

- **Tagged unions take a record.** `tagged(key, { click: object(...), key: object(...) })` reads the tag from the input and routes by it, because a variant cannot be asked which tag it accepts. The tag is added back to the output so the type is a proper tagged union, and the variants do not repeat it.
- **Shapes are plain objects.** Extending is spread and omitting is destructuring. `partial(shape)` wraps each property in `optional` and returns a new shape. There is no `required`, since it would have to unwrap `optional`.
- **Defaults belong to `optional`.** `optional(validator, value)` replaces `undefined` with the value, and the output type loses `undefined`. There is no separate `withDefault`: a default is what an optional value is when it is absent.
- **Recursion names its own type.** `lazy` looks a validator up on first use, and the variable that holds a recursive validator carries an explicit type annotation, because TypeScript cannot infer a type that refers to itself.

Structure is checked before content. A collection whose size is wrong fails at once without validating its items, and a tagged union with a missing tag fails without running any variant, so hostile input is rejected before it is worked through. Every other check still reports every problem it can find.

## Tree-shaking is a contract

The package is `sideEffects: false`, every module is side-effect free at load, and nothing registers itself anywhere. To keep it that way:

- One validator or check per module; a module imports only `core/` helpers and other validators it truly composes.
- No shared mutable state, no module-level registries, no `Object.assign`-style attachment of properties to functions at load. The only module-level state is the depth counter of `lazy`, the count a `lazy` made while a getter runs shares, and the validation running now in `core/async`, described under [Results, not exceptions](#results-not-exceptions), and the `WeakMap` in `core/nesting` from each composer to its work, which composers use to pass a place to each other: all are created at load without a side effect, the depth is back at zero, no getter is running and no validation is current whenever no validator is running, each validation has a count of its own, so none sees what an earlier one counted, and the map holds its composers weakly and changes no function.
- Options are read once when a validator is created, not per call, and defaults are resolved there.
- An export made by a call at load, such as `export const hex = /* @__PURE__ */ formatFactory(...)`, carries the pure annotation on the outermost call, and its arguments make no call of their own: a bundler keeps a call it cannot prove pure, so every consumer would carry it. Rolldown and esbuild both drop an annotated call nothing uses, and the size budgets would catch one that stayed. Any other export is a function or a constant.
- The English wording lives in `messages/english-messages.ts` and is reachable only through `englishMessages` and the export of each code's wording, so `formatIssue` itself carries none of it.

`tests/integration/bundle-size.test.ts` bundles small consumer-shaped modules against the built `dist/` and asserts a gzip ceiling for each: one leaf validator, an object of a few fields, messages alone, and everything. A budget that fails means something made a validator a tenth heavier. The shared core, the code every validator carries, is where a byte costs most: it is paid once per validator family a consumer uses, so a helper there earns its place only if nearly every validator needs it. Each budget is what its scenario measured plus 10%, rounded up to ten bytes, so a fix that adds a few bytes passes without touching the test. When one fails on purpose, every scenario is measured again and every budget reset by the same rule, and the commit says what grew and why.

## Types

There is no input-type parameter. Every validator accepts `unknown`, and that is the honest input type of a function that exists to check unknown data. `Infer<typeof validator>` reads the output type from either flavor.

The types that compute a composer's return type and that a consumer may need to name, such as `Composed`, `AnyValidator` and `InferShape`, are exported, so a library that exports a validator can name its type. A helper type that only shapes a signature, such as `Simplify` or `UrlParts`, may stay internal: `hub check` allows it, the reference lists it under its internal types, and TypeScript writes it out in a consumer's declarations, which a generic wrapper around `url`, `optional`, `tagged` or `object` emitted without an error. The ones a consumer is expected to write are `Validator`, `AsyncValidator`, `Check`, `AsyncCheck`, `Message`, `Infer`, `ValidationResult`, `ValidationIssue`, `Messages` and the options interface of each validator; the docs present the rest as the machinery of signatures, and a change to them is still a change to the API.

An `object` output type is built with `Simplify`, so hover text shows one object, and a property whose validator can produce `undefined` becomes optional in it.

`tests/integration/consumer-types.test.ts` compiles `tests/integration/fixtures/consumer.ts` against `dist/index.d.ts` with `skipLibCheck: false`. The fixture uses `@ts-expect-error` for lines that must fail, so a declaration that becomes too permissive breaks the test as surely as one that becomes too strict. Unit tests import from source and cannot see what a consumer sees; this is the test that can. It needs `dist/`, which `hub test` builds first. `tests/integration/doc-examples.test.ts` holds the public docs to the same declarations: every TypeScript block of `README.md` and the pages directly under `docs/` is compiled as a module of its own, with the same settings, so an example that stops compiling fails the suite. A fragment that uses a name from the text around it, such as `input`, finds it in a short list of global declarations in the test, and a block that imports nothing is given an import of every export.

The runtime code is checked against the runtimes it promises, not against Node.js alone. `tsconfig.json` is a solution file that `tsc -b` follows to two projects: `tsconfig.src.json` checks `src` with the ECMAScript library and `src/runtime-globals.d.ts` only, which declares the members of `URL`, `URLSearchParams`, `TextDecoder` and `atob` the code uses, so a global one runtime lacks, such as `Buffer` or `document`, fails to compile; `tsconfig.test.json` checks the tests and `src/test-utils.ts` with Node's types. The two share `src` without referencing each other, since a reference would want the shared files from the other project's output, which `noEmit` never writes. The build reads `tsconfig.src.json`, since `tsdown` refuses a config with references.

## Dependency model

The package has no dependencies, and it must never depend on another workspace package: workspace packages depend on it, and a cycle has no build order.

A package that validates with it declares it as a regular `dependency`, installed from its release as `docs/specs/packages-lifecycle.md` asks of any public package that depends on another.

Until 0.3.0 the recorded choice was the opposite: a `devDependency` that the adopter's build inlined, declared in `codenhub.bundled`, so its consumers never saw this package or its version. That bought isolation from an API that was still changing. It did not weigh the package's purpose, which is to be the one place validation's edge cases are handled, once more than one package relies on it:

- **A fix did not reach anyone by itself.** Inlined code is a copy. A fix here reached an application only after every package that inlined it was rebuilt and released, where a dependency range delivers it with one update.
- **The core was paid once per package.** An application using several such packages carried a copy of the shared core in each, about 1.2 kB gzipped per copy at 0.2.0, and more for each validator they had in common. As a dependency the application's bundler keeps one.

The cost of the reversal is that this package's version is now visible to an adopter's consumers. Before 1.0 a caret range spans one minor, so two adopters on different minors install two copies: adopters move to a new minor together. `codenhub.bundled` remains a rule of the tooling for other libraries; this package no longer asks for it.

## What adopting costs

The claim that a consumer pays only for what it uses was measured, for 0.1.0, on a real workspace package that validates its own configuration. It took the package as a bundled devDependency and replaced about 80 lines of hand-written checks with eight validators (`array`, `boolean`, `object`, `optional`, `pipe`, `refine`, `string`, `unknown`) and `formatIssue` and `formatPath`. Minified and gzipped, across every entry point and chunk, it went from 5.6 kB to 8.3 kB: +2.7 kB, about +48%. The hand-written checks were about 0.5 kB.

The claim held in the sense that matters for correctness: the built output contained none of the validators the package did not use, no coercion code and no Standard Schema adapter, and `hub check` found no leak. It did not hold in the sense of being small for a package that only checks a few options. Where the bytes went:

- **The validators, about 1.9 kB**, of which about 0.6 kB is the core every validator shares: reporting the received type, building issues, and the sync-until-async plumbing. `string` alone is close to 1 kB because its options are all in one function, so a consumer that uses `min` still carries `pattern`, `startsWith` and the rest.
- **The built-in English wording, about 1.0 kB.** In the first measurement `formatIssue` carried the wording for every issue a built-in can report, and it could not be shaken per code, so a consumer that worded its own issues still bundled it. It is now a separate import, and the same package supplying its own three lines of wording dropped to +1.9 kB (7.6 kB in total, +35%) with none of the English in its build. After the fixes of the pre-release review, which added a few hundred bytes to the shared checks, the same package measures 7.8 kB, +2.2 kB or +39%. The fixes of the second review, chiefly checking when a validator is created that every child is a function, add 0.1 kB more: 7.95 kB, +2.35 kB or about +42%.
- **The consumer's own glue, about 0.3 kB.**

Two consequences follow. First, hand-written checks are still cheaper in bytes for a handful of options, and the package earns its place through consistency and shared behavior rather than size, so "lightweight" holds per validator and not for a package that validates little. Second, inlining copies the shared core into every package that inlines it: an application that installs several such packages carries one copy per package, where a regular dependency would be deduplicated by the application's bundler. Inlining bought isolation from this package's version; 0.3.0 gave it up, as [Dependency model](#dependency-model) records.

The measurements above are of 0.1.0. The migration also exposed three gaps, which 0.2.0 closes: there was no leaf for function-valued options, which `func()` now is; a validator could not carry a fixed message of its own, which the `message` option now does; and the shared core was about 0.6 kB in every consumer. One gap remains by design: a message that needs the offending value cannot be built by a validator, since issues never hold it.

### 0.2.0, measured again

The same package, moved to checks, `func` and `unique`, measures 7.88 kB against 8.04 kB for the same package on 0.1.0, each built file minified with esbuild and gzipped, then summed. So 0.2.0 costs this adopter 0.16 kB less while adding checks, messages per validator and asynchronous checks to everything it uses: the slimmer type naming and the rare constraints leaving `string` pay for the argument handling and check running every validator now shares. That shared core is about 0.65 kB in a bundle with one leaf in it. The fixes of the third review, chiefly rejecting options that are not a plain object, which takes the same test `object` uses, add 63 bytes gzipped to it (`boolean()` alone, 797 to 860 bytes); the adopter was not measured again for them.

Measured again on 2026-10-04, the same way, before the release: 8.90 kB with the package as the fourth to sixth reviews and the pre-release audit left it, 8.98 kB after the first fixes of the final audit, and 9.26 kB after the rest, chiefly the check of option names that every validator now carries, with the names it reads and the error that lists them, and the handling of a pending result when a sibling throws. So 0.2.0 costs this adopter 1.22 kB more than 0.1.0, about 15%, for options and checks that are checked when made, issues bounded in size, recursion bounded in work, and one answer in every runtime. The fixes of the audit before the API freeze add 0.15 kB more: 9.35 kB, against 9.20 kB for `main` before them, both measured the same way on the same day, chiefly from requiring text of every message a function returns and refusing a check's result that is not an issue, which every validator carries, and from `oneOf` refusing a list with a hole or a `Set`. The budgets in `tests/integration/bundle-size.test.ts` were reset from measurement for them (`boolean()` alone, 1064 to 1127 bytes) and hold the line from here.

### 0.3.0, and what a small adopter can expect

[Issue 209](https://github.com/codenhub/codenhub/issues/209) asked for a floor low enough that inlining the package costs a small package about what hand-written checks would. Measured on 0.2.0 with esbuild, minified:

- A lone `boolean()` is 2.6 kB (1.2 kB gzipped), nearly all of it the shared core: argument handling, the check runner, wording and naming the received type.
- The eleven exports the first adopter uses are 10.1 kB (3.9 kB gzipped). The hand-written checks they replaced, rebuilt from the commit that removed them, are 2.1 kB (0.66 kB gzipped).
- Removing three of the checks the core makes of a schema, the 0.1.0 migration errors, the test of option names and the test of what a check returns, takes 7% off that adopter's 10.1 kB. The bytes are in the validators it uses, not in the floor.

So the target is out of reach by about five times, and nothing that keeps the behavior closes it. Two designs that lower the floor were considered and rejected:

- **Lean factories beside the full ones**, taking no checks and no message: 0.6 kB for a leaf and 3.4 kB for a plain object of three fields against 7.2 kB, measured on a prototype. A second family is a second implementation of the same edge cases, and the first adopter, which uses checks and messages, gains nothing.
- **Checks out of every factory, into one composer**, so the runner arrives with the import that needs it. It saves about 2 kB minified, 0.8 kB gzipped, once per application, and only in an application where nothing uses a check or a message, while every check written becomes a longer call.

What 0.3.0 does instead is make the cost a shared one and remove what adopters wrote around the package: it becomes a regular dependency, `assert` replaces the throwing helper each adopter wrote, the wording of each code is importable alone, and `objectLike` covers the instances `object` refuses. The 0.1.0 migration errors are gone, and an option 0.1.0 had is reported as any unknown option is: `string()` alone goes from 1787 to 1606 bytes gzipped, `number()` from 1962 to 1864, `array` from 2525 to 2299, and an object of three fields from 5313 to 5076. The budgets of the scenarios that shrank were reset from measurement, and `assert` with two wordings (2635 bytes) and `objectLike` (2331 bytes) have budgets of their own.

Hand-written checks stay cheaper in bytes for a handful of options. What an adopter buys is that the edge cases are handled in one place, and what it pays is shared with every other adopter in the same application.

## Coercion

A coercing validator is a strict validator behind a converter: `coerceNumber(options)` builds `number(options)` once, converts the input, and hands the converted value to it. So the strict validator owns every constraint and every option check, and the coercing one adds only the conversion. Each is its own module and its own export, so a consumer that never coerces does not bundle the conversion code, which is why coercion is not an option on the strict validators.

The conversions are narrow on purpose, because a conversion that guesses turns a bug into a plausible value: no booleans as numbers, no empty string as zero, no free-form dates, no typo read as `false`. What cannot be converted fails with `invalid_type` and `coerced: true` in `params`, and never the value.

## Standard Schema

A validator is a function and not a schema object, so Standard Schema v1 support is an adapter: `standard(validator, messages)` returns a new function that calls the validator and carries a `~standard` property, and leaves the validator you gave untouched. The standard requires a `message` on every issue, and the adapter supplies it with `formatIssue` and a message map it requires as an argument, so the cost of messages is paid only by whoever asks for interop. Input type and output type are `unknown` and the validator's `Infer`, since validators take `unknown`.

`~standard.validate` is synchronous for a synchronous validator and returns a promise for an asynchronous one, through `chain`. The interface types are vendored in `src/interop/standard-schema.ts` so the package needs no dependency for them.

## Adding a validator

1. One module, one exported factory, options in one interface, all with TSDoc per `docs/guidelines/code.md`. Throw `RangeError` or `TypeError` from the factory for options that make no sense.
2. Build it with the [builders](#builders) where one fits: `format` for a string format, `guard` for a type, `check` for a rule on a typed value. The signature is `validator(options?, ...checks)`, and the options include `message`.
3. Decide whether a constraint is an option or a check by [how often it is used](#options-checks-formats-and-composition).
4. Describe what is accepted, never what is rejected, per [Formats are allowlists](#formats-are-allowlists). When a standard parser gives the input its meaning, check what the parser read and return it. Decide whether it returns the text as written or a canonical form before it is released, since that is [part of its contract](#compatibility-of-a-format).
5. Non-matching type: `invalid_type`. Failed constraint: `invalid_format`, `invalid_value`, `too_small` or `too_big` with `params` that name the facts and never the value.
6. Report every failing constraint, not the first.
7. Tests beside it: accepted values, rejected values, edge cases, the exact issue shape, the `message` option, and that no issue contains the input. A format that returns a parser's reading also gets a case in `src/formats/parser-agreement.test.ts`.
8. Add it to the size budgets if it adds a scenario a consumer would plausibly bundle alone.
9. Document it in `docs/validators.md`, and the wording for its issue shape in `messages/english-messages.ts`.
