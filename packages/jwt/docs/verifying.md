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
  requiredClaims: ["sub", "exp"],
});

export async function authenticate(authorization: string | null) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
  const result = await verify(token);
  return result.ok ? result.value.payload.sub : undefined;
}
```

The verifier accepts any value, including `undefined` or a number, and reports a value that is not a token as `malformed` rather than throwing. It never throws for a token, whatever the token holds; the one exception is a [`claims` schema](#checking-your-own-claims) of your own that throws or rejects.

## Options

Every option is checked when `createVerifier` runs, and an invalid one throws a `TypeError` naming the option and its constraint. Durations are in seconds.

| Option           | Default    | What it does                                                                                                       |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `keys`           | required   | The [key set](key-sets.md) that selects the verification key for each token.                                       |
| `issuer`         | none       | A string or a non-empty array of strings. When set, `iss` is required and must equal one of them exactly.          |
| `audience`       | none       | A string or a non-empty array of strings. When set, `aud` is required and must contain at least one of them.       |
| `type`           | none       | The required `typ` header, such as `JWT` or `at+jwt`. When set, `typ` is required.                                 |
| `clockTolerance` | `0`        | Seconds of clock skew allowed on `exp`, `nbf`, `iat` and `maxAge`. An integer from 0 through 300.                  |
| `maxAge`         | none       | Most seconds since `iat`. When set, `iat` is required. A positive integer.                                         |
| `maxLength`      | `8192`     | Longest token accepted, in characters, checked before anything is decoded. An integer from 1 through 65536.        |
| `requiredClaims` | `[]`       | Claims that must be present, whatever their value.                                                                 |
| `claims`         | none       | A [Standard Schema](#checking-your-own-claims) run on the payload after every other check passed.                  |
| `now`            | `Date.now` | The current time in **milliseconds** since the Unix epoch, as `Date.now` returns it. Pass your own clock in tests. |

Without `issuer`, `audience`, `type`, `maxAge` and `requiredClaims`, a verifier checks only the signature, the types of the registered claims (`iss`, `sub`, `aud`, `jti`, `exp`, `nbf`, `iat`) and the times the token itself states. A token without `exp` never expires: if your tokens must expire, list `exp` in `requiredClaims`.

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
| `nbf`    | now + `clockTolerance` < `nbf`            | `not_yet_valid`    |
| `iat`    | `iat` > now + `clockTolerance`            | `issued_in_future` |
| `maxAge` | now − `iat` > `maxAge` + `clockTolerance` | `too_old`          |

A token is expired at the very second its `exp` names, as RFC 7519 §4.1.4 requires. With `maxAge` set and no `iat`, the result is `missing_claim` with `{ claim: "iat" }`; `too_old` carries `{ maxAge }`.

`clockTolerance` exists because the issuer's clock and yours never agree exactly. It defaults to 0, so skew is something you opt into. A tolerance of 30 to 60 seconds is common for tokens from another server; the cap of 300 seconds keeps a typo from turning a five-minute token into a much longer one.

### Issuer

With `issuer` set, `iss` must equal one of the given values exactly, character for character: `https://issuer.example` and `https://issuer.example/` are different issuers. A missing `iss` is `missing_claim` with `{ claim: "iss" }`, and a different one is `wrong_issuer`.

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

A token with several audiences is accepted by each of them. Whether that is acceptable is a policy of the protocol on top: OpenID Connect, for example, adds the `azp` claim for it, which this package does not interpret.

### Token type

Some tokens look alike but mean different things, such as an ID token and an access token from the same issuer. The `typ` header tells them apart, and `type` requires a specific one, so a token of one kind cannot be replayed as another. The comparison follows RFC 7515 §4.1.9: it ignores case, and ignores an `application/` prefix on either side, so `type: "at+jwt"` accepts `at+jwt`, `AT+JWT` and `application/at+jwt`. A missing or different `typ` is `wrong_type` at `["header", "typ"]`.

### Required claims

`requiredClaims` lists claims that must be present, whatever their value. Each missing one is `missing_claim` with `{ claim }` and path `["payload", claim]`. A claim already reported missing by `issuer`, `audience` or `maxAge` is not reported twice.

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

Each issue the schema reports becomes one `invalid_claims` issue whose path is `["payload", ...]` followed by the schema's path. The schema's messages are dropped, since a message such as "expected a number, received 'hunter2'" can quote the token. A schema that throws or rejects is not caught: the verifier's promise rejects with that error.

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
