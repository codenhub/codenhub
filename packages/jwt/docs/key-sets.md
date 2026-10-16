---
title: Key sets
description: How a verifier picks a key, local key sets, importing a JWKS document, fetching an issuer's JWKS with caching, cooldown and stale keys, and writing your own key set.
order: 4
---

# Key sets

A verifier does not take a key; it takes a **key set**, an object that picks the one key for each token. Issuers rotate keys: they publish a new key, sign new tokens with it, and keep the old one published until every token it signed has expired. A key set holds all of them and selects the right one by the token's header.

| Function             | Use it when                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `createKeySet`       | You hold the keys yourself: you issue the tokens, or you configured an issuer's keys by hand. |
| `importKeySet`       | You have a JWKS document in hand, such as one read from a file or a configuration service.    |
| `createRemoteKeySet` | An issuer publishes its keys at a URL, such as the `jwks_uri` of an OpenID Connect provider.  |

## How a key is selected

Every key set, the three above and your own if it uses the same rules, selects one key and never tries keys in turn. Trying each key until one verifies would let a token pass against a key it never named, and would multiply the cost of every forged token by the size of the set.

- **The header has a `kid`.** Only keys with that `kid` are candidates. None is `unknown_kid`. Among them, exactly one must have the header's `alg`: none is `alg_mismatch`, and several is `ambiguous_key`.
- **The header has no `kid`.** Exactly one key in the whole set must have the header's `alg`. None is `no_matching_key`, and several is `ambiguous_key`.

So a set may hold one key per algorithm without `kid`s, but once it holds two keys of one algorithm, tokens must name their key. A secret key only ever matches `HS256` tokens and a public key only its own algorithm, since both follow from the `alg` comparison.

## A local key set

```ts
import { createKeySet, createVerifier, type PublicKey } from "@codenhub/jwt";

declare const currentKey: PublicKey; // kid "2026-10"
declare const previousKey: PublicKey; // kid "2026-07"

const verify = createVerifier({
  keys: createKeySet([currentKey, previousKey]),
  issuer: "https://issuer.example",
});
```

`createKeySet` takes public and secret keys this package created, and copies the list, so changing your array later does not change the set. It throws a `TypeError` for an empty list, a private key, an object this package did not create, or two keys with the same `kid` and `alg`, including two keys without a `kid` and with the same `alg`, which selection could never tell apart.

## Importing a JWKS

A JWKS (JSON Web Key Set) is a JSON object whose `keys` member is an array of JWKs. `importKeySet` imports the public keys of one:

```ts
import { importKeySet } from "@codenhub/jwt";

const result = await importKeySet(JSON.parse(jwksText), { algorithms: ["RS256"] });
if (result.ok) {
  const keys = result.value;
}
```

A JWKS is untrusted input, so the import never throws for it. It fails only when the document is not a JWKS at all: `malformed` when it is not an object or its `keys` is not an array (path `["keys"]`), and `too_large` with `{ limit: "keys", maximum: 100 }` when it lists more than 100 keys.

Individual keys that cannot be used are skipped, not fatal, because an issuer's JWKS routinely holds keys meant for something else, such as encryption. Skipped are: `oct` keys (a JWKS is public, so a secret never comes from one), keys with `use` other than `sig`, keys with private members, weak, oversized or malformed keys, and keys whose `alg` is not in `algorithms`. A JWKS with no usable key gives an empty set, whose `select` always fails.

Each usable key becomes one key per algorithm it is bound to:

- A JWK with an `alg` member is bound to that algorithm, if `algorithms` allows it.
- A JWK without `alg` is bound to every allowed algorithm its `kty` and `crv` fit. An `RSA` key becomes an `RS256` key and a `PS256` key; an `OKP` `Ed25519` key becomes an `EdDSA` key and an `Ed25519` key. The token's `alg` then picks between them, which is safe because both are the same family of signature on the same key.

`algorithms` defaults to every asymmetric algorithm. Narrow it to what your issuer actually uses, so a key the issuer meant only for `RS256` is never used to check a `PS256` token.

Two usable keys with the same `kid` and `alg` do not fail the import; selecting them fails with `ambiguous_key` rather than picking one.

## A remote key set

`createRemoteKeySet` fetches an issuer's JWKS from a URL, imports it as `importKeySet` does, and caches it:

```ts
import { createRemoteKeySet, createVerifier } from "@codenhub/jwt";

const keys = createRemoteKeySet({
  url: "https://issuer.example/.well-known/jwks.json",
  algorithms: ["RS256"],
});

const verify = createVerifier({ keys, issuer: "https://issuer.example", audience: "api" });
```

Nothing is fetched until the first token needs a key. Create the key set once and share it between requests, so they share its cache.

### Options

Durations are in seconds. Every option is checked when the key set is created, and an invalid one throws a `TypeError`.

| Option             | Default                        | What it does                                                                                                                                          |
| ------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`              | required                       | An absolute `https:` URL, as a string or a `URL`. Other schemes, and URLs with a user name or password, throw.                                        |
| `fetch`            | `globalThis.fetch`             | The `fetch` to call, for runtimes or tests that supply their own. The global is looked up at each fetch.                                              |
| `algorithms`       | every asymmetric algorithm     | As for [`importKeySet`](#importing-a-jwks).                                                                                                           |
| `cacheTtl`         | `600`                          | How long a fetched JWKS is used before it is fetched again. An integer of at least 1.                                                                 |
| `cooldown`         | `30`, or `cacheTtl` if smaller | Least time between the starts of two fetches caused by a failure or an unknown `kid`. An integer from 0 through `cacheTtl`.                           |
| `maxStale`         | `3600`                         | How long after `cacheTtl` ran out the last JWKS is still used while fetching a new one fails. An integer of at least 0; 0 never uses an expired JWKS. |
| `timeout`          | `5`                            | How long one fetch, body included, may take. Greater than 0 and at most 60; fractions are allowed.                                                    |
| `maxResponseBytes` | `65536`                        | Largest response body accepted, in bytes. An integer from 1 through 1048576.                                                                          |
| `now`              | `Date.now`                     | The current time in milliseconds, for tests.                                                                                                          |

### Caching and rotation

- **Expiry.** A fetched JWKS is used for `cacheTtl` seconds, counted from when the fetch finished. The first token after that fetches it again.
- **One fetch at a time.** While a fetch is running, every token that needs keys waits for it, unless the cache is fresh and holds its key; concurrent requests never start a second fetch.
- **Unknown `kid`.** When an issuer rotates in a new key, the first token signed with it names a `kid` your cached JWKS does not hold. The key set then fetches the JWKS once more and selects again from the result. A header without a `kid` never causes a refetch.
- **Cooldown.** A refetch for an unknown `kid`, and a retry after a failed fetch, only starts once `cooldown` seconds have passed since the last fetch started. Inside that window an unknown `kid` fails with `unknown_kid` at once. Anyone can send you tokens with invented `kid`s; with the cooldown, a flood of them costs the issuer at most one request per window, however many tokens arrive.
- **Stale keys.** When a fetch fails after `cacheTtl` ran out, the last JWKS that was fetched is still used for up to `maxStale` more seconds, so a short outage at the issuer does not take your service down with it. Using it does not extend it: each token after the cooldown tries to fetch again, and past `maxStale` the key set fails with `key_fetch_failed`. Lower `maxStale` if a revoked key must stop working sooner, at the cost of failing sooner when the issuer is unreachable.

### When fetching fails

A fetch is a `GET` with `accept: application/json`. It does not follow redirects and accepts only status 200. The body is read up to `maxResponseBytes` and abandoned as soon as it grows past that, and the whole fetch, body included, is abandoned after `timeout`. The body must be a strict JSON object, parsed with the same rules as a token's header, and then a JWKS.

A failure the stale keys cannot cover is `key_fetch_failed`, whose `params.reason` says what happened:

| `reason`           | Cause                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `timeout`          | The fetch took longer than `timeout`.                                                       |
| `network`          | `fetch` rejected, for example because the host could not be reached.                        |
| `status`           | The response status was not 200, redirects included. `params.status` holds the status code. |
| `too_large`        | The `Content-Length` header or the body exceeded `maxResponseBytes`.                        |
| `invalid_response` | The body was not a strict JSON object, was not a JWKS, or listed more than 100 keys.        |

The issue holds nothing from the response. `select` never throws and never rejects, whatever the server sends.

## Your own key set

`KeySet` is an interface with one method, `select(header)`, which returns a promise of a result holding a key. You can implement it, for example to choose an issuer's key set by a prefix in the `kid`:

```ts
import { createRemoteKeySet, type KeySet } from "@codenhub/jwt";

const tenants = new Map<string, KeySet>([
  ["a", createRemoteKeySet({ url: "https://a.issuer.example/jwks.json" })],
  ["b", createRemoteKeySet({ url: "https://b.issuer.example/jwks.json" })],
]);

const keys: KeySet = {
  select: async (header) => {
    const tenant = tenants.get(header.kid?.split(":")[0] ?? "");
    return tenant === undefined ? { ok: false, error: { issues: [{ code: "unknown_kid", path: ["header", "kid"] }] } } : tenant.select(header);
  },
};
```

A verifier treats a custom key set as code that may be wrong. If `select` throws, rejects, or returns anything other than a result holding a public or secret key this package created, the verifier fails with `key_fetch_failed` and `{ reason: "key_set_error" }` instead of throwing or using what it returned. A failed result is passed through as returned, so keep its issues free of token values as this package's own are.
