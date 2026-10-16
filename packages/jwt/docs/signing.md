---
title: Signing tokens
description: What sign writes into the header, which payloads it accepts, and why it adds no claims of its own.
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

`sign` adds no claim. It does not set `iat`, `exp` or `jti`, and does not check that `exp` is in the future. Every claim the token should carry is one you write, which keeps what a token says visible at the call that signs it. Write times as whole seconds since the Unix epoch, `Math.floor(Date.now() / 1000)`, since that is what verifiers, this one included, read them as.

The payload must be a plain object whose values JSON represents exactly: strings, finite numbers, booleans, `null`, arrays and plain objects, nested at most 32 levels deep. `undefined`, functions, symbols, bigints, `NaN` and `Infinity`, `Date`s and other class instances, getters, sparse arrays and cycles all throw. `JSON.stringify` would drop or rewrite most of these silently, so the token would not say what your code meant.

The registered claims are checked for the types RFC 7519 gives them: `exp`, `nbf` and `iat` must be finite numbers, `iss`, `sub` and `jti` strings, and `aud` a string or an array of strings. A token this package signs therefore never fails a verifier's `invalid_claim` check.

## The header

The header's `alg` always comes from the key. You may repeat it in `header.alg`, but a different value throws: a key signs under its own algorithm only.

`kid` defaults to the key's `kid`. Set `header.kid` to write another one; the key's `kid` is only a default. `kid`, `typ` and `cty` must be strings.

Other header parameters are written as given, with the same JSON rules as the payload, except these, which throw:

| Parameter                  | Why it is refused                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crit`                     | It asks the verifier to understand an extension. This package implements none, and its own verifier rejects every token with `crit`.                       |
| `b64`                      | Unencoded payloads (RFC 7797) are not supported.                                                                                                           |
| `jwk`, `jku`, `x5u`, `x5c` | They tell the verifier where to find the key. A verifier that trusts them lets the token choose its own key, so this package neither emits nor reads them. |

The header is written in a fixed order: `alg`, then `kid`, `typ` and `cty` when present, then the other parameters in the order you gave them.

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
