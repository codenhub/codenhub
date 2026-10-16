---
status: APPROVED
last_updated: 2026-10-16
scope: What `@codenhub/oidc` 0.1 covers, the invariants it keeps, and the decisions taken while building it.
---

# `@codenhub/oidc`: package scope

> **How to read this document.** This started as the outcome of a brainstorming session, not a final spec. Section 4 lists the **invariants**: security and design commitments that hold unless there's a strong, explained reason to break them. Sections 1 to 3, 5 and 7 are the agreed scope of 0.1. The API sketch in section 6 was a **proposal**; the shipped API answers it differently in places, and section 8 records how. Section 8 also records the decisions taken while building the package, marked by who settled them. If you find a better API shape, better behavior, or a better-established practice, propose it and explain why, as `docs/guidelines/documentation.md` asks for reversing a decision. The goal is the best possible package, not faithfulness to this document.
>
> The display name is `OidcKit`. How the package is built, and why, is in [architecture.md](architecture.md). What remains before 0.1 is in [roadmap.md](roadmap.md).

---

## 1. Context

This is the second building block:

1. **`@codenhub/jwt`**: JWS/JWK primitives on Web Crypto. It's published as 0.0.1.
2. **`@codenhub/oidc`** (this package): OpenID Connect for **both sides**, the client (Relying Party) and the provider (OpenID Provider).
3. **The SSO application**: a self-hosted, 100% free and open-source identity provider with an admin dashboard for users, roles, and registered apps. Its differentiator is that user data belongs to the user's account, not to individual apps. This app is the first real consumer of the provider side.
4. Later, and only if needed: SAML.

The package covers both sides on purpose. It isn't "a package built for one project": it's a general OIDC toolkit. Apps integrating with the SSO get a client written by the same people who wrote the provider. Both sides also share a lot: metadata types, error codes, PKCE, and token validation rules.

### Relationship with `@codenhub/jwt`

- Use `@codenhub/jwt` for all JWS/JWK work. **Read its current public API and docs in `packages/jwt` first.** Don't rely on the sketch from its scope document, because some decisions changed before publishing.
- If `oidc` needs something `jwt` lacks, propose the change to `jwt` instead of working around it. A hashing helper for `at_hash` is one likely example, and a claim-check hook is another.
- Don't reimplement anything `jwt` already does.

---

## 2. Scope

### Shared (root export)

- Types for discovery metadata (OpenID Connect Discovery, RFC 8414), for authorization/token/error responses, and for standard claims.
- OAuth/OIDC error codes (RFC 6749 §4.1.2.1 and §5.2, OIDC Core §3.1.2.6) as typed values.
- PKCE (RFC 7636), `S256` only.
- `at_hash` computation, either here or in `jwt`.

### Client (`@codenhub/oidc/client`)

- **Discovery**: fetch and validate `/.well-known/openid-configuration`. The `issuer` must match exactly. Results are cached, and the client can also be configured without discovery.
- **Authorization request**: build the URL with `state`, `nonce`, and PKCE `S256`. Return a serializable "pending" object that the app stores. The client itself holds no state.
- **Callback**: check `state` and handle error responses. Validate the `iss` parameter (RFC 9207) when the provider advertises it. Exchange the code.
- **ID token validation**:
  - signature, through `jwt` and the provider's JWKS
  - `iss` and `aud`
  - `azp` when `aud` has multiple values
  - `exp` and `iat`
  - `nonce`
  - `auth_time` when `max_age` was requested
  - `at_hash` when present
- **Refresh** (`refresh_token` grant).
- **Userinfo**. The `sub` must equal the ID token's `sub`.
- **Client authentication**: `client_secret_basic`, `client_secret_post`, `private_key_jwt`, `client_secret_jwt` (HS256 is available in `jwt`), and `none` for public clients with PKCE.

### Provider (`@codenhub/oidc/provider`)

- **Endpoints**: discovery, JWKS, authorization, token, userinfo.
- **Authorization** is split into begin and complete steps, because login and consent UI belong to the app (see section 6).
- **Grants**: `authorization_code` and `refresh_token`.
- **Client authentication verification** for the same methods the client supports.
- **Request handling**:
  - `prompt`: `none` must return `login_required` / `consent_required`; `login` and `consent` must force those steps.
  - `max_age`, with `auth_time` in the ID token.
  - Scopes mapped to claims.
- **`iss` in the authorization response** (RFC 9207), advertised in discovery.
- **Refresh tokens** rotate on every use. Reuse detection revokes the whole token family.
- **Code replay** revokes every token issued from that code.
- **Store interface**: the adapters the app implements (section 5).
- **An in-memory reference store** under a testing subpath (for example `@codenhub/oidc/testing`). It's clearly marked as not for production, and it's used by tests and examples.

### Candidates (in if cheap and clean, otherwise later)

- Token revocation (RFC 7009). It's useful for logout and for the SSO dashboard.
- JWT access tokens (RFC 9068, `typ: at+jwt`) as an option alongside opaque tokens.

### Out of scope (0.1)

These are left out to keep the surface small, not because they're bad:

- **Never supported:** implicit and hybrid flows, the password grant (ROPC), and PKCE `plain`.
- **Out of scope for 0.1:**
  - Client credentials. It will probably matter later for the SSO's user-data API.
  - Device flow, CIBA, and PAR (RFC 9126). PAR is a strong later candidate.
  - DPoP and mTLS.
  - Dynamic client registration.
  - Request objects (JAR) and JWE-encrypted tokens.
  - Logout specs: RP-initiated, front-channel, back-channel, and session management. These are the next step after 0.1.
  - Token introspection.
  - Pairwise subject identifiers. They're interesting for the SSO's privacy story, so the design should leave room for them.

---

## 3. Design direction

- **Fetch API everywhere.** The provider takes a `Request` and returns a `Response`. The client uses an injectable `fetch`. This one choice makes it run unchanged on Workers, Node 24+, Deno, Bun, and inside any framework (Hono, plain Workers, Node adapters).
- **The package owns the protocol; the app owns everything else**: users, passwords, MFA, sessions and cookies, login and consent pages, persistence. The provider never renders HTML and never decides how a user authenticates.
- **Opinionated.** Secure choices are defaults or the only option, and rejected options are rejected loudly.
- **The client stays small.** Importing `oidc/client` must not pull in provider code.

---

## 4. Invariants

1. **PKCE `S256` is required for every client**, confidential ones included. A missing or `plain` challenge is rejected.
2. **`redirect_uri` matches exactly.** It's a byte-for-byte comparison against a registered value, with no normalization, wildcards, or prefix matching. Loopback redirects with variable ports (RFC 8252) are allowed only if explicitly enabled per client. That's an open question for 0.1.
3. **No open redirects.** The provider only redirects to a redirect URI it has verified for that client. The types make the difference between "send this error back to the client" and "render an error yourself" impossible to miss.
4. **Authorization codes:**
   - single-use
   - short-lived, with a bounded default (around 60s or less)
   - bound to the client, `redirect_uri`, PKCE challenge, `nonce`, scopes, and the authenticated session
   - consumed atomically
5. **Exact issuer matching** everywhere: discovery, ID tokens, and the RFC 9207 `iss` parameter.
6. **No token type confusion.** An ID token is never accepted as an access token or the reverse; use `typ`/`aud` distinctions through `jwt`. A refresh token is never accepted anywhere else.
7. **Client secrets.** The store interface must allow verifying a secret without the provider ever seeing it in plaintext, so storing hashes is possible and recommended. Secret comparisons are constant-time.
8. **Untrusted input never throws.** Requests, callbacks, discovery documents, token responses, and JWKS all produce results. Programmer errors (bad options, an invalid store) throw `TypeError`, ideally when the client or provider is created.
9. **Bounded cost.**
   - Cap request body sizes, parameter counts, and parameter lengths before parsing.
   - Reject duplicate parameters (OAuth forbids them).
   - Cap outbound fetches (discovery, JWKS, token, userinfo) for response size and time.
10. **Nothing secret leaks.** Codes, tokens, secrets, verifiers, and claim values never appear in issues, logs, or `error_description`. Error responses to clients are generic.
11. **HTTP hygiene.**
    - Token and userinfo responses carry `Cache-Control: no-store`.
    - The token endpoint accepts only `POST` with `application/x-www-form-urlencoded`.
    - The CORS policy is decided and documented. Public browser clients need it on the token endpoint; the authorization endpoint must never have it.
12. **Randomness** comes from `crypto.getRandomValues` only, with enough entropy (at least 128 bits) for `state`, `nonce`, codes, verifiers, and tokens.
13. **Codenhub conventions**, as in `jwt`:
    - result shape `{ ok: true, value } | { ok: false, error: { issues } }`
    - frozen results
    - ESM only, `sideEffects: false`, subpath exports
    - follow `AGENTS.md` and `docs/`
14. **Dependencies.** The only runtime dependency is `@codenhub/jwt`, plus another `@codenhub/*` package only when it's clearly justified. No third-party runtime dependencies. Runtime-agnostic, with an injectable `fetch` and clock.

---

## 5. The store interface

The store is where most real-world bugs live. Its contract should be precise and documented, including what each method must guarantee.

The provider needs, at minimum:

- **Clients**: look up by `client_id`. This returns registered redirect URIs, allowed scopes, the authentication method, and either a secret verifier or a JWKS.
- **Authorization codes**: `save` with a TTL, and `consume`. `consume` **must be atomic get-and-delete**. Document what that rules out: plain Cloudflare KV is not atomic, so it needs D1 or Durable Objects.
- **Refresh tokens**: `save`, `rotate` (atomic), `revokeFamily`.
- **Grants or sessions**, if needed, for code-replay revocation and refresh-family tracking.

Tokens and codes should be stored hashed, so a leaked database doesn't leak usable tokens. Decide whether the provider hashes before calling the store; it probably should.

The in-memory testing store must implement these guarantees faithfully. It's also the reference other adapters are tested against. Consider shipping a reusable **store conformance test suite**, so the SSO app's D1 or Postgres adapters can be checked against the same rules.

---

## 6. API sketch (a proposal, change freely)

```ts
// ── Client ─────────────────────────────────────────────
import { createClient } from "@codenhub/oidc/client";

const client = await createClient({
  issuer: "https://sso.example", // discovery runs here; issuer must match exactly
  clientId: "app123",
  auth: { method: "client_secret_basic", secret: "..." }, // or private_key_jwt, none, ...
  redirectUri: "https://app.example/callback",
  fetch, // optional
});

const { url, pending } = await client.authorize({ scope: ["openid", "email"] });
// pending: serializable { state, nonce, codeVerifier, ... }, stored by the app

const result = await client.callback(request, pending);
// ok    → { claims, tokens: { accessToken, refreshToken, idToken, expiresAt } }
// error → state_mismatch | provider_error | invalid_id_token | nonce_mismatch | ...

await client.refresh(refreshToken);
await client.userinfo(accessToken);

// ── Provider ───────────────────────────────────────────
import { createProvider } from "@codenhub/oidc/provider";

const provider = createProvider({
  issuer: "https://sso.example",
  keys, // @codenhub/jwt key set
  store,
  claims: (subject, scopes) => ({ email: "...", name: "..." }),
  ttl: { code: 60, accessToken: 600, idToken: 600, refreshToken: 2_592_000 },
});

// Discovery, JWKS, token, userinfo
const response = await provider.handle(request); // Response | null (not an OIDC route)

// Authorization: two steps, because the login UI belongs to the app
const begin = await provider.beginAuthorization(request);
if (begin.ok) {
  // begin.value.interaction: validated and serializable; the app stores it and renders login/consent
} else if (begin.error.redirect) {
  return begin.error.redirect; // safe: the error goes to the verified redirect_uri
} else {
  // unknown client / bad redirect_uri: must NOT redirect; the app renders its error page
}

return provider.completeAuthorization(interaction, {
  subject,
  authTime,
  amr: ["pwd"],
  grantedScopes,
});
```

### Open questions

- **The interaction handle.** If the app stores the interaction client-side, in a cookie or a hidden form, it must be tamper-proof. Should the package sign it with `jwt`, or always store it server-side through the store and return an opaque ID? The second is probably simpler and safer.
- **Consent persistence.** Does "remember consent" belong to the provider (through the store) or to the app?
- **Default access token format.** Opaque is simpler to revoke. A JWT (RFC 9068) lets resource servers verify offline. Pick one default and make the other an option.
- **Loopback redirects** for native and CLI apps: in 0.1, or later?
- **Customization hooks.** Custom scopes and claims, extra ID token claims, and per-client policy (allowed scopes, token TTLs). Design these so the SSO's user-data scopes fit later without breaking changes.
- **Error-to-response mapping.** How much of it the package does automatically, versus handing the app a typed error.

---

## 7. Testing and acceptance

- **Cross-implementation interop**, devDependencies only:
  - this client against panva's `oidc-provider`
  - this provider against panva's `openid-client`
  - this client against this provider, end to end
- **OpenID conformance suite.** Run the provider against the official Basic OP and Config OP test plans, and the client against the RP tests where practical. Required for 0.1. For 0.0.1, document how to run it and how far it gets.
- **Hostile-input suite**, in the style of `jwt` and `validation`. Each case asserts the exact result:
  - missing or `plain` PKCE
  - wrong `code_verifier`
  - code reuse, which must also revoke the tokens issued from that code
  - an expired code
  - a code used by a different client, or with a different `redirect_uri`
  - `redirect_uri` variants: trailing slash, case change, extra query parameter, fragment, encoded characters, different port, `http` instead of `https`
  - unknown `client_id`, which must not redirect
  - duplicate parameters
  - oversized bodies and parameters
  - wrong content type, or `GET` on the token endpoint
  - refresh token reuse, which must revoke the whole family
  - an ID token presented as an access token
  - a discovery document with a mismatched issuer
  - an ID token with a wrong `nonce`, `aud`, `azp`, or `iss`
  - an `iss` mismatch in the callback (mix-up attack)
  - a `state` mismatch
  - slow, huge, or malformed provider responses on the client side
- **Leak tests.** No token, code, secret, or verifier appears in issues, logs, or error responses.
- **Concurrency tests for the store contract.** Two simultaneous redemptions of one code means exactly one succeeds. The same holds for refresh token rotation.
- **Runtime matrix.** Node and workerd/Miniflare, as in `jwt`.
- **Docs.** README and `docs/` to codenhub standards, with a "what hostile input gets" section and a short guide for each side: integrating a client, and building a provider on top of the store interface.

**0.0.1 is done when:**

- The authorization code flow works end to end, this client against this provider, on Node and workerd.
- All invariants hold and have tests.
- The hostile-input and leak suites pass.

**0.1 is done when:**

- Everything in scope works.
- The provider passes the OpenID conformance Basic and Config OP plans.
- The client interoperates with `oidc-provider`.
- The public API is stable enough to build the SSO application on.

---

## 8. Decisions

Decisions bind work while they stand; reversing one follows "Recording decisions" in `docs/guidelines/documentation.md`.

### Approved by the maintainer (2026-10-16)

1. **The interaction handle is an opaque identifier, kept server-side through the store.** `beginAuthorization` saves the validated request with `saveInteraction` and returns a random 256-bit `id`; `completeAuthorization` consumes it atomically, so an interaction completes at most once. The store key is the identifier's SHA-256 digest, like every other secret value. Rejected: a signed JWT handle kept by the app in a cookie or form, which needs a signing key, can be replayed until it expires unless the app tracks it, and grows with the request.
2. **Access tokens are opaque in 0.0.1.** A random 256-bit value, stored hashed; revoking a token or a family is a store delete. RFC 9068 JWT access tokens are a later option (roadmap). Rejected for now: shipping `at+jwt` alongside, which adds surface and tests to 0.0.1 and gives tokens that cannot be revoked before they expire.
3. **Consent belongs to the app, and `redirect_uri` matching is exact only.** The app decides whether to show consent and passes the granted scopes to `completeAuthorization`; the store has no consent table. Loopback redirects with variable ports (RFC 8252 §7.3) are deferred. Rejected for now: a provider-side consent store, which adds a table and a policy the SSO app must own anyway.
4. **0.0.1 targets the "0.0.1 is done when" criteria of section 7.** Interop against panva's `oidc-provider` and `openid-client`, the OpenID conformance runs, and token revocation (RFC 7009) are on the [roadmap](roadmap.md).

### Taken while building, pending the maintainer's review

5. **The shipped API.** `discover(issuer)` returns the metadata as a result, and `createClient({ metadata, ... })` is synchronous and holds the metadata, so a discovery failure is a result rather than a rejected constructor (invariant 8) and an app caches discovery by keeping the client. `createProvider` returns `{ metadata, handle, beginAuthorization, completeAuthorization }`; `handle` returns `null` for any URL that is not discovery, JWKS, token or userinfo, including the authorization endpoint, which the app routes to `beginAuthorization` itself. Rejected: an async `createClient` that discovers, as in the sketch, which must either throw for untrusted input or return a result in place of a client.
6. **The root export is types only.** PKCE and `at_hash` live in internal shared modules both sides import; no consumer needs them once the client and the provider compute them. Exporting them later is additive.
7. **Every URL is `https`.** Issuer, endpoints and `jwks_uri` must be `https` URLs, on both sides, with no exception for `localhost`: `@codenhub/jwt` refuses a non-`https` JWKS URL, and the client verifies ID tokens through it. Redirect URIs may use any scheme but `javascript:`, `data:`, `vbscript:` and `file:`, so native apps can register custom schemes.
8. **The provider hashes before it calls the store.** Codes, tokens and interaction identifiers reach the store only as base64url SHA-256 digests (section 5).
9. **Client secrets are random and stored as a SHA-256 digest.** `generateClientSecret` makes a 256-bit secret and `hashClientSecret` its digest, which is what a client record holds; the provider compares digests in constant time. A fast hash is sound for a 256-bit random value, which cannot be guessed. Rejected: a password hash such as PBKDF2, which costs every token request a deliberate delay to protect secrets the package never lets a human choose. `client_secret_jwt` is the exception: an HMAC is checked with the secret itself, so a client using it has its secret in the record as an `HS256` `SecretKey`, and the documentation says so (invariant 7).
10. **Code replay and refresh reuse revoke one grant.** A code exchange starts a grant (`grantId`); every access and refresh token issued from that code, and from refreshes after it, belongs to it. A replayed code or a reused refresh token makes the provider call `revokeGrant`, and the store contract requires that tokens saved after the revocation by a request already in flight are revoked too. Consumption is atomic mark-as-used, not delete, so a replay can be recognized and the grant named.
11. **A refresh token family keeps the expiry of the code exchange.** Rotation issues a new token with the same `expiresAt`, so a family lives at most `ttl.refreshToken` (30 days by default) and the user signs in again after it. A refresh token is issued only when `offline_access` is granted.
12. **ID tokens carry only protocol claims; scope claims are released at the userinfo endpoint.** The code flow always yields an access token, and OpenID Connect Core §5.4 releases scope claims through userinfo in that case. ID tokens are signed with the first signing key and carry `typ: JWT`, `auth_time`, `nonce` when the request had one, `amr` and `acr` when the app gave them, and `at_hash`.
13. **CORS.** Discovery, JWKS, token and userinfo answer any origin (`Access-Control-Allow-Origin: *`) and their preflights; the authorization endpoint never has CORS headers. None of the cross-origin endpoints reads cookies or other ambient credentials, so a page on another origin can do nothing through them it could not do from a server.
14. **Error responses never carry `error_description`.** Token errors are `{ "error": code }`, userinfo errors a `WWW-Authenticate` challenge, authorization errors a redirect with `error`, `state` and `iss`.
15. **`private_key_jwt` and `client_secret_jwt` need `client_id` in the body.** The provider finds the client before it verifies the assertion and never decodes an unverified payload, which `@codenhub/jwt` deliberately does not offer. The assertion's `aud` may be the issuer or the token endpoint URL. Assertion `jti` replay within the assertion's lifetime is not tracked yet (roadmap).
16. **`completeAuthorization` throws `TypeError` when the app's outcome contradicts the request**: scopes that were not requested or no `openid`, an `authTime` before the interaction under `prompt=login`, or older than `max_age`. These are bugs in the app's login flow, and answering them with a code would silently log a user in without the step the client asked for.
17. **Store failures propagate.** A store that throws or rejects makes `handle`, `beginAuthorization` or `completeAuthorization` reject. Answering `invalid_grant` for a database outage would hide it and log users out. The `claims` callback is treated the same way.
18. **The client's clock tolerance defaults to 0 seconds**, following `@codenhub/jwt` decision 6; an app whose clock may drift from the provider's sets `clockTolerance`.
19. **`@codenhub/jwt` is a peer dependency.** Its keys are recognized only by the copy that created them, so the app and this package must share one copy. It is installed from its release through the catalog, as `docs/specs/packages-lifecycle.md` asks.
20. **A code or refresh token is consumed before anything else about the request is checked.** The store offers only atomic consumption, so a refresh request that asks for a scope outside the family's grant, or a token presented by another client, burns the token: the first answers `invalid_scope`, and the legitimate client's next use of the token is a replay that revokes the family. A well-behaved client never sends either. Checks that do not need the record run first: a refresh `scope` naming a scope the provider or the client does not have is refused before the token is consumed. Rejected: a non-consuming lookup before consumption, which adds a store method and a read-then-write window the atomic path closes; it is listed on the [roadmap](roadmap.md) if real clients need it.
