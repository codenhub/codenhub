---
status: DRAFT
last_updated: 2026-11-27
scope: What `@codenhub/oidc` needs between 0.0.1 and its 0.1.0 release.
---

# Roadmap

## Purpose

This records what stands between 0.0.1 and a 0.1.0 the SSO application (Symbolon) can build on. The scope, invariants and decisions are in [scope.md](scope.md); the design is in [architecture.md](architecture.md). It is a draft until the maintainer reviews it.

Many items below change a contract: a record the store persists, a client record field, an option, or a recorded decision. Each is a proposal until the maintainer approves it, and its approval is recorded in scope.md section 8 with its reasons and the alternatives it rejected. An item that reverses a decision names what that decision did not weigh, as `docs/guidelines/documentation.md` asks.

## Current Focus

The SSO application is the package's first real consumer, and a review of its scope against this package found what it needs and the package lacks. The order follows the SSO application's own roadmap.

- **The OpenID conformance plans ran**, the client's RP plans as well, and the provider passes them but for the one module argued below ("The OpenID conformance suite"). Every change the review found is built, and scope.md decisions 47 to 56 record them; the record shapes are settled before the SSO application writes its `OidcStore` adapters. What its data API needs is built too: `authenticate`, `accessTokenClaims` and resource indicators on both sides, in decisions 57 to 59, its privacy asks for pairwise subjects, in decision 60, and its audit for the refused request in `onDiagnostic`, in decision 61. It builds on `@codenhub/jwt` 0.1.0. The client passes the RP plans too. What is left before 0.1 is the release (below).

## Planned

### The OpenID conformance suite

The target was that the provider passes the Basic OP and Config OP plans, and it does. Both plans ran on 2026-11-26 on the certification suite, against [`packages/oidc/conformance`](../../conformance/docs/runbook.md) deployed from `main` at `faa666c2` with the host's login page added, @codenhub/oidc 0.0.1 in `package.json` and unreleased:

- **Config OP** (plan `EDo9oul75c76q`): passed.
- **Basic OP** (plan `NXWZdJ2wDezl7`): 26 of 35 modules passed. `oidcc-ensure-request-without-nonce-succeeds-for-code-flow` failed, as argued below. Four modules end in REVIEW with the screenshot the suite captured, the second login of `oidcc-prompt-login` and `oidcc-max-age-1` and the error page for an unregistered redirect URI in two more. Three warn: userinfo refuses a token in the body (Notes), the ID token has no `acr` because the host passes none, and `oidcc-claims-essential` asks through the `claims` parameter, which discovery says is unsupported. The request object module skips on `request_not_supported`. The runbook's "What to expect" has each.

No module failed for a reason that is a provider defect, so the run found nothing to change in the package.

The client's RP plans, which section 7 of scope.md asks for where practical, ran on 2026-11-27 from [`src/rp-run.ts`](../../conformance/src/rp-run.ts), on `main` at `2c4c5ce5` with that script added. The suite's provider never calls the relying party, so the script plays the browser and the client from one machine and nothing is deployed. They ran before the release because a client defect found after it would stay in a version that cannot be replaced:

- **Basic RP** (plan `a99mjrzUIkMz4`): 13 of 14 modules passed, and each module that sends a bad ID token or userinfo response was refused for the reason it tests.
- **Config RP** (plan `KMoHMpn7sh2d1`): 5 of 6 modules passed, the key rotation among them.
- In both, `oidcc-client-test-idtoken-sig-none` skips: the client refuses an unsigned ID token, which the suite accepts.

No module found a client defect. The runbook's "What to expect from the RP plans" has each module's outcome. Discovery's `id_token_signing_alg_values_supported` must list `RS256` for the Config OP plan, so the conformance host signs with an RS256 key. That key is this plan's, not a recorded decision; scope.md decisions 30 and 39 record only that the run waits for a deployable host and stays the 0.1 criterion.

**PKCE.** Most modules of the Basic OP plan send no `code_challenge`, so the suite's clients are registered with `requirePkce: false` (scope.md decision 52), and one control client keeps it on; the host fails if the control client accepts a request without PKCE. `oidcc-ensure-request-without-nonce-succeeds-for-code-flow` sends neither PKCE nor a `nonce` and is a known failure, argued in the certification submission.

### Release

- **No release before 0.1.0.** Everything after 0.0.1 reaches npm in 0.1.0, including the 60-second client clock tolerance (decision 44) and the expired `id_token_hint` at logout (decision 45), which the SSO application installs from npm. A 0.0.2 now would carry every breaking change since 0.0.1 without the conformance run behind it, and the SSO application would adopt that shape. Revisit only if the SSO application is blocked on a fix before the run.
- **What the SSO application finds next.** 0.0.1 aimed to be the last release before a breaking change (`docs/specs/packages-lifecycle.md`, "Versioning"). What the first look at the consumer found is built, as scope.md decisions 47 to 61 record; a change building it shows the public API needs ships in the release that makes it, as a breaking change if it is one. 0.1.0 is the judgment that the SSO application builds on the package without such changes.
- **A changelog from 0.1.0**, opened by `hub release --cut` with the release, per `docs/specs/packages-changelog.md`. An adapter or app written for 0.0.1 breaks in ways the page must mark, each with what to do: `engines.node` is `>=26`; the `@codenhub/jwt` peer is `^0.1.0`; `secretHash` is `secretHashes` (decision 48); `client_secret_jwt` takes `keys` rather than `key` (decision 82); `CodeRecord.maxAgeRequested` is gone (decision 71); saves must reject an existing key and `findClient` matches byte for byte (decisions 29 and 68); a client assertion's `aud` is the issuer alone (decision 66); `createProvider` refuses unknown options and a non-canonical issuer or endpoint (decisions 95 and 96); `refresh` takes `previous` rather than `subject` (decision 92); `callback` results carry `parameters`, and `ProviderDiagnostic` carries `grantId` and `subject` and reports `token_revoked` with status 200 (decisions 78 and 89); a signed userinfo response without `iss` or `aud` is refused (decision 97).

- **The 0.1 release review.** Its fixes and the contracts it settled are built, as scope.md decisions 66 to 75 record.

- **The full audit.** Its fixes are built, as scope.md decisions 76 to 97 record, and so is the move to `@codenhub/jwt` 0.1.0 it waited on: `verifyIdTokenHint` passes `audience: false` and `allowExpired` (decision 45), the userinfo verifier `audience: false` and `requireExpiration: false`, since a signed userinfo response need carry neither `aud` nor `exp`, `computeTokenHash` gave way to `@codenhub/jwt`'s `tokenHash`, both algorithm lists, the client's `ID_TOKEN_ALGORITHMS` and the provider's in `client-record.ts`, gained the algorithms 0.1.0 adds ([#607](https://github.com/codenhub/codenhub/issues/607)), and the workerd suite loads every file of the jwt build, which 0.1.0 splits per module. What remains is the conformance run above.

## Later / Possible

- **A client assertion without `client_id`** ([#615](https://github.com/codenhub/codenhub/issues/615)). It only accepts requests the provider refuses today, so it is not breaking and comes after 0.1.0. It revises scope.md decision 15, which waits for the maintainer's approval of the change itself.

Pairwise subject identifiers shipped as the `subjectTypes` option (scope.md decision 60).

## Not Planned

- Implicit and hybrid flows, the password grant, and PKCE `plain` (scope.md section 2, "Never supported").
- Tracking client assertion `jti` values (scope.md decision 23).
- A non-consuming refresh token lookup, unless a real client needs it (scope.md decision 20).
- Loopback redirect URIs with variable ports, PAR, front-channel logout and session management. Each waits for a consumer and its case (scope.md decision 38). Back-channel logout shipped (decision 53), and so did pairwise subjects (decision 60).
- Device flow, CIBA, DPoP, mTLS, dynamic client registration, request objects, JWE-encrypted tokens and token introspection (scope.md section 2).

## Notes

- **Userinfo reads the token only from the `Authorization` header.** The Basic OP plan's `oidcc-userinfo-post-body` warns on the `401` rather than failing (2026-11-26 run), so nothing changes: RFC 6750 §2.2 makes the body method optional, and a token in a form body is where logs and caches see it.
- **The SSO application's docs are behind this package.** Its scope says 0.0.1 has no logout support, and the first step of its roadmap is logout here. 0.0.1 has RP-initiated logout (decision 37), and back-channel logout is built (decision 53).

## References

- [The SSO application's scope](https://github.com/codenhub/symbolon/blob/main/docs/scope.md) and [roadmap](https://github.com/codenhub/symbolon/blob/main/docs/roadmap.md).
- PKCE in the conformance plans, from other providers' runs: [hearth-auth/hearth#780](https://github.com/hearth-auth/hearth/issues/780), [fells-code/seamless-auth-oidc-provider#29](https://github.com/fells-code/seamless-auth-oidc-provider/pull/29), [Tjeerd-menno/open-identity-stack#303](https://github.com/Tjeerd-menno/open-identity-stack/issues/303), [clavis-id/clavis#45](https://github.com/clavis-id/clavis/pull/45).
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html).
