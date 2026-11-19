---
title: Verifying tokens
description: Every verifier option, the order checks run in, times and clock skew, audiences, typ, custom claim schemas, and reading a header before verification.
order: 1
---

# Verifying tokens

`createVerifier` takes the rules a token must meet and returns a function that checks one token against them. Create the verifier once, when your module loads, and call it for every token:

```ts
import { createRemoteKeySet, createVerifier } from "@codenhub/jwt";

const verify = createVerifier({
  keys: createRemoteKeySet({ url: "https://issuer.example/.well-known/jwks.json" }),
  issuer: "https://issuer.example",
  audience: "api",
  requiredClaims: ["sub"],
});

export async function authenticate(authorization: string | null) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
  const result = await verify(token);
  return result.ok ? result.value.payload.sub : undefined;
}
```

The verifier accepts any value, including `undefined` or a number, and reports a value that is not a token as `malformed` rather than throwing. It never throws for a token, whatever the token holds; the exceptions are code of your own: a [`claims` schema](#checking-your-own-claims) that throws or rejects, and a `now` that returns something other than a finite number, such as `NaN` from `Date.parse` of an unset variable. The schema's own error propagates unchanged. A non-finite `now` makes the promise reject with a `TypeError` when the verifier reads the clock, which it does only for a token whose signature checked out, because a `NaN` clock would make every time comparison false and accept expired tokens.

## Options

Every option is checked when `createVerifier` runs, and an invalid one throws a `TypeError` naming the option and its constraint. So does a name that is not an option below, such as `audiance` or `issuers` (`createVerifier: options.audiance is not an option.`), even when its value is `undefined`: a misspelled option would otherwise silently turn its check off. Durations are in seconds.

| Option              | Default                 | What it does                                                                                                                                                                               |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `keys`              | required                | The [key set](key-sets.md) that selects the verification key for each token.                                                                                                               |
| `issuer`            | none                    | A string or a non-empty array of strings. When set, `iss` is required and must equal one of them exactly.                                                                                  |
| `audience`          | none                    | A string or a non-empty array of strings. When set, `aud` is required and must contain at least one of them. Unset, a token with `aud` fails; `false` accepts any `aud`.                   |
| `type`              | none                    | The required `typ` header, such as `JWT` or `at+jwt`, or an array of accepted ones, where `null` accepts a token without `typ`. When set, `typ` is required unless the array holds `null`. |
| `requireExpiration` | `true` without `maxAge` | Whether `exp` is required. `false` when `maxAge` is set, since `maxAge` bounds the token's life instead.                                                                                   |
| `allowExpired`      | `false`                 | Accept a token whose `exp` has passed, for an expired token that still identifies someone, such as an OpenID Connect `id_token_hint`. Every other check still runs.                        |
| `clockTolerance`    | `0`                     | Seconds of clock skew allowed on `exp`, `nbf`, `iat` and `maxAge`, with at least 60 on `nbf` and `iat`. An integer from 0 through 300.                                                     |
| `maxAge`            | none                    | Most seconds since `iat`. When set, `iat` is required. A positive integer.                                                                                                                 |
| `maxLength`         | `8192`                  | Longest token accepted, in characters, checked before anything is decoded. An integer from 1 through 65536.                                                                                |
| `requiredClaims`    | `[]`                    | Claims that must be present, whatever their value.                                                                                                                                         |
| `claims`            | none                    | A [Standard Schema](#checking-your-own-claims) run on the payload after every other check passed.                                                                                          |
| `now`               | `Date.now`              | The current time in **milliseconds** since the Unix epoch, as `Date.now` returns it. Pass your own clock in tests. It must return a finite number; see below.                              |

Without `issuer`, `audience`, `type`, `maxAge` and `requiredClaims`, a verifier checks the signature, the types of the registered claims (`iss`, `sub`, `aud`, `jti`, `exp`, `nbf`, `iat`), the times the token itself states, that it has an `exp`, and that it names no audience. Two defaults are strict on purpose, since forgetting an option should never make a verifier accept more:

- **`exp` is required.** A token without `exp` would never expire, so it is `missing_claim` with `{ claim: "exp" }` unless `maxAge` is set, which bounds the token's age instead, as for DPoP proofs. Tokens that carry no `exp` by design, such as long-lived API keys you revoke by `jti`, need `requireExpiration: false`.
- **A token with `aud` needs `audience`.** RFC 7519 §4.1.3 says a recipient that is not in a token's `aud` must reject it. An issuer that mints tokens for several services would otherwise have each service accept the others' tokens. Name your audience, or pass `audience: false` when a verifier accepts tokens for any audience on purpose.

## The order checks run in

1. **Length.** A value that is not a string is `malformed`. A string longer than `maxLength` is `too_large` with `{ limit: "length", maximum }`, before any decoding.
2. **Structure.** The token must have exactly three segments, each non-empty and in strict base64url: only `A`–`Z`, `a`–`z`, `0`–`9`, `-` and `_`, no `=` padding, and no stray bits in the last character. A segment that breaks this is `malformed` at path `["header"]`, `["payload"]` or `["signature"]`.
3. **Header.** The header must decode to valid UTF-8 JSON that is an object (else `malformed`), nested at most 32 levels deep (else `too_large` with `{ limit: "depth", maximum: 32 }`), with no member name repeated at any depth (else `duplicate_key`, where `JSON.parse` would silently keep the last one); these issues have the path `["header"]`. Its `alg` must be one of the [supported algorithms](index.md#keys-are-bound-to-one-algorithm), compared exactly, so `none`, `None` and `es256` are all `unsupported_alg`. A `crit` member is `unsupported_crit`, since this package implements no header extension, and a `b64` member is `malformed`, since unencoded payloads (RFC 7797) are not supported. `kid`, `typ` and `cty`, when present, must be strings.
4. **Key selection.** The key set picks one key for the header, or fails with `unknown_kid`, `no_matching_key`, `ambiguous_key`, `alg_mismatch` or `key_fetch_failed`. [Key sets](key-sets.md#how-a-key-is-selected) describes the rules. Header members such as `jwk`, `jku`, `x5u` and `x5c`, which name a key or a place to fetch one, are ignored: a token never supplies its own key.
5. **Algorithm.** The selected key's `alg` must equal the header's `alg`, or the result is `alg_mismatch`.
6. **Signature.** A signature of the wrong length for the key, or one that does not verify, is `bad_signature`.
7. **Payload.** Only now is the payload decoded, under the same rules as the header, at path `["payload"]`.
8. **Claims.** Every claim check below runs, and every failure is reported together.
9. **Your schema.** If `claims` is set and every check above passed, it runs last.

Steps 1 to 7 stop at the first failure, so their result holds one issue. A token whose signature does not verify never has its payload read.

## Claim checks

### Claim types

The registered claims must have the types RFC 7519 gives them when present: `iss`, `sub` and `jti` strings; `aud` a string or an array of strings; `exp`, `nbf` and `iat` finite numbers. A claim of the wrong type is one `invalid_claim` issue at its path, such as `["payload", "exp"]`, and the checks below skip it rather than report it a second time.

### Times

The verifier reads the current time as `now() / 1000`, a fractional number of seconds, and compares it with the time claims:

| Claim    | Fails when                                | Issue              |
| -------- | ----------------------------------------- | ------------------ |
| `exp`    | now ≥ `exp` + `clockTolerance`            | `expired`          |
| `nbf`    | now + max(`clockTolerance`, 60) < `nbf`   | `not_yet_valid`    |
| `iat`    | `iat` > now + max(`clockTolerance`, 60)   | `issued_in_future` |
| `maxAge` | now − `iat` > `maxAge` + `clockTolerance` | `too_old`          |

A token is expired at the very second its `exp` names, as RFC 7519 §4.1.4 requires. A token without `exp` is `missing_claim` with `{ claim: "exp" }` unless `requireExpiration` is `false`, which it is by default when `maxAge` is set. With `maxAge` set and no `iat`, the result is `missing_claim` with `{ claim: "iat" }`; `too_old` carries `{ maxAge }`.

`allowExpired: true` skips only the `expired` check. Every other check still runs, `exp` is still required, and `maxAge` still bounds the token's age, so the token must still be one the issuer signed for you. It exists for tokens that identify someone after they expired, such as the `id_token_hint` an OpenID Connect provider accepts at logout. Give such tokens a verifier of their own, and never use it for a token that grants access:

```ts
const verifyHint = createVerifier({ keys, issuer: "https://issuer.example", audience: clientId, allowExpired: true });
```

`clockTolerance` exists because the issuer's clock and yours never agree exactly. Clocks drift; it is the one thing about them you can count on. It defaults to 0 for `exp` and `maxAge`, so a token never lives longer than it says unless you opt in. `nbf` and `iat` always allow at least 60 seconds: they come from the issuer's clock, and with no leeway a verifier a fraction of a second behind refuses a token the moment it is issued. Accepting a token early does not extend its life, which `exp` still bounds. A tolerance of 30 to 60 seconds is common for tokens from another server; the cap of 300 seconds keeps a typo from turning a five-minute token into a much longer one.

### Issuer

With `issuer` set, `iss` must equal one of the given values exactly, character for character: `https://issuer.example` and `https://issuer.example/` are different issuers. A missing `iss` is `missing_claim` with `{ claim: "iss" }`, and a different one is `wrong_issuer`.

A key bound to an issuer by its key set's `issuer` option adds a second check: `iss` must also equal that key's issuer, with the same issues, reported once even when both checks fail. It applies with or without the verifier's `issuer` option. Use it whenever one verifier holds the keys of several issuers, so that one issuer's key cannot verify a token claiming another; [Key sets](key-sets.md#keys-of-several-issuers) shows how.

### Audience

`aud` names who a token is for. It may be one string or an array of strings. With `audience` set, the token passes when any value in its `aud` equals any value in `audience`:

| `audience`           | Token `aud`      | Result           |
| -------------------- | ---------------- | ---------------- |
| `"api"`              | `"api"`          | passes           |
| `"api"`              | `["web", "api"]` | passes           |
| `["api", "billing"]` | `"billing"`      | passes           |
| `"api"`              | `["web"]`        | `wrong_audience` |
| `"api"`              | `[]`             | `wrong_audience` |
| `"api"`              | absent           | `missing_claim`  |
| unset                | `"api"`          | `wrong_audience` |
| unset                | absent           | passes           |
| `false`              | anything         | passes           |

A token with several audiences is accepted by each of them. Whether that is acceptable is a policy of the protocol on top: OpenID Connect, for example, adds the `azp` claim for it, which this package does not interpret.

### Token type

Some tokens look alike but mean different things, such as an ID token and an access token from the same issuer. The `typ` header tells them apart, and `type` requires a specific one, so a token of one kind cannot be replayed as another. The comparison follows RFC 7515 §4.1.9: it ignores case, and ignores an `application/` prefix on either side, so `type: "at+jwt"` accepts `at+jwt`, `AT+JWT` and `application/at+jwt`. A missing or different `typ` is `wrong_type` at `["header", "typ"]`.

`type` also takes an array of accepted values. `null` in it accepts a token without `typ`, which helps while an issuer moves to explicit types: `type: ["at+jwt", null]` accepts RFC 9068 access tokens and older ones that carried no `typ`, but not an ID token typed `JWT`.

### Required claims

`requiredClaims` lists claims that must be present, whatever their value. Each missing one is `missing_claim` with `{ claim }` and path `["payload", claim]`. A claim already reported missing by `issuer`, `audience`, `maxAge` or the `exp` requirement is not reported twice.

## Checking your own claims

`claims` takes any [Standard Schema](https://standardschema.dev/), the interface shared by validation libraries such as `@codenhub/validation`, Zod and Valibot. It runs on the payload after every other check passed, and types the verified payload:

```ts
import { createKeySet, createVerifier, type PublicKey } from "@codenhub/jwt";
import { object, standard, string } from "@codenhub/validation";

declare const publicKey: PublicKey;

const verify = createVerifier({
  keys: createKeySet([publicKey]),
  issuer: "https://issuer.example",
  claims: standard(object({ sub: string({ min: 1 }), scope: string() })),
});

const result = await verify(token);
if (result.ok) {
  result.value.payload.scope; // string
}
```

The schema checks; it does not transform. The payload you get back is the token's own frozen payload, with every claim it carried, even ones the schema does not list, and never a value the schema produced. That is why the payload is typed by what the schema accepts, its input type.

Each issue the schema reports becomes one `invalid_claims` issue whose path is `["payload", ...]` followed by the schema's path. The schema's messages are dropped, since a message such as "expected a number, received 'hunter2'" can quote the token. The paths are kept, though, and can name keys the payload chose, so do not show them to users unescaped. A schema that throws or rejects is not caught: the verifier's promise rejects with that error.

## Reading the header before verifying

`readHeader` returns a token's header without verifying anything, for when you must choose what to do with a token before you can verify it, such as which verifier or tenant a `kid` belongs to:

```ts
import { readHeader } from "@codenhub/jwt";

const header = readHeader(token);
if (header.ok && header.value.kid?.startsWith("tenant-a:")) {
  // hand the token to tenant A's verifier
}
```

It checks the token exactly as a verifier does up to the header, steps 1 to 3 above, and takes the same `maxLength` option. It does not decode the payload, and nothing in this package does before a signature verifies: there is no way to read claims from an unverified token. Treat the header as untrusted too; it only becomes meaningful once a verifier accepts the token.
