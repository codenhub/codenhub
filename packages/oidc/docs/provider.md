---
title: Provider
description: Creating an OpenID Provider and its diagnostics, routing its endpoints, the authorization step, the token endpoint and its grants, userinfo, token revocation, the published metadata, and the CORS and error-response rules.
order: 2
---

# Provider

The provider is the OpenID Provider for one issuer. It answers the discovery, JWKS, token, userinfo and revocation endpoints itself, and it runs the authorization step in two calls the app makes from its own login and consent pages. The provider stores what it needs through the `OidcStore` you implement; see [Store](store.md).

Import it from `@codenhub/oidc/provider`:

```ts
import { createProvider, generateClientSecret, hashClientSecret, type OidcStore } from "@codenhub/oidc/provider";
```

## Creating a provider

`createProvider(options)` returns a frozen provider. It validates every option once, so a misconfiguration throws `TypeError` at startup and not on the first request. The message names the option and never its value.

```ts
import { generateKeyPair } from "@codenhub/jwt";
import { createProvider, type OidcStore } from "@codenhub/oidc/provider";

declare const store: OidcStore; // the app's database adapter
declare function lookupEmail(subject: string): Promise<string>;

export async function createSsoProvider() {
  return createProvider({
    issuer: "https://sso.example",
    signingKeys: [await generateKeyPair({ alg: "ES256", kid: "2026-10" })],
    store,
    claims: async ({ subject }) => ({ email: await lookupEmail(subject) }),
    scopes: { "read:orders": ["order_count"] },
  });
}
```

| Option         | Meaning                                                                                                                                                                | Default                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `issuer`       | The issuer identifier: an `https` URL of visible ASCII, with no query, fragment or credentials. It is used byte for byte in `iss`, and a trailing slash is kept there. | Required                    |
| `signingKeys`  | Key pairs from `generateKeyPair`, or from `importPrivateKey` and `importPublicKey`. See [Signing keys](#signing-keys).                                                 | Required                    |
| `store`        | Where clients, codes, tokens and interactions are kept. An object with every method of `OidcStore`. See [Store](store.md).                                             | Required                    |
| `claims`       | Returns the claims about a user for the scopes granted. See [Claims](#claims).                                                                                         | Required                    |
| `scopes`       | Extra scopes and the claims each releases, merged over the standard scopes. See [Scopes](#scopes).                                                                     | Standard scopes only        |
| `ttl`          | Token and interaction lifetimes in seconds. See [Lifetimes](#lifetimes).                                                                                               | See [Lifetimes](#lifetimes) |
| `endpoints`    | The URLs of the authorization, token, userinfo, JWKS and revocation endpoints. See [Endpoints](#endpoints).                                                            | Paths under the issuer      |
| `onDiagnostic` | Called with the reason each token, userinfo or revocation request is refused with an OAuth error response. See [Diagnostics](#diagnostics).                            | None                        |
| `now`          | The current time in milliseconds since the Unix epoch. For tests.                                                                                                      | `Date.now`                  |

`createProvider` throws `TypeError` when:

- The issuer is not an `https` URL of visible ASCII with no query, fragment or credentials.
- `signingKeys` is empty, is not an array of `{ privateKey, publicKey }` pairs, pairs a private and a public key of different algorithms, gives a pair's two keys different `kid`s, or repeats a `kid`.
- `store` is not an object, or one of its methods is not a function. The message names the first missing method, such as `store.findClient`.
- `claims` is not a function, or `now` or `onDiagnostic` is given and is not a function.
- A lifetime is outside its range, an endpoint is not an `https` URL, two endpoints share an origin and path, or `scopes` breaks the rules under [Scopes](#scopes).

### Signing keys

The first pair signs every ID token. Every public key in the list is published at the JWKS endpoint, so a key that is no longer used to sign stays verifiable while tokens it signed are still in circulation. To rotate, put the new pair first and keep the old pair after it until the ID tokens it signed have expired, which is `ttl.idToken` seconds after they were issued. Both keys of a pair carry the same `kid`, and the `kid` appears in each ID token's header, so a relying party can find the right key.

`importPrivateKey` and `importPublicKey` do not return keys. They return results, `{ ok, value }`, so unwrap each one and pair the two values yourself:

```ts
import { importPrivateKey, importPublicKey } from "@codenhub/jwt";

declare const privateJwk: unknown; // the private JWK, from the app's secret store
declare const publicJwk: unknown; // the public JWK, the same key published at the JWKS endpoint

const privateKey = await importPrivateKey(privateJwk, { alg: "ES256" });
const publicKey = await importPublicKey(publicJwk, { alg: "ES256" });
if (!privateKey.ok || !publicKey.ok) {
  throw new Error("The signing key could not be imported.");
}
const signingKeys = [{ privateKey: privateKey.value, publicKey: publicKey.value }];
```

The provider checks each pair's algorithm and `kid`, not that the two halves match. A pair built from the halves of two different key pairs issues ID tokens that nobody can verify, so pair only the two halves of one key pair.

Use one algorithm per pair. The provider publishes the algorithms of its keys as `id_token_signing_alg_values_supported`, and a relying party accepts only the asymmetric algorithms this package supports.

### Claims

`claims` is called by the userinfo endpoint, once per request, with what the access token grants:

```ts
// The argument is a ClaimsRequest.
{
  subject: "user-1", // the user the token was issued for
  clientId: "my-app", // the client the token was issued to
  scopes: ["openid", "profile"], // the scopes granted to this token
  claims: ["name", "family_name"], // the claim names those scopes release
}
```

It returns an object, or a promise of one, with the claims about the user. The package keeps only the names in `claims`, reading each as an own, enumerable data property, so a getter is never run. It then sets `sub` to `subject` last, so the callback cannot change which user the response is about. Claims for a scope the token does not hold are never returned, even when the callback has them.

If `claims` throws or rejects, the userinfo request rejects with the same error, so `handle` rejects too. The app's request handler must catch it, since the package does not turn a store or callback failure into a response. See [Store](store.md#errors).

### Scopes

The standard scopes release these claims, and a client may request them when its record lists them:

| Scope     | Claims released                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile` | `name`, `family_name`, `given_name`, `middle_name`, `nickname`, `preferred_username`, `profile`, `picture`, `website`, `gender`, `birthdate`, `zoneinfo`, `locale`, `updated_at` |
| `email`   | `email`, `email_verified`                                                                                                                                                        |
| `address` | `address`                                                                                                                                                                        |
| `phone`   | `phone_number`, `phone_number_verified`                                                                                                                                          |

`openid` and `offline_access` are protocol scopes. They release no claims and cannot be given claims of their own. `openid` is required for every sign-in, and `offline_access` is what makes the provider issue a refresh token.

The `scopes` option adds scopes, each mapped to the claim names it releases. A scope with the same name as a standard one replaces it. Each key must be a scope token, and not `openid` or `offline_access`, and each claim name must be a non-empty string other than `sub`. A request for a scope the provider does not define, or one the client's record does not list, is refused. See [Authorization](#the-authorization-step).

### Lifetimes

All values are seconds.

| `ttl` key      | Default             | Allowed range       | What it limits                                                                                       |
| -------------- | ------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `code`         | `60`                | 1 through 600       | An authorization code, from the moment the app completes the interaction.                            |
| `interaction`  | `1800`              | 60 through 86400    | An authorization request, from `beginAuthorization` until the app completes it.                      |
| `accessToken`  | `600`               | 60 through 86400    | An access token. It is also the `expires_in` the token endpoint returns.                             |
| `idToken`      | `600`               | 60 through 86400    | An ID token's `exp`, counted from when it is issued.                                                 |
| `refreshToken` | `2592000` (30 days) | 60 through 31536000 | A refresh token family, counted from the code exchange that started it. Rotation does not extend it. |

### Endpoints

The five endpoints the provider answers default to paths under the issuer. The discovery document is always at `{issuer}/.well-known/openid-configuration`, and it cannot be moved. The authorization, token, userinfo, JWKS and revocation endpoints are all configurable.

| `endpoints` key | Default              |
| --------------- | -------------------- |
| `authorization` | `{issuer}/authorize` |
| `token`         | `{issuer}/token`     |
| `userinfo`      | `{issuer}/userinfo`  |
| `jwks`          | `{issuer}/jwks`      |
| `revocation`    | `{issuer}/revoke`    |

Each value is an absolute `https` URL of visible ASCII (no spaces, control or non-ASCII characters, and no backslash, which the URL parser reads as a slash; use punycode hosts and percent-encoding), with no fragment or credentials, on any origin. The six URLs, including discovery, must each have their own origin and path, because `handle` tells endpoints apart by origin and path. The query string is ignored when a request is routed.

### The published metadata

`provider.metadata` is the discovery document, frozen. Every value comes from the options, so it cannot drift from what the endpoints enforce:

- `issuer`, the five endpoint URLs, and `scopes_supported`, which lists every scope the provider knows.
- `response_types_supported`: `["code"]`. `response_modes_supported`: `["query"]`.
- `grant_types_supported`: `["authorization_code", "refresh_token"]`. `subject_types_supported`: `["public"]`.
- `id_token_signing_alg_values_supported`: the algorithms of every published key.
- `token_endpoint_auth_methods_supported`: `client_secret_basic`, `client_secret_post`, `client_secret_jwt`, `private_key_jwt` and `none`. `token_endpoint_auth_signing_alg_values_supported`: `ES256`, `EdDSA`, `Ed25519`, `RS256`, `PS256` and `HS256`. The revocation endpoint publishes the same two lists as `revocation_endpoint_auth_methods_supported` and `revocation_endpoint_auth_signing_alg_values_supported`, and `revocation_endpoint` holds its URL.
- `claims_supported`: the ID token's claims and every claim the scopes release.
- `code_challenge_methods_supported`: `["S256"]`. `authorization_response_iss_parameter_supported`: `true`.
- `claims_parameter_supported`, `request_parameter_supported` and `request_uri_parameter_supported`: `false`, because the package does not implement them.

## Routing requests with handle

`provider.handle(request)` answers the five endpoints it owns. It returns a promise of a `Response`, or of `null` when the request is for none of them. It routes by method and by origin and path, and ignores the query, so a client may append parameters to the discovery URL.

| Endpoint   | Methods                  | Answer                                                                                   |
| ---------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| Discovery  | `GET`, `OPTIONS`         | The metadata as JSON, with `Cache-Control: public, max-age=300`.                         |
| JWKS       | `GET`, `OPTIONS`         | `{ "keys": [...] }`, the public keys as JWKs, with `Cache-Control: public, max-age=300`. |
| Token      | `POST`, `OPTIONS`        | The token response or an error. See [The token endpoint](#the-token-endpoint).           |
| Userinfo   | `GET`, `POST`, `OPTIONS` | The released claims or a bearer challenge. See [Userinfo](#userinfo).                    |
| Revocation | `POST`, `OPTIONS`        | `200` with no body, or an OAuth error. See [Token revocation](#token-revocation).        |

A method an endpoint does not accept is `405` with an `Allow` header. `HEAD` is not accepted by the discovery or JWKS endpoints, so it gets `405` too. The authorization endpoint is not one of the five, so `handle` returns `null` for it. The app serves that endpoint itself and calls `beginAuthorization` from it. `handle` never throws for a request. It rejects only when the store or the `claims` callback rejects.

The routing sketch below uses only `Request` and `Response`, as a plain Worker would. It answers the five endpoints from `handle` and passes everything else to the app's own authorization handler.

```ts
export default {
  async fetch(request: Request): Promise<Response> {
    const answered = await provider.handle(request);
    if (answered !== null) {
      return answered;
    }
    if (new URL(request.url).pathname === "/authorize") {
      return authorize(request);
    }
    return new Response("Not found.", { status: 404 });
  },
};
```

## The authorization step

The authorization endpoint is served by the app, because the user's login and consent happen there. The app calls `beginAuthorization` with the browser's request, then, once the user has signed in and granted what the client asked for, calls `completeAuthorization`. Between the two calls the request is an **interaction**.

### Starting: beginAuthorization

`provider.beginAuthorization(request)` validates an authorization request. It accepts a `GET`, whose parameters are in the query, or a `POST` with an `application/x-www-form-urlencoded` body. On success it saves the request as an interaction and returns it. On failure it returns a result whose `redirect` is either the response to return to the browser, or `null`:

```ts
async function authorize(request: Request): Promise<Response> {
  const begun = await provider.beginAuthorization(request);
  if (!begun.ok) {
    // A redirect goes back to the client. `null` means nothing could be verified, so the app renders its own error.
    return begun.error.redirect ?? new Response("Invalid authorization request.", { status: 400 });
  }
  // Keep begun.value.id in the user's server-side session, then show the login and consent page.
  return showLogin(begun.value.id);
}

declare function showLogin(interactionId: string): Response; // the app's login and consent page
```

The checks run in this order, and the first failure is the one reported. Failures before the client and its redirect URI are verified render an error; failures after are redirected to the client's registered redirect URI with `error`, `state` and `iss`, so the client can see why.

| Check                                                                                                                                             | Failure                                                                                        | `redirect` |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| The URL is at most 8192 characters.                                                                                                               | `invalid_request`                                                                              | `null`     |
| The method is `GET`, or `POST` with a form body. The body is at most 16384 bytes.                                                                 | `invalid_request`                                                                              | `null`     |
| The parameters parse: no duplicate, at most 32, none longer than 4096 characters.                                                                 | `invalid_request`, with `params.reason` of `duplicate`, `too_many` or `too_long`               | `null`     |
| `client_id` is present.                                                                                                                           | `invalid_request`, path `["client_id"]`                                                        | `null`     |
| The client is registered.                                                                                                                         | `unknown_client`                                                                               | `null`     |
| `redirect_uri` is present and is one of the client's registered URIs, byte for byte.                                                              | `invalid_redirect_uri`                                                                         | `null`     |
| No `request`, `request_uri` or `registration` parameter is present.                                                                               | `request_not_supported`, `request_uri_not_supported` or `registration_not_supported`           | Redirect   |
| `response_type` is present and is `code`.                                                                                                         | `invalid_request` with path `["response_type"]` when missing, else `unsupported_response_type` | Redirect   |
| `response_mode`, when present, is `query`.                                                                                                        | `invalid_request`, path `["response_mode"]`                                                    | Redirect   |
| `scope` contains `openid`, and every scope is one the provider defines and the client may request.                                                | `invalid_scope`                                                                                | Redirect   |
| `code_challenge` has the shape of an S256 challenge.                                                                                              | `invalid_request`, path `["code_challenge"]`                                                   | Redirect   |
| `code_challenge_method` is `S256`. `plain` is refused.                                                                                            | `invalid_request`, path `["code_challenge_method"]`                                            | Redirect   |
| `prompt`, when present, is one or more of `none`, `login`, `consent` and `select_account`, and `none` stands alone. A repeated value counts once. | `invalid_request`, path `["prompt"]`                                                           | Redirect   |
| `max_age`, when present, is at most nine digits.                                                                                                  | `invalid_request`, path `["max_age"]`                                                          | Redirect   |

On success the result carries the interaction:

- `id`, the identifier to pass to `completeAuthorization`. A random 256-bit value, and the store holds only its digest.
- `clientId`, `redirectUri`, `scopes` and `prompt`, as validated.
- `maxAge`, `loginHint` and `uiLocales`, when the request carried them. `loginHint` is passed through as sent. `uiLocales` has its empty entries, from repeated or trailing spaces, dropped; no entries left means absent. Both are within the length limit.
- `createdAt`, in seconds since the Unix epoch.

Keep `id` in the user's server-side session, or in a form field the app itself checks. Do not put it in a URL the user can edit, because whoever holds it can complete the interaction. The interaction lasts `ttl.interaction` seconds, 1800 by default, and it can be completed once.

### Prompt and max_age

The provider does not show pages, so the app enforces what the request asks for:

- `prompt=login`: the app must authenticate the user again for this request. `completeAuthorization` rejects a login that happened before the interaction was created, with `TypeError`.
- `prompt=consent`: the app must ask the user to consent, then pass the granted scopes.
- `prompt=select_account`: the app must let the user choose an account.
- `prompt=none`: the app must not show any page. If the user is not signed in, or consent is needed, the app completes the interaction with a denial such as `login_required`, `consent_required`, `interaction_required` or `account_selection_required`. The package does not check the user's session for `prompt=none`, so this is the app's responsibility.
- `max_age`: the app must not grant a login older than `max_age` seconds. `completeAuthorization` rejects an `authTime` older than that, with `TypeError`.

### Finishing: completeAuthorization

`provider.completeAuthorization(interactionId, outcome)` finishes the interaction. The app passes the `id` it kept and one of two outcomes:

```ts
// The user signed in and the granted scopes are the ones they consented to.
await provider.completeAuthorization(id, {
  subject: "user-1", // the user's identifier, which becomes `sub`
  authTime: Math.floor(Date.now() / 1000), // when the user authenticated, in seconds
  scopes: ["openid", "profile"], // a subset of the requested scopes, including openid
  amr: ["pwd"], // optional: authentication methods, such as ["pwd", "otp"]
  acr: "urn:example:loa:2", // optional: an authentication context class
});

// The user refused, or cannot be given the access the client asked for.
await provider.completeAuthorization(id, { error: "access_denied" });
```

A denial's `error` is one of `access_denied`, `login_required`, `consent_required`, `interaction_required` or `account_selection_required`, and it is the only other member the object may hold.

The result is an `OidcResult<Response>`. A grant or denial answers with a `302` to the interaction's redirect URI. A grant adds a `code`, which the client exchanges at the token endpoint, and a denial adds `error`. Both carry the `state` the client sent, when it sent one, and `iss`, the issuer, for RFC 9207. The registered redirect URI is kept byte for byte, and the parameters are appended to its existing query. `completeAuthorization` returns `interaction_not_found` as a failed result, with no redirect, when the identifier is empty or unknown, was already completed, or has expired. The app renders its own error for that case.

A code lasts `ttl.code` seconds, 60 by default, and the client can redeem it once.

The method throws `TypeError` in two cases, and they are different:

- **The outcome is the wrong shape**, such as a non-empty `subject` missing, an `authTime` that is not a non-negative integer, or a denial with extra members. This is checked before the interaction is taken, so the interaction is still usable and the app can fix the call and retry.
- **The outcome contradicts the request**: scopes the client did not request or no `openid`, an `authTime` in the future, an `authTime` before the interaction under `prompt=login`, or an `authTime` older than the requested `max_age`. The interaction has already been taken at this point, so it is gone. The app must restart the sign-in. These are bugs in the login flow, and the package refuses them rather than issue a code that would skip the step the client asked for.

## The token endpoint

The token endpoint answers `POST` with an `application/x-www-form-urlencoded` body. It refuses the request before doing any work when the method, content type or body is wrong, and then authenticates the client before it reads the grant.

### Requests

The checks run in this order:

1. The method. `OPTIONS` gets a preflight. Any other method but `POST` gets `405` with `Allow: POST, OPTIONS`.
2. The `Content-Type`. It must be `application/x-www-form-urlencoded`, optionally with `charset=utf-8`. Otherwise `invalid_request`.
3. The body. It is read as strict UTF-8 and is at most 16384 bytes. Otherwise `invalid_request`.
4. The parameters. No duplicate, at most 32, and none longer than 4096 characters. Otherwise `invalid_request`.
5. The client's credentials. See [Client authentication](#client-authentication).
6. The `grant_type`. Missing is `invalid_request`. A value other than `authorization_code` or `refresh_token` is `unsupported_grant_type`.
7. The grant. See [Authorization code](#authorization-code) and [Refresh tokens](#refresh-tokens).

### Client authentication

A token request presents its client's credentials one of four ways, and it must present exactly one. A request that carries more than one of the `Authorization` header, a `client_secret` and a `client_assertion` is `invalid_request`. The client must also be the one the provider registered for it, with the method it registered.

| Presented as                                                                                 | Requires                                                                                             | Checked against the record's `auth.method`                           |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `Authorization: Basic`, the client identifier and secret, form-encoded and joined by a colon | A well-formed header. A `client_id` in the body must equal the header's, or it is `invalid_request`. | `client_secret_basic`, by SHA-256 digest of the secret               |
| `client_id` and `client_secret` in the body                                                  | `client_id` in the body.                                                                             | `client_secret_post`, by SHA-256 digest of the secret                |
| `client_assertion` with `client_assertion_type` set to the JWT bearer type                   | `client_id` and `client_assertion_type` in the body.                                                 | `client_secret_jwt` or `private_key_jwt`, by verifying the assertion |
| Neither: only `client_id` in the body                                                        | `client_id` in the body.                                                                             | `none`                                                               |

The `Basic` scheme may be followed by one or more spaces before the credentials, as RFC 7235 allows. An `Authorization` header that does not authenticate the client is `invalid_client` with a `401`: a malformed Basic header, a header in another scheme such as `Bearer`, or an empty one. A failure of the check itself, whether an unknown client, a wrong secret, a wrong key or a method the client did not register, is the same `invalid_client` with a `401`. The two cases are not told apart, so a caller cannot learn which clients exist. Whenever the client was presented through the `Authorization` header and the check failed, the `401` carries `WWW-Authenticate: Basic realm="token"`, as RFC 6749 §5.2 asks. A request that combines the header with another credential is `invalid_request`, with no challenge.

A client secret is compared by its SHA-256 digest, in constant time. The record holds the digest from [hashClientSecret](#client-secrets), never the secret.

A client assertion is a JWT that the provider verifies with the client's key from the record. Its `iss` and `sub` must be the client identifier, and its `aud` must be the issuer or the token endpoint URL. It must carry a `jti`, and it must not be expired. Its `exp` may be at most 300 seconds ahead of the provider's clock, plus the 60-second clock tolerance that applies to `exp`, `nbf` and `iat`: an assertion whose `exp` is 360 seconds ahead is accepted, and one 361 seconds ahead is refused. The `jti` is not remembered, so an assertion may be replayed within that lifetime. This is by design: a replayed assertion alone gets nothing, since a code also needs its PKCE verifier and a refresh token is single use. Remembering every `jti` would cost each store a table and a write on every token request.

### Authorization code

A request for `authorization_code` must carry `code`, `redirect_uri` and `code_verifier`. A missing one is `invalid_request`. The checks that follow, in order:

1. The verifier has the shape RFC 7636 defines, 43 to 128 unreserved characters. Otherwise `invalid_grant`, and the code is **not** spent.
2. The code is redeemed atomically with `consumeCode`. An unknown or purged code is `invalid_grant`.
3. A code that was already redeemed is a **replay**. The provider revokes the grant the code belongs to, so every access token and refresh token issued from it stops working, and returns `invalid_grant`.
4. Otherwise the code is spent, and each of these checks returns `invalid_grant`: it has expired, it was issued to another client, its `redirect_uri` is not the one in the request, or the verifier's S256 digest is not its challenge. A failure here still burns the code, so a wrong verifier cannot be retried against the same code.

On success the provider starts a grant, and issues:

- An access token, an opaque random value that only its digest is stored under. It lasts `ttl.accessToken` seconds.
- A refresh token, only when the granted scopes include `offline_access`. Its family lasts `ttl.refreshToken` seconds from this exchange.
- An ID token, signed with the first signing key. Its claims are `iss`, `sub`, `aud` (the client identifier), `iat`, `exp` (`ttl.idToken` after `iat`), `auth_time`, `amr` and `acr` when the grant had them, `nonce` when the authorization request had one, and `at_hash` for the access token. Its header is `typ: JWT` and the key's `alg` and `kid`. An ID token carries no scope claims, which are released at userinfo.

### Refresh tokens

A request for `refresh_token` must carry `refresh_token`, or it is `invalid_request`. Each refresh token is single-use, and rotation replaces it:

1. The `scope` parameter, when given, must name only scopes the provider defines and the client may request, and it must include `openid`. Otherwise `invalid_scope`, and the token is not spent.
2. The token is spent atomically with `consumeRefreshToken`. An unknown or revoked token is `invalid_grant`, and it is not spent.
3. A token that was already spent is a **reuse**. The provider revokes the family, so the access tokens and refresh tokens issued from that sign-in stop working, and returns `invalid_grant`.
4. Otherwise the token is spent, and it must be unexpired and issued to this client. Otherwise `invalid_grant`.
5. The `scope` parameter, when given, must be a subset of the family's scopes. Otherwise `invalid_scope`. When it is omitted, the access token has every scope the family holds.
6. A new access token is issued, and a new refresh token that replaces the spent one. The new refresh token keeps the family's original scopes and its original expiry, so rotation neither widens the family nor extends it. An ID token is issued too, without a nonce.

The response has the same shape as the code exchange, with `scope` set to the scopes of the new access token.

A refresh token that is spent by a request for a scope its family does not hold is gone: the provider does not issue a new one, and the client must sign the user in again. The same is true of a refresh token that a different client presents, which is refused after it has been spent. Both checks need the token's record, and the store reads it only by spending it. A scope the provider or the client does not know is refused before the token is spent.

### Responses

A successful token response is JSON, with `Cache-Control: no-store` and `Pragma: no-cache`:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 600,
  "id_token": "...",
  "refresh_token": "...",
  "scope": "openid profile offline_access"
}
```

`refresh_token` is present only when a family was issued or rotated. Every error is a JSON object holding only the OAuth code, with no `error_description`. Its status depends on the code: `invalid_client` is `401`, `server_error` is `500`, and every other code is `400`.

## Userinfo

The userinfo endpoint answers `GET` and `POST`, and `OPTIONS` for a preflight. It reads the access token from the `Authorization` header only, in the form `Bearer` followed by one space and an RFC 6750 token. The scheme's letter case does not matter. A token in the body or the query is never read, so a credential does not land in a URL a proxy or a log keeps.

| Request                                                   | Answer                                                                                                                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `Authorization` header                                 | `401` with `WWW-Authenticate: Bearer`, and no error code, as RFC 6750 asks.                                                                                                                        |
| A header that is not a well-formed `Bearer` credential    | `400` with `WWW-Authenticate: Bearer error="invalid_request"`.                                                                                                                                     |
| A token that is unknown, expired, or from a revoked grant | `401` with `WWW-Authenticate: Bearer error="invalid_token"`.                                                                                                                                       |
| A valid access token                                      | `200` with the released claims as JSON, and `Cache-Control: no-store`.                                                                                                                             |
| A valid access token whose scopes do not include `openid` | `403` with `WWW-Authenticate: Bearer error="insufficient_scope"`, and `claims` is not called. Every token this provider issues has `openid`, so only records written outside it reach this answer. |

The lookup finds only access tokens. An ID token or a refresh token presented here is not found, so it gets `invalid_token`. The released claims are the names the token's scopes release, each taken from what the `claims` callback returns, and `sub` set to the token's subject. See [Claims](#claims).

## Token revocation

The revocation endpoint implements [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009). A client uses it to end a sign-in it no longer needs. It answers `POST` with an `application/x-www-form-urlencoded` body, and the client authenticates exactly as it does at the token endpoint. See [Client authentication](#client-authentication).

It reads two parameters:

- `token`, required: the access token or refresh token to revoke.
- `token_type_hint`, optional. The provider ignores it and looks up both kinds of token, which RFC 7009 allows.

Revoking either kind of token revokes its whole grant, so every access token and refresh token issued from that sign-in stops working. The provider does this through the store's `revokeGrant`, and the endpoint needs no other store method.

| Request                                                                          | Answer                                                                                                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token` missing or empty                                                         | `400`, `invalid_request`.                                                                                                                                                 |
| A token the store does not find: unknown, purged, or of an already revoked grant | `200`, with nothing revoked. The answer does not show whether the token existed.                                                                                          |
| An access token or refresh token the store holds, live or expired                | `200`, and its grant is revoked. The provider does not check `expiresAt` here, so an expired token the store still holds revokes its grant the same way a live one does.  |
| A refresh token already spent, of any client                                     | `200`, and its grant is revoked, since a spent token presented again is a replay.                                                                                         |
| A token issued to another client                                                 | `400`, `invalid_request`. An access token is left alone. A refresh token is spent and its grant is revoked, because a refresh token in another client's hands has leaked. |
| A method other than `POST` or `OPTIONS`                                          | `405`, with `Allow: POST, OPTIONS`.                                                                                                                                       |

Every answer carries the CORS headers described under [Cross-origin requests](#cross-origin-requests), and the `200` and `400` responses carry `Cache-Control: no-store`. Preflights are answered for any origin.

The package has no introspection endpoint. A resource server sees a revocation only by calling the userinfo endpoint. A resource server that accepts an access token without calling userinfo keeps accepting it until the token expires.

## Discovery and JWKS

Both are public documents and may be cached. They answer `GET`, with `Cache-Control: public, max-age=300`. The JWKS response is `{ "keys": [...] }`, holding the public half of every signing key as a JWK, so a relying party can verify the signatures. The keys are exported once and then served from memory, and a failed export is not kept, so the next request tries again.

## Cross-origin requests

The discovery, JWKS, token, userinfo and revocation endpoints answer any origin, with `Access-Control-Allow-Origin: *`, and they answer CORS preflights. This is safe because none of them reads cookies or any other ambient credential: a request is authorized only by what it carries itself, so a page on another origin can do nothing through them that a server could not do with the same credentials.

The authorization endpoint never receives CORS headers. The app serves it, so the app decides its headers, and the package adds none, which means a cross-origin page cannot read its response. The endpoint is meant for top-level navigation. Protecting it from requests that other sites trigger is the app's job, as [Hostile input](security.md) notes.

## Client secrets

A confidential client's secret is generated and stored by the provider in a form that cannot be used if the store leaks.

- `generateClientSecret()` returns a new secret: 256 bits from the Web Crypto random number generator, base64url-encoded into 43 characters. Give it to the client once.
- `hashClientSecret(secret)` returns a promise of the base64url SHA-256 digest of the secret. Store that as the record's `auth.secretHash`, and never the secret itself.

A single SHA-256 is enough here because the secret is 256 bits of randomness and cannot be guessed. It is not enough for a password a person chose, so never use one as a client secret: the hash would then be cheap to attack offline. `client_secret_jwt` is the exception. Its HMAC key must be the secret itself, so the record holds the `SecretKey` instead of a digest, and the store must keep that key protected.

## Errors

The provider answers a request with one of three kinds of error, and the kind follows the endpoint:

- **Authorization endpoint, before the client is verified:** the app renders the error, because the package cannot trust the request enough to send the browser anywhere. This is `beginAuthorization` with `redirect: null`.
- **Authorization endpoint, after the client is verified:** a `302` to the registered redirect URI, carrying `error`, `state` and `iss`. This is `beginAuthorization` with a `redirect`, and `completeAuthorization` for a denial.
- **Token and userinfo endpoints:** the OAuth error responses described above, which carry only the code.

No response carries `error_description`. The only request value an error response repeats is `state`, which the client sent to get it back. [Issues](errors.md) lists the codes each result can carry.

### Diagnostics

The token, userinfo and revocation endpoints tell the client only the OAuth error code, so a client cannot tell an expired code from a wrong verifier. `onDiagnostic` tells the operator why. It is set when the provider is created:

```ts
import { createProvider, type ProviderOptions } from "@codenhub/oidc/provider";

declare const options: ProviderOptions; // the options shown above

export const provider = createProvider({
  ...options,
  onDiagnostic: (diagnostic) => {
    console.warn(`OIDC ${diagnostic.endpoint} refused: ${diagnostic.reason}`, diagnostic.clientId ?? "");
  },
});
```

Each diagnostic is a frozen object with these members:

- `endpoint`: `token`, `userinfo` or `revocation`.
- `reason`: why the request was refused. The values are listed below.
- `status`: the HTTP status the client was sent.
- `clientId`: the client, when the provider learned it from the store: the authenticated client, a registered client whose authentication failed, or the client a presented token belongs to. It is absent when the request only named a client, such as an unknown one.

The reasons, grouped as in the provider's types:

| Group                                   | Reasons                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The request, before the client is known | `content_type`, `body`, `parameters`                                                                                                                                                                                                                                                                                                                                          |
| Client authentication                   | `client_credentials_missing`, `client_credentials_ambiguous`, `client_credentials_malformed`, `client_unknown`, `client_method_mismatch`, `client_credentials_wrong`                                                                                                                                                                                                          |
| The token request                       | `grant_type_missing`, `grant_type_unsupported`, `parameter_missing`, `code_verifier_malformed`, `code_unknown`, `code_replayed`, `code_expired`, `code_client_mismatch`, `redirect_uri_mismatch`, `code_verifier_mismatch`, `scope_invalid`, `refresh_token_unknown`, `refresh_token_replayed`, `refresh_token_expired`, `refresh_token_client_mismatch`, `scope_not_granted` |
| Userinfo                                | `access_token_missing`, `access_token_malformed`, `access_token_unknown`, `access_token_expired`, `access_token_without_openid`                                                                                                                                                                                                                                               |
| Revocation                              | `token_missing`, `token_of_another_client`                                                                                                                                                                                                                                                                                                                                    |

The callback is called once for each refusal that is answered with an OAuth error response, after the response is built and before `handle` resolves. A `405` for a method the endpoint does not accept, and an `OPTIONS` preflight, are not reported. Authorization failures are not reported either, since `beginAuthorization` and `completeAuthorization` return their issues. The diagnostic never holds a value the request carried: no token, code, verifier, secret or redirect URI.

The callback may return a promise. `handle` awaits it, so a slow callback delays the response. If it throws or its promise rejects, `handle` rejects, the same as for a store failure, so keep it from throwing. A value that is not a function makes `createProvider` throw `TypeError`.
