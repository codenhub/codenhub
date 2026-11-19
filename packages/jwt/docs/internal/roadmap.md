---
status: DRAFT
last_updated: 2026-11-18
scope: What `@codenhub/jwt` needs before its 0.1.0 release.
---

# Roadmap

## Purpose

This records what stands between the implemented 0.0.1 and a 0.1.0 that `@codenhub/oidc` and the SSO application (Symbolon) build on. The scope and invariants are in [scope.md](scope.md); the design is in [architecture.md](architecture.md). It is a draft until the maintainer reviews it.

## Current Focus

0.1.0 is released when:

- **An audit has found no blocker.** A review of the package against scope.md section 3, with the hostile-input, leak, vector, interop, browser and workerd suites passing, and any finding that breaks an invariant fixed. Met: the audit's one blocker, unknown verifier options that silently turned a check off, is closed by decision 22, and its other defects are fixed with tests. What it left open is under "Later / Possible".

Of what the SSO application plans, `importKeyPair` (decision 25) and DPoP support (decision 30) need changes here, and both are in. A release review before 0.1.0 also added the remaining algorithms (decision 27), PEM import (decision 31), loopback `http:` JWKS URLs (decision 29), a 60-second floor of future leeway for `nbf` and `iat` (decision 26), and unknown options refused everywhere (decision 28). Its needs found so far land in `@codenhub/oidc` ([oidc's roadmap](../../../oidc/docs/internal/roadmap.md)). Should one of those designs need a primitive this package lacks, the change is proposed here rather than worked around there (oidc scope.md section 1).

## Planned

None at present. The changelog starts at 0.1.0 ([docs/changelog](../changelog/index.md)); there is no page for 0.0.1, the first release, which preceded any consumer.

## Later / Possible

- **JWE**, if encrypted ID tokens turn out to be needed (scope.md section 2).

## Not Planned

- **Unverified payload decoding.** Invariant 3.
- **`none`, JWS JSON serialization and RFC 7797 unencoded payloads.** Out of scope for 0.1 (scope.md section 2), and `none` permanently (invariant 2).
- **OIDC-specific checks** (`nonce`, `azp`, `at_hash`, `c_hash`). They belong in `@codenhub/oidc` (decisions 7 and 14).

## Notes

- **`@codenhub/oidc` is not a release criterion.** It is built on `KeySet`, `VerifiedJwt`, the key unions and the issue codes without needing a breaking change here.
- **The SSO application's signing keys** are generated with `generateKeyPair`, persisted with `exportPrivateJwk`, loaded again with `importKeyPair` (decision 25), and encrypted at rest by the application with Web Crypto directly, so no JWE is needed for it. It chooses its own `kid` values, or uses `jwkThumbprint` for them; the same helper gives the `jkt` a DPoP-bound token carries (decision 30).
