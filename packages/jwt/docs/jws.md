---
title: JWS
description: Signing and verifying any payload as a JWS, in the compact or JSON serialization, with unencoded and detached payloads.
order: 8
---

# JWS

A JWT is one use of a JSON Web Signature (JWS, RFC 7515): a JSON payload, compact form, read as claims. `signJws`, `signGeneralJws` and `createJwsVerifier` handle the rest of RFC 7515: any payload, bytes or text, in the compact serialization or the JSON one, with payloads left unencoded (RFC 7797) or kept out of the JWS altogether (detached, RFC 7515 Appendix F).

Use them when the thing you sign is not a set of claims: a webhook body, a document, a request digest, a payload another protocol defines. A JWS has no claims, so the verifier checks no `exp`, `aud` or `iss`, and a key set's issuer binding does not apply. For tokens, use [`sign`](signing.md) and [`createVerifier`](verifying.md), which stay compact-only.

```ts
import { createJwsVerifier, createKeySet, generateKeyPair, signJws } from "@codenhub/jwt";

const { privateKey, publicKey } = await generateKeyPair({ alg: "EdDSA", kid: "2026-11" });

const jws = await signJws({ payload: new Uint8Array([1, 2, 3]), key: privateKey });
// "eyJhbGciOiJFZERTQSIsImtpZCI6IjIwMjYtMTEifQ.AQID.…"

const verify = createJwsVerifier({ keys: createKeySet([publicKey]) });
const result = await verify(jws);
if (result.ok) {
  result.value.payload; // Uint8Array [1, 2, 3]
}
```

The algorithm is still the key's: `alg` is written from the key when signing and must equal the selected key's when verifying, so the verifier has no `algorithms` option.

## Signing

`signJws` writes one signature. Its `payload` is a `Uint8Array`, from any realm, or a string, signed as its UTF-8 bytes; a string with a lone surrogate throws, since it has no UTF-8 form.

| Member              | Meaning                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `payload`           | The bytes or text to sign.                                                                                                                                                                                                                       |
| `key`               | A private or secret key. Its `alg` and `kid` go into the protected header, as `sign` writes them.                                                                                                                                                |
| `header`            | Extra protected header members, checked as `sign` checks its `header`. It may hold `crit`; it may not hold `b64`, `jwk`, `jku`, `x5u` or `x5c`.                                                                                                  |
| `unprotectedHeader` | Members the signature does not cover, JSON serialization only. It may not hold `alg`, `crit`, `b64`, `jwk`, `jku`, `x5u` or `x5c`, nor share a member with the protected header. A `kid` here keeps the key's `kid` out of the protected header. |
| `b64`               | `false` to sign the payload unencoded (RFC 7797). Defaults to `true`.                                                                                                                                                                            |
| `detached`          | `true` to leave the payload out of the JWS. Defaults to `false`.                                                                                                                                                                                 |
| `serialization`     | `"compact"`, the default, or `"flattened"` for the flattened JSON serialization.                                                                                                                                                                 |

`signGeneralJws` writes the general JSON serialization: one payload signed by 1 to 8 signers, each `{ key, header?, unprotectedHeader? }`, in the order given.

```ts
const jws = await signGeneralJws({
  payload: '{"amount":"10.00"}',
  signers: [{ key: ecPrivateKey }, { key: rsaPrivateKey, unprotectedHeader: { kid: "rsa-2026" } }],
});
// '{"payload":"eyJhbW91bnQiOiIxMC4wMCJ9","signatures":[{"protected":"…","signature":"…"},{…}]}'
```

Both return the JWS as a string, JSON text for the JSON serializations, and reject with a `TypeError` for a mistake in their input, as `sign` does.

## Unencoded and detached payloads

With `b64: false`, the payload is signed as its bytes instead of its base64url text, and the protected header says so with `"b64":false` and `"crit":["b64"]`, which `signJws` writes for you. RFC 7797 lists it in `crit` so a verifier that does not understand `b64` refuses the JWS instead of checking the wrong bytes.

An unencoded payload has to survive the serialization it is written in. In the compact form it must be printable ASCII without `.`, which would end the segment; in the JSON form it must be UTF-8 text. Anything else throws: detach it instead.

A detached payload is signed but not written: the compact form has an empty middle segment, `<header>..<signature>`, and the JSON forms have no `payload` member. The receiver gets the payload some other way, such as an HTTP body, and gives it to the verifier:

```ts
const jws = await signJws({ payload: body, key: privateKey, b64: false, detached: true });
// send `jws` in a header and `body` as the body; on the other side:
const result = await verify(jws, { payload: body });
```

## Verifying

`createJwsVerifier({ keys, crit?, maxLength?, onKeySetError? })` reads any of the three serializations: a string that starts with `{`, after JSON whitespace, is JSON, and anything else is compact. `keys` is a key set, as for `createVerifier`; a function that routes by issuer is not accepted, since a JWS has no `iss`. `maxLength`, 8192 characters by default and at most 65536, bounds the JWS, not a detached payload.

Each JWS goes through, in order:

1. The length cap, before any decoding, and the input's type and well-formedness.
2. Strict parsing of its structure and of every signature's headers. JSON that repeats a member name, at any depth, or nests deeper than 32 levels is refused, and a general JWS may hold at most 8 signatures. Members of the JWS object that RFC 7515 does not define are ignored.
3. The header rules below, for every signature. Any issue here fails the whole JWS, even when another signature is good.
4. The payload: one given to the verifier is used only when the JWS carries none.
5. Each signature in turn, until one verifies: its `alg`, its `crit` names, key selection from both of its headers, the key's algorithm, and the signature.
6. The payload's bytes, decoded only now.

The result is the frozen `{ payload, header, unprotectedHeader?, key, signatureIndex }`. `payload` is a `Uint8Array` of its own; decode text with `new TextDecoder("utf-8", { fatal: true })`. `header` is the protected header of the signature that verified, and `unprotectedHeader` its unprotected header, when it has one. Nothing in the unprotected header is signed: anyone who handles the JWS can change it, so never base a decision on it beyond choosing a key.

A general JWS verifies by its first signature that checks out, and `signatureIndex` says which. When none does, the failure lists every signature's issue, each under `["signatures", index]`:

```ts
{ ok: false, error: { issues: [
  { code: "unknown_kid", path: ["signatures", 0, "header", "kid"] },
  { code: "bad_signature", path: ["signatures", 1] },
] } }
```

### Header rules

- `alg`, `crit` and `b64` must be in the protected header, since they decide how the signature is checked.
- The protected and unprotected headers must not share a member (RFC 7515 §7.2.1).
- `crit` (RFC 7515 §4.1.11) is a non-empty list of distinct names, each present in the protected header, none of them a parameter RFC 7515 or RFC 7518 defines. A JWS whose `crit` names anything other than `b64` and the names in the verifier's `crit` option fails with `unsupported_crit`. List a name in `crit` only when your code processes that header member.
- `b64` is a boolean, listed in `crit`, and every signature of a general JWS agrees on it.
- `kid`, `typ` and `cty` are text.

A JWT verifies as a JWS too, its payload returned as bytes and none of its claims checked. The reverse is not true: `createVerifier` refuses `b64` and any `crit`, since RFC 7797 keeps unencoded payloads out of JWTs.

## Limits

| Limit                       | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| JWS length                  | `maxLength`, 8192 characters by default, 65536 at most |
| Signatures in a general JWS | 8, signing and verifying                               |
| JSON nesting                | 32 levels                                              |

[Issues](errors.md#jws) lists the codes a JWS verifier returns.
