---
status: IMPLEMENTED
last_updated: 2026-10-17
scope: How `@codenhub/oidc` is built and why, for whoever changes it next.
---

# OidcKit architecture

This records how `@codenhub/oidc` keeps the invariants of [scope.md](scope.md) section 4, and the reasoning behind choices that are not obvious from the code. Public behavior is in the package docs; this is for changing the package without breaking what it relies on. Decisions are listed in [scope.md](scope.md) section 8, and what remains before 0.1 in [roadmap.md](roadmap.md).

## What the package defends against

In scope, and the package must get right:

- **Any request to the provider**, and any callback URL, discovery document, token response, userinfo response or JWKS the client receives. For these, bad input is a result or an OAuth error response and never an exception, and costs a bounded amount of work.
- **Authorization code interception and injection**: PKCE `S256` is required of every client, and a code is bound to its client, redirect URI, challenge, nonce and scopes.
- **Open redirects**: the provider redirects only to a redirect URI it matched byte for byte against the client's registration.
- **Mix-up and CSRF on the callback**: `state` and the RFC 9207 `iss` parameter are checked before anything in the response is used.
- **Replay**: codes and refresh tokens are single-use, and a second use revokes everything issued from the same grant.
- **Token type confusion**: an ID token is never accepted where an access token is, a refresh token never where either is.
- **Leaks**: codes, tokens, secrets, verifiers and claim values never appear in issues, `TypeError` messages, or error responses; the store only ever sees digests of them.

Out of scope, and documented rather than defended:

- **The app's own code**: the store, the `claims` callback, and the login and consent flow. Their exceptions propagate (scope.md decision 17). A store that is not atomic breaks the replay guarantees, which is why the contract spells atomicity out.
- **Everything above the protocol**: how users authenticate, sessions and cookies, rate limiting of the endpoints, and where `PendingAuthorization` and the interaction identifier are kept.
- **What `@codenhub/jwt` defends**: algorithm substitution, JWS parser differentials, JWKS fetching limits. The package relies on it for every signature.

## Module layout

| Path            | Owns                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`  | The root export: shared types only (decision 6).                                                                          |
| `src/shared/`   | Public types, results, limits, base64url and digests, PKCE, `at_hash`, strict parameter parsing, bounded bodies.          |
| `src/client/`   | `discover`, `createClient`, and the client's bounded JSON fetch, metadata checks, client authentication, ID token checks. |
| `src/provider/` | `createProvider`, option resolution, the five endpoints, client authentication, secrets, responses, diagnostics.          |
| `src/testing/`  | The in-memory reference store and the store conformance cases.                                                            |

Each subpath is its own build entry (`client.ts`, `provider.ts`, `testing.ts`), and the client never imports from `src/provider/`, so `@codenhub/oidc/client` does not carry provider code (scope.md section 3). Both sides import `src/shared/`, which the bundler emits as a shared chunk.

## Provider

### Options

`resolveOptions` (`provider/options.ts`) checks every option once, at creation, and freezes the result, so a misconfiguration throws `TypeError` at startup and each request reads plain resolved values. `now()` there returns whole seconds, the unit of every record and claim. Endpoint URLs default to paths under the issuer, and `handle` compares a request's origin and path with each one, ignoring the query.

### Authorization

`beginAuthorization` splits failures by what can be trusted when they happen:

1. Before the client and its redirect URI are known, nothing in the request can be trusted with a redirect: an oversized URL, a bad method or body, a malformed or duplicated parameter, an unknown client, or a redirect URI that is not exactly one of the client's. These fail with `redirect: null`, and the app renders its own error.
2. After both are verified, every failure is a `302` to that redirect URI with `error`, `state` and `iss`.

The validated request is saved through `saveInteraction` under the digest of a random identifier (decision 1). `completeAuthorization` consumes it atomically, so a second completion gets `interaction_not_found`; it then checks the app's outcome against the request (decision 16) and saves a code record carrying everything the token endpoint must compare.

### Token endpoint

Order of checks, cheapest and least trusting first: method, content type, body size, parameter parsing (duplicates refused), client authentication, grant type, then the grant. Client authentication finds exactly one presented method (Basic header, `client_secret` in the body, a client assertion, or nothing) and requires it to be the registered one; the presented credential is then checked against the record: a secret by comparing SHA-256 digests in constant time, an assertion with `@codenhub/jwt`'s verifier with the client as issuer and the issuer or token endpoint as audience.

A code or refresh token is consumed before it is checked, so a wrong verifier or redirect URI still burns it, and a second attempt is a replay. A replay revokes the grant. Because a replay can arrive while the first exchange is still saving its tokens, the store contract requires `revokeGrant` to cover tokens saved after it (decision 10); the memory store keeps a set of revoked grants and checks it on every read.

### Revocation endpoint

The revocation endpoint shares the token endpoint's front checks and client authentication (`readClientRequest` in `token.ts`). It reads the access token table first, because that read changes nothing, and then spends a refresh token, so either kind of token revokes its grant with no store method beyond the ones the token endpoint uses (decision 27). It does not check expiry: a token the store still holds revokes its grant whether or not it has expired, which is harmless.

### Diagnostics

A refusal at the token, userinfo or revocation endpoint is built with `refuse(response, reason, clientId?)` (`diagnostics.ts`), which records the reason in a `WeakMap` keyed by the response. `handle` passes the recorded refusal to `onDiagnostic` after the endpoint answers (decision 28). The reason never travels through return types, and a response the code did not mark is never reported. `clientId` is passed only where it comes from the store.

### Userinfo

The bearer token is read from the `Authorization` header only. Access tokens, refresh tokens and ID tokens never share a lookup: an access token is found only through `findAccessToken`, so presenting any other token there finds nothing, which is the type-confusion defense for opaque tokens. Released claims are filtered to the names the granted scopes release, read without running getters, and `sub` is set last from the record.

## Client

`createClient` resolves and freezes its options; the metadata is checked by the same function as a discovered document. Every request goes through `requestJson` (`client/http.ts`): `redirect: "manual"`, a timeout raced against the request so a `fetch` that ignores its abort signal still cannot hold the caller, a response size cap enforced while streaming, and JSON content type required. It never throws; failures are `request_failed` with a `reason`.

The callback checks, in order: the URL and its parameters, `state` (constant-time), `iss` when present or when the provider advertises it, an `error` response, then the code exchange and the ID token. The ID token goes through one `@codenhub/jwt` verifier per client, built on a remote key set restricted to the provider's advertised asymmetric algorithms, with the issuer, the client as audience, and `sub`, `exp` and `iat` required; the OpenID-specific checks (`azp`, `nonce`, `auth_time` under `max_age`, `at_hash`, `typ` not `at+jwt`) run on the verified payload, as `@codenhub/jwt` decision 7 intends. An OAuth `error` value from a provider is narrowed to a known code, or `unknown`, before it reaches an issue, so an issue never carries text the provider chose.

## Limits

| Limit                                 | Value                      | Why this value                                                                                  |
| ------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| Request URL read by the provider      | 8192 chars                 | Authorization requests are a few hundred characters; the cap is checked before parsing.         |
| Request body read by the provider     | 16384 bytes                | A token request with an RSA-4096 client assertion is under 3 KB.                                |
| Parameters per request                | 32                         | A request uses at most about a dozen.                                                           |
| Parameter length                      | 4096 chars                 | Fits a client assertion signed with RSA-4096.                                                   |
| Response body read by the client      | 65536 bytes                | Discovery documents and token responses are a few kilobytes.                                    |
| Client request timeout                | 5 s, 1 to 60               | A slow provider should fail a sign-in, not hold it.                                             |
| Client option list entries            | 100                        | `scope`, `prompt` and `uiLocales` of `authorize` and `scope` of `refresh`; decision 22.         |
| URL characters                        | Visible ASCII              | Issuers, endpoints and redirect URIs, less `\`; the URL parser rewrites the rest (decision 22). |
| Authorization URL built by the client | 8192 chars                 | The provider's URL limit, checked after encoding (decision 24).                                 |
| Metadata copy                         | Depth 32, 65536 containers | Bounds hand-written metadata that reuses objects; no fetched document reaches either.           |
| Client assertion clock tolerance      | 60 s                       | Client clocks drift; with none, a clock one second ahead failed every request (decision 23).    |
| Client assertion lifetime             | 300 s                      | Bounds replay of an untracked `jti` (decision 23).                                              |
| Code lifetime                         | 60 s, ≤ 600                | Invariant 4: short-lived, bounded.                                                              |
| Interaction lifetime                  | 1800 s                     | Time for a user to sign in and consent.                                                         |
| Access and ID token lifetime          | 600 s                      | Short, since opaque access tokens are checked at the store anyway.                              |
| Refresh token family lifetime         | 30 days                    | Decision 11.                                                                                    |

## Error model

- **Untrusted input returns a result**, or for provider endpoints an OAuth error response. The result type `OidcResult` has `@codenhub/jwt`'s shape, so code handling one handles the other.
- **Programmer error throws `TypeError`**: invalid options at creation, a malformed client record from the store, a malformed `PendingAuthorization`, and an outcome that contradicts the request.
- **Issues carry no input.** `params` hold only fixed vocabulary (`endpoint`, `reason`, a known OAuth `error`, a `jwtCode`) and numbers such as an HTTP `status`. Error responses carry only the OAuth code.
- **Results are deep-frozen.**
- **Operators get reasons, clients get codes.** `onDiagnostic` receives a fixed-vocabulary reason for each refusal at the token, userinfo and revocation endpoints; the response still carries only the OAuth code (decision 28).

## Runtime constraints

The source uses only `crypto.getRandomValues`, `crypto.subtle`, `TextEncoder`, `TextDecoder`, `URL`, `URLSearchParams`, `fetch`, `Request`, `Response`, `AbortController` and `setTimeout`: no `Buffer`, no `node:` imports, and no `atob`/`btoa`, whose leniency the strict decoders exist to refuse. `tsconfig.src.json` sets `types: []`, so a Node.js global in `src/` fails the type check.
