---
status: DRAFT
last_updated: 2026-11-13
scope: What `@codenhub/oidc` needs between 0.0.1 and its 0.1.0 release.
---

# Roadmap

## Purpose

This records what stands between 0.0.1 and a 0.1.0 the SSO application (Symbolon) can build on. The scope, invariants and decisions are in [scope.md](scope.md); the design is in [architecture.md](architecture.md). It is a draft until the maintainer reviews it.

Many items below change a contract: a record the store persists, a client record field, an option, or a recorded decision. Each is a proposal until the maintainer approves it, and its approval is recorded in scope.md section 8 with its reasons and the alternatives it rejected. An item that reverses a decision names what that decision did not weigh, as `docs/guidelines/documentation.md` asks.

## Current Focus

The SSO application is the package's first real consumer, and a review of its scope (2026-11-12) against this package found what it needs and the package lacks. The order follows the SSO application's own roadmap.

- **Release what `main` already holds.** The fixes after 0.0.1, the 60-second client clock tolerance (decision 44) and the expired `id_token_hint` at logout (decision 45), are not on npm. The SSO application installs from npm, so it needs a release that carries them.
- **Run the OpenID conformance plans.** Every change the review found is built, and scope.md decisions 47 to 56 record them; the record shapes are settled before the SSO application writes its `OidcStore` adapters. What is left before 0.1 is the conformance run below and the release.

## Planned

### The OpenID conformance suite

The provider passes the Basic OP and Config OP plans; the client runs the RP tests where practical. The plans need a provider reachable from the suite's runner, so a small deployable host comes with this item: [`apps/oidc-conformance`](../../../../apps/oidc-conformance/docs/runbook.md), a Worker that keeps the provider and an in-memory store in one Durable Object. Its runbook says how to deploy it, configure the plans and record the results here; it has not been deployed or run yet. Discovery's `id_token_signing_alg_values_supported` must list `RS256` for the Config OP plan, so the conformance host signs with an RS256 key. That key is this plan's, not a recorded decision; scope.md decisions 30 and 39 record only that the run waits for a deployable host and stays the 0.1 criterion.

**PKCE.** Most modules of the Basic OP plan send no `code_challenge`, so the suite's clients are registered with `requirePkce: false` (scope.md decision 52), and one control client keeps it on; the host fails if the control client accepts a request without PKCE. `oidcc-ensure-request-without-nonce-succeeds-for-code-flow` sends neither PKCE nor a `nonce` and is a known failure, argued in the certification submission.

### Release

- **What the SSO application finds next.** 0.0.1 aimed to be the last release before a breaking change (`docs/specs/packages-lifecycle.md`, "Versioning"). The items above are what the first look at the consumer found; a change building it shows the public API needs ships in the release that makes it, as a breaking change if it is one. 0.1.0 is the judgment that the SSO application builds on the package without such changes.
- **A changelog from 0.1.0**, opened by `hub release --cut` with the release, per `docs/specs/packages-changelog.md`.

## Later / Possible

None of these breaks an existing contract, so each can wait for its consumer.

- **More from JWT access tokens.** Extra claims, such as roles. An audience per resource shipped as resource indicators (scope.md decision 59).
- **Pairwise subject identifiers in discovery.** The app already derives a subject per client (decision 38); an option for `subject_types_supported` is the remaining change, when the SSO application turns pairwise subjects on.

## Not Planned

- Implicit and hybrid flows, the password grant, and PKCE `plain` (scope.md section 2, "Never supported").
- Tracking client assertion `jti` values (scope.md decision 23).
- A non-consuming refresh token lookup, unless a real client needs it (scope.md decision 20).
- Loopback redirect URIs with variable ports, PAR, front-channel logout and session management. Each waits for a consumer and its case (scope.md decision 38). Back-channel logout shipped (decision 53), and pairwise subjects moved to Later.
- Device flow, CIBA, DPoP, mTLS, dynamic client registration, request objects, JWE-encrypted tokens and token introspection (scope.md section 2).

## Notes

- **Userinfo reads the token only from the `Authorization` header**, and the Basic OP plan has `oidcc-userinfo-post-body`. RFC 6750 §2.2 makes the body method optional, and the module is believed to tolerate a refusal; confirm it in the first conformance run.
- **The SSO application's docs are behind this package.** Its scope says 0.0.1 has no logout support, and the first step of its roadmap is logout here. RP-initiated logout shipped in 0.0.1 (decision 37), and back-channel logout followed (decision 53).

## References

- [The SSO application's scope](https://github.com/codenhub/symbolon/blob/main/docs/scope.md) and [roadmap](https://github.com/codenhub/symbolon/blob/main/docs/roadmap.md).
- PKCE in the conformance plans, from other providers' runs: [hearth-auth/hearth#780](https://github.com/hearth-auth/hearth/issues/780), [fells-code/seamless-auth-oidc-provider#29](https://github.com/fells-code/seamless-auth-oidc-provider/pull/29), [Tjeerd-menno/open-identity-stack#303](https://github.com/Tjeerd-menno/open-identity-stack/issues/303), [clavis-id/clavis#45](https://github.com/clavis-id/clavis/pull/45).
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html).
