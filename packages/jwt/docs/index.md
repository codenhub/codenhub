---
title: Overview
description: What JwtKit does, the ideas it is built on, a first signed and verified token, and where to go next.
---

# Sign and verify JSON Web Tokens

`@codenhub/jwt` (JwtKit) creates and checks JSON Web Tokens with the platform's Web Crypto API. It signs a set of claims into a token, verifies a token someone sent you, and manages the keys both of those need: generating them, importing them from JSON Web Keys (JWKs), exporting them, and picking the right one from a set, including a set an identity provider publishes at a URL.

It is written for the side of the exchange that receives tokens it did not make. A token arriving in an `Authorization` header is attacker-controlled text until a signature check says otherwise, so the package treats every token, every JWK and every key-set response as hostile input.

## A token in one paragraph

A JSON Web Token (JWT, RFC 7519) is three base64url-encoded parts joined by dots: `<header>.<payload>.<signature>`. The **header** is a JSON object saying how the token was signed, most importantly `alg`, the algorithm, and often `kid`, the identifier of the key. The **payload** is a JSON object of **claims**: statements such as who issued the token (`iss`), who it is about (`sub`), who it is for (`aud`) and when it expires (`exp`). The **signature** covers the first two parts, so a token whose header or payload was changed no longer verifies. This three-part form is the JWS compact serialization (RFC 7515); it is the only one this package reads and writes.

Base64url is an encoding, not encryption: anyone holding a token can read its payload. A signature proves who made the token and that it was not changed, nothing more.

## Installation

```sh
pnpm add @codenhub/jwt
```

The package is ESM only and has no runtime dependencies. Everything is imported by name from `@codenhub/jwt`; the only other export is `@codenhub/jwt/package.json`, for tools that read the version.

## Quick start

Generate a key pair, sign a token with the private key, and verify it with the public key:

```ts
import { createKeySet, createVerifier, generateKeyPair, sign } from "@codenhub/jwt";

const { privateKey, publicKey } = await generateKeyPair({ alg: "ES256", kid: "2026-10" });

const token = await sign({
  payload: {
    iss: "https://issuer.example",
    aud: "api",
    sub: "user-1",
    exp: Math.floor(Date.now() / 1000) + 300,
  },
  key: privateKey,
  header: { typ: "JWT" },
});

const verify = createVerifier({
  keys: createKeySet([publicKey]),
  issuer: "https://issuer.example",
  audience: "api",
});

const result = await verify(token);
```

Claims that hold a time, `exp`, `nbf` and `iat`, are seconds since the Unix epoch, as RFC 7519 defines them, which is why the example divides `Date.now()` by 1000. `sign` adds no claim of its own: the payload is signed exactly as given.

`createVerifier` is called once, when your module loads, and checks every option then; the function it returns is called once per token.

## Reading the result

Operations on input you do not control return a result instead of throwing. A result is one of two frozen plain objects, so you branch on `ok`:

```ts
const result = await verify(token);

if (result.ok) {
  const { header, payload, key } = result.value;
  console.log(payload.sub, header.kid, key.alg);
} else {
  for (const issue of result.error.issues) {
    console.log(issue.code, issue.path);
  }
}
```

`result.value.payload` is only ever a payload whose signature verified and whose claims passed every check you configured. `result.error.issues` is never empty. Each issue has a stable `code`, and where useful a `path` such as `["payload", "exp"]` and `params` such as `{ maximum: 8192 }`. An issue never holds a value taken from the token or key, so logging a failure cannot log a token. [Issues](errors.md) lists every code.

The shape is the same as `@codenhub/validation`'s result, so code that handles one handles the other.

The package throws a `TypeError` only for a mistake in your own code: an invalid option, a key object this package did not create, or a payload passed to `sign` that JSON cannot represent. Those throw as early as possible, when a verifier or key set is created rather than when a token arrives.

## Keys are bound to one algorithm

Every key this package creates is bound to exactly one algorithm at the moment it is generated or imported, and a token can only be verified with a key whose algorithm equals the token's `alg` header. The token never chooses how it is checked.

That closes the best-known class of JWT attacks. In the "`alg: none`" attack a forged token claims it needs no signature; here `none` is not a supported algorithm in any casing. In the algorithm-confusion attack a token signed with HMAC (`HS256`) using an RSA public key as the secret is verified by a library that let the header pick HMAC; here a public key is bound to `RS256` or another asymmetric algorithm and is never used as an HMAC secret, and HMAC secrets are a separate kind of key altogether.

| Algorithm | Signature                             | Key                         |
| --------- | ------------------------------------- | --------------------------- |
| `ES256`   | ECDSA on P-256 with SHA-256           | `EC` JWK, curve `P-256`     |
| `EdDSA`   | Ed25519                               | `OKP` JWK, curve `Ed25519`  |
| `Ed25519` | Ed25519                               | `OKP` JWK, curve `Ed25519`  |
| `RS256`   | RSASSA-PKCS1-v1_5 with SHA-256        | `RSA` JWK, 2048 to 8192 bit |
| `PS256`   | RSASSA-PSS with SHA-256, 32-byte salt | `RSA` JWK, 2048 to 8192 bit |
| `HS256`   | HMAC with SHA-256                     | secret of at least 32 bytes |

`EdDSA` and `Ed25519` produce identical signatures. RFC 9864 replaces the older, curve-agnostic `EdDSA` identifier with `Ed25519`, and issuers still use both, so both are supported, but a key is bound to one of them: a key bound to `Ed25519` does not verify a token whose header says `EdDSA`.

[Keys](keys.md) covers key kinds, importing, generating and exporting.

## What runs before your claims are read

A verifier runs its checks in a fixed order and stops at the first structural, key or signature failure:

1. The token is a string no longer than `maxLength` characters (8192 by default), checked before anything is decoded.
2. It has exactly three non-empty segments of strict base64url, and its header is a JSON object without repeated member names, with a supported `alg` and no `crit` member.
3. The key set selects one key for the header.
4. The key's algorithm equals the header's `alg`, and the signature verifies.
5. Only then is the payload decoded, and every configured claim check runs. Claim failures are reported together, not one at a time.

There is no function that decodes a payload without verifying it. When you need to look at a token before verifying it, for example to route it by `kid`, `readHeader` returns the header alone. [Verifying tokens](verifying.md) covers every check and option.

## Requirements

- Node.js 24 or newer, or another runtime with Web Crypto (`globalThis.crypto.subtle`), `TextEncoder`, `TextDecoder`, and, for remote key sets, `fetch`, `AbortController` and `setTimeout`. The package uses no Node.js API, so it also runs in browsers, Deno, Bun and Cloudflare Workers.
- `EdDSA` and `Ed25519` need Web Crypto's Ed25519 support, which Node.js 24, Chrome 137, Firefox 129 and Safari 17 have. The other algorithms work wherever Web Crypto does.
- ESM-aware package resolution. The package is ESM only and marked `sideEffects: false`.

## Next steps

- [Verifying tokens](verifying.md): every verifier option, the order checks run in, times and clock skew, audiences, `typ`, custom claim schemas, and `readHeader`.
- [Signing tokens](signing.md): what `sign` writes into the header, what payloads it accepts, and why it adds no claims.
- [Keys](keys.md): public, private and secret keys, importing JWKs and raw secrets, generating keys, and exporting them.
- [Key sets](key-sets.md): how a key is selected, local sets, importing a JWKS, and fetching an issuer's JWKS with caching, cooldown and stale keys.
- [Issues](errors.md): the result shape, every issue code and its `params`, and what throws instead.
