---
title: Issues
description: The result shape, every issue code with its path and params, and which mistakes throw instead.
order: 8
---

# Issues

Everything that reads input you do not control, a token, a JWK, a JWKS or a key-set response, returns a result instead of throwing. For a verifier, a forged token is an ordinary Tuesday, not an exception. This page describes what a failed result holds and lists every code.

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

Two kinds of issue come from your code, and hold only what it puts in them: a `schema_failed` path is your schema's path, so a schema over a record can name a payload's own property names there, and a custom key set's failure issues are returned as it gave them. Keep both free of input values if you log them.

Codes and `params.reason` values may gain members in a minor release, when a new check or failure needs its own name; existing ones keep their meaning. Treat an unknown code as a failure like any other, and give a `switch` over codes a `default` branch rather than relying on TypeScript's exhaustiveness check.

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

| Code               | Path                | Params                                  | Meaning                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unknown_kid`      | `["header", "kid"]` |                                         | No key in the set has the header's `kid`. A remote set refetches first, outside its cooldown.                                                                                                                                                                                                                   |
| `no_matching_key`  | none                |                                         | The header has no `kid`, and no key in the set has its `alg`.                                                                                                                                                                                                                                                   |
| `ambiguous_key`    | none                |                                         | More than one key fits the header. Keys are never tried in turn.                                                                                                                                                                                                                                                |
| `alg_mismatch`     | `["header", "alg"]` |                                         | Keys with the header's `kid` exist, but none is bound to its `alg`; or a custom key set or resolver returned a key bound to another `alg`.                                                                                                                                                                      |
| `bad_signature`    | none                |                                         | The signature has the wrong length for the key, or does not verify.                                                                                                                                                                                                                                             |
| `key_fetch_failed` | none                | `{ reason }`, and `status` for `status` | A remote key set could not get its JWKS: `reason` is `timeout`, `network`, `status`, `too_large`, `invalid_response` or `no_usable_keys`, a JWKS without a key the set can use. `key_set_error` means a custom key set or `keys` function threw or returned something unusable; `onKeySetError` gets the error. |

### Claims

| Code               | Path                         | Params       | Meaning                                                                                                                                                                                                                                                                                                       |
| ------------------ | ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_claim`    | `["payload", claim]`         |              | A registered claim has the wrong type, such as an `exp` that is not a finite number.                                                                                                                                                                                                                          |
| `expired`          | `["payload", "exp"]`         |              | Now is at or past `exp` plus the clock tolerance.                                                                                                                                                                                                                                                             |
| `not_yet_valid`    | `["payload", "nbf"]`         |              | `nbf` is later than now plus the clock tolerance, or 60 seconds when the tolerance is less.                                                                                                                                                                                                                   |
| `issued_in_future` | `["payload", "iat"]`         |              | `iat` is later than now plus the clock tolerance, or 60 seconds when the tolerance is less.                                                                                                                                                                                                                   |
| `too_old`          | `["payload", "iat"]`         | `{ maxAge }` | More than `maxAge` plus the clock tolerance has passed since `iat`.                                                                                                                                                                                                                                           |
| `wrong_issuer`     | `["payload", "iss"]`         |              | `iss` is none of the accepted issuers, or is not the issuer the selected key is bound to. With a `keys` function, also when the function returns `undefined` for the token's `iss`; an `iss` the `issuer` option refuses fails before the function is called.                                                 |
| `wrong_subject`    | `["payload", "sub"]`         |              | `sub` is none of the accepted subjects.                                                                                                                                                                                                                                                                       |
| `wrong_audience`   | `["payload", "aud"]`         |              | `aud` contains none of the accepted audiences, or the verifier names no `audience` and the token has an `aud`.                                                                                                                                                                                                |
| `wrong_type`       | `["header", "typ"]`          |              | The `typ` header is missing or is not the required type.                                                                                                                                                                                                                                                      |
| `missing_claim`    | `["payload", claim]`         | `{ claim }`  | A claim required by `requiredClaims`, `issuer`, `subject`, `audience`, `maxAge` or `requireExpiration` is absent. `iss` is also required when the selected key is bound to an issuer, and when `keys` is a function, which needs it to choose a key set, so that token fails before its signature is checked. |
| `schema_failed`    | `["payload", ...schemaPath]` |              | Your `claims` schema reported an issue there. The path segments are the schema's.                                                                                                                                                                                                                             |

[Verifying tokens](verifying.md#claim-checks) describes each check.

### DPoP proofs

From the verifier `createDpopVerifier` returns, besides the codes above.

| Code                      | Path                   | Params       | Meaning                                                                                                                                               |
| ------------------------- | ---------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrong_method`            | `["payload", "htm"]`   |              | `htm` is not the request's method, compared exactly.                                                                                                  |
| `wrong_url`               | `["payload", "htu"]`   |              | `htu` is not the request's URL, once both are normalized and stripped of their query and fragment.                                                    |
| `wrong_access_token_hash` | `["payload", "ath"]`   |              | `ath` is not the hash of the request's access token.                                                                                                  |
| `wrong_nonce`             | `["payload", "nonce"]` |              | The verifier requires a nonce and the proof's is missing, not a string, or not one it accepts. Answer it with a fresh nonce and `use_dpop_nonce`.     |
| `wrong_key`               | `["header", "jwk"]`    |              | The proof's key does not have the thumbprint of the access token's `cnf.jkt`, or the access token's claims have no string `cnf.jkt`.                  |
| `replayed`                | `["payload", "jti"]`   |              | `acceptJti` returned `false`: the proof's `jti` was seen before.                                                                                      |
| `callback_failed`         | none                   | `{ option }` | The `nonce` function or `acceptJti`, named by `option`, threw, rejected or returned something other than a boolean; `onCallbackError` gets the error. |

A proof's `typ`, `alg`, signature and claims fail with the codes above, and a `jwk` header that does not import with the key import codes below, under `["header", "jwk"]`. [DPoP proofs](dpop.md#verifying-proofs) describes each check.

### Encrypted tokens

A decrypter and a nested verifier use the token structure and key selection codes above, for five segments instead of three, and these:

| Code                | Path                                       | Params | Meaning                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unsupported_alg`   | `["header", "alg"]`                        |        | `alg` is missing or not a supported key management algorithm. `RSA1_5`, `PBES2-*` and the 192-bit `A192KW` and `ECDH-ES+A192KW` are here.                                                                                                             |
| `unsupported_enc`   | `["header", "enc"]`                        |        | `enc` is missing, not a supported content encryption algorithm, or not in the decrypter's `enc` list.                                                                                                                                                 |
| `malformed`         | `["header", member]`                       |        | A `zip` member, which is never decompressed; a non-text `kid`, `typ` or `cty`; an `apu` or `apv` that is not base64url; or, for `ECDH-ES`, an `epk` that is missing, not on the key's curve, a low-order point, or holds a private or unknown member. |
| `malformed`         | `["encrypted_key"]`, `["iv"]` or `["tag"]` |        | The encrypted key is present for `dir` or `ECDH-ES`, or empty for another `alg`; or the IV or tag has the wrong length for `enc`.                                                                                                                     |
| `alg_mismatch`      | `["header", "alg"]` or `["header", "enc"]` |        | The selected key is bound to another `alg`; at `enc`, a `dir` key is bound to another `enc`.                                                                                                                                                          |
| `decryption_failed` | none                                       |        | The content key could not be recovered, or the tag does not verify. These are one code on purpose: [Encrypting tokens](encrypting.md#what-a-forged-token-learns) explains.                                                                            |
| `malformed`         | `["plaintext"]`                            |        | From `decodeJsonObject` and a nested verifier: the plaintext is not UTF-8, or not a JSON object.                                                                                                                                                      |
| `wrong_type`        | `["header", "cty"]`                        |        | From a nested verifier: the JWE's `cty` is present and is not `JWT`.                                                                                                                                                                                  |

### Key import

| Code                     | Path                                | Params                                 | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_key`            | a JWK member, or none               | `{ reason }` for some PEM strings      | The JWK is not an object, a member has the wrong type or encoding, an RSA key's `d` or `qi` disagrees with its other members, Web Crypto rejected the material, or a PEM string is not one well-formed block of a key for the import's role. `reason` is `encrypted` for an encrypted PEM key, and `unsupported_format` for a PEM label or form this package does not read, such as `OPENSSH PRIVATE KEY` or an `EC PRIVATE KEY` without its curve. At `["kid"]`, the JWK's `kid` differs from the `kid` option. |
| `unsupported_key`        | a JWK member                        | `{ maximum: 8192 }` for an RSA modulus | The key type or curve, of a JWK or of a PEM key, does not fit the algorithm, the RSA modulus is too long, or the key is multi-prime RSA.                                                                                                                                                                                                                                                                                                                                                                         |
| `weak_key`               | a JWK member, or none               | `{ minimum }`                          | An RSA modulus under 2048 bits, or a secret shorter than its hash: 32, 48 or 64 bytes.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `unexpected_private_key` | a JWK member, or none               |                                        | A public import holds a private member, or is a PEM private key: `PRIVATE KEY`, `RSA PRIVATE KEY`, `EC PRIVATE KEY` or `ENCRYPTED PRIVATE KEY` (no path).                                                                                                                                                                                                                                                                                                                                                        |
| `wrong_use`              | `["use"]` or `["key_ops"]`, or none |                                        | `use` is not `sig` (`enc` for a JWE key), or `key_ops` does not allow the operation the key is imported for or allows one of another purpose, any but `sign` and `verify` for a signing key; without a path, a public `CryptoKey` lacks the `verify` usage.                                                                                                                                                                                                                                                      |
| `alg_mismatch`           | `["alg"]`, or none                  |                                        | The JWK's `alg` names another algorithm than the one you asked for; without a path, a `CryptoKey` was made for another Web Crypto algorithm or hash, such as `RSA-OAEP` or `ECDH`.                                                                                                                                                                                                                                                                                                                               |
| `malformed`              | none, or `["keys"]`                 |                                        | From `importKeySet`: the JWKS is not an object (no path), or its `keys` is not an array (`["keys"]`).                                                                                                                                                                                                                                                                                                                                                                                                            |
| `too_large`              | none                                | `{ limit: "keys", maximum: 100 }`      | From `importKeySet`: the JWKS lists more than 100 keys.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

`importKeySet` and `createRemoteKeySet` skip JWKs that fail these checks instead of reporting them. [Keys](keys.md#importing-a-public-key) describes each check.

## What throws instead

A `TypeError` means a mistake in the calling code, not in the input, and is thrown as early as possible:

- **Options.** Every option of `createVerifier`, `createDpopVerifier`, `createDecrypter`, `createNestedVerifier`, `createRemoteKeySet`, `importKeySet`, `readHeader` and the key functions is checked when the function is called, and an invalid one throws, naming the option and its constraint. Every one of them, and the input of `sign`, `createDpopProof`, `encrypt` and `encryptJwt`, also throws for a name that is not one of its options, so a typo such as `audiance` cannot silently disable a check or fall back to a default. Create verifiers and key sets at startup and a misconfiguration fails the deploy, not the first request.
- **Key objects.** Passing an object this package did not create where a key is expected, a key of the wrong kind (such as a public key to `sign`, or a signing key to `encrypt`), or exporting a key created without `extractable: true`.
- **What you sign.** A payload or header `sign` cannot write exactly as JSON, one that breaks the rules in [Signing tokens](signing.md), or an `embedKey` that is not the public half of the signing key.
- **What you encrypt.** A plaintext that is neither bytes nor text, an `enc` a `dir` key is not bound to, or a header member [Encrypting tokens](encrypting.md#encrypting) refuses.
- **DPoP requests.** The request a DPoP verifier is called with: a member it does not know, an invalid method or URL, an empty `accessToken`, or `accessTokenClaims` that is not an object. The verifier's promise rejects; a proof never makes it reject.

A `TypeError` message names the option or member and the rule it broke, never its value.

Three things propagate rather than becoming a result: an exception thrown by your own `claims` schema, a `now` option that returns something other than a finite number, and a failure of Web Crypto itself while signing or generating a key, which means the runtime lacks the algorithm. A verifier's `now` makes its promise reject with a `TypeError`, for a token whose signature checked out. A remote key set's `now` makes its `select` reject with a `TypeError`; a verifier using that key set catches the rejection like any other key-set error and reports `key_fetch_failed` with `{ reason: "key_set_error" }`.
