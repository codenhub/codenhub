---
status: DRAFT
last_updated: 2026-10-16
scope: What `@codenhub/jwt` needs before its 0.1.0 release.
---

# Roadmap

## Purpose

This records what stands between the implemented 0.0.1 and a 0.1.0 that `@codenhub/oidc` can build against. The scope and invariants are in [scope.md](scope.md); the design is in [architecture.md](architecture.md). It is a draft until the maintainer reviews it.

## Current Focus

0.1.0 is released when:

- **The judgment calls are settled.** Every item under "Pending maintainer confirmation" in [scope.md](scope.md#pending-maintainer-confirmation) is confirmed and moved to the approved list, or rejected and changed in code and public docs.
- **An audit has found no blocker.** A review of the package against scope.md section 3, with the hostile-input, leak, vector, interop, browser and workerd suites passing, and any finding that breaks an invariant fixed.
- **`@codenhub/oidc` has been sketched against the public types**, enough to confirm that `KeySet`, `VerifiedJwt`, the key unions and the issue codes do not need a breaking change for the relying-party and provider flows (scope.md section 6, "0.1 is done when").

## Planned

- **A changelog from 0.1.0**, opened by `hub release --cut` with the release, per `docs/specs/packages-changelog.md`. There is no page for 0.0.1, the first release, published before the package had consumers.
- **The generated API reference** (`codenhub.docs.reference`), once the TSDoc has been reviewed for consumer wording, so the reference and the hand-authored docs say the same thing.

## Later / Possible

- **JWE**, if encrypted ID tokens turn out to be needed (scope.md section 2).
- **More algorithms**, such as `ES384`, `ES512` or `RS512`, if an issuer `oidc` must support requires one. Each is one row in the algorithm table plus vectors.

## Not Planned

- **Unverified payload decoding.** Invariant 3.
- **`none`, JWS JSON serialization and RFC 7797 unencoded payloads.** Out of scope for 0.1 (scope.md section 2), and `none` permanently (invariant 2).
- **OIDC-specific checks** (`nonce`, `azp`, `at_hash`, `c_hash`). They belong in `@codenhub/oidc` (decision 7, pending item 4).
