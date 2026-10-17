---
status: APPROVED
last_updated: 2026-10-17
scope: What `@codenhub/oidc` 0.1 covers, the invariants it keeps, and the decisions taken while building it.
---

# `@codenhub/oidc`: package scope

> **How to read this document.** This started as the outcome of a brainstorming session, not a final spec. Section 4 lists the **invariants**: security and design commitments that hold unless there's a strong, explained reason to break them. Sections 1 to 3, 5 and 7 are the agreed scope of 0.1. The API sketch in section 6 was a **proposal**; the shipped API answers it differently in places, and section 8 records how. Section 8 also records the decisions taken while building the package, marked by who settled them. If you find a better API shape, better behavior, or a better-established practice, propose it and explain why, as `docs/guidelines/documentation.md` asks for reversing a decision. The goal is the best possible package, not faithfulness to this document.
>
> The invariants and every decision in section 8 are approved by the maintainer; decisions 5 to 22 were reviewed in the pre-release audit of 2026-10-16, which also took decisions 23 to 31. The release audit of 2026-10-17 took decisions 32 to 39.
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
- PKCE (RFC 7636), `S256` only, and `at_hash` computation. Both ship as internal shared modules rather than root exports (decision 6).

### Client (`@codenhub/oidc/client`)

- **Discovery**: fetch and validate `/.well-known/openid-configuration`. The `issuer` must match exactly. Results are cached, and the client can also be configured without discovery. As shipped, `discover` fetches on every call, and the app caches by keeping the metadata or the client (decision 5).
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
- **Grants**: `authorization_code`, `refresh_token`, and `client_credentials` (decision 35).
- **Client authentication verification** for the same methods the client supports.
- **Request handling**:
  - `prompt`: `none` must return `login_required` / `consent_required`; `login` and `consent` must force those steps. As shipped, the app performs these steps, since sessions and consent are its own (decision 3): it answers `prompt=none` with a denial, and the provider checks the outcome it reports, such as an `authTime` no older than the request under `prompt=login` (decision 16).
  - `max_age`, with `auth_time` in the ID token.
  - Scopes mapped to claims.
- **`iss` in the authorization response** (RFC 9207), advertised in discovery.
- **RP-initiated logout** (RP-Initiated Logout 1.0): the end-session request is validated by the provider and the session ended by the app (decision 37).
- **Refresh tokens** rotate on every use. Reuse detection revokes the whole token family.
- **Code replay** revokes every token issued from that code.
- **Store interface**: the adapters the app implements (section 5).
- **An in-memory reference store** under a testing subpath (for example `@codenhub/oidc/testing`). It's clearly marked as not for production, and it's used by tests and examples.

### Candidates (in if cheap and clean, otherwise later)

- Token revocation (RFC 7009). It's useful for logout and for the SSO dashboard. Shipped in 0.0.1 (decision 27).
- JWT access tokens (RFC 9068, `typ: at+jwt`) as an option alongside opaque tokens. Shipped in 0.0.1 (decision 36).

### Out of scope (0.1)

These are left out to keep the surface small, not because they're bad:

- **Never supported:** implicit and hybrid flows, the password grant (ROPC), and PKCE `plain`.
- **Out of scope for 0.1:**
  - Device flow, CIBA, and PAR (RFC 9126). PAR is not planned (decision 38).
  - DPoP and mTLS.
  - Dynamic client registration.
  - Request objects (JAR) and JWE-encrypted tokens.
  - Front-channel and back-channel logout, and session management. RP-initiated logout is in (decision 37).
  - Token introspection.
  - Pairwise subject identifiers, which the app can already compute itself (decision 38).

---

## 3. Design direction

- **Fetch API everywhere.** The provider takes a `Request` and returns a `Response`. The client uses an injectable `fetch`. This one choice makes it run unchanged on Workers, Node 24+, Deno, Bun, and inside any framework (Hono, plain Workers, Node adapters).
- **The package owns the protocol; the app owns everything else**: users, passwords, MFA, sessions and cookies, login and consent pages, persistence. The provider never renders HTML and never decides how a user authenticates.
- **Opinionated.** Secure choices are defaults or the only option, and rejected options are rejected loudly.
- **The client stays small.** Importing `oidc/client` must not pull in provider code.

---

## 4. Invariants

1. **PKCE `S256` is required for every client**, confidential ones included. A missing or `plain` challenge is rejected.
2. **`redirect_uri` matches exactly.** It's a byte-for-byte comparison against a registered value, with no normalization, wildcards, or prefix matching. Loopback redirects with variable ports (RFC 8252) are not planned (decision 38), so the match is exact in every case.
3. **No open redirects.** The provider only redirects to a redirect URI it has verified for that client. The types make the difference between "send this error back to the client" and "render an error yourself" impossible to miss.
4. **Authorization codes:**
   - single-use
   - short-lived, with a bounded default (around 60s or less)
   - bound to the client, `redirect_uri`, PKCE challenge, `nonce`, scopes, and the authenticated session. As shipped, the code carries the subject, `auth_time`, `amr` and `acr` the app reports; tying the interaction to the browser's session is the app's job, by keeping the interaction identifier in that session.
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

- **Clients**: look up by `client_id`. This returns registered redirect URIs, allowed scopes, the authentication method, and either a secret verifier or a JWKS. As shipped, a record also lists its grants and its post-logout redirect URIs (decisions 35 and 37).
- **Authorization codes**: `save` with a TTL, and `consume`. `consume` **must be atomic**. Decision 10 makes it an atomic mark-as-used rather than a get-and-delete, so a replay can be recognized. Document what that rules out: plain Cloudflare KV is not atomic, so it needs D1 or Durable Objects.
- **Refresh tokens**: `save`, `rotate` (atomic), `revokeFamily`.
- **Grants or sessions**, if needed, for code-replay revocation and refresh-family tracking.

As shipped, `OidcStore` (`src/provider/types.ts`) answers this list: refresh tokens are consumed like codes, by an atomic mark-as-used, and rotation saves a new token; a family is a grant, revoked with `revokeGrant`, which must also hide tokens of that grant saved after it (decision 10). The TSDoc on `OidcStore` is the contract.

Tokens and codes should be stored hashed, so a leaked database doesn't leak usable tokens. Decide whether the provider hashes before calling the store; it probably should.

The in-memory testing store must implement these guarantees faithfully. It's also the reference other adapters are tested against. A reusable **store conformance test suite** checks the SSO app's D1 or Postgres adapters against the same rules: as shipped, `storeConformanceCases` in `@codenhub/oidc/testing` (decision 29).

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
- **OpenID conformance suite.** Run the provider against the official Basic OP and Config OP test plans, and the client against the RP tests where practical. Required for 0.1; 0.0.1 does not run it (decision 30).
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
2. **Access tokens are opaque by default.** A random 256-bit value, stored hashed; revoking a family is a store revocation (`revokeGrant`, which must also hide tokens of that grant saved after it, decision 10). RFC 9068 JWT access tokens became an option in the release audit (decision 36). Rejected at first: shipping `at+jwt` alongside, which adds surface and tests to 0.0.1 and gives tokens that cannot be revoked before they expire; decision 36 reversed this with opaque kept the default.
3. **Consent belongs to the app, and `redirect_uri` matching is exact only.** The app decides whether to show consent and passes the granted scopes to `completeAuthorization`; the store has no consent table. Loopback redirects with variable ports (RFC 8252 §7.3) are not planned (decision 38). Rejected for now: a provider-side consent store, which adds a table and a policy the SSO app must own anyway.
4. **0.0.1 targets the "0.0.1 is done when" criteria of section 7.** Interop against panva's `oidc-provider` and `openid-client`, the OpenID conformance runs, and token revocation (RFC 7009) were left for later; the audit brought interop and revocation into 0.0.1 (decisions 27 and 30).

### Taken while building, approved in the pre-release audit (2026-10-16)

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
15. **`private_key_jwt` and `client_secret_jwt` need `client_id` in the body.** The provider finds the client before it verifies the assertion and never decodes an unverified payload, which `@codenhub/jwt` deliberately does not offer. The assertion's `aud` may be the issuer or the token endpoint URL. Its `jti` is required but not tracked, and its lifetime is capped (decision 23).
16. **`completeAuthorization` throws `TypeError` when the app's outcome contradicts the request**: scopes that were not requested or no `openid`, an `authTime` before the interaction under `prompt=login`, or more than `max_age` before the request (decision 32). These are bugs in the app's login flow, and answering them with a code would silently log a user in without the step the client asked for.
17. **Store failures propagate.** A store that throws or rejects makes `handle`, `beginAuthorization` or `completeAuthorization` reject. Answering `invalid_grant` for a database outage would hide it and log users out. The `claims` callback is treated the same way.
18. **The client's clock tolerance defaults to 0 seconds**, following `@codenhub/jwt` decision 6; an app whose clock may drift from the provider's sets `clockTolerance`.
19. **`@codenhub/jwt` is a peer dependency.** Its keys are recognized only by the copy that created them, so the app and this package must share one copy. It is installed from its release through the catalog, as `docs/specs/packages-lifecycle.md` asks.
20. **A code or refresh token is consumed before any check that needs its record.** The store offers only atomic consumption, so a refresh request that asks for a scope outside the family's grant, or a token presented by another client, burns the token: the first answers `invalid_scope`, and the legitimate client's next use of the token is a replay that revokes the family. A well-behaved client never sends either. Checks that need only the request run first: the shape of the `code_verifier`, and a refresh `scope` naming a scope the provider or the client does not have, or leaving out `openid` (decision 31), are refused before the value is consumed. Checks against the record (expiry, client, `redirect_uri`, the verifier against the challenge, the scope against the family) run after, so they burn it. Rejected: a non-consuming lookup before consumption, which adds a store method and a read-then-write window the atomic path closes. The audit dropped it from the roadmap: reopen it only with a real client that sends such requests, which is the evidence it lacks.

### Approved by the maintainer during review (2026-10-16)

21. **A refresh whose new ID token fails validation returns no tokens.** The client reports the ID token's issues and drops the access and refresh tokens of that response, although the provider has already spent the refresh token that was sent, so the user must sign in again. An ID token that fails validation means the response cannot be trusted, and handing its tokens to the app would invite it to use them. Rejected: returning the tokens alongside the issues, which changes the failure shape of `refresh` and makes an untrusted response usable.

### Taken during review, approved in the pre-release audit (2026-10-16)

22. **Client-side caps match what the provider accepts, and URLs are visible ASCII.** Added in response to PR review: `authorize` refuses `scope`, `prompt` and `uiLocales` lists of more than 100 entries, a `maxAge` above 999999999, and a joined `scope`, a `loginHint` or a joined `ui_locales` longer than 4096 characters; `refresh` refuses a `scope` list of more than 100 entries or longer than 4096 characters joined; each is a `TypeError`. Issuers, endpoint URLs and redirect URIs, on both sides, must be visible ASCII (`!` to `~`) other than `\`, which the URL parser rewrites to `/` in special schemes (added in the audit). A client token response whose `access_token` is not printable ASCII is `invalid_token_response`. The caps mirror what this package's provider accepts (`\d{1,9}` for `max_age`, 4096 characters per parameter, and 8192 characters of URL, decision 24), so the client fails at the call rather than sending a request the provider would answer with an error page instead of a redirect; 100 entries is far above any real request and bounds the copy each list goes through. The URL rule exists because the URL parser rewrites spaces, controls and non-ASCII host characters (IDNA maps `example。com` to `example.com`), so a stored string would differ from the URL it serializes to; internationalized URLs are written as punycode and percent-encoding. The access token rule follows RFC 6749 §A.12, and `at_hash` is defined over ASCII octets. Rejected: leaving the caps to the provider, which turns a caller mistake into an unredirected provider error page; accepting non-ASCII URLs and comparing their serialized form, which breaks the byte-for-byte issuer and redirect URI matching of invariants 2 and 5.

### Taken in the pre-release audit, approved by the maintainer (2026-10-16)

23. **Client assertions get 60 seconds of clock tolerance and at most 300 seconds of lifetime, and `jti` replay is accepted by design.** The provider verified assertions with no tolerance, so a client whose clock ran one second ahead sent an `iat` in the future and failed every token request; clients such as openid-client and this package's set `iat` to their own clock. An assertion whose `exp` is more than 300 seconds after the provider's now, plus the tolerance, is refused, as RFC 7523 §3 allows. Replay within that window is accepted: a replayed assertion only authenticates the client, and a token request also needs a code with its PKCE verifier or a single-use refresh token. Rejected: tracking `jti` through a store method, which costs every adapter a table and a write on every token request for no token an attacker could not already get; no tolerance, which fails honest clients.
24. **`authorize` refuses an encoded authorization URL longer than 8192 characters**, the provider's URL limit. Decision 22's per-value caps count characters before percent-encoding, so a `loginHint` of 2048 emoji passed its cap and made a URL of about 25,000 characters, which the provider answers with an error page instead of a redirect: the outcome decision 22 exists to prevent. Rejected: lowering the per-value caps to cover the worst encoding, which refuses legitimate ASCII values to bound a rare case.
25. **`OidcIssueCode` lists only codes an operation returns.** It included every `OAuthErrorCode`, so an exhaustive `switch` had to handle fifteen codes that never occur as issues; it now holds the client codes, the three provider codes, and the six OAuth codes `beginAuthorization` redirects with. An OAuth code a provider sends stays in `provider_error`'s `params.error`. Rejected: keeping the wide union as reserved, since narrowing it after publishing is a breaking change and widening it later is not.
26. **The in-memory store keeps every record, has no clock, and saves and returns copies.** It purged expired records by its own `Date.now` on every write, so a provider on a test clock lost live codes, a late replay's answer depended on unrelated writes, and each write scanned every map. It is a testing store, so memory growing with use is acceptable, and the provider checks expiry itself. Rejected: documenting that its clock must match the provider's, a trap for every test; a `purgeExpired` method, surface for a store that is not for production.
27. **Token revocation (RFC 7009) ships without a store change.** The provider's revocation endpoint finds an access token with `findAccessToken` and spends a refresh token with `consumeRefreshToken`, and either revokes its whole grant with `revokeGrant`, as RFC 7009 §2.1 allows. Unknown tokens get `200` (§2.2), `token_type_hint` is ignored (§2.1 permits it), and another client's token is refused with `invalid_request`; a refresh token spent by that lookup still has its grant revoked, since it has leaked and its next use would revoke the grant as a replay anyway. The client gains `revoke`. Rejected: the revoke-by-token store method the roadmap assumed, which the existing methods make unnecessary; a non-consuming refresh lookup (decision 20).
28. **`onDiagnostic` reports why the token, userinfo and revocation endpoints refused a request.** Decision 14 sends clients a bare OAuth code, which left an operator unable to tell an expired code from a wrong verifier. The callback receives a frozen `{ endpoint, reason, status, clientId? }` with a fixed vocabulary of reasons; `clientId` appears only when it comes from the store, never from an unverified request. It is awaited before `handle` resolves, so a throw or a rejection propagates, as decision 17 has the store and `claims` do; its type returns `void`, so a callback that returns another value still fits. Authorization failures are not reported, since `beginAuthorization` and `completeAuthorization` already return issues. Rejected: logging inside the package, which has no logger and runs on every runtime; reasons in `error_description`, which decision 14 refuses.
29. **`storeConformanceCases` checks an adapter against the `OidcStore` contract with any test runner.** Each case is a name and a `run(createStore)` that rejects with an `Error` naming the broken rule. The audit also wrote down rules the contract left unsaid: saves never overwrite, the revocation check is atomic with consumption, and adapters purge expired rows themselves, keeping replay and revocation markers as long as they matter. Rejected: a suite bound to one runner, such as Vitest's `describe`.
30. **Interop runs now; OpenID conformance certification stays a 0.1 item.** Dev-only suites run openid-client against this provider and this client against oidc-provider. The OpenID conformance plans need a provider reachable from the OpenID Foundation's runner, so they wait for a deployable host. Rejected: documenting "how far it gets" for 0.0.1 without running it, which would be a guess.
31. **Behaviors settled in the audit.** A refresh `scope` must include `openid`, checked before the token is spent, and userinfo answers `insufficient_scope` (403) for a token without `openid` (OpenID Connect Core §5.3). A failing `Authorization` header at the token or revocation endpoint always gets the Basic challenge (RFC 6749 §5.2). A registered redirect URI's query is kept byte for byte (§3.1.2). Invalid percent-encoded UTF-8 is refused as `malformed` rather than decoded to U+FFFD. Empty `ui_locales` entries are dropped, since it is a hint. The client strips a JSON byte order mark (RFC 8259 §8.1), accepts hand-written metadata that reuses an object, type-checks every claim `IdTokenClaims` types, and refuses at creation an assertion key whose algorithm the provider does not advertise.

### Taken in the release audit, approved by the maintainer (2026-10-17)

32. **`max_age` is measured at the request, on both sides.** OpenID Connect Core §3.1.2.1 asks for re-authentication when the time since the last login is more than `max_age`, which is judged when the request arrives. The client measured it at the callback, against a millisecond clock and a whole-second `auth_time`, so `authorize({ maxAge: 0 })`, the spec's equivalent of `prompt=login`, failed every sign-in with `auth_too_old` (5 of 5, this client against this provider), and small values failed whenever the login took longer than `max_age`. The provider measured it in `completeAuthorization`, so a user who spent longer on the consent page than `max_age` allowed made it throw `TypeError`. The provider now compares `authTime` with the interaction's `createdAt`, and `PendingAuthorization` carries `requestedAt` beside `maxAge` for the client to compare with. Rejected: fixing only the provider and refusing `maxAge: 0`, which drops a value the spec defines and still fails small values; a clock tolerance as the remedy, which loosens every other time check to fix one.
33. **`storeConformanceCases` seeds clients.** `createStore` receives `{ clients }`, the shape `createMemoryStore` already takes, and a case checks that `findClient` returns a registered client with its values. The suite passed an adapter whose `findClient` never found anything, the one read every request starts with, because `OidcStore` has no method that saves a client. A refresh-token twin of the duplicate-save case was added beside it. Rejected: narrowing the documentation to say the suite does not check `findClient`, which leaves that read untested in every adapter.
34. **Behaviors settled in the release audit.** `userinfo` throws `TypeError` for an access token that is not printable ASCII, rather than reporting the header `fetch` refuses as a network failure that invites a retry. The hostile parameter check runs in workerd against the built package as well, since the bundler had deleted it from `dist/` (`AGENTS.md` records the trap).
35. **Client credentials (RFC 6749 §4.4) ships, gated per client.** A client record lists `grantTypes`, `authorization_code` by default, or `client_credentials`; the refresh grant comes with `authorization_code`. Only a client that authenticates may use `client_credentials`, and a record that gives it to a `none` client is a `TypeError`. A request without `scope` gets every scope of the client but `openid` and `offline_access`, which mean nothing without a user; asking for either is `invalid_scope`. The token's subject is the client, as RFC 9068 §2.2 has it, no ID token or refresh token is issued, and each token is its own grant, so revoking one leaves the client's others. A client not allowed a grant gets `unauthorized_client`, which joins `OidcIssueCode` for the authorization redirect. On the client, `clientCredentials` sends the grant and drops an `id_token` nothing would check, and `redirectUri` becomes optional, since a service client signs no user in; `authorize` and `callback` throw `TypeError` without it. The SSO application's user-data API is the consumer section 2 anticipated. Rejected: `refresh_token` as its own grant type, as RFC 7591 lists it, since `offline_access` already decides whether a sign-in may refresh; a separate record type for service clients, which every adapter would have to store twice.
36. **JWT access tokens (RFC 9068) ship as an option; opaque stays the default.** `accessToken: { format: "jwt", audience }` signs access tokens with the first signing key, with `typ: at+jwt`, `iss`, `exp`, `aud`, `sub`, `client_id`, `iat`, `jti`, `scope`, and, for a user's grant, `auth_time`, `amr` and `acr`. They are stored by digest like opaque tokens, so userinfo and revocation work alike; a resource server verifies them offline with `@codenhub/jwt`'s `createVerifier({ type: "at+jwt" })` and sees a revocation only when the token expires, which the documentation states and `ttl.accessToken` bounds. This reverses decision 2's "later": the maintainer settled deferred items before 0.0.1, and decision 2's reason, tokens that outlive their revocation, is answered by keeping opaque the default. Rejected: per-client or per-scope audiences through resource indicators (RFC 8707), which wait for a second resource server; a verifier helper in this package, which `@codenhub/jwt` already is; leaving JWT access tokens out of the store, which would break userinfo and revocation for them.
37. **RP-initiated logout ships as a stateless validation step, like authorization.** The app routes the end-session endpoint (`endpoints.endSession`, `${issuer}/logout` by default, advertised as `end_session_endpoint`) and calls `endSession(request)`, which reads `GET` or a `POST` form and returns who asked and a `redirect`, or a failure the app renders: a logout request never redirects to anything unverified. An `id_token_hint` is verified as this provider's ID token; one that does not verify is ignored, because `@codenhub/jwt` returns no payload for a token that fails and an expired hint is normal, so the result names no user and the app asks the user to confirm. A verified hint issued to another client than `client_id` is `invalid_request` (RP-Initiated Logout 1.0 §2). A `post_logout_redirect_uri` must match one of the client's `postLogoutRedirectUris` byte for byte, which needs a known client from `client_id` or the hint. The client gains `endSessionUrl`, which always sends `client_id`, so the redirect works after the hint expires. Rejected: accepting expired hints, which needs a decoded unverified payload, refused for the reason decision 15 gives; a store-backed logout interaction, which keeps state the request does not need; front-channel and back-channel logout, which need session identifiers (`sid`) and calls from the provider (decision 38).
38. **Not planned, each until a consumer needs it:** loopback redirect URIs with variable ports (RFC 8252 §7.3), since the SSO application's clients are web apps and the exact match of invariant 2 is simpler to keep; PAR (RFC 9126), since its gain is keeping large or sensitive request parameters out of the URL, and no client of this package sends any; pairwise subject identifiers, since the app chooses the `subject` it passes to `completeAuthorization` and can derive it per client already, leaving only `subject_types_supported` to change; front-channel and back-channel logout and session management, which need the app's sessions to carry `sid` and the provider to call clients. Rejected: keeping them as "later", which the maintainer asked to settle before 0.0.1. Reopening one needs the consumer and its case.
39. **The OpenID conformance run stays the 0.1 release criterion.** It is a criterion of section 7, not a feature: it needs a host reachable from the OpenID Foundation's runner, and 0.0.1 is the release that puts the provider behind a real host in the SSO application. Rejected: dropping it with the deferred features, which would leave 0.1 without an outside check of the provider.
