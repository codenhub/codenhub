---
title: Issues
description: The result shape, every issue code with its path and params, and which mistakes throw instead.
order: 5
---

# Issues

Everything that reads input you do not control, a token, a JWK, a JWKS or a key-set response, returns a result instead of throwing. This page describes what a failed result holds and lists every code.

## The failed result

```ts
// What a verifier returned for an expired token with the wrong audience
const result = {
  ok: false,
  error: {
    issues: [
      { code: "expired", path: ["payload", "exp"] },
      { code: "wrong_audience", path: ["payload", "aud"] },
    ],
  },
};
```

`error.issues` is never empty, and its type says so, so `result.error.issues[0]` is an issue and not `undefined`. Issues are listed in the order the checks ran. Structural, key-selection and signature failures stop at the first one, so a result for them holds one issue; claim checks report every failing claim; a key import reports the first problem it finds.

The whole result is deeply frozen.

## The issue

| Field    | Meaning                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`   | The stable category of the failure. Branch on it.                                                                                                                                                          |
| `path`   | Where the failure is, when it concerns one place: `["header", "kid"]`, `["payload", "exp"]`, a JWK member such as `["n"]`, or a segment such as `["signature"]`. Omitted when it concerns the whole input. |
| `params` | Facts from your own configuration or this package's limits, such as `{ maximum: 8192 }` or `{ claim: "sub" }`. Omitted when there are none.                                                                |

An issue this package creates never holds a value taken from the input: no token segment, claim value, header value, or key material, and no message from Web Crypto, a schema or a server, since any of those can quote the input. It names which check failed and never what the token said, so a failure can be logged, returned to a client or sent to an error tracker without leaking a token. `path` names claims and header members, which are names this package or your configuration chose, never values. `params.status` of `key_fetch_failed` is the HTTP status code the JWKS server answered with, a number and never content.

Two kinds of issue come from your code, and hold only what it puts in them: an `invalid_claims` path is your schema's path, so a schema over a record can name a payload's own property names there, and a custom key set's failure issues are returned as it gave them. Keep both free of input values if you log them.

There are no messages: a code is the whole answer. Map codes to text yourself if a person needs to read them, and prefer not to tell a client more than "invalid token" when the client may be an attacker.

## Codes

### Token structure

| Code               | Path                                | Params                            | Meaning                                                                                                                                                                                   |
| ------------------ | ----------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `malformed`        | none, a segment, or a header member |                                   | Not a string, not three segments, a segment that is empty or not strict base64url, or JSON that is invalid or not an object. Also a non-text `kid`, `typ` or `cty`, and any `b64` header. |
| `too_large`        | none                                | `{ limit: "length", maximum }`    | The token is longer than `maxLength`.                                                                                                                                                     |
| `too_large`        | `["header"]` or `["payload"]`       | `{ limit: "depth", maximum: 32 }` | The JSON nests deeper than 32 levels.                                                                                                                                                     |
| `duplicate_key`    | `["header"]` or `["payload"]`       |                                   | A JSON object repeats a member name, at any depth.                                                                                                                                        |
| `unsupported_alg`  | `["header", "alg"]`                 |                                   | `alg` is missing or not one of the supported algorithms, compared exactly. `none` in any casing is here.                                                                                  |
| `unsupported_crit` | `["header", "crit"]`                |                                   | The header has a `crit` member. No header extension is supported.                                                                                                                         |

### Key selection and signature

| Code               | Path                | Params                                  | Meaning                                                                                                                                                                                              |
| ------------------ | ------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unknown_kid`      | `["header", "kid"]` |                                         | No key in the set has the header's `kid`. A remote set refetches first, outside its cooldown.                                                                                                        |
| `no_matching_key`  | none                |                                         | The header has no `kid`, and no key in the set has its `alg`.                                                                                                                                        |
| `ambiguous_key`    | none                |                                         | More than one key fits the header. Keys are never tried in turn.                                                                                                                                     |
| `alg_mismatch`     | `["header", "alg"]` |                                         | Keys with the header's `kid` exist, but none is bound to its `alg`.                                                                                                                                  |
| `bad_signature`    | none                |                                         | The signature has the wrong length for the key, or does not verify.                                                                                                                                  |
| `key_fetch_failed` | none                | `{ reason }`, and `status` for `status` | A remote key set could not get its JWKS: `reason` is `timeout`, `network`, `status`, `too_large` or `invalid_response`. `key_set_error` means a custom key set threw or returned something unusable. |

### Claims

| Code               | Path                         | Params       | Meaning                                                                              |
| ------------------ | ---------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `invalid_claim`    | `["payload", claim]`         |              | A registered claim has the wrong type, such as an `exp` that is not a finite number. |
| `expired`          | `["payload", "exp"]`         |              | Now is at or past `exp` plus the clock tolerance.                                    |
| `not_yet_valid`    | `["payload", "nbf"]`         |              | Now plus the clock tolerance is before `nbf`.                                        |
| `issued_in_future` | `["payload", "iat"]`         |              | `iat` is later than now plus the clock tolerance.                                    |
| `too_old`          | `["payload", "iat"]`         | `{ maxAge }` | More than `maxAge` plus the clock tolerance has passed since `iat`.                  |
| `wrong_issuer`     | `["payload", "iss"]`         |              | `iss` is none of the accepted issuers.                                               |
| `wrong_audience`   | `["payload", "aud"]`         |              | `aud` contains none of the accepted audiences.                                       |
| `wrong_type`       | `["header", "typ"]`          |              | The `typ` header is missing or is not the required type.                             |
| `missing_claim`    | `["payload", claim]`         | `{ claim }`  | A claim required by `requiredClaims`, `issuer`, `audience` or `maxAge` is absent.    |
| `invalid_claims`   | `["payload", ...schemaPath]` |              | Your `claims` schema reported an issue there. The path segments are the schema's.    |

[Verifying tokens](verifying.md#claim-checks) describes each check.

### Key import

| Code                     | Path                       | Params                                 | Meaning                                                                                                       |
| ------------------------ | -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `invalid_key`            | a JWK member, or none      |                                        | The JWK is not an object, a member has the wrong type or encoding, or Web Crypto rejected the material.       |
| `unsupported_key`        | a JWK member               | `{ maximum: 8192 }` for an RSA modulus | The key type or curve does not fit the algorithm, the RSA modulus is too long, or the key is multi-prime RSA. |
| `weak_key`               | a JWK member, or none      | `{ minimum }`                          | An RSA modulus under 2048 bits, or a secret under 32 bytes.                                                   |
| `unexpected_private_key` | a JWK member               |                                        | A public import holds a private member.                                                                       |
| `wrong_use`              | `["use"]` or `["key_ops"]` |                                        | `use` is not `sig`, or `key_ops` does not allow the operation the key is imported for.                        |
| `alg_mismatch`           | `["alg"]`                  |                                        | The JWK's `alg` names another algorithm than the one you asked for.                                           |
| `malformed`              | none, or `["keys"]`        |                                        | From `importKeySet`: the JWKS is not an object (no path), or its `keys` is not an array (`["keys"]`).         |
| `too_large`              | none                       | `{ limit: "keys", maximum: 100 }`      | From `importKeySet`: the JWKS lists more than 100 keys.                                                       |

`importKeySet` and `createRemoteKeySet` skip JWKs that fail these checks instead of reporting them. [Keys](keys.md#importing-a-public-key) describes each check.

## What throws instead

A `TypeError` means a mistake in the calling code, not in the input, and is thrown as early as possible:

- **Options.** Every option of `createVerifier`, `createRemoteKeySet`, `importKeySet`, `readHeader` and the key functions is checked when the function is called, and an invalid one throws, naming the option and its constraint. Create verifiers and key sets at startup and a misconfiguration fails the deploy, not the first request.
- **Key objects.** Passing an object this package did not create where a key is expected, a key of the wrong kind (such as a public key to `sign`), or exporting a key created without `extractable: true`.
- **What you sign.** A payload or header `sign` cannot write exactly as JSON, or one that breaks the rules in [Signing tokens](signing.md).

A `TypeError` message names the option or member and the rule it broke, never its value.

Two things propagate rather than becoming a result: an exception thrown by your own `claims` schema, and a failure of Web Crypto itself while signing or generating a key, which means the runtime lacks the algorithm.
