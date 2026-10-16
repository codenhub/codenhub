---
status: APPROVED
last_updated: 2026-10-16
scope: What `@codenhub/jwt` 0.1 covers, the invariants it keeps, and the decisions taken while building it.
---

# `@codenhub/jwt`: package scope

> **How to read this document.** This started as the outcome of a brainstorming session, not a final spec. Section 3 lists the **invariants**: security and design commitments that hold unless there is a strong, explained reason to break them. Sections 1, 2, 4 and 6 are the agreed scope of 0.1. The API sketch in section 5 was a **proposal**; the shipped API answers it differently in places, as section 5 notes. Section 7 records the decisions taken while building the package: those the maintainer approved, and judgment calls that are not decisions until the maintainer confirms them. If you find a better API shape, better behavior, or a better-established practice, propose it and explain why, as `docs/guidelines/documentation.md` asks for reversing a decision. The goal is the best possible package, not faithfulness to this document.
>
> The package is published as `@codenhub/jwt` (decision 9). The display name is `JwtKit` (section 7).
>
> How the package is built, and why, is in [architecture.md](architecture.md). What remains before 0.1 is in [roadmap.md](roadmap.md).

---

## 1. Context

This package is the first building block of a larger effort:

1. **`@codenhub/jwt`** (this package): JWS/JWK primitives on Web Crypto.
2. **`@codenhub/oidc`**: OpenID Connect, both **client** (relying party) and **provider** (OpenID Provider), built on top of this package.
3. **An SSO application**: a self-hosted, 100% free and open-source identity provider with an admin dashboard (users, roles, registered apps). Its differentiator is that user data belongs to the user's account, not to individual apps.
4. Later, and only if needed: `xml`, `xmldsig`, and `saml`.

`oidc` will be designed against this package's public API, so it should be stable enough to build on by 0.1.

### Why build it instead of depending on an existing library

`panva/jose` is excellent: zero dependencies, runtime-agnostic, and well scrutinized. We are not building this because it's bad. We're building it because:

- The SSO project must not depend on a core it doesn't own. The project has to stay free and open indefinitely, and its consumers shouldn't inherit someone else's maintenance decisions.
- The required scope is much smaller than a full JOSE implementation (see section 2).
- It should follow codenhub's conventions and its "trust no input" posture, matching `@codenhub/validation` and `@codenhub/error`.

**Use `panva/jose` as a reference.** Reading how it handles edge cases is encouraged, and it is a good **devDependency** for interop tests. It must never become a runtime dependency.

---

## 2. Scope

### In scope (0.1)

- **JWS compact serialization**: sign and verify.
- **Algorithms**: `ES256`, `EdDSA` (Ed25519), `RS256`. `PS256` if it's nearly free.
- **JWK**: import and export, public and private, for the supported key types.
- **Key generation** for the supported algorithms.
- **Key sets**: a local key set, plus a remote JWKS key set (fetch, cache, rotation).
- **Claim validation**: `exp`, `nbf`, `iat`, `iss`, `aud`, `typ`, max age, required claims, and optional custom claim validation via Standard Schema.
- **Header-only inspection**, used to route by `kid`.

### Out of scope (0.1)

- **JWE** (encryption). It's rare in OIDC and only needed for encrypted ID tokens. Revisit later.
- JWS JSON serialization (general and flattened).
- Unencoded payloads (`b64: false`, RFC 7797).
- Algorithms beyond those listed above.
- Anything OIDC-specific, such as `nonce`, `at_hash`, `c_hash`, or `azp` semantics. These belong in `@codenhub/oidc`, though this package should make them easy to implement there.

### Open question (resolved)

**HMAC (`HS256`)?** OIDC's `client_secret_jwt` and HS-signed ID tokens use it, so `oidc` may need it eventually. If it's included, symmetric keys must be a distinct key type that can never be confused with an asymmetric public key. Decide whether it belongs in 0.1 or later.

Resolved: `HS256` is in 0.1, as the distinct `SecretKey` kind. See decision 1 in section 7. `PS256` is in 0.1 too, as a judgment call pending confirmation.

---

## 3. Invariants

These are the commitments that should hold.

1. **The algorithm comes from the key, never from the token.** A key is bound to exactly one algorithm when it's imported or generated. If the token header's `alg` doesn't match the key's algorithm, verification fails. This closes off `alg: none` and the RS/HS confusion attack class.
2. **`none` is never supported**, in any form.
3. **No unverified payload access.** There is no `decode()` that returns claims. The only unverified read is the header, for key selection.
4. **Untrusted input never throws.** Verification and import of untrusted data return results. Programmer errors, such as invalid options or signing with a verify-only key, throw `TypeError`, ideally when the verifier or key is created rather than when it's used. Exceptions from the caller's own code, such as a `claims` schema that throws or rejects, propagate rather than becoming results (decision 10).
5. **Bounded cost.** Token length is capped before any decoding happens. JSON depth and size are bounded. Remote JWKS responses are size-capped and time-bounded. Failing input must be cheap.
6. **Issues never contain input values.** No token content, claim values, or key material appears in issues, error messages, or logs. Issues can name _which_ check failed (`wrong_audience`); they don't echo what the token said.
7. **Strict parsing.**
   - Base64url only: no padding, no `+`/`/`, no non-canonical trailing bits.
   - Exactly three segments.
   - Header and payload must be JSON objects. **Duplicate keys must be rejected**, because `JSON.parse` silently keeps the last one.
   - Reject `crit` headers this package doesn't understand. In 0.1 that means any `crit`.
   - Numeric date claims must be finite numbers.
8. **Key hygiene.**
   - Enforce minimum RSA modulus length (2048).
   - Importing a key for verification must not quietly accept private parameters.
   - Validate the curve and key type against the declared algorithm.
   - Exporting private key material is a separate, explicitly named operation.
9. **Frozen results.** Returned headers, payloads, keys, and key sets are immutable.
10. **Runtime-agnostic.** Use only Web Crypto and standard globals. It must run on Node 24+, Cloudflare Workers, Deno, Bun, and modern browsers. `fetch` must be injectable wherever it's used.
11. **Zero runtime dependencies.**
12. **Codenhub conventions.** Result shape `{ ok: true, value } | { ok: false, error: { issues } }`, consistent with `@codenhub/validation`. ESM only, `sideEffects: false`, tree-shakable named exports. Follow the repository's docs, tooling, and contribution standards (`AGENTS.md`, `docs/`).

---

## 4. Behavior details worth getting right

- **Key selection.** If the header has a `kid`, select by `kid`. Without a `kid`:
  - If the key set holds one compatible key, use it.
  - Otherwise fail.

  Never try every key in turn. Selection should also filter by algorithm and `use`/`key_ops`.

- **Remote JWKS.**
  - HTTPS only.
  - Cache with a TTL.
  - On an unknown `kid`, refetch once, subject to a **cooldown**, so attackers can't force a fetch on every request.
  - Concurrent misses share a single in-flight request.
  - Response size cap and timeout.
  - Optionally serve stale keys while a refetch fails; decide on and document the policy.
- **Time.** Configurable clock tolerance with a sane default and an upper bound. An injectable clock, for tests.
- **`aud`.** Handle both string and array forms. Decide on and document the behavior for multi-audience tokens.
- **`typ`.** Allow requiring a specific `typ`, for example `at+jwt` from RFC 9068 versus `JWT`. This lets `oidc` prevent token-type confusion.
- **Comparisons.** Signature verification goes through Web Crypto. Any other secret-dependent comparison must be constant-time.

---

## 5. API sketch (a proposal, change freely)

> The shipped API is `src/index.ts`. It differs from this sketch where building it found a better shape: `importKey` became `importPublicKey`, `importPrivateKey` and `importSecretKey`, so the kind of key is in the function name and its return type rather than in a `use` option; `exportJwk` became `exportPublicJwk`, with `exportSecretJwk` beside `exportPrivateJwk`; `sign` takes one `{ payload, key, header }` object; and a verified result also carries the `key` that matched. The questions at the end of this section are answered in section 7: `sign` takes a single object, the verifier has one stage (decision 7), and `at_hash`/`c_hash` stay in `@codenhub/oidc` (pending item 4). The sketch is kept as the record of what was proposed.

```ts
// Keys: algorithm bound at import/generation
const key = await importKey(jwk, { alg: "ES256", use: "verify" }); // Result<Key>
const pair = await generateKeyPair({ alg: "EdDSA" }); // { privateKey, publicKey }
exportJwk(pair.publicKey); // public JWK
exportPrivateJwk(pair.privateKey); // explicit, separate

// Signing: the caller's own data, so bad input is a programmer error (throws)
const token = await sign({ kid: "2026-10", typ: "JWT" }, payload, pair.privateKey);

// Key sets
const local = createKeySet([keyA, keyB]);
const remote = createRemoteKeySet({
  url: "https://sso.example/jwks",
  cacheTtl: 600,
  cooldown: 30,
  fetch, // optional
});

// Verification: a configured verifier, called like a validator
const verify = createVerifier({
  keys: remote,
  issuer: "https://sso.example",
  audience: "app123",
  type: "JWT",
  clockTolerance: 30,
  maxAge: 3600,
  maxLength: 8_192,
  requiredClaims: ["sub"],
  claims: someStandardSchema, // optional
});

const result = await verify(token);
// ok    → { ok: true, value: { header, payload, key } }  (frozen)
// error → { ok: false, error: { issues: [{ code, ... }] } }

// Unverified header read, for kid routing only
readHeader(token); // Result<Header>
```

**Candidate issue codes:** `malformed`, `too_large`, `duplicate_key`, `unsupported_crit`, `unknown_kid`, `no_matching_key`, `alg_mismatch`, `bad_signature`, `expired`, `not_yet_valid`, `issued_in_future`, `too_old`, `wrong_issuer`, `wrong_audience`, `wrong_type`, `missing_claim`, `invalid_claims`, `key_fetch_failed`.

**Questions worth reconsidering:**

- Should `sign` take `(header, payload, key)`, or a single options object?
- Should verifier configuration be split into "signature" and "claims" stages, so `oidc` can compose its own claim checks?
- How should `oidc` derive `at_hash` and `c_hash`? Should this package expose a small hashing helper tied to the key's algorithm?

---

## 6. Testing and acceptance

- **Official vectors.** RFC 7515 appendices, RFC 7520 (JOSE Cookbook) for the supported algorithms, and RFC 8037 for EdDSA.
- **Interop.** Tokens signed here verify with `panva/jose`, and the reverse, as a devDependency-only test suite.
- **Hostile-input suite**, in the spirit of `@codenhub/validation`'s README. Each case asserts the exact result:
  - `alg: none`, including case variants.
  - `alg` swapped (RS256 ↔ HS256, ES256 ↔ RS256).
  - Duplicate JSON keys.
  - Non-canonical base64url.
  - Oversized tokens and deeply nested JSON.
  - Unknown `crit`.
  - Wrong `kid`.
  - Expired, not-yet-valid, and future-`iat` tokens.
  - Audience arrays.
  - A JWKS endpoint that is slow, huge, or flapping.
  - Kid-miss floods hitting the cooldown.
- **Leak checks.** Serialized failures never contain token or key contents.
- **Runtime matrix.** Tests run on Node and in a Workers-compatible environment (for example, workerd/Miniflare), plus a browser if the tooling allows.
- **Docs.** A README and `docs/` written to codenhub standards, including a short "what hostile input gets" section.

**0.1 is done when:**

- Everything in scope above works.
- Every invariant holds and has a test.
- The public types are stable enough for `@codenhub/oidc` to build against.

---

## 7. Decisions

### Approved by the maintainer (2026-10-16)

These were asked explicitly and approved. They bind work while they stand; reversing one follows "Recording decisions" in `docs/guidelines/documentation.md`.

1. **`HS256` is in 0.1, as a distinct `SecretKey` kind.** `@codenhub/oidc` needs it for `client_secret_jwt` and HS-signed ID tokens, and adding it after 0.1 would widen the key unions (`SigningKey`, `VerificationKey`) and the `KeySet` contract that `oidc` builds against, which is a breaking change for it. A secret key has its own `kind`, is never selected for an asymmetric `alg`, is never imported from a JWKS, and must be at least 32 bytes. Rejected: deferring it to a later minor, for the breaking change above.
2. **Both `EdDSA` and `Ed25519` are supported, and each key is bound to one of them.** RFC 9864 deprecates the curve-agnostic `EdDSA` identifier in favor of `Ed25519`, but deployed issuers still publish `EdDSA`. Binding each key to one identifier keeps invariant 1 literal: a key verifies under exactly one `alg`. A JWKS entry without `alg` is imported as two keys, one bound to each identifier, so each key still verifies under exactly one `alg` (pending item 2). Rejected: only `Ed25519`, which cannot verify tokens from those issuers; treating the two as aliases of one key, which makes a key answer to two `alg` values.
3. **Runtime matrix: Node.js, browsers (Playwright: Chromium, Firefox, WebKit), and workerd.** These are the runtimes invariant 10 names that differ in their Web Crypto and `fetch`. Deno and Bun are expected to work through the same standard globals but are not tested.
4. **Display name `JwtKit`.** `jwt` is an acronym, not a word that reads as a name, so the branding guideline's neutral, fused pattern applies with the `kit` descriptor. Recorded in `docs/guidelines/branding.md`.
5. **A remote key set serves stale keys for a bounded `maxStale` (default 3600 seconds) after its TTL while refetching fails.** Without it, a short outage at the issuer takes down every service that verifies its tokens, once their caches expire. The bound means a key the issuer has removed, possibly because it was compromised, stops being trusted at most `cacheTtl` plus `maxStale` after the last successful fetch, whether or not the issuer is reachable. Rejected: never serving stale keys, which turns an issuer outage into an outage of every consumer; serving them without a bound, which keeps a removed key trusted indefinitely while the issuer is unreachable.
6. **Default clock tolerance is 0 seconds, at most 300.** Skew is something a consumer opts into, so a default never silently extends a token's life. The cap keeps a misconfiguration from turning short-lived tokens into long-lived ones. Rejected: a default of 30 or 60 seconds, as several libraries use, which widens every token's validity for consumers that never asked for it.
7. **The verifier has a single stage.** `createVerifier(options)` checks structure, signature and claims in one call, and `@codenhub/oidc` adds its own per-request checks (`nonce`, `azp`, `at_hash`) on the frozen result. Rejected: separate signature and claims stages, which double the API surface and make it possible to run claim checks on a payload whose signature was never checked, against invariant 3.
8. **This document is kept as `docs/internal/scope.md`**, conformed to the internal documentation rules, with its decisions recorded here; the design and its rationale are in [architecture.md](architecture.md).
9. **The npm name is `@codenhub/jwt`.** The first publish fixes the name, and renaming later would cost every consumer a migration, so it is settled before 0.0.1 is published.
10. **A throwing or rejecting `claims` schema propagates**: the verifier's promise rejects. The schema is caller code, and a bug in it should surface rather than be hidden, as `@codenhub/validation` treats callbacks. Rejected: mapping the throw to an `invalid_claims` issue at `["payload"]`, which hides caller bugs as token failures; the cost of rejecting is that an HTTP handler that does not catch the rejection answers 500 instead of 401.

### Pending maintainer confirmation

These are judgment calls made while implementing, by the orchestrator or the implementing agent. They describe the code as it is, but they are **not decisions** until the maintainer confirms them, and may change without the evidence a reversal needs. When one is confirmed, move it to the list above with its reason; when one is rejected, change the code and the public docs in the same change.

1. **`claims` (Standard Schema) checks only.** The returned payload is the token's own frozen payload, typed by the schema's input type, and the schema's output is discarded. Schema messages are dropped from issues, since they may quote the input. Why: a transforming schema would return an unfrozen value the package did not parse, breaking invariant 9, and a message is the most likely place for an input value to leak.
2. **JWKS binding.** In `importKeySet` and `createRemoteKeySet`, a JWK without `alg` is bound to every allowed algorithm its `kty`/`crv` fit (an RSA key becomes `RS256` and `PS256`); `algorithms` defaults to every asymmetric algorithm; `oct` keys and `HS256` are never imported from a JWKS; unusable entries are skipped rather than failing the import; a JWKS may list at most 100 keys. Why: many issuers omit `alg` in their JWKS, and the token's `alg` still picks exactly one binding; skipping lets an issuer's JWKS hold encryption keys without breaking verification.
3. **`PS256` is included.** It costs one entry in the algorithm table on Web Crypto, and scope section 2 allowed it "if it's nearly free".
4. **An `at_hash`/`c_hash` helper is deferred to `@codenhub/oidc`.** The mapping from `alg` to hash and the left-half truncation are defined by OpenID Connect, not by JWS, and scope section 2 puts OIDC semantics out of scope.
5. **`importSecretKey` details.** The `kid` option applies to raw bytes only and is ignored for a JWK, whose own `kid` is used; an empty-string `kid` is accepted everywhere; a secret JWK's `key_ops` passes when it includes `sign` or `verify`.
6. **A custom `KeySet` that throws, rejects, or returns something that is not a result holding a package-created public or secret key** gives `key_fetch_failed` with `{ reason: "key_set_error" }`. Why: the verifier must not throw for a token, and must not verify with a key it cannot vouch for.
7. **Remote key set details.** The default `cooldown` is `min(30, cacheTtl)`; URLs with a user name or password are refused; the TTL counts from when a fetch completes; a `select` call starts at most one fetch; a header without `kid` never triggers a refetch.
8. **Header handling.** A `b64` header is `malformed` (RFC 7797 is out of scope, and ignoring `b64` without `crit` would verify a different payload than the signer meant); `jwk`, `jku`, `x5u` and `x5c` headers are ignored and never used for key selection, and `sign` refuses to emit them along with `crit` and `b64`.
9. **Units.** Durations in options are seconds, matching the claims they are compared with; `now` returns milliseconds, matching `Date.now`, so `now: Date.now` and test clocks need no wrapper.
10. **`sign` input.** `sign` takes one `{ payload, key, header }` object rather than positional arguments; it rejects `undefined` values and every other value JSON cannot carry exactly, and checks registered claim types. On verification, an ill-typed registered claim is one `invalid_claim` issue and the later checks of that claim are skipped.
11. **Result type.** A package-local `JwtResult` mirrors `@codenhub/validation`'s shape, with no runtime dependency on `@codenhub/error` or `@codenhub/validation`, per the error-propagation pattern in `docs/specs/errors.md` and invariant 11.
