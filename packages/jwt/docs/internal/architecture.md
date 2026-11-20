---
status: IMPLEMENTED
last_updated: 2026-11-18
scope: How `@codenhub/jwt` is built and why, for whoever changes it next.
---

# JwtKit architecture

This records how `@codenhub/jwt` keeps the invariants of [scope.md](scope.md) section 3, and the reasoning behind choices that are not obvious from the code. Public behavior is in the package docs; this is for changing the package without breaking what it relies on. Decisions are listed in [scope.md](scope.md) section 7, and what remains before 0.1 in [roadmap.md](roadmap.md).

## What the package defends against

In scope, and the package must get right:

- **Any string or value offered as a token**, any value offered as a JWK or JWKS, and any response from a JWKS URL. For these, bad input is a result and never an exception, and costs a bounded amount of work.
- **Algorithm substitution**: `alg: none`, RS/HS confusion, and any token that tries to choose how it is verified, including through `jwk`, `jku`, `x5u` or `x5c` headers.
- **Parser differentials**: input that one JSON or base64 parser reads differently from another, such as duplicate member names, padding, or non-canonical trailing bits, so that what was signed and what is read could differ.
- **Leaks through failures**: no issue, `TypeError` message or result holds a value of a token, claim, header, JWK or response.
- **Forced work against an issuer**: while the cache is usable, a stream of tokens with invented `kid`s costs the issuer at most one fetch per cooldown window. A fetch that misses its deadline or is cancelled with its request (decision 42) may be fetched again inside the window, but only when no usable cache can answer, so invented `kid`s alone never reach that path. `cooldown: 0` gives the bound up, never more than one fetch at a time.

Out of scope, and documented rather than defended:

- **Code inside the caller's own arguments.** Options, signing input and a custom `KeySet` are the caller's code. Their getters and exceptions propagate, except that a key set's failure is converted (see [Verification flow](#verification-flow)), and the issues of a failed result a custom key set returns are passed through unchanged, so a custom key set that echoes the token leaks it.
- **Policy above JWS.** Whether a multi-audience token is acceptable, `nonce`, `azp`, `at_hash`, token revocation: these belong to the protocol package on top.
- **Side channels in Web Crypto.** Signature verification is the platform's. The package makes no other secret-dependent comparison: `kid`, `alg`, `iss` and `aud` are public values, so plain equality is fine for them.

## Module layout

| Folder      | Owns                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| `core/`     | The public type contract (`types.ts`), limits, and the internal `ok`/`fail` helpers that deep-freeze results. |
| `encoding/` | Strict base64url, the strict JSON object parser, and UTF-8 helpers.                                           |
| `jws/`      | Compact parsing (`checkSegments`, `parseCompact`, `parsePayload`) and the public `readHeader`.                |
| `keys/`     | The algorithm table, the key registry, JWK and PEM checks, import, generation, export and thumbprints.        |
| `keysets/`  | Selection, local key sets, JWKS import, the remote key set, and the issuer's key ring.                        |
| `sign/`     | `sign`.                                                                                                       |
| `verify/`   | Option resolution, claim checks, and `createVerifier`.                                                        |
| `interop/`  | A local copy of the Standard Schema v1 types, so the package has no dependency for them.                      |

## Algorithm binding

Every algorithm is one row of `ALGORITHM_PARAMS` in `keys/algorithms.ts`: the JWK `kty` and `crv` it requires, the Web Crypto import parameters, and the sign/verify parameters. Import, generation, signing and verification all read the same row, so adding or changing an algorithm is one edit, and no path can disagree with another about what `ES256` means.

A key's `alg` is fixed when the key object is created and is the only algorithm it is used with:

- `sign` writes the key's `alg` into the header; a caller's `header.alg` may repeat it but never change it.
- Selection matches the header's `alg` against each key's `alg` exactly, and the verifier checks the selected key's `alg` against the header again, so a custom `KeySet` that returns a key of another algorithm still fails with `alg_mismatch`.
- Supported algorithms are compared case-sensitively against a fixed list (`JWS_ALGORITHMS`), so `none`, `NONE` and `es256` are `unsupported_alg` before any key is looked at.
- `EdDSA` and `Ed25519` share a row's parameters but are separate identifiers, and a key is bound to one, so a key never answers to two `alg` values (decision 2).

`PS256`, `PS384` and `PS512` use a salt of the hash length, 32, 48 or 64 bytes, as RFC 7518 §3.5 requires. ECDSA signatures are the fixed-length `r ‖ s` form that JWS and Web Crypto both use, 64, 96 or 132 bytes for P-256, P-384 and P-521, so no DER conversion is needed.

## Key objects and the registry

A key object is a frozen plain object with exactly the public fields of `PublicKey`, `PrivateKey` or `SecretKey`. The `CryptoKey` and the expected signature length live in a module-level `WeakMap` keyed by that object (`keys/registry.ts`).

- **No material in reach.** The object has no property that holds or leads to key material, so `JSON.stringify`, `structuredClone`, logging and spreading a key reveal nothing.
- **No forgery.** Every function that takes a key looks it up in the registry and throws `TypeError` for anything else, so a look-alike `{ kind: "public", alg: "HS256" }` cannot smuggle an algorithm or a kind past the checks. A key's `kind` is checked separately where it matters (`sign` refuses a public key, `createKeySet` a private key, the export functions the wrong kind).
- **Garbage collection.** A `WeakMap` drops the entry when the key object is unreachable.

Rejected: a class with private fields. It gives the same protection, but its instances are not plain data, do not serialize as their public fields, and make the public types nominal for no gain. Also rejected: exposing `CryptoKey`, which would let a caller use the key with another algorithm through Web Crypto directly, and would make it extractable on some runtimes.

The registry is per module instance. Two copies of the package in one program do not recognize each other's keys, and a key from the other copy throws the same `TypeError` as a look-alike. This is the price of unforgeable keys and is not worth working around.

A PEM key is read by importing its DER into Web Crypto as SPKI or PKCS#8, extractable, and exporting it as a JWK; the JWK then goes through the same checks as one given directly, so a PEM cannot reach a key the JWK path would refuse, such as a 1024-bit modulus (decision 31). Web Crypto's DER parser is the platform's, so the package carries no ASN.1 code of its own; the price is that PKCS#1 and SEC 1 blocks, which Web Crypto cannot read, are refused.

Imported public keys are created extractable, because `exportPublicJwk` must work for any public key and public material is not secret. Private and secret keys are extractable only with `extractable: true`, and their export functions check the key's own `extractable` field before asking Web Crypto.

The expected signature length (64 bytes for ES256 and Ed25519, 96 for ES384, 132 for ES512, the modulus length for RSA, the hash length for HMAC) is recorded at import or generation, from the material, so the verifier can reject a wrongly sized signature before calling Web Crypto.

## Strict parsing

### Base64url

`encoding/base64url.ts` is hand-written rather than built on `atob`, which accepts padding, whitespace and the `+`/`/` alphabet, and on `Buffer`, which is Node.js only and lenient. It accepts only `[A-Za-z0-9_-]`, no padding, a length whose remainder by 4 is not 1, and a last character whose unused low bits are zero. The last rule matters: without it, several different strings decode to the same bytes, so two different tokens would carry the same signature and the same claims, which breaks any cache or replay check that keys on the token text.

### JSON

`encoding/json.ts` is a hand-written, linear-time parser for one JSON object, used for headers, payloads and remote JWKS responses. It decodes UTF-8 with `TextDecoder("utf-8", { fatal: true, ignoreBOM: true })`, so invalid UTF-8 is `malformed` and a byte-order mark is a parse error rather than silently dropped. It then accepts exactly what `JSON.parse` accepts, and returns the same value, plus three rules:

- **The top level is an object.** Anything else is `malformed`.
- **Duplicate member names, at any depth, are `duplicate_key`.** `JSON.parse` keeps the last one, and other parsers keep the first, so a token with `{"sub":"user","sub":"admin"}` can mean different things to a gateway and a service behind it.
- **Nesting deeper than 32 levels is `too_large` with `{ limit: "depth", maximum: 32 }`.** The top-level object is level 1.

A `__proto__` member becomes an own data property, as `JSON.parse` makes it, and never sets the prototype. Numbers are converted as `Number` of the lexeme, so they match `JSON.parse` exactly. The result is deep-frozen.

Rejected: `JSON.parse` with a reviver. A reviver sees the object after duplicates are already collapsed, so it cannot detect them, and `JSON.parse` has no depth limit short of the engine's stack.

### Headers

`jws/compact.ts` checks, in order: the value is a string; its length is at most `maxLength`, before anything else; exactly three segments, each non-empty and canonical base64url; a header that parses under the rules above; a supported `alg`; no `crit`; no `b64`; and text `kid`, `typ` and `cty`. Members are read with `Object.hasOwn`, so a header can never pick up a value from `Object.prototype`. The payload segment's characters are checked here, but it is not decoded until the signature verifies.

`readHeader` runs exactly this function, so it can never accept a token a verifier would reject before key selection.

## Verification flow

`createVerifier` resolves and freezes its options once (`verify/options.ts`), throwing `TypeError` for any invalid one, and returns a closure. For each token:

1. `parseCompact`: the length cap, structure and header, as above. Cheapest checks first, so a hostile token costs a comparison of its length before anything is allocated.
2. `keys.select(header)`, wrapped: a key set that throws, rejects, or returns anything other than a well-formed result with a registered public or secret key yields `key_fetch_failed` with `{ reason: "key_set_error" }` (decision 16). A failed result is passed through, and its issue list is re-frozen.
3. The selected key's `alg` must equal the header's (`alg_mismatch`). This repeats what the built-in key sets already guarantee, because a custom one may not.
4. The signature's length must equal the key's expected length (`bad_signature`), which spares Web Crypto inputs it would reject anyway and differs across runtimes in how it rejects them.
5. `crypto.subtle.verify`. `false` is `bad_signature`.
6. `parsePayload`: only now is the payload decoded and parsed (invariant 3).
7. `checkClaims`: registered claim types, then `exp`, `nbf`, `iat`, `maxAge`, issuer, audience, `typ`, required claims. Every failure is collected, so a caller sees all of them at once. A claim of the wrong type is reported once as `invalid_claim` and skipped by the later checks, which would otherwise report it again under another code.
8. The Standard Schema, only when every check above passed, so the schema never runs on a payload with an expired or foreign token. Its issues keep only their paths (decision 11).

Steps 1 to 6 stop at the first failure because each depends on the one before: there is no key to report on without a header, and no claim to report on without a verified signature.

Time is `now() / 1000`, fractional seconds, compared with the numeric date claims without rounding, so a test clock set to the millisecond behaves exactly as written. `exp` fails when now is greater than or equal to `exp` plus the tolerance, per RFC 7519 §4.1.4 ("on or after"). `nbf` and `iat` are compared with a tolerance of at least 60 seconds, whatever `clockTolerance` says, because they come from the issuer's clock and a verifier slightly behind it would otherwise refuse tokens the moment they are issued (decision 26).

`typ` is normalized for comparison per RFC 7515 §4.1.9: lowercased, with a leading `application/` removed, on both the option (once, at creation) and the header.

The verified result is `ok({ header, payload, key })`, deep-frozen; header and payload are already frozen by the parser.

## Embedded keys and thumbprints

A DPoP proof (RFC 9449) carries its public key in a `jwk` header. `sign` writes that member only from `embedKey`, a registered public key, never from `header`: it requires a private signing key of the same `alg`, writes the public members of the key's type in a fixed order, and verifies the signature it just made with `embedKey`, so a proof can never carry a key that does not verify it. A verifier from `createVerifier` still ignores `jwk`. `createDpopProof` signs through the same path, with `writeKeyKid` off so the proof carries no `kid`. `createDpopVerifier` is the one place a token's own key is trusted, and only for a proof (decision 62): it parses with `parseCompact`, refuses an `alg` outside its asymmetric allowlist before importing `header.jwk` for that `alg` with `importPublicKey`, verifies the signature itself, and then runs `checkClaims` with `maxAge` and `jti`, `htm` and `htu` required. The DPoP checks follow, collected with the claim issues; the caller's `nonce` function and `acceptJti` run only once the issues are empty, so a refused proof records nothing.

`jwkThumbprint` exports the key's JWK and hashes only the members RFC 7638 §3.2 requires, in lexicographic order. Those members are base64url strings and fixed names, so `JSON.stringify` already writes the canonical form.

## Key selection

`keysets/select.ts` is shared by every built-in key set:

- With a `kid`: candidates are the keys with that `kid`. Among them, exactly one must have the header's `alg`: none is `alg_mismatch`, several `ambiguous_key`.
- With a `kid` no key has: a key without a `kid` stands in (decision 35), as a PEM key has none. Exactly one key without a `kid` must have the header's `alg`: several is `ambiguous_key`, none `unknown_kid`. A `kid` that is not a string never gets a stand-in.
- Without a `kid`: exactly one key in the set must have the header's `alg`: none is `no_matching_key`, several `ambiguous_key`.

Keys are never tried in turn. Trial verification would accept a token under a key it did not name, would make the cost of a forged token grow with the size of the set, and would make the outcome depend on the order of the set.

`alg_mismatch` for a known `kid` is distinct from `unknown_kid` because only the latter can be fixed by refetching a JWKS. A remote key set refetches when `lacksKid` holds: the header names a `kid` that no key in the cache carries, whatever the selection gave, `unknown_kid`, a stand-in key, or `ambiguous_key` among several stand-ins. Refetching only on `unknown_kid` would let a stand-in answer a rotated-in `kid` with `bad_signature` until the cache expired.

Scope section 4 asked selection to filter by `use` and `key_ops` too. That filter runs once, at import: a JWK with `use` other than `sig` or `key_ops` without the needed operation is refused (`wrong_use`) or, in a JWKS, skipped, so every key that reaches a set is a signature key and selection needs no second filter.

`createKeySet` throws for two keys with the same `kid` and `alg`, since its keys are the caller's own and the duplicate is a configuration mistake. `importKeySet` keeps such duplicates and lets selection report `ambiguous_key`, since a JWKS is untrusted input and must not throw, and failing the whole import would let one bad entry disable every other key.

## JWKS import

`keysets/local.ts` reads a JWKS without running caller code: own data properties only, and a `Proxy` or getter that throws makes the JWKS `malformed`. More than 100 keys is `too_large`, checked before any key is imported, so an oversized JWKS cannot make import cost unbounded. Each entry is bound to its `alg` when it has one and the algorithm is allowed, or otherwise to every allowed algorithm its `kty`/`crv` fit, then imported with `importPublicKey`; failed imports are dropped (decision 12). `oct` entries are never bound, because `algorithms` only accepts asymmetric algorithms.

## Remote key set

`keysets/remote.ts` keeps its state in the closure of `createRemoteKeySet`; the returned object is frozen and holds only `select`:

| State                | Meaning                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cached`             | The last keys fetched successfully, or imported from the seed: the keys, `fetchedAt` (from `now()` when the fetch completed) and `ttlMs`.         |
| `lastFailure`        | The failure of the last fetch, cleared by the next success.                                                                                       |
| `lastFetchStartedAt` | When the last fetch started, for the cooldown and for the fetch's deadline.                                                                       |
| `inFlight`           | The running fetch, shared by every caller that needs keys while it runs.                                                                          |
| `generation`         | Counts fetches started. A fetch that settles after a newer one replaced it changes no state; a failure it ends with still reaches `onFetchError`. |
| `seeding`            | The import of the seed, started by the first `select` and awaited by every one.                                                                   |
| `fetchState`         | Whether to pass `cache: "no-cache"`, cleared for the key set's life when the runtime refused it ([fetching](#fetching)).                          |

The terms the steps use:

- The cache is **fresh** while its age is under `ttlMs`, and **usable** while it is under `ttlMs` plus `maxStale`. The age is `now()` minus `fetchedAt`; an age down to minus a minute counts as 0, and a cache further in the future is neither.
- The **cooldown** runs while less than `cooldown` has passed since `lastFetchStartedAt`; a clock earlier than that start ends it.
- A fetch is **live** while it is in flight and its **deadline**, its start plus `timeout` plus a second, has not passed. It **counts as running** while it is live or the cooldown runs, so invented `kid`s cannot start fetches faster than one per cooldown even when fetches hang.

A `select` call:

1. Awaits the seed's import, once per key set.
2. If a fetch counts as running: when the cache is usable, selects from it and answers, unless the header lacks a `kid` the cache carries and the fetch is live; otherwise joins the fetch. If none runs and the cache is not fresh, outside the cooldown: a usable cache answers this call and a fetch starts in the background to replace it (decision 37); without one, the call joins a new fetch.
3. Takes the usable keys: the cache while it is usable, otherwise the last failure.
4. Selects. When the header lacks a `kid` the keys carry, as `lacksKid` decides, this call has not fetched, and the cooldown is not running with no live fetch to join, it joins a fetch once more and selects from its keys. If that fetch fails, a stand-in key the first selection found still answers; otherwise the failure does.

Joining a fetch (decision 42) starts one when none counts as running. Otherwise it waits for the running fetch until its deadline. A fetch that settles in time gives its result. One that misses the deadline, or rejects, as on Workers when the request that started it ended, is given up: inside the cooldown a usable cache answers instead, and otherwise the call starts a fetch of its own, once.

So each `select` starts at most two fetches, the second only after the first was given up, concurrent callers never start a second fetch while one is live, and fetches caused by failures or unknown `kid`s are at least `cooldown` apart. A header without `kid` never refetches: `no_matching_key` cannot be fixed by a rotation the issuer announces through `kid`s, and refetching on it would let any token without a `kid` force fetches.

The TTL counts from when a fetch completes. `ttlMs` is `cacheTtl`, shortened by the response's `Cache-Control` ([fetching](#fetching)); a seed gets `cacheTtl`, since a snapshot does not record the response's headers. Stale keys are served under the bound of decision 5 and are never re-dated: `fetchedAt` only moves on a successful fetch, so `maxStale` is a hard limit from the last success. A failed fetch, `no_usable_keys` included, leaves `cached` as it was. The default cooldown is `min(30, cacheTtl)`, since a cooldown longer than the TTL would keep an expired cache from refreshing.

The seed is read when the key set is created and imported at the first `select`. Anything but an object with a finite `fetchedAt` and a string `url` whose normalized `href` is the key set's own is no seed, and neither is a `jwks` that imports no usable key (decision 38): a seed comes from storage, which another key set or an older build may have written.

### Fetching

- **`GET` with `accept: application/json`, `redirect: "manual"`.** A redirect is a `status` failure: following one would let whoever controls the redirect target supply keys, and the URL is what the consumer configured. `credentials` is not passed: a public JWKS needs none, and Cloudflare Workers rejects some of its values.
- **`cache: "no-cache"`.** A browser's HTTP cache honours the issuer's `Cache-Control`, so without it a refetch for a rotated-in `kid` or after `cacheTtl` could be answered from the browser's copy, and the TTL, the refetch on an unknown `kid` and `maxStale` would no longer bound how old the keys are. A `Cache-Control: no-cache` request header would do the same but is not CORS-safelisted, so a cross-origin JWKS would need a preflight. Workers before compatibility date 2025-08-07 reject the member (see the trap in the package's `AGENTS.md`), so a rejection whose message names `cache` is tried once more without it, and `fetchState` then leaves `cache` out for the key set's life. A network failure also rejects with a `TypeError` but names no `cache`, so it is not retried and a failing issuer still costs one request per fetch.
- **HTTPS only, no credentials in the URL**, checked at creation. `http:` is accepted on a loopback host, `localhost`, `127.0.0.0/8` or `[::1]`, matched on the parsed URL's `hostname` so that spellings such as `127.1` normalize first (decision 29). A URL with a user name or password would put a secret where logs and error trackers print URLs.
- **`fetch` is looked up at each call** when not injected, so test stubs and polyfills installed after creation are used, and it is called through a local so a browser's `fetch` never runs with a foreign `this`.
- **Timeout** by racing the request against a timer that aborts the `AbortController`. The race, not the abort signal alone, bounds the time: a `fetch` or body stream that ignores the signal still cannot hold the caller past `timeout`.
- **Size cap.** A `Content-Length` over the cap fails before the body is read. The body is read from its stream, and the read stops and the stream is cancelled as soon as the total passes the cap, so a server that lies about or omits `Content-Length` still cannot make the package buffer more than the cap plus one chunk. A response without a body stream falls back to `arrayBuffer()` and is checked after.
- **Body.** One leading UTF-8 byte order mark is dropped, since some servers write one, and the rest is parsed as a strict JSON object, as a token's header is. Token parsing drops nothing: a token's segments are base64url, where a byte order mark is never legitimate. A JWKS that imports no key for `algorithms` is `no_usable_keys` rather than an empty cache, which would turn every token into `unknown_kid` until the next fetch.
- **`Cache-Control`.** `max-age` shortens the TTL, clamped to `cooldown` at least and `cacheTtl` at most, so an issuer that announces a short lifetime ahead of a rotation is fetched sooner, and neither a header nor its absence lifts the bound the consumer set. `no-store` and `no-cache` give the minimum. Directives are split on commas, names compared case-insensitively, and a `max-age` whose value is not all digits ignored; the first well-formed `max-age` wins, as RFC 9111 §4.2.1 allows. `s-maxage` is for shared caches and ignored.
- **Never throws.** Every failure, including an unexpected exception from a stub, becomes `key_fetch_failed` with a `reason`. Rejections that arrive after the outcome is decided are caught so they are not reported as unhandled.

## Limits

| Limit                         | Value                      | Configurable                       | Why this value                                                                                                                                                                                                                            |
| ----------------------------- | -------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token length                  | 8192 characters            | `maxLength`, 1 to 65536            | Large enough for ID tokens with many claims; the ceiling stops a typo from lifting the bound.                                                                                                                                             |
| JSON depth                    | 32                         | no                                 | JWT claims are shallow; 32 leaves room for nested custom claims. The parser keeps open containers on its own stack, so depth never threatens the call stack; the limit bounds what consumers walking the payload recursively must handle. |
| Keys in a JWKS                | 100                        | no                                 | Issuers publish a handful; each key costs an import.                                                                                                                                                                                      |
| RSA modulus                   | 2048 to 8192 bit           | no                                 | NIST minimum below; above, verification cost grows with no security need.                                                                                                                                                                 |
| HMAC secret                   | 32, 48 or 64 bytes minimum | no                                 | RFC 7518 §3.2 requires a key at least as long as the hash output of `HS256`, `HS384` or `HS512`.                                                                                                                                          |
| PEM text                      | 16384 characters           | no                                 | A PKCS#8 RSA-8192 key, the largest imported, is about 6.4 KB; the cap bounds the scan before any decoding.                                                                                                                                |
| Clock tolerance               | 0 s, at most 300 s         | `clockTolerance`                   | Decision 6. `nbf` and `iat` use at least 60 s (decision 26).                                                                                                                                                                              |
| Remote TTL / cooldown / stale | 600 s / 30 s / 3600 s      | `cacheTtl`, `cooldown`, `maxStale` | Typical issuer rotation windows; decision 5 for stale. A response's `max-age` shortens the TTL, never below `cooldown`.                                                                                                                   |
| Remote timeout                | 5 s, at most 60 s          | `timeout`                          | A JWKS is small; a slow issuer should fail a request, not hold it.                                                                                                                                                                        |
| Remote response               | 65536 bytes, at most 1 MiB | `maxResponseBytes`                 | A typical JWKS is a few kilobytes; the 1 MiB ceiling holds 100 RSA-8192 JWKs with room to spare.                                                                                                                                          |

## Error model

- **Untrusted input returns a result.** Tokens, JWKs, JWKS documents and responses, and headers given to `select`. The result type is package-local (`JwtResult`), shaped like `@codenhub/validation`'s, with no runtime dependency on either `@codenhub/error` or `@codenhub/validation` (decision 21).
- **Programmer error throws `TypeError`, as early as possible.** Options are checked when a verifier or key set is created, so a misconfiguration fails at startup, and every function refuses a member it does not know as an option (decisions 22 and 28). `sign`'s input is the caller's own data, so it throws too.
- **Issues carry no input.** `params` only ever hold values from the caller's configuration or the package's limits (`maximum`, `minimum`, `claim`, `maxAge`, `limit`, `reason`, `status`). `TypeError` messages name the option or member, never its value. Web Crypto's own error messages are never forwarded, since they can describe the rejected material.
- **Results are deep-frozen** by `ok` and `fail`, which walk with their own stack and do not run getters.

## Runtime constraints

The source uses only `globalThis.crypto.subtle`, `TextEncoder`, `TextDecoder`, `fetch`, `Response` bodies, `AbortController`, `setTimeout` and `URL` (invariant 10). In particular:

- **No `Buffer` and no `node:` imports**, so the package runs unchanged in browsers, Deno, Bun and workerd.
- **No `atob`/`btoa`**, because their leniency is exactly what the strict decoder exists to refuse.
- **No `credentials` in `fetch` options, and `cache` only while the runtime takes it**, for workerd (see [Fetching](#fetching)).

`tsconfig.src.json` sets `types: []`, so a Node.js global used in `src/` fails the type check.

## Why not `jose` at runtime

`panva/jose` is the reference implementation this package is checked against, and it is a devDependency for interop tests: tokens signed here verify with `jose`, and the reverse. It is never a runtime dependency (invariant 11), for the reasons in [scope.md](scope.md#why-build-it-instead-of-depending-on-an-existing-library): the SSO project must own its core, the needed scope is a small subset of JOSE, and the package follows this repository's result and issue conventions, which `jose`'s exceptions do not.
