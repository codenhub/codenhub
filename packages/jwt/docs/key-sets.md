---
title: Key sets
description: How a verifier picks a key, local key sets, importing a JWKS document, choosing a key set by issuer, fetching an issuer's JWKS with caching, cooldown and stale keys, and writing your own key set.
order: 4
---

# Key sets

A verifier does not take a key; it takes a **key set**, an object that picks the one key for each token. Issuers rotate keys: they publish a new key, sign new tokens with it, and keep the old one published until every token it signed has expired. A key set holds all of them and selects the right one by the token's header. Some rotations follow a calendar and some follow a leaked key at 3 a.m.; the key set treats both the same way.

| Function             | Use it when                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `createKeySet`       | You hold the keys yourself: you issue the tokens, or you configured an issuer's keys by hand. |
| `importKeySet`       | You have a JWKS document in hand, such as one read from a file or a configuration service.    |
| `createRemoteKeySet` | An issuer publishes its keys at a URL, such as the `jwks_uri` of an OpenID Connect provider.  |

## How a key is selected

Every key set, the three above and your own if it uses the same rules, selects one key and never tries keys in turn. Trying each key until one verifies would let a token pass against a key it never named, and would multiply the cost of every forged token by the size of the set.

- **The header has a `kid`.** Only keys with that `kid` are candidates. Among them, exactly one must have the header's `alg`: none is `alg_mismatch`, and several is `ambiguous_key`. When no key has that `kid`, a key with no `kid` at all stands in: exactly one such key must have the header's `alg`, several is `ambiguous_key`, and none is `unknown_kid`. That is how a single PEM key, which has no `kid`, verifies tokens from an issuer that names its key in every token. A remote set refetches its JWKS before letting a key without a `kid` stand in, as it does for an unknown `kid`, so a key rotated in under a new `kid` is found.
- **The header has no `kid`.** Exactly one key in the whole set must have the header's `alg`. None is `no_matching_key`, and several is `ambiguous_key`.

So a set may hold one key per algorithm without `kid`s, but once it holds two keys of one algorithm, tokens must name their key. A secret key only ever matches tokens of its own HMAC algorithm and a public key only its own algorithm, since both follow from the `alg` comparison.

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

The set lists its keys in `keys`, a frozen array in the order you gave them. An issuer that verifies its own tokens with the set can publish its JWKS from the same list, so the two never disagree:

```ts
import { createKeySet, exportPublicJwk, type PublicKey } from "@codenhub/jwt";

const keys = createKeySet([currentKey, previousKey]);

const jwks = {
  keys: await Promise.all(keys.keys.filter((key): key is PublicKey => key.kind === "public").map(async (key) => exportPublicJwk(key))),
};
// Serve JSON.stringify(jwks) at your jwks_uri.
```

The filter keeps secret keys out of the document, where `exportPublicJwk` would refuse them anyway. To also choose the key that signs, and when each key is published, use a key ring instead: [Key rotation](rotation.md).

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
- A JWK without `alg` is bound to every allowed algorithm its `kty` and `crv` fit. An `RSA` key becomes one key for each of `RS256`, `RS384`, `RS512`, `PS256`, `PS384` and `PS512`; an `EC` key one for the algorithm of its curve; an `OKP` `Ed25519` key an `EdDSA` key and an `Ed25519` key. The token's `alg` then picks between them, which is safe because both are the same family of signature on the same key.

`algorithms` defaults to every asymmetric algorithm, a list that may grow in a minor release. Narrow it to what your issuer actually uses, so a key the issuer meant only for `RS256` is never used to check a `PS256` token.

Two usable keys with the same `kid` and `alg` do not fail the import; selecting them fails with `ambiguous_key` rather than picking one.

The imported set's `keys` lists one key per JWK and algorithm it was bound to, in the JWKS's order, so an RSA JWK without `alg` appears six times.

## Keys of several issuers

A verifier's `issuer` option says which issuers it accepts, but not which issuer each key speaks for. When one verifier holds the keys of several issuers, such as one per tenant, any of those keys would verify a token claiming any accepted `iss`: tenant A's key, or anyone who holds it, could sign a token that says it comes from tenant B. Give each issuer's key set the `issuer` option, which `createKeySet`, `importKeySet` and `createRemoteKeySet` all take:

```ts
const tenantA = createRemoteKeySet({ url: "https://a.issuer.example/jwks.json", issuer: "https://a.issuer.example" });
```

Each key the set hands out is then bound to that issuer, and its `issuer` member says so. A verifier that selects a bound key requires the token's `iss` to equal it, whatever its own `issuer` option allows: a missing `iss` is `missing_claim` with `{ claim: "iss" }`, and a different one is `wrong_issuer`. The binding travels with the key, so it holds in a key set built from other key sets, as in [your own key set](#your-own-key-set).

`createKeySet` binds copies of the keys you give it and leaves the originals unbound; a copy works wherever the original does. A key already bound to the same issuer is kept as it is, and one bound to another issuer throws a `TypeError`, since a key cannot speak for two issuers.

### Choosing the key set by issuer

To reach those sets from one verifier, give `createVerifier` a function as `keys`. It is called with the issuer the token claims and the token's header, and returns that issuer's key set, or `undefined` for an issuer it does not know:

```ts
import { createRemoteKeySet, createVerifier, type KeySet } from "@codenhub/jwt";

const tenants = new Map<string, KeySet>(["https://a.issuer.example", "https://b.issuer.example"].map((issuer) => [issuer, createRemoteKeySet({ url: `${issuer}/jwks.json`, issuer })]));

const verify = createVerifier({ keys: (issuer) => tenants.get(issuer), audience: "https://api.example" });
```

The verifier reads `iss` from the payload before the signature is checked, only to route the token: a token without `iss` is `missing_claim` with `{ claim: "iss" }`, one whose `iss` is not a string is `invalid_claim`, and an `iss` the function returns `undefined` for is `wrong_issuer`. When the verifier also has an `issuer` option, an `iss` it does not list is `wrong_issuer` before the function is called. The function may be `async`. If it throws, rejects, or returns something other than a key set or a route, the token fails with `key_fetch_failed` and `{ reason: "key_set_error" }`, and `onKeySetError` gets the error.

When issuers' tokens name different audiences or `typ` values, as tenants with their own client IDs do, return a route instead of the key set: `{ keys, audience, type }`. A route's `audience` and `type` take the same values as the verifier options and replace them for that issuer's tokens; one it leaves out keeps the verifier's. An invalid route is `key_set_error`, like any other mistake in the function.

```ts
const verify = createVerifier({
  keys: (issuer) => {
    const tenant = tenantsByIssuer.get(issuer);
    return tenant && { keys: tenant.keySet, audience: tenant.clientId };
  },
});
```

The `iss` is chosen by whoever sent the token. Look it up among issuers you already hold, as the `Map` above does, and never build a JWKS URL or a database query from it without checking it against a list first: otherwise anyone can make your server fetch from an address they pick. Still give each set its `issuer`: the function picks the set by a claim the signature has not yet covered, and the binding is what then refuses a token whose key belongs to another issuer.

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

On Cloudflare Workers, also pass `waitUntil` from `cloudflare:workers`. A Worker cancels a request's unfinished I/O once the request has responded, and that includes a JWKS fetch the key set started in the background. With `waitUntil`, each fetch keeps running until it is done:

```ts
import { waitUntil } from "cloudflare:workers";

const keys = createRemoteKeySet({ url: "https://issuer.example/.well-known/jwks.json", waitUntil });
```

Without it, nothing breaks. The cache is just replaced later: background fetches die with their requests, so the expired JWKS keeps being used until `maxStale` runs out and a token waits for a fetch of its own.

### Options

Durations are in seconds. Every option is checked when the key set is created, and an invalid one throws a `TypeError`, as does a name that is not an option below (`createRemoteKeySet: options.cachettl is not an option.`).

| Option             | Default                        | What it does                                                                                                                                                                                                       |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `url`              | required                       | An absolute `https:` URL, as a string or a `URL`, or `http:` on `localhost`, `127.0.0.0/8` or `[::1]` for local development. Anything else, and URLs with a user name or password, throw.                          |
| `fetch`            | `globalThis.fetch`             | A `JwksFetch`, `(url: string, init: RequestInit) => Promise<Response>`, for runtimes or tests that supply their own. The global is looked up at each fetch.                                                        |
| `algorithms`       | every asymmetric algorithm     | As for [`importKeySet`](#importing-a-jwks).                                                                                                                                                                        |
| `issuer`           | none                           | The issuer whose JWKS this is. Each key is bound to it, so a token it verifies must carry that `iss`. See [keys of several issuers](#keys-of-several-issuers).                                                     |
| `cacheTtl`         | `600`                          | Most time a fetched JWKS is used before it is fetched again; a shorter `max-age` shortens it, to `cooldown` at least. An integer of at least 1.                                                                    |
| `cooldown`         | `30`, or `cacheTtl` if smaller | Least time between the starts of two fetches caused by a failure or an unknown `kid`. An integer from 0 through `cacheTtl`.                                                                                        |
| `maxStale`         | `3600`                         | How long after `cacheTtl` ran out the last JWKS is still used while a new one is fetched, or while fetching it fails. An integer of at least 0; 0 never uses an expired JWKS.                                      |
| `timeout`          | `5`                            | How long one fetch, body included, may take. Greater than 0 and at most 60; fractions are allowed.                                                                                                                 |
| `maxResponseBytes` | `65536`                        | Largest response body accepted, in bytes. An integer from 1 through 1048576.                                                                                                                                       |
| `now`              | `Date.now`                     | The current time in milliseconds, for tests.                                                                                                                                                                       |
| `seed`             | none                           | `{ url, jwks, fetchedAt }` as `onFetch` got it, used as if this key set had fetched it. `null` is none; one of another shape or `url`, or with no usable key, is ignored. See [persisting](#persisting-the-cache). |
| `onFetch`          | none                           | Called with `{ url, jwks, fetchedAt }` after each successful fetch.                                                                                                                                                |
| `onFetchError`     | none                           | Called with the `key_fetch_failed` issue after each failed fetch, including fetches no token waited for and fetches a newer one replaced.                                                                          |
| `waitUntil`        | none                           | Called with each fetch as it starts, to keep it running after the request that started it has responded. On Cloudflare Workers, pass `waitUntil` from `cloudflare:workers`.                                        |

### Caching and rotation

- **Expiry.** A fetched JWKS is used for `cacheTtl` seconds, counted from when the fetch finished. When the response's `Cache-Control` has a shorter `max-age`, it is used for that long instead, but never for less than `cooldown`, which is also what `no-store` and `no-cache` give it; `s-maxage` and a malformed `max-age` are ignored. So an issuer that announces a short lifetime before a rotation is fetched again sooner, and `cacheTtl` stays the upper bound. The first token after that is still verified with it, at once, and starts a fetch in the background that replaces it for later tokens. Past `maxStale`, tokens wait for the fetch instead.
- **One fetch at a time.** While a fetch is running, a token waits for it only when the cached JWKS cannot give its key; concurrent requests never start a second fetch. A token waits at most until a second past the fetch's `timeout`. If the fetch has not finished by then, or fails because the request that started it has ended, the token's request fetches again itself, unless the cooldown is running and the cached JWKS is still usable: then it selects from the cache. A fetch that has not settled a second past its `timeout`, and past the cooldown, no longer counts as running. Both happen on Cloudflare Workers when the request that started the fetch ended and took its I/O with it, unless `waitUntil` kept it alive.
- **Unknown `kid`.** When an issuer rotates in a new key, the first token signed with it names a `kid` your cached JWKS does not hold. The key set then fetches the JWKS once more and selects again from the result, also when a key without a `kid` could stand in for it; if that refetch fails, the stand-in still answers. A header without a `kid` never causes a refetch.
- **Cooldown.** A refetch for an unknown `kid`, and a retry after a failed fetch, only starts once `cooldown` seconds have passed since the last fetch started. Inside that window an unknown `kid` fails with `unknown_kid` at once. Anyone can send you tokens with invented `kid`s; with the cooldown, a flood of them costs the issuer at most one request per window, however many tokens arrive.
- **Stale keys.** When a fetch fails after `cacheTtl` ran out, the last JWKS that was fetched is still used for up to `maxStale` more seconds, so a short outage at the issuer does not take your service down with it. Using it does not extend it: each token after the cooldown tries to fetch again, and past `maxStale` the key set fails with `key_fetch_failed`. Lower `maxStale` if a revoked key must stop working sooner, at the cost of failing sooner when the issuer is unreachable.

### Persisting the cache

A process that lives for one request, such as a serverless function, starts with an empty cache and fetches the JWKS on its first token. To skip that, save what `onFetch` receives and pass it back as `seed`:

```ts
const saved = await store.get("jwks"); // the string stored last time, or null when there is none

const keys = createRemoteKeySet({
  url: "https://issuer.example/.well-known/jwks.json",
  seed: saved ? JSON.parse(saved) : null,
  onFetch: (snapshot) => store.put("jwks", JSON.stringify(snapshot)),
});
```

A seed is treated exactly like a JWKS this key set fetched at `fetchedAt`: fresh for `cacheTtl`, then stale for `maxStale`, then not used at all. `null` and `undefined` mean no seed. A seed that is not a snapshot, such as one an older build saved without `url`, is ignored, and so is one whose `jwks` imports no key this set can use: the key set fetches as it would without one. A seed whose `url` is not this key set's, compared as the URL parser normalizes both, is ignored too, so a staging key set's snapshot saved under the same store key never gets its keys bound to the production `issuer`. Give each key set its own store key anyway, or they keep overwriting each other's snapshot. `onFetch` and `onFetchError` may return a promise, which is handed to `waitUntil` so a save outlives the request on Workers; what they throw or reject with is ignored, so a broken store or logger never fails a token.

A seed or cache whose `fetchedAt` is up to a minute ahead of the clock, as after a small clock correction or from a host whose clock runs ahead, counts as just fetched. Further ahead, it is expired: a clock that jumps back that far could otherwise keep a removed key trusted past `cacheTtl` plus `maxStale`.

### When fetching fails

A fetch is a `GET` with `accept: application/json` and `cache: "no-cache"`, so a browser's HTTP cache revalidates the JWKS with the issuer rather than answering a refetch from its copy. A runtime that rejects the `cache` member, as Cloudflare Workers does before compatibility date 2025-08-07, is asked again without it, and the key set leaves it out from then on. A fetch does not follow redirects and accepts only status 200. The body is read up to `maxResponseBytes` and abandoned as soon as it grows past that, and the whole fetch, body included, is abandoned after `timeout`. The body must be a strict JSON object, parsed with the same rules as a token's header, after one leading UTF-8 byte order mark, which some servers write, is dropped; then a JWKS with at least one key the set can use. A failed fetch never replaces the keys the set already has.

A failure the stale keys cannot cover is `key_fetch_failed`, whose `params.reason` says what happened:

| `reason`           | Cause                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `timeout`          | The fetch took longer than `timeout`.                                                            |
| `network`          | `fetch` rejected, for example because the host could not be reached.                             |
| `status`           | The response status was not 200, redirects included. `params.status` holds the status code.      |
| `too_large`        | The `Content-Length` header or the body exceeded `maxResponseBytes`.                             |
| `invalid_response` | The body was not a strict JSON object, was not a JWKS, or listed more than 100 keys.             |
| `no_usable_keys`   | The JWKS held no key this set can use: none at all, none for `algorithms`, or none that imports. |

The issue holds nothing from the response. `select` never throws and never rejects, whatever the server sends. The one exception is a bug in your own `now` option: when it returns something other than a finite number, `select` rejects with a `TypeError`, because a `NaN` clock would keep the cache from ever expiring. A verifier that calls such a key set turns the rejection into `key_fetch_failed` with `{ reason: "key_set_error" }`, so it fails closed.

## Your own key set

`KeySet` is an interface with one method, `select(header)`, which returns a promise of a result holding a key. You can implement it, for example to choose an issuer's key set by a prefix in the `kid`, when the tokens name their tenant that way rather than by `iss` as [choosing the key set by issuer](#choosing-the-key-set-by-issuer) does:

```ts
import { createRemoteKeySet, type KeySet } from "@codenhub/jwt";

const tenants = new Map<string, KeySet>([
  ["a", createRemoteKeySet({ url: "https://a.issuer.example/jwks.json", issuer: "https://a.issuer.example" })],
  ["b", createRemoteKeySet({ url: "https://b.issuer.example/jwks.json", issuer: "https://b.issuer.example" })],
]);

const keys: KeySet = {
  select: async (header) => {
    const tenant = tenants.get(header.kid?.split(":")[0] ?? "");
    return tenant === undefined ? { ok: false, error: { issues: [{ code: "unknown_kid", path: ["header", "kid"] }] } } : tenant.select(header);
  },
};
```

Each tenant's set has its `issuer`, so tenant A's key verifies only tokens whose `iss` is tenant A's, whichever `kid` the token names. Without it, a token signed with tenant A's key and claiming tenant B's `iss` would pass, as the `kid` alone picks the key. A verifier's `issuer` option still says which issuers it accepts at all.

A verifier treats a custom key set as code that may be wrong. If `select` throws, rejects, or returns anything other than a result holding a public or secret key this package created, the verifier fails with `key_fetch_failed` and `{ reason: "key_set_error" }` instead of throwing or using what it returned. A failed result is passed through as returned, so keep its issues free of token values as this package's own are.

The issue never carries the error, which may hold anything. To log it, pass `onKeySetError` to `createVerifier`: it is called with what `select` or the `keys` function threw or rejected with, or with a `TypeError` naming what it returned instead. It is not called for a failure the key set returns itself, such as `unknown_kid`, and its own errors are ignored.

```ts
const verify = createVerifier({ keys: tenantKeys, onKeySetError: (error) => logger.error("key set failed", error) });
```

Keys are recognized only by the copy of `@codenhub/jwt` that created them. If your program loads two copies, `createKeySet` throws the `TypeError` meant for look-alikes ("… not a look-alike object") for a key from the other copy, and when a verifier's key set, one from the other copy or a custom one, selects such a key, the token fails with `key_fetch_failed` and `{ reason: "key_set_error" }`. Deduplicate the install so one copy is loaded, and if you publish a library built on this package, declare it as a `peerDependency`. [Keys](keys.md) explains why.
