---
status: DRAFT
last_updated: 2026-10-17
scope: What `@codenhub/oidc` needs between 0.0.1 and its 0.1.0 release.
---

# Roadmap

## Purpose

This records what stands between 0.0.1 and a 0.1.0 the SSO application can build on. The scope, invariants and decisions are in [scope.md](scope.md); the design is in [architecture.md](architecture.md). It is a draft until the maintainer reviews it.

## Current Focus

0.0.1 is the first publish, and its purpose is to find out whether the package holds up in the SSO application. The criteria of scope.md section 7 hold: the authorization code flow works end to end, this client against this provider, on Node.js and workerd; every invariant has tests; the hostile-input, leak and interop suites pass. The release audit of 2026-10-17 settled every deferred item: client credentials, JWT access tokens and RP-initiated logout ship in 0.0.1 (scope.md decisions 35 to 37), and the other four are not planned (decision 38).

## Planned

0.1.0 is released when scope.md section 7 "0.1 is done when" holds:

- **The OpenID conformance suite.** The provider passes the Basic OP and Config OP plans; the client runs the RP tests where practical. The plans need a provider reachable from the suite's runner, so a small deployable host (a Worker, or a Node.js server) comes with this item. Discovery's `id_token_signing_alg_values_supported` must list `RS256` for the Config OP plan, so the conformance host signs with an RS256 key (scope.md decisions 30 and 39).
- **What the SSO application finds.** Changes the first real consumer shows the public API needs, before it freezes at 0.1.
- **A changelog from 0.1.0**, opened by `hub release --cut` with the release, per `docs/specs/packages-changelog.md`.

## Later / Possible

None. The two candidates the scope named shipped: token revocation (scope.md decision 27) and JWT access tokens (decision 36). Device flow, CIBA, DPoP and mTLS are out of scope by scope.md section 2, and decision 38 moved four items to Not Planned.

## Not Planned

- Implicit and hybrid flows, the password grant, and PKCE `plain` (scope.md section 2, "Never supported").
- Tracking client assertion `jti` values (scope.md decision 23).
- A non-consuming refresh token lookup, unless a real client needs it (scope.md decision 20).
- Loopback redirect URIs with variable ports, PAR, pairwise subject identifiers, and front-channel or back-channel logout and session management. Each waits for a consumer and its case (scope.md decision 38).
- Device flow, CIBA, DPoP, mTLS, dynamic client registration, request objects, JWE-encrypted tokens and token introspection (scope.md section 2).
