---
status: DRAFT
last_updated: 2026-11-12
scope: What `@codenhub/oidc` needs between 0.0.1 and its 0.1.0 release.
---

# Roadmap

## Purpose

This records what stands between 0.0.1 and a 0.1.0 the SSO application (Symbolon) can build on. The scope, invariants and decisions are in [scope.md](scope.md); the design is in [architecture.md](architecture.md). It is a draft until the maintainer reviews it.

Many items below change a contract: a record the store persists, a client record field, an option, or a recorded decision. Each is a proposal until the maintainer approves it, and its approval is recorded in scope.md section 8 with its reasons and the alternatives it rejected. An item that reverses a decision names what that decision did not weigh, as `docs/guidelines/documentation.md` asks.

## Current Focus

The SSO application is the package's first real consumer, and a review of its scope (2026-11-12) against this package found what it needs and the package lacks. The order follows the SSO application's own roadmap.

- **Release what `main` already holds.** The fixes after 0.0.1, the 60-second client clock tolerance (decision 44) and the expired `id_token_hint` at logout (decision 45), are not on npm. The SSO application installs from npm, so it needs a release that carries them.
- **Settle the persisted shapes before the SSO application writes its `OidcStore` adapters.** That is the second step of its roadmap. The items marked "record shape" under Planned add fields to `ClientRecord`, `InteractionRecord`, `CodeRecord` or `RefreshTokenRecord`. Adding them after the SSO application persists those records costs it a migration on three databases, so each is decided, even if as "no", before that step.

## Planned

### Changes the SSO application needs

Grouped by the step of the SSO application's roadmap that first needs them.

**Before the store adapters:**

- **A session identifier on a grant, and `sid` in the ID token** (record shape). `AuthorizationGrant` carries no session, and `completeAuthorization` returns only a `Response`, so the app cannot tell which of its sessions a grant came from. The SSO application lets users and admins revoke sessions, and revoking one should end the tokens issued during it, not every grant of that user and client. Proposal: an optional `sessionId` on `AuthorizationGrant`, kept on the code and refresh token records, and emitted as `sid` in the ID token (OpenID Connect Front-Channel and Back-Channel Logout use the same claim). This is the prerequisite for back-channel logout below.
- **Several secrets per client** (record shape). `ClientAuthentication` holds one `secretHash`, so rotating a client's secret breaks the client until it is reconfigured. The SSO application's admins rotate secrets from the dashboard. Proposal: accept a list of digests, any of which authenticates, so a new secret can be added before the old one is removed.
- **Token lifetimes per client** (record shape). `ttl` applies to the whole provider, and the SSO application registers each app with its own token lifetimes. Proposal: an optional `ttl` on `ClientRecord`, held to the same bounds as `ProviderTtl`, falling back to the provider's.
- **`acr_values` reaches the app** (record shape). `beginAuthorization` drops `acr_values`, so a client that asks for a stronger authentication, such as a second factor, cannot tell the app. The SSO application has MFA policies, and `completeAuthorization` already reports `acr`. Proposal: carry `acrValues` on the interaction. `claims_locales` and `display` are dropped the same way and can come with it if cheap; the `claims` parameter stays unsupported, as discovery says.

**Before the OIDC endpoints:**

- **The ID token signing algorithm per client** (record shape). The provider signs every ID token and JWT access token with the first signing key, while discovery advertises the algorithm of every published key. OpenID Connect Core §15.1 requires a provider to support `RS256`, and OpenID Connect Registration makes `RS256` the default for a client that registers no `id_token_signed_response_alg`. A provider whose first key is `EdDSA` or `ES256` therefore breaks relying parties that only verify `RS256`; the conformance item below gives an RS256 key to the conformance host only. Proposal: `ClientRecord.idTokenSigningAlg`, signing with the first key of that algorithm, defaulting to `RS256` when such a key exists and to the first key otherwise.
- **Scope claims in the ID token, as an option** (record shape, for the per-client opt-in). Decision 12 releases scope claims only at userinfo, following OpenID Connect Core §5.4. What it did not weigh: relying parties that read only the ID token and never call userinfo, such as Kubernetes' API server OIDC authenticator and many "Sign in with" integrations that expect `email` there. A general identity provider serves them too, and the SSO application's question of roles in tokens lands here. Proposal: an opt-in, per client or provider-wide, that puts the claims the granted scopes release into the ID token, through the existing `claims` callback. Userinfo stays the default. Reverses part of decision 12.
- **A re-check before a refresh.** The refresh grant never consults the app. A user who is disabled, loses the role an app requires, or revokes consent keeps refreshing until the family expires, 30 days by default, unless the app revokes every matching grant itself. Proposal: an optional callback the provider calls before it issues tokens from a refresh, which can refuse with `invalid_grant`, given the subject, the client and the scopes. The alternative is a rule in the SSO application that every action ending access revokes the matching grants; the hook is preferred because one forgotten code path there leaves access open.
- **Configuration that changes at runtime.** `signingKeys`, `scopes` and `ttl` are fixed when the provider is created, while the SSO application edits keys, apps and scopes from its dashboard. `createProvider` keeps no state between requests, so rebuilding it when the configuration changes works, and key rotation already works by key order: a new key is published second, then moved first once relying parties have fetched it. Proposal: document and test that rebuilding the provider is cheap and safe, since rotation on Node.js and across Worker isolates depends on it; and accept a scope a client's record allows that is missing from `scopes` as releasing no claims, so an app-defined scope such as `data:<namespace>:read` lives only in the database and adding one does not need a rebuild.

**For 0.1:**

- **Back-channel logout** (OpenID Connect Back-Channel Logout 1.0; record shape). The SSO application's scope strongly prefers it for usable single sign-out. Decision 38 left it not planned until a consumer needs it, and the SSO application is that consumer. It needs the session identifier above. Proposal: a helper that signs a logout token for a client and session with the provider's keys, and the client record fields it needs (`backchannelLogoutUri`, whether `sid` is required), which are settled with the other record shapes even though the feature comes later; the app makes the calls, so the provider still makes no outbound requests. Reverses part of decision 38. Front-channel logout and session management stay not planned.

### The OpenID conformance suite

The provider passes the Basic OP and Config OP plans; the client runs the RP tests where practical. The plans need a provider reachable from the suite's runner, so a small deployable host (a Worker, or a Node.js server) comes with this item. Discovery's `id_token_signing_alg_values_supported` must list `RS256` for the Config OP plan, so the conformance host signs with an RS256 key. That key is this plan's, not a recorded decision; scope.md decisions 30 and 39 record only that the run waits for a deployable host and stays the 0.1 criterion.

**It cannot pass while invariant 1 holds as written.** In the Basic OP plan only `oidcc-ensure-request-with-valid-pkce-succeeds` sends a `code_challenge`; every other module sends none, and `oidcc-ensure-request-without-nonce-succeeds-for-code-flow` sends neither PKCE nor a nonce. Other providers that require PKCE of every client report most of the plan failing at the first authorization request (references below). Invariant 1 did not weigh the plans that are its own 0.1 criterion, nor confidential clients of relying-party libraries that send no PKCE, which the SSO application will serve. Decision 45 weighed the same audience, relying parties built on other libraries, for logout; this is that audience's PKCE case. OAuth 2.1 §7.5.1.1 and RFC 9700 §2.1.1 allow a confidential client to go without PKCE only when the provider has reasonable assurance that the client implements the OpenID Connect `nonce` properly; being confidential is not enough. Proposal: a `requirePkce` flag on `ClientRecord` (record shape), `true` by default and impossible to turn off for a client whose `auth.method` is `none`. A `code_challenge` that is sent is always enforced. A request from a client with the flag off that carries no `code_challenge` must carry a `nonce`, which the provider already binds to the code and puts in the ID token for the client to check; turning the flag off is the operator's assurance that the client checks it. That rule fails `oidcc-ensure-request-without-nonce-succeeds-for-code-flow`, which sends neither, so the decision must also settle that module: a third client setting that waives the nonce too, a known failure argued in the certification submission, or another way out the plan's documentation allows. The conformance host registers the suite's clients with the flag off and one control client with it on, and fails if the control client accepts a request without PKCE. Reverses invariant 1.

### Release

- **What the SSO application finds next.** 0.0.1 aimed to be the last release before a breaking change (`docs/specs/packages-lifecycle.md`, "Versioning"). The items above are what the first look at the consumer found; a change building it shows the public API needs ships in the release that makes it, as a breaking change if it is one. 0.1.0 is the judgment that the SSO application builds on the package without such changes.
- **A changelog from 0.1.0**, opened by `hub release --cut` with the release, per `docs/specs/packages-changelog.md`.

## Later / Possible

None of these breaks an existing contract, so each can wait for its consumer.

- **Authenticating a bearer token for the app's own APIs.** A resource endpoint served by the app beside the provider, such as the SSO application's future user-data API, has no way to check an opaque access token except by repeating the provider's digest, lookup and expiry checks against the store. A provider method that takes a `Request` and returns the token's record, or a refusal with its `WWW-Authenticate` challenge, would keep that logic in one place. Token introspection (RFC 7662) stays out of scope.
- **More from JWT access tokens.** Extra claims, such as roles, and an audience per resource (RFC 8707) instead of one for the provider. Decision 36 left per-resource audiences to a second resource server.
- **Pairwise subject identifiers in discovery.** The app already derives a subject per client (decision 38); an option for `subject_types_supported` is the remaining change, when the SSO application turns pairwise subjects on.

## Not Planned

- Implicit and hybrid flows, the password grant, and PKCE `plain` (scope.md section 2, "Never supported").
- Tracking client assertion `jti` values (scope.md decision 23).
- A non-consuming refresh token lookup, unless a real client needs it (scope.md decision 20).
- Loopback redirect URIs with variable ports, PAR, front-channel logout and session management. Each waits for a consumer and its case (scope.md decision 38). Back-channel logout and pairwise subjects moved above.
- Device flow, CIBA, DPoP, mTLS, dynamic client registration, request objects, JWE-encrypted tokens and token introspection (scope.md section 2).

## Notes

- **Userinfo reads the token only from the `Authorization` header**, and the Basic OP plan has `oidcc-userinfo-post-body`. RFC 6750 §2.2 makes the body method optional, and the module is believed to tolerate a refusal; confirm it in the first conformance run.
- **The SSO application's docs are behind this package.** Its scope says 0.0.1 has no logout support, and the first step of its roadmap is logout here. RP-initiated logout shipped in 0.0.1 (decision 37); what remains is back-channel logout, above.

## References

- [The SSO application's scope](https://github.com/codenhub/symbolon/blob/main/docs/scope.md) and [roadmap](https://github.com/codenhub/symbolon/blob/main/docs/roadmap.md).
- PKCE in the conformance plans, from other providers' runs: [hearth-auth/hearth#780](https://github.com/hearth-auth/hearth/issues/780), [fells-code/seamless-auth-oidc-provider#29](https://github.com/fells-code/seamless-auth-oidc-provider/pull/29), [Tjeerd-menno/open-identity-stack#303](https://github.com/Tjeerd-menno/open-identity-stack/issues/303), [clavis-id/clavis#45](https://github.com/clavis-id/clavis/pull/45).
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html).
