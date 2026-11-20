---
title: DPoP proofs
description: Creating RFC 9449 DPoP proofs on the client, verifying them on the server, nonces, replay checks, and binding an access token to the proof's key.
order: 6
---

# DPoP proofs

DPoP (RFC 9449) binds an access token to a key the client holds. With each request, the client sends a proof: a short-lived JWT signed with its private key, carrying the public key in a `jwk` header and naming the request it is for. A server accepts the request only when the proof verifies and its key is the one the access token is bound to, so a stolen access token is useless without the key.

`createDpopProof` signs proofs on the client, and `createDpopVerifier` checks them on the server.

## Creating proofs

Generate the client's key once and sign a new proof for every request:

```ts
import { createDpopProof, generateKeyPair } from "@codenhub/jwt";

const { privateKey } = await generateKeyPair({ alg: "ES256" });

// At the token endpoint: no access token yet.
const tokenProof = await createDpopProof({ key: privateKey, method: "POST", url: "https://issuer.example/token" });

// At a resource server: the proof carries the hash of the access token it comes with.
const proof = await createDpopProof({ key: privateKey, method: "GET", url: "https://api.example/orders", accessToken });
await fetch("https://api.example/orders", { headers: { authorization: `DPoP ${accessToken}`, dpop: proof } });
```

The proof's header is `alg`, from the key, `typ: "dpop+jwt"`, and `jwk`, the key's public half with only its material. The key's own `kid` is not written, since the `jwk` names the key. The payload is:

| Claim   | Value                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `jti`   | `jti`, or a random UUID by default.                                                                                                  |
| `htm`   | `method`, as given. Methods are case-sensitive, so send `GET`, not `get`.                                                            |
| `htu`   | `url`, a string or a `URL`, normalized and without its query and fragment: `https://API.example:443/a?x` is `https://api.example/a`. |
| `iat`   | The clock, `now` or `Date.now`, in whole seconds.                                                                                    |
| `ath`   | When `accessToken` is given, the base64url SHA-256 hash of it.                                                                       |
| `nonce` | When `nonce` is given: the value the server last sent in a `DPoP-Nonce` header.                                                      |

The key must be a private key of an asymmetric algorithm. A non-extractable key, kept in IndexedDB as [Keys](keys.md#importing-a-web-crypto-key) shows, and a key held by a KMS through `createExternalSigningKey` both work. A secret key throws: a proof anyone holding the secret could sign proves nothing.

## Verifying proofs

Create the verifier once, at startup, and call it with each request's `DPoP` header:

```ts
import { createDpopVerifier } from "@codenhub/jwt";

const verifyProof = createDpopVerifier({ algorithms: ["ES256", "EdDSA"] });

const result = await verifyProof(request.headers.get("dpop"), { method: request.method, url: request.url });
if (!result.ok) {
  return new Response(null, { status: 400, headers: { "www-authenticate": 'DPoP error="invalid_dpop_proof"' } });
}
const { payload, key, thumbprint } = result.value;
```

`thumbprint` is the RFC 7638 thumbprint of the proof's key. At the token endpoint, write it into the access token you issue as `cnf: { jkt: thumbprint }`; that binds the token to the key.

A proof goes through these checks in order, and the first failure among the first six is the result:

1. The length cap, `maxLength`, then the same strict parsing as any token's.
2. `typ` is exactly `dpop+jwt`, or `wrong_type`.
3. `alg` is one of `algorithms`, every asymmetric algorithm by default, or `unsupported_alg`. A symmetric algorithm is never accepted.
4. The `jwk` header is an object, or `malformed` at `["header", "jwk"]`.
5. It is a public JWK for that `alg`, imported with every check `importPublicKey` runs. A failure keeps its code with the path under `["header", "jwk"]`, such as `unexpected_private_key` at `["header", "jwk", "d"]` for a JWK with a private member.
6. The signature verifies with that key, or `bad_signature`.

Then the claims, with every failure reported together:

- `jti`, `htm`, `htu` and `iat` are present (`missing_claim`) and of their types (`invalid_claim`). `exp` is checked when present.
- `iat` is at most `maxAge` seconds old, 60 by default, plus `clockTolerance` (`too_old`), and at most `max(clockTolerance, 60)` seconds ahead (`issued_in_future`).
- `htm` equals the request's method exactly (`wrong_method`).
- `htu` equals the request's URL once both are normalized and stripped of their query and fragment (`wrong_url`). Normalizing lowercases the scheme and host, drops a default port and removes dot segments; it does not decode percent-encoding.
- When the request gives `accessToken`, `ath` is present (`missing_claim`) and is its hash (`wrong_access_token_hash`). Without one, `ath` is ignored.
- A static `nonce` option, and `accessTokenClaims`, below.

Last, only for a proof that passed everything else: a `nonce` function, then `acceptJti`.

A request URL behind a proxy is the URL the client used, not the one your server sees: rebuild it from your public origin when they differ.

### Binding the access token

At a resource server, pass the verified access token's claims as `accessTokenClaims`. The proof's key must then have the thumbprint the token's `cnf.jkt` carries, or the proof fails with `wrong_key` at `["header", "jwk"]`:

```ts
const token = await verifyAccessToken(accessToken);
if (!token.ok) return unauthorized();

const proof = await verifyProof(request.headers.get("dpop"), {
  method: request.method,
  url: request.url,
  accessToken,
  accessTokenClaims: token.value.payload,
});
```

Claims without a string `cnf.jkt` fail with `wrong_key` too, so a token that was never bound cannot pass as a DPoP one. A token introspection response (RFC 7662) carries `cnf.jkt` the same way and can be passed as it is.

### Nonces

A server that requires nonces (RFC 9449 §8) passes the ones it accepts as `nonce`: one value, a list, or a function that says whether a nonce is current, which may be async:

```ts
const verifyProof = createDpopVerifier({ nonce: (nonce) => nonces.isCurrent(nonce) });
```

A proof whose `nonce` is missing, not a string or not accepted fails with `wrong_nonce`, one code for all three, so the server answers it with a fresh nonce:

```ts
if (!result.ok && result.error.issues.some((issue) => issue.code === "wrong_nonce")) {
  return new Response(null, {
    status: 400, // 401 at a resource server
    headers: { "dpop-nonce": nonces.current(), "www-authenticate": 'DPoP error="use_dpop_nonce"' },
  });
}
```

Without the option, a proof's `nonce` is ignored.

### Replay

Each proof may be used once. `acceptJti` records a proof's `jti` and returns whether it was new: `false` fails the proof with `replayed`. It runs last, so a refused proof records nothing:

```ts
const verifyProof = createDpopVerifier({
  acceptJti: async (jti, { thumbprint, keepUntil }) => store.addIfAbsent(`${thumbprint}:${jti}`, keepUntil),
});
```

`keepUntil` is the last second the proof is accepted, `iat + maxAge + clockTolerance`: keep the `jti` until then, not `maxAge` after you first saw it, since a proof issued ahead of your clock is accepted that much longer. Scoping the `jti` by `thumbprint`, as above, keeps one client from blocking another's identifiers.

### Callback failures

A `nonce` function or `acceptJti` that throws, rejects or returns something other than a boolean fails the proof with `callback_failed`, with `{ option: "nonce" }` or `{ option: "acceptJti" }`. The error is kept out of the issue, which could quote anything, and goes to `onCallbackError` instead, as a key set's goes to `onKeySetError`:

```ts
const verifyProof = createDpopVerifier({ acceptJti, onCallbackError: (error) => log.error(error) });
```

Treat `callback_failed` as a server error, not the client's: answer 500 or 503.

## What throws

`createDpopProof` rejects with a `TypeError` for an input that is not one: a member that is not an option, a key that is not a private key of an asymmetric algorithm, a method that is not an HTTP method token, a URL that is not an absolute `http:` or `https:` URL, an empty `accessToken`, `nonce` or `jti`, or a clock that does not return milliseconds.

`createDpopVerifier` throws a `TypeError` for an invalid or unknown option. The verifier it returns resolves to a result for every proof, but rejects with a `TypeError` for a request that is not one, since the request comes from your code: a member that is not one of `method`, `url`, `accessToken` and `accessTokenClaims`, an invalid method or URL, an empty `accessToken`, or `accessTokenClaims` that is not an object. [Issues](errors.md) lists every code.
