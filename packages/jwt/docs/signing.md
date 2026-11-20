---
title: Signing tokens
description: What sign writes into the header, which payloads it accepts, and the claims it adds only when asked.
order: 2
---

# Signing tokens

`sign` turns a payload into a compact token with a private or secret key:

```ts
import { generateKeyPair, sign } from "@codenhub/jwt";

const { privateKey } = await generateKeyPair({ alg: "ES256", kid: "2026-10" });
const now = Math.floor(Date.now() / 1000);

const token = await sign({
  payload: { iss: "https://issuer.example", sub: "user-1", aud: "api", iat: now, exp: now + 300 },
  key: privateKey,
  header: { typ: "JWT" },
});
// "eyJhbGciOiJFUzI1NiIsImtpZCI6IjIwMjYtMTAiLCJ0eXAiOiJKV1QifQ.eyJpc3Mi…"
```

The payload, key and header are your own data, not input from outside, so a mistake in them is a bug: `sign` rejects its promise with a `TypeError` naming what is wrong, rather than returning a result.

## The payload is signed as given

`sign` adds no claim unless you ask for one with the options below, and does not check that `exp` is in the future. Write times as seconds since the Unix epoch, `Math.floor(Date.now() / 1000)`, since that is what verifiers, this one included, read them as. Write them as whole seconds: RFC 7519 allows fractions, but many verifiers parse numeric dates as integers and refuse or misread `1700000000.5`. An `exp`, `nbf` or `iat` past 253402300799, the last second of year 9999, throws: it is almost certainly `Date.now()` in milliseconds, which would sign a token that expires in some 55,000 years.

The payload must be a plain object whose values JSON represents exactly: strings, finite numbers, booleans, `null`, arrays and plain objects, nested at most 32 levels deep. `undefined`, functions, symbols, bigints, `NaN`, `Infinity` and `-0`, `Date`s and other class instances, getters, sparse arrays and cycles all throw. `JSON.stringify` would drop or rewrite most of these silently, so the token would not say what your code meant. A `Date` in `exp` is the classic: it would sign as a string, and every verifier would then refuse a token whose expiry is not a number. Objects and arrays from another realm, such as a `vm` context or an iframe, are plain too. `sign` reads each member once, through its property descriptor, and writes the token from the values it checked, so a `Proxy` cannot show the checks one value and the token another.

In TypeScript, the payload may have any object type, an `interface` included, as long as its registered claims have their RFC 7519 types and every member is a JSON value: a `Date` member or an `exp` typed as a string is a compile error, before it is a `TypeError`.

```ts
interface SessionClaims {
  sub: string;
  exp: number;
  roles: string[];
}

const claims: SessionClaims = { sub: "user-1", exp: Math.floor(Date.now() / 1000) + 300, roles: ["admin"] };
const token = await sign({ payload: claims, key: signingKey });
```

The registered claims are checked for the types RFC 7519 gives them: `exp`, `nbf` and `iat` must be finite numbers, `iss`, `sub` and `jti` strings, and `aud` a string or an array of strings. A token this package signs therefore never fails a verifier's `invalid_claim` check.

`sign` does not limit a token's length, but verifiers do: a token longer than the verifier's `maxLength`, 8192 characters by default, fails with `too_large`. A payload of a few kilobytes reaches that, so raise `maxLength` on the verifier, up to 65536, when your tokens are large.

## Claims sign can add

Four options write a claim for you, after the payload's own members:

| Option              | Writes                                          |
| ------------------- | ----------------------------------------------- |
| `issuedAt: true`    | `iat`, the current time                         |
| `notBefore: number` | `nbf`, that many seconds after the current time |
| `expiresIn: number` | `exp`, that many seconds after the current time |
| `jti: true`         | `jti`, a random UUID from `crypto.randomUUID()` |

```ts
const token = await sign({
  payload: { iss: "https://issuer.example", sub: "user-1", aud: "api" },
  key: privateKey,
  issuedAt: true,
  expiresIn: 300,
});
// payload: {"iss":"https://issuer.example","sub":"user-1","aud":"api","iat":1700000000,"exp":1700000300}
```

The times are whole seconds, the clock read once and rounded down, so `exp - iat` is exactly `expiresIn`. `notBefore` and `expiresIn` are seconds, never milliseconds, from 0 to 315360000, ten years; a larger one throws, since it is almost certainly a duration in milliseconds. That bound catches milliseconds only from four days up: `expiresIn: 300_000`, meant as five minutes, signs a token that lasts three and a half days, so write durations in seconds. Setting an option and the claim it writes in the payload too throws, rather than choosing one of them.

The clock is `Date.now` unless you pass `now`, a function that returns milliseconds since the Unix epoch, as a verifier's `now` does. It is called only when `issuedAt`, `notBefore` or `expiresIn` is given.

## The header

The header's `alg` always comes from the key. You may repeat it in `header.alg`, but a different value throws: a key signs under its own algorithm only.

`kid` defaults to the key's `kid`. Set `header.kid` to write another one; the key's `kid` is only a default. `kid`, `typ` and `cty` must be strings.

Other header parameters are written as given, with the same JSON rules as the payload, except these, which throw:

| Parameter                  | Why it is refused                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crit`                     | It asks the verifier to understand an extension. This package implements none, and its own verifier rejects every token with `crit`.                                                  |
| `b64`                      | Unencoded payloads (RFC 7797) are not supported.                                                                                                                                      |
| `jwk`, `jku`, `x5u`, `x5c` | They tell the verifier where to find the key. A verifier that trusts them lets the token choose its own key, so this package never reads them, and writes `jwk` only from `embedKey`. |

In TypeScript, `SignHeader` types these members as `never`, so writing one is a compile error too.

The header is written in a fixed order: `alg`, then `kid`, `typ` and `cty` when present, then `jwk` for an `embedKey`, then the other parameters in the order you gave them.

`sign`'s input takes only `payload`, `key`, `header`, `embedKey`, `issuedAt`, `notBefore`, `expiresIn`, `jti` and `now`; any other member throws (`sign: input.headers is not an option.`).

## Which key signs

`key` must be a `PrivateKey` or a `SecretKey` created by this package; [Keys](keys.md) shows how to generate or import one. A `PublicKey`, or a look-alike object with the same fields, throws.

To sign with a key you keep elsewhere, import it once at startup and reuse the key object:

```ts
import { importPrivateKey, sign } from "@codenhub/jwt";

const imported = await importPrivateKey(JSON.parse(process.env.SIGNING_JWK ?? "null"), { alg: "ES256" });
if (!imported.ok) {
  throw new Error(`SIGNING_JWK is not a usable ES256 private key: ${imported.error.issues[0].code}`);
}
const signingKey = imported.value;

export const issue = (sub: string) => sign({ payload: { sub, exp: Math.floor(Date.now() / 1000) + 300 }, key: signingKey });
```

A key held by a cloud KMS or an HSM signs through `createExternalSigningKey`; [Keys](keys.md#keys-held-by-a-kms-or-hsm) shows it.

## DPoP proofs

A DPoP proof (RFC 9449) is a token that carries the public key it was signed with, in a `jwk` header, so a server can bind an access token to the client's key. Sign one with `embedKey`, the public half of the signing key:

```ts
import { generateKeyPair, sign } from "@codenhub/jwt";

const { privateKey, publicKey } = await generateKeyPair({ alg: "ES256" });

const proof = await sign({
  payload: { jti: crypto.randomUUID(), htm: "POST", htu: "https://issuer.example/token", iat: Math.floor(Date.now() / 1000) },
  key: privateKey,
  header: { typ: "dpop+jwt" },
  embedKey: publicKey,
});
```

`embedKey` must be a public key this package created, bound to the same `alg` as `key`, and its pair: `sign` verifies the signature with it before returning, and throws otherwise. Only the key's material is written, never a private member, `alg`, `use` or `kid`.

A verifier never uses the key a token carries. On the server, trust the proof's key explicitly, for that one proof:

```ts
import { createKeySet, createVerifier, importPublicKey, jwkThumbprint, readHeader } from "@codenhub/jwt";

async function verifyProof(proof: string) {
  const header = readHeader(proof);
  if (!header.ok || header.value.alg !== "ES256") return undefined;
  const key = await importPublicKey(header.value.jwk, { alg: "ES256" });
  if (!key.ok) return undefined;
  const verified = await createVerifier({ keys: createKeySet([key.value]), type: "dpop+jwt", maxAge: 60 })(proof);
  return verified.ok ? { payload: verified.value.payload, jkt: await jwkThumbprint(key.value) } : undefined;
}
```

Limit `alg` to the algorithms you accept, as above. `jkt` is the value an access token's `cnf.jkt` must equal. Checking `htm`, `htu`, `ath`, `nonce` and that each `jti` is used once is the protocol's job, above this package. With `maxAge`, keep each `jti` until the proof's `iat + maxAge + clockTolerance` has passed, not `maxAge` after you first saw it: a proof whose `iat` is up to `max(clockTolerance, 60)` seconds ahead of your clock is accepted that much longer, as [Verifying tokens](verifying.md) describes.

A proof's `ath` is the whole SHA-256 hash of the access token, base64url-encoded, which `encodeBase64Url` gives:

```ts
import { encodeBase64Url } from "@codenhub/jwt";

const ath = encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken))));
```

## Token hashes in ID tokens

An OpenID Connect ID token issued with an access token carries `at_hash`, and one issued with an authorization code carries `c_hash`: the left half of the token's hash, with the hash the ID token's `alg` uses. `tokenHash` computes it for every algorithm this package signs with, `EdDSA` and `Ed25519` included, which use SHA-512:

```ts
import { sign, tokenHash } from "@codenhub/jwt";

const idToken = await sign({
  payload: { ...claims, at_hash: await tokenHash(accessToken, "ES256"), c_hash: await tokenHash(code, "ES256") },
  key: privateKey,
});
```

To check one, compute it from the token you received and the verified ID token's `alg`, and compare. `tokenHash` throws a `TypeError` for an `alg` this package does not support.
