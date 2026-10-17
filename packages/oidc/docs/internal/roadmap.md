---
status: DRAFT
last_updated: 2026-10-16
scope: What `@codenhub/oidc` needs between 0.0.1 and its 0.1.0 release.
---

# Roadmap

## Purpose

This records what stands between the 0.0.1 implementation and a 0.1.0 the SSO application can build on. The scope, invariants and decisions are in [scope.md](scope.md); the design is in [architecture.md](architecture.md). It is a draft until the maintainer reviews it.

## Current Focus

0.0.1 is released when the criteria of scope.md section 7 hold: the authorization code flow works end to end, this client against this provider, on Node.js and workerd; every invariant has tests; the hostile-input and leak suites pass. Before the first publish, the maintainer reviews the decisions scope.md section 8 lists as pending.

## Planned

0.1.0 is released when scope.md section 7 "0.1 is done when" holds:

- **Interop with panva's libraries**, as devDependencies only: this client against `oidc-provider`, and this provider against `openid-client`. The second is the first check that the provider's discovery document, token responses and error codes match what a widely used relying party expects.
- **The OpenID conformance suite.** The provider passes the Basic OP and Config OP plans; the client runs the RP tests where practical. The plans need a provider reachable from the suite's runner, so a small deployable host (a Worker, or a Node.js server) comes with this item. Discovery's `id_token_signing_alg_values_supported` must list `RS256` for the Config OP plan, so the conformance host signs with an RS256 key.
- **Token revocation (RFC 7009).** The store already revokes by grant; the endpoint needs a revoke-by-token method on the store, which is a breaking change to `OidcStore` and so belongs before 0.1.
- **Client assertion replay.** `private_key_jwt` and `client_secret_jwt` assertions are not tracked by `jti`, so one can be replayed within its lifetime, and the provider does not cap that lifetime. Tracking needs a store method, so it is also a breaking change to `OidcStore` and belongs before 0.1.
- **A store conformance suite**, exported from `@codenhub/oidc/testing` and runnable with any test runner, so the SSO application's D1 or Postgres adapters are checked against the same rules as the memory store (scope.md section 5).
- **Diagnostics for operators.** Token and authorization failures answer with a bare OAuth code by design, which leaves an operator nothing to debug with. An optional callback receiving the internal reason (never an input value) would close that gap.
- **The generated API reference** (`codenhub.docs.reference`), once the TSDoc has been reviewed for consumer wording.

## Later / Possible

- **A non-consuming refresh token lookup**, so a refresh with a widened scope or from another client does not burn the family's token (scope.md decision 20), if real clients turn out to send such requests.

- **RFC 9068 JWT access tokens** as an option beside opaque ones (scope.md decision 2).
- **Loopback redirect URIs with variable ports** for native and CLI apps (RFC 8252 §7.3; decision 3).
- **Logout**: RP-initiated, then back-channel. The grant model already identifies what a session issued.
- **PAR (RFC 9126)**, client credentials, and pairwise subject identifiers, as scope.md section 2 lists them.

## Not Planned

- Implicit and hybrid flows, the password grant, and PKCE `plain` (scope.md section 2, "Never supported").
