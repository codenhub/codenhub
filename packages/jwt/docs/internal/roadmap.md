---
status: DRAFT
last_updated: 2026-11-19
scope: What `@codenhub/jwt` needs before its 0.1.0 release.
---

# Roadmap

## Purpose

This records what stands between the implemented 0.0.1 and a 0.1.0 that `@codenhub/oidc` and the SSO application (Symbolon) build on. The scope and invariants are in [scope.md](scope.md); the design is in [architecture.md](architecture.md). It is a draft until the maintainer reviews it.

## Current Focus

0.1.0 is released when:

- **An audit has found no blocker.** A review of the package against scope.md section 3, with the hostile-input, leak, vector, interop, browser and workerd suites passing, and any finding that breaks an invariant fixed. Met: the audit's one blocker, unknown verifier options that silently turned a check off, is closed by decision 22, and its other defects are fixed with tests. It left nothing open; the release review of 0.1.0 is recorded in scope.md decisions 55 to 83.

Of what the SSO application plans, `importKeyPair` (decision 25) needed a change here, and it is in; so is DPoP support (decision 30), which neither it nor `@codenhub/oidc` now plans but other clients and servers need. A release review before 0.1.0 also added the remaining algorithms (decision 27), PEM import (decision 31), loopback `http:` JWKS URLs (decision 29), a 60-second floor of future leeway for `nbf` and `iat` (decision 26), and unknown options refused everywhere (decision 28). A release-readiness audit then made `exp` and a matching audience required by default (decision 32), and added `allowExpired` (33), `type` lists (34), the kid-less key fallback (35), a generic `sign` (36), `tokenHash` (14), stale-while-revalidate key sets with a seed and fetch callbacks (37 and 38) and a `waitUntil` hook for Workers (42), `LocalKeySet` (39), private-key thumbprints (40) and certificate import (41). A full audit then bound keys to their issuer for verifiers that serve several (decision 43), opened the issue codes to minor additions (44), bounded `sign`'s time claims to catch milliseconds (45), and moved the Linux WebKit Ed25519 retry into `generateKeyPair` (46), let a verifier choose its key set by the token's issuer (47), read PEMs flattened onto one line (48), imported Web Crypto keys, non-extractable ones included (49), and added `getPublicKey` (50). It deferred JWE to the next minor release, and a KMS signer until a consumer needs one; the 0.1 full audit then added that signer (decision 54), and compact JWE was brought into 0.1.0 (decisions 63 to 69). Its needs found so far land in `@codenhub/oidc` ([oidc's roadmap](../../../oidc/docs/internal/roadmap.md)). Should one of those designs need a primitive this package lacks, the change is proposed here rather than worked around there (oidc scope.md section 1).

## Planned

Nothing yet.

The changelog starts at 0.1.0 ([docs/changelog](../changelog/index.md)); there is no page for 0.0.1, the first release, which preceded any consumer.

## Later / Possible

Nothing yet.

## Not Planned

- **Unverified payload decoding.** Invariant 3.
- **`none`.** Permanently (invariant 2).
- **JWS JSON serialization and RFC 7797 unencoded payloads for JWTs.** RFC 7519 and RFC 7797 keep JWTs compact and encoded; other payloads have them through `signJws`, `signGeneralJws` and `createJwsVerifier` (scope.md decision 70).
- **JWE JSON serialization, `zip`, `RSA1_5`, `PBES2-*` and 192-bit AES.** Decision 63.
- **OIDC-specific checks** (`nonce`, `azp`, `at_hash`, `c_hash`). They belong in `@codenhub/oidc` (decisions 7 and 14).

## Notes

- **`@codenhub/oidc` is not a release criterion.** It is built on `KeySet`, `VerifiedJwt`, the key unions and the issue codes without needing a breaking change here.
- **The SSO application's signing keys** are generated with `generateKeyPair`, persisted with `exportPrivateJwk`, loaded again with `importKeyPair` (decision 25), and encrypted at rest by the application with Web Crypto directly, so no JWE is needed for it. It chooses its own `kid` values, or uses `jwkThumbprint` for them; the same helper gives the `jkt` a DPoP-bound token carries (decision 30).
