---
status: DRAFT
last_updated: 2026-10-17
scope: What `@codenhub/oidc` needs between 0.0.1 and its 0.1.0 release.
---

# Roadmap

## Purpose

This records what stands between 0.0.1 and a 0.1.0 the SSO application can build on. The scope, invariants and decisions are in [scope.md](scope.md); the design is in [architecture.md](architecture.md). It is a draft until the maintainer reviews it.

## Current Focus

0.0.1 is the first publish, and its purpose is to find out whether the package holds up in the SSO application. The criteria of scope.md section 7 hold: the authorization code flow works end to end, this client against this provider, on Node.js and workerd; every invariant has tests; the hostile-input, leak and interop suites pass. The pre-release audit settled every pending decision (scope.md section 8).

## Planned

0.1.0 is released when scope.md section 7 "0.1 is done when" holds:

- **The OpenID conformance suite.** The provider passes the Basic OP and Config OP plans; the client runs the RP tests where practical. The plans need a provider reachable from the suite's runner, so a small deployable host (a Worker, or a Node.js server) comes with this item. Discovery's `id_token_signing_alg_values_supported` must list `RS256` for the Config OP plan, so the conformance host signs with an RS256 key (scope.md decision 30).
- **What the SSO application finds.** Changes the first real consumer shows the public API needs, before it freezes at 0.1.
- **A changelog from 0.1.0**, opened by `hub release --cut` with the release, per `docs/specs/packages-changelog.md`.

## Later / Possible

Each of these is its own specification and design, outside 0.1 by scope.md section 2, and waits for a consumer that needs it:

- **RFC 9068 JWT access tokens** as an option beside opaque ones (scope.md decision 2).
- **Loopback redirect URIs with variable ports** for native and CLI apps (RFC 8252 §7.3; decision 3).
- **Logout**: RP-initiated, then back-channel. The grant model already identifies what a session issued, and revocation (decision 27) already ends one.
- **PAR (RFC 9126)**, client credentials, and pairwise subject identifiers.

## Not Planned

- Implicit and hybrid flows, the password grant, and PKCE `plain` (scope.md section 2, "Never supported").
- Tracking client assertion `jti` values (scope.md decision 23).
- A non-consuming refresh token lookup, unless a real client needs it (scope.md decision 20).
