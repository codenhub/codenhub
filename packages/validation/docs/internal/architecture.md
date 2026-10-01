---
status: IMPLEMENTED
last_updated: 2026-10-01
scope: How the validation package is built and why, for whoever changes it next.
---

# Validation architecture

This records the invariants of `@codenhub/validation` and the reasoning behind decisions that are not obvious from the code. Public behavior lives in the package docs; this is for changing the package without breaking what it relies on. The release conditions and the path to 0.2.0 live in [roadmap.md](roadmap.md).

## What the package is for

The package answers one question, "is this value what I need it to be?", for any package or app that has to ask it and does not want validation to become its business. The unit is a **value**: a URL, an email, a number, a port. A schema for an object or a form is a composition of value validators, never a different kind of thing.

Two consequences shape every decision below:

- **A consumer pays only for what it imports.** The package is meant to be inlined into other packages at build time, so its weight lands in their bundles. Anything that makes every validator heavier is a regression, and the size budgets in `tests/integration/bundle-size.test.ts` enforce that.
- **The contract is ours.** Results, issues and paths are plain data defined here. Nothing depends on another validator's shape or on another workspace package, which is what lets any workspace package depend on this one.

## What the package defends against

A validator is a boundary check on data a program did not make. This section says which input that covers, so a finding can be sorted before anyone writes a fix. It changes only by decision, and a change to it comes before the code that follows from it.

In scope, and the package must get right:

- **Any value JSON can hold, of any shape.** Wrong types, missing and extra keys, `__proto__` and other keys named like prototype members, and nesting of any depth reached through `lazy`. For this input, bad input is a failure and never an exception.
- **Text crafted to be read one way by the validator and another by what uses it.** A format either describes its text completely with a pattern or grammar, or, where a standard parser decides what the text means, returns what that parser read (see [Formats are allowlists](#formats-are-allowlists)). A value that passes means the same thing to the validator and to its consumer.
- **The input leaking through issues.** An issue holds type names and constraint values, never the value under test.
- **Work that grows faster than the input.** A schema whose work multiplies with each level of nesting, such as a recursive `union` of objects, where every option recurses into the children even after it has failed, turns a few hundred bytes into hours. Capping the input cannot help, so `lazy` bounds the calls one synchronous run makes (`maxCalls`), as it bounds the depth. The count restarts with each outermost `lazy` call, so that separate validations never share it, which means a root that fans out before any `lazy` is open, such as an `array` of recursive items, has one count per branch and still costs per item what the count allows. A validation of untrusted input is held to one count by wrapping its root in `lazy`, and the docs say so. The limit is read from the outermost call alone, so the wrapper that holds the count also sets it; a nested `lazy`'s own `maxCalls` is not read, since checking it as `maxDepth` is checked would leave a limit set on the root unable to raise or lower the default of every `lazy` inside. Restarting the count only when the synchronous run ends instead would bound every validation without the wrapper, but would make validations run in one loop share it and fail valid input. The work of a flat input, which grows with it, is a matter of size, below.

Out of scope, and documented rather than defended:

- **Code inside the input.** A getter, a `Proxy` trap or a `then` method runs when read, and its exception propagates, as a callback's does.
- **Size.** Time and memory that grow with the input and with the issues it produces. The caller caps untrusted input and gives collections a `max`.
- **Recursion across an `await`.** `lazy` bounds the stack and the calls of one synchronous run, not an asynchronous recursive schema.
- **The world behind a value.** Whether a domain resolves, where it points, whether a mailbox exists, and which IP ranges are private.

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

Every factory has the same signature: `validator(options?, ...checks)`, where a composer's own arguments, such as the shape of `object` or the item of `array`, come first. Options are an object and checks are functions, so the factory tells them apart with `typeof` and `string(startsWith("a"))` needs no empty options. Every factory that reports an issue of its own accepts a `message` option, so its validators have an options object that can grow without a breaking change.

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

A check is given to a validator after its options: `string({ min: 3 }, startsWith("ab"))`, `object(shape, check((data) => data.password === data.confirm, { path: ["confirm"] }))`. It runs once the value has its type: for a leaf, as soon as the input has passed the type test, next to the option constraints; for a format, once the input is of the format, since the format is what its value is; for a composer, once every child has passed, since before that there is no value of the type to check. A check on an object therefore reports nothing while a property fails, which is the price of giving it a typed value, and a check on `ip()` never sees text that is not an address, so it can parse the value without guarding against that.

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

Where a standard parser decides what the text means, the parser is the description. `url` hands the text to the URL parser, checks what it read (the scheme against a list, the absence of credentials, the host against the public-host rule), and returns that reading serialized, never the text it was given. `email` does the same for its domain, and a `mailto` URL gives each recipient as `email` does. The value then cannot mean one thing to the validator and another to the request or mail server that uses it, whatever spelling the text used: dot segments, fullwidth or invisible characters, IPv4 shorthand, escapes. The rules these validators apply to raw text are positive descriptions too: a written URL holds no whitespace and no control characters, and a domain is written with letters, marks, digits, dots and hyphens, none of which can end a host. Text a format checks without a parser, such as a UUID, is described completely by its pattern and is returned as written.

A format whose meaning has more than one spelling returns one canonical spelling, so a later comparison or lookup on the value treats one meaning as one value:

- `url`, `email` and `domain` return what the URL parser read. For a scheme the parser has no rules for, such as `ssh`, it reads the host as written, so `url` normalizes that host as RFC 3986 does, letters in lowercase and escapes in uppercase.
- `ip` returns an IPv4 address as written, which has one spelling, and an IPv6 address as the URL parser writes it, lowercase with the longest run of zero groups shortened (RFC 5952), and its zone as written. An IPv6 address that embeds an IPv4 one is written in hex groups, `::ffff:c000:201`, where RFC 5952 would keep the dotted form, since the parser's reading is the rule. `cidr` returns its address as `ip` does.
- `mac` returns lowercase pairs separated by colons.
- `hostname` and `uuid` return lowercase, and `ulid` uppercase, the spelling each one's specification writes; a hostname keeps a final dot, which names the same host but is not dropped from what was given, and so do `domain` and the host of `url`, as the parser keeps it. An email domain has no absolute form, so `email` rejects one.
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
- An encoded path separator is structure too: with a `path` part, a path holding `%2F` or `%5C` fails before any part runs, as a failure of the path part whose `issues` hold `invalid_value` with `{ encodedSeparator: true }`. The parser keeps it encoded, so a check on the path reads one segment where a server that decodes it before routing reads two, and `/api/..%2fadmin` would pass a check for `/api/` and reach `/admin`. Without a `path` part nothing checks the path, so the URL is accepted.
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

Invalid input is a normal outcome, so it is a return value: `{ ok: true, value }` or `{ ok: false, error: { issues } }`. The shape matches the `Result<T>` used elsewhere in the repository on purpose, and is defined locally so the package depends on nothing. `docs/specs/errors.md` asks packages without an error dependency to return a package-local result, and asks that throwing and returning not be mixed for the same failure, which is why there is no `parse` or `assert`.

Two things do throw, and both are programmer errors: an invalid option when a validator is created (`string({ min: -1 })` is a `RangeError`, `object(shape, { unknownKeys: "loose" })` is a `TypeError`, and so is an option of the wrong type, such as `number({ int: "yes" })`, a part validator that is not a function, an empty `protocols`, or checks passed as a list, every one of which would otherwise be ignored or read as something else), and a callback the consumer wrote that throws, which propagates as the bug it is. Code inside the input is treated as a callback too: reading a property runs a getter, and a `Proxy` runs a trap, and an exception from either propagates rather than being reported, which would take a `try` around every read in `object`, `record` and `tagged`. Data parsed from JSON carries no code, so validation never throws for it. The one place it could is recursion, since each level of nesting is a level of the JavaScript stack: `lazy` is the only way a schema refers to itself, so `lazy` alone counts. It keeps one module-level counter of the `lazy` calls open on the stack, incremented on entry and decremented in a `finally`, and fails with `too_big` and `{ type: "depth" }` past `maxDepth`. A second counts every `lazy` call since the outermost one began, restarting when a call begins with none open, and fails with `too_big` and `{ type: "calls" }` past `maxCalls`, so work that multiplies with each level, as in a recursive `union` of objects, stops after a bounded number of calls. A counter of calls still on the stack is the right measure of what can overflow, because a promise's continuation runs from a shallow stack. It is not a bound on recursion itself: an asynchronous recursive schema resets it at every await, so it follows input of any depth, and a cyclic object until memory runs out. Bounding that would take a depth carried from one level to the next, which a validator cannot receive without a second parameter in the `(input) => result` contract; the docs say so, and leave the bound to the consumer. No composer takes a depth parameter or holds state. Size is a separate matter that the docs leave to the consumer: nothing here caps how much flat input is checked.

`is(validator, input)` is the boolean projection, for hooks that need a type guard. Its narrowing is exact only for a validator that does not change the value, and the docs say so.

## Issues

An issue is `{ code, path, params?, message? }` and nothing else.

- `code` is an open set of strings. The built-in codes are `invalid_type`, `invalid_value`, `invalid_format`, `too_small`, `too_big`, `unrecognized_key`, `invalid_key`, `invalid_union` and `invalid_intersection`; a custom validator adds its own, such as `username_taken`, and callers branch on them.
- `path` is absolute: from the root of what was validated down to the offending value. A validator reports an issue at its own location (an empty path, or a path relative to its value), and each composer prefixes the segment it descended through with `collectNested`. Nothing else edits paths, which is what keeps them predictable.
- `params` holds the facts behind the failure (`{ minimum: 3, type: "string" }`, `{ expected: "string", received: "number" }`), enough to build a message and to branch on.
- `message` is optional. A built-in validator sets it only when the consumer passed a `message` option, and a check only when it was given one. A custom validator can set it when it wants fixed text.
- `params.received` of `invalid_type` names the kind of value, from `typeof` plus `null`, `array`, `date`, `invalid date`, `nan` and `infinity`, and never a class name: naming a class takes reading the prototype, which every validator would pay for, for a message that tells the reader little.

**Issues never contain an input value.** No `input` field exists, and `params` carries type names and constraint values, never the value under test. Keys are the exception by necessity: a path is made of the input's keys, and `unrecognized_key` names the key in `params.key` as well. This is a privacy invariant, not a default: inputs are passwords and tokens, and an issue is something callers log. Any new rule must keep it, and the unit tests check it per validator.

### Messages are on demand, and the English is separate

Text is not built when an issue is created. `formatIssue(issue, messages?)` builds it from a message map, taking the first of: the issue's own `message`, an entry for its `code` in the map, then the generic "Invalid value". `flatten` groups formatted messages by path for forms.

The built-in English wording is not inside `formatIssue`. It is `englishMessages`, a map in its own module that a consumer imports and passes in. That is what keeps a program that words its own issues from bundling about 1 kB gzipped of English it never shows, and it makes rewording and localization the same operation: spread `englishMessages` and override some codes, or write a whole map. It also means a bare `formatIssue(issue)` is deliberately unhelpful, so `standard`, which the specification obliges to produce text, takes the map as a required argument instead of falling back silently.

That split is what keeps validators small (no string per rule) and makes localization a data problem: a map keyed by code. A consumer that never asks for text never bundles any.

### One validator's own wording

A map words every issue of a code alike, which is wrong for a form where one field needs its own sentence. So every validator takes a `message` option, a string or a function of the issue returning one, and every built-in check takes a message as its last argument:

```ts
string({ min: 3, message: "Pick a longer name" });
email({ message: (issue) => t("errors.email") });
startsWith("ab", "Must start with ab");
```

The option words every issue the validator reports itself, every issue one of its checks reports without a message of its own, and none a child reports, so `object({...}, { message })` words an object that is not an object and leaves each property's issues to that property. A check takes its validator's wording because a field's sentence is meant for the field: `string({ message: "Invalid username" }, pattern(/^\w+$/))` would otherwise show a user the regular expression. A check that needs a sentence of its own is given one, and keeps it. A function is called when the issue is reported, so the issue carries text and stays plain data. The order of [`formatIssue`](#messages-are-on-demand-and-the-english-is-separate) is unchanged, since an issue that carries a message is worded by it first. There is no message per option, such as `min: [3, "Too short"]`: it would make every option a union and every validator heavier, and a constraint that needs its own wording can be written as a check, which takes one.

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
- No shared mutable state, no module-level registries, no `Object.assign`-style attachment of properties to functions at load. The only module-level state is the two counters of `lazy`, described under [Results, not exceptions](#results-not-exceptions): both are created at load without a side effect, the depth is back at zero whenever no validator is running, and the call count restarts with each outermost `lazy` call, so no validation sees what an earlier one counted.
- Options are read once when a validator is created, not per call, and defaults are resolved there.
- An export made by a call at load, such as `export const hex = /* @__PURE__ */ formatFactory(...)`, carries the pure annotation on the outermost call, and its arguments make no call of their own: a bundler keeps a call it cannot prove pure, so every consumer would carry it. Rolldown and esbuild both drop an annotated call nothing uses, and the size budgets would catch one that stayed. Any other export is a function or a constant.
- The English wording lives in `messages/english-messages.ts` and is reachable only through the `englishMessages` export, so `formatIssue` itself carries none of it.

`tests/integration/bundle-size.test.ts` bundles small consumer-shaped modules against the built `dist/` and asserts a gzip ceiling for each: one leaf validator, an object of a few fields, messages alone, and everything. A budget that fails means something made a validator a tenth heavier. The shared core, the code every validator carries, is where a byte costs most: it is paid once per validator family a consumer uses, so a helper there earns its place only if nearly every validator needs it. Each budget is what its scenario measured plus 10%, rounded up to ten bytes, so a fix that adds a few bytes passes without touching the test. When one fails on purpose, every scenario is measured again and every budget reset by the same rule, and the commit says what grew and why.

## Types

There is no input-type parameter. Every validator accepts `unknown`, and that is the honest input type of a function that exists to check unknown data. `Infer<typeof validator>` reads the output type from either flavor.

Every type a public signature names is exported, since `hub check` requires it and a consumer that exports a validator from a library must be able to name its type in declarations. So the types that compute a composer's return type, such as `Composed`, `AnyValidator` and `InferShape`, are public too. The ones a consumer is expected to write are `Validator`, `AsyncValidator`, `Check`, `AsyncCheck`, `Message`, `Infer`, `ValidationResult`, `ValidationIssue`, `Messages` and the options interface of each validator; the docs present the rest as the machinery of signatures, and a change to them is still a change to the API.

An `object` output type is built with `Simplify`, so hover text shows one object, and a property whose validator can produce `undefined` becomes optional in it.

`tests/integration/consumer-types.test.ts` compiles `tests/integration/fixtures/consumer.ts` against `dist/index.d.ts` with `skipLibCheck: false`. The fixture uses `@ts-expect-error` for lines that must fail, so a declaration that becomes too permissive breaks the test as surely as one that becomes too strict. Unit tests import from source and cannot see what a consumer sees; this is the test that can. It needs `dist/`, which `hub test` builds first. `tests/integration/doc-examples.test.ts` holds the public docs to the same declarations: every TypeScript block of `README.md` and the pages directly under `docs/` is compiled as a module of its own, with the same settings, so an example that stops compiling fails the suite. A fragment that uses a name from the text around it, such as `input`, finds it in a short list of global declarations in the test, and a block that imports nothing is given an import of every export.

The runtime code is checked against the runtimes it promises, not against Node.js alone. `tsconfig.json` is a solution file that `tsc -b` follows to two projects: `tsconfig.src.json` checks `src` with the ECMAScript library and `src/runtime-globals.d.ts` only, which declares the members of `URL`, `URLSearchParams`, `TextDecoder` and `atob` the code uses, so a global one runtime lacks, such as `Buffer` or `document`, fails to compile; `tsconfig.test.json` checks the tests and `src/test-utils.ts` with Node's types. The two share `src` without referencing each other, since a reference would want the shared files from the other project's output, which `noEmit` never writes. The build reads `tsconfig.src.json`, since `tsdown` refuses a config with references.

## Dependency model

The package has no dependencies, and it must never depend on another workspace package: workspace packages depend on it, and a cycle has no build order.

Packages inside this repository that validate are meant to take it as a `devDependency` and have their build inline the validators they use, so a published package ships only that code and its own consumers never see this package or its version. `docs/specs/packages-lifecycle.md` requires anything reachable from a published entry point to be a `dependency` or a `peerDependency`, so `hub check` accepts a declared exception: a `codenhub.bundled` list in `package.json` naming devDependencies that the build inlines, described in that spec. Listing a name is a promise about the build, and `hub check` fails when the built JavaScript or declarations still name it. The rule is owned by the tooling, not by this package.

## What adopting costs

The claim that a consumer pays only for what it uses was measured, for 0.1.0, on a real workspace package that validates its own configuration. It took the package as a bundled devDependency and replaced about 80 lines of hand-written checks with eight validators (`array`, `boolean`, `object`, `optional`, `pipe`, `refine`, `string`, `unknown`) and `formatIssue` and `formatPath`. Minified and gzipped, across every entry point and chunk, it went from 5.6 kB to 8.3 kB: +2.7 kB, about +48%. The hand-written checks were about 0.5 kB.

The claim held in the sense that matters for correctness: the built output contained none of the validators the package did not use, no coercion code and no Standard Schema adapter, and `hub check` found no leak. It did not hold in the sense of being small for a package that only checks a few options. Where the bytes went:

- **The validators, about 1.9 kB**, of which about 0.6 kB is the core every validator shares: reporting the received type, building issues, and the sync-until-async plumbing. `string` alone is close to 1 kB because its options are all in one function, so a consumer that uses `min` still carries `pattern`, `startsWith` and the rest.
- **The built-in English wording, about 1.0 kB.** In the first measurement `formatIssue` carried the wording for every issue a built-in can report, and it could not be shaken per code, so a consumer that worded its own issues still bundled it. It is now a separate import, and the same package supplying its own three lines of wording dropped to +1.9 kB (7.6 kB in total, +35%) with none of the English in its build. After the fixes of the pre-release review, which added a few hundred bytes to the shared checks, the same package measures 7.8 kB, +2.2 kB or +39%. The fixes of the second review, chiefly checking when a validator is created that every child is a function, add 0.1 kB more: 7.95 kB, +2.35 kB or about +42%.
- **The consumer's own glue, about 0.3 kB.**

Two consequences follow. First, hand-written checks are still cheaper in bytes for a handful of options, and the package earns its place through consistency and shared behavior rather than size, so "lightweight" holds per validator and not for a package that validates little. Second, inlining copies the shared core into every package that inlines it: an application that installs several such packages carries one copy per package, where a regular dependency would be deduplicated by the application's bundler. Inlining buys isolation from this package's version, and that is worth revisiting once the API is 1.0.

The measurements above are of 0.1.0. The migration also exposed three gaps, which 0.2.0 closes: there was no leaf for function-valued options, which `func()` now is; a validator could not carry a fixed message of its own, which the `message` option now does; and the shared core was about 0.6 kB in every consumer. One gap remains by design: a message that needs the offending value cannot be built by a validator, since issues never hold it.

### 0.2.0, measured again

The same package, moved to checks, `func` and `unique`, measures 7.88 kB against 8.04 kB for the same package on 0.1.0, each built file minified with esbuild and gzipped, then summed. So 0.2.0 costs this adopter 0.16 kB less while adding checks, messages per validator and asynchronous checks to everything it uses: the slimmer type naming and the rare constraints leaving `string` pay for the argument handling and check running every validator now shares. That shared core is about 0.65 kB in a bundle with one leaf in it. The fixes of the third review, chiefly rejecting options that are not a plain object, which takes the same test `object` uses, add 63 bytes gzipped to it (`boolean()` alone, 797 to 860 bytes); the adopter was not measured again for them.

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
