---
status: DRAFT
last_updated: 2026-11-12
scope: What `@codenhub/jwt` needs before its 0.1.0 release.
---

# Roadmap

## Purpose

This records what stands between the implemented 0.0.1 and a 0.1.0 that `@codenhub/oidc` and the SSO application (Symbolon) build on. The scope and invariants are in [scope.md](scope.md); the design is in [architecture.md](architecture.md). It is a draft until the maintainer reviews it.

## Current Focus

0.1.0 is released when:

- **An audit has found no blocker.** A review of the package against scope.md section 3, with the hostile-input, leak, vector, interop, browser and workerd suites passing, and any finding that breaks an invariant fixed. No such audit is recorded yet.

Nothing the SSO application plans needs a change here. Its needs found so far land in `@codenhub/oidc` ([oidc's roadmap](../../../oidc/docs/internal/roadmap.md)). Should one of those designs need a primitive this package lacks, the change is proposed here rather than worked around there (oidc scope.md section 1).

## Planned

- **The generated API reference** (`codenhub.docs.reference`), once the TSDoc has been reviewed for consumer wording, so the reference and the hand-authored docs say the same thing. `@codenhub/oidc` already has one; this package does not.
- **A changelog from 0.1.0**, opened by `hub release --cut` with the release, per `docs/specs/packages-changelog.md`. There is no page for 0.0.1, the first release, which precedes any consumer.

## Later / Possible

- **JWE**, if encrypted ID tokens turn out to be needed (scope.md section 2).
- **More algorithms**, such as `ES384`, `ES512` or `RS512`, if an issuer `oidc` must support, or a client authenticating to the SSO application with `private_key_jwt`, requires one. Each is one row in the algorithm table plus vectors.

## Not Planned

- **Unverified payload decoding.** Invariant 3.
- **`none`, JWS JSON serialization and RFC 7797 unencoded payloads.** Out of scope for 0.1 (scope.md section 2), and `none` permanently (invariant 2).
- **OIDC-specific checks** (`nonce`, `azp`, `at_hash`, `c_hash`). They belong in `@codenhub/oidc` (decisions 7 and 14).

## Notes

- **The criterion "`@codenhub/oidc` has been sketched against the public types" is met.** `@codenhub/oidc` 0.0.1 is built on `KeySet`, `VerifiedJwt`, the key unions and the issue codes without needing a breaking change here, so it is no longer a release criterion.
- **The SSO application's signing keys** are generated with `generateKeyPair`, persisted with `exportPrivateJwk`, and encrypted at rest by the application with Web Crypto directly, so no JWE is needed for it. It chooses its own `kid` values; an RFC 7638 thumbprint helper is not needed for that.
