---
title: Client
description: Discovering a provider, creating a relying-party client, starting and finishing a sign-in, refreshing tokens, fetching userinfo, and authenticating to the token endpoint.
order: 1
---

# Client

The client is the relying party for one provider and one registered client. It is created from the provider's metadata, and it holds no per-user state: everything one sign-in needs between the redirect and the callback is in the `pending` value the application keeps.

Import it from `@codenhub/oidc/client`:

```ts
import { createClient, discover } from "@codenhub/oidc/client";
```

## Discovering the provider

`discover(issuer, options?)` fetches the provider's discovery document and checks it. It returns the metadata, which `createClient` needs. You can also write the metadata by hand for a provider that has no discovery document, and `createClient` checks it as strictly.

```ts
const discovered = await discover("https://login.example.com");
if (!discovered.ok) {
  for (const issue of discovered.error.issues) {
    console.error(issue.code, issue.path);
  }
} else {
  console.log(discovered.value.authorization_endpoint);
}
```

The document is requested from `{issuer}/.well-known/openid-configuration`. A trailing slash on the issuer is removed before the well-known path is added, and an issuer with a path keeps that path. The request does not follow redirects. Its response must be a `200` with a JSON object of at most 65536 bytes, and it must finish within the timeout. The document's `issuer` member must equal the issuer you passed, byte for byte, so a document served for another issuer is refused.

| Option    | Meaning                                                                                  | Default            |
| --------- | ---------------------------------------------------------------------------------------- | ------------------ |
| `fetch`   | The `fetch` to call. It is looked up on each call when you omit it.                      | `globalThis.fetch` |
| `timeout` | Seconds to wait for the whole request, including the body. An integer from 1 through 60. | `5`                |

`discover` returns a failed result, with no exception, for every failure of the network, the response or the document:

- `request_failed` with `params.reason` of `timeout`, `network`, `status` (with `params.status`, for any response other than `200`, including redirects), `content_type` (a `200` that is not JSON), `too_large` or `malformed` (a body that is not a JSON object). `params.endpoint` is `discovery`.
- `issuer_mismatch` when the document's `issuer` is not the issuer you passed.
- `invalid_metadata` for each member that is missing or invalid, with its path, such as `["metadata", "jwks_uri"]`. Every such member is reported in one result.

Only a bad argument throws `TypeError`: an issuer that is not an `https` URL or has a query, `options` that is not an object, a `fetch` that is not a function, or a timeout outside 1 through 60.

Cache the metadata, or the client, rather than calling `discover` on every sign-in. A provider's discovery document changes rarely, and each call is a request.

## Creating a client

`createClient(options)` returns a frozen client. It makes no request, and it throws `TypeError` when an option is invalid, so a misconfigured client never starts. Its message names the option and never its value.

```ts
const client = createClient({
  metadata: discovered.value,
  clientId: "my-app",
  redirectUri: "https://app.example.com/callback",
  auth: { method: "none" },
});
```

| Option           | Meaning                                                                                                                                                                                                                                                                                                                | Default            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `metadata`       | The provider's metadata, from `discover` or written by hand. Checked as strictly as a fetched document.                                                                                                                                                                                                                | Required           |
| `clientId`       | The client identifier the provider registered. A non-empty string.                                                                                                                                                                                                                                                     | Required           |
| `redirectUri`    | The redirect URI registered for this client. Sent with every authorization request and token request. An absolute URI of visible ASCII (no spaces, control or non-ASCII characters; use punycode hosts and percent-encoding), with no fragment or credentials, and not `javascript:`, `data:`, `vbscript:` or `file:`. | Required           |
| `auth`           | How the client authenticates to the token endpoint. See [Client authentication](#client-authentication).                                                                                                                                                                                                               | Required           |
| `fetch`          | The `fetch` for the token, userinfo and JWKS requests. Looked up on each call when you omit it.                                                                                                                                                                                                                        | `globalThis.fetch` |
| `timeout`        | Seconds to wait for each response, including its body, before failing. An integer from 1 through 60.                                                                                                                                                                                                                   | `5`                |
| `clockTolerance` | Seconds of clock skew allowed on the ID token's `exp`, `iat` and `auth_time`. An integer from 0 through 300.                                                                                                                                                                                                           | `0`                |
| `now`            | The current time in milliseconds since the Unix epoch. For tests.                                                                                                                                                                                                                                                      | `Date.now`         |

The client accepts an ID token only when its signature verifies with one of the provider's keys, and only with an asymmetric algorithm the provider advertises in `id_token_signing_alg_values_supported` that this package supports: `ES256`, `EdDSA`, `Ed25519`, `RS256` or `PS256`. An ID token signed with `HS256` or `none` is never accepted. The keys come from the provider's `jwks_uri`, which the client fetches on first use and caches.

`createClient` throws `TypeError` when:

- The issuer in `metadata` is not an own data property holding an `https` URL of visible ASCII with no query, fragment or credentials, or the metadata is not valid. The message names the first invalid member.
- `auth.method` is not one of the five methods, or it is not in `metadata.token_endpoint_auth_methods_supported` when the provider lists those.
- `auth.key` is not a key of the kind the method needs, or `auth.secret` is empty.
- An option is missing or out of range.

## Starting a sign-in

`client.authorize(options?)` builds the authorization request. It returns a promise of `{ url, pending }`: redirect the browser to `url`, and keep `pending` for the callback. Calling it with no options requests `openid` alone.

```ts
const { url, pending } = await client.authorize({
  scope: ["openid", "profile", "email"],
  prompt: ["login"],
  maxAge: 300,
});
```

| Option      | Meaning                                                                                                                                                                      | Default      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `scope`     | Scopes to request, as a non-empty array of at most 100 scope tokens, at most 4096 characters when joined with spaces. It must include `openid`. Duplicates are removed.      | `["openid"]` |
| `prompt`    | Whether the provider must, or must not, show its pages: `none`, `login`, `consent` or `select_account`. `none` must stand alone, and a value may not repeat.                 | None sent    |
| `maxAge`    | The most seconds that may pass since the user last authenticated, as a non-negative integer. When set, the ID token must carry `auth_time`, and the callback checks its age. | None sent    |
| `loginHint` | A hint about the account to sign in with, such as an email address. A string.                                                                                                | None sent    |
| `uiLocales` | Preferred languages for the provider's pages, as at most 100 BCP 47 tags, each without spaces.                                                                               | None sent    |

The URL is the provider's authorization endpoint with the request's parameters added to any query it already has: `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `nonce`, `code_challenge` with `code_challenge_method=S256`, and whichever optional parameters you set. The `state`, `nonce` and PKCE verifier are random values from `crypto.getRandomValues`, generated for each call.

`authorize` rejects with `TypeError` for an invalid option, such as a scope list without `openid` or a `prompt` value it does not know. A refused request leaves nothing behind, since everything is validated before any value is generated.

## Keeping `pending`

`pending` is a `PendingAuthorization`:

- `state`, a random value the callback must echo back.
- `nonce`, a random value the ID token must carry.
- `codeVerifier`, the PKCE verifier that redeems the code.
- `maxAge`, present only when you requested one.

It is plain JSON, so `JSON.stringify` and `structuredClone` preserve it. Keep it where the user's browser cannot read or change it: a server-side session, or an encrypted, `HttpOnly` cookie. Treat it as a secret, because the verifier redeems the code. Discard it after the callback, whether the callback succeeded or failed, so a second callback cannot use the same values.

The callback checks the shape of `pending`, and a malformed value throws `TypeError`, since the application stored it and a bad value is a bug in the application.

## Finishing a sign-in

`client.callback(url, pending)` takes the URL the browser was redirected to, as a string or a `URL`, and the `pending` you kept. It returns a promise of a result. On success the value is a `SignIn`:

- `claims`, the validated ID token's claims, frozen.
- `tokens`, a `TokenSet` with `idToken` always present.

```ts
const signedIn = await client.callback(request.url, pending);
if (signedIn.ok) {
  const { sub } = signedIn.value.claims;
  const { accessToken, refreshToken, expiresAt } = signedIn.value.tokens;
} else {
  for (const issue of signedIn.error.issues) {
    console.error(issue.code, issue.path);
  }
}
```

The checks run in this order, and each one that fails ends the callback with its issue, so a request that fails `state` never reaches the token endpoint:

1. The URL is a string or `URL`, and `pending` has the right shape. Otherwise `TypeError`.
2. The URL is at most 8192 characters and parses. Its query has no duplicated parameter, at most 32 parameters, and no parameter longer than 4096 characters. Otherwise `invalid_callback` with path `["callback"]`, and for the parameter checks `params.reason` of `duplicate`, `too_many` or `too_long`.
3. The `state` parameter is present. Otherwise `invalid_callback` with path `["callback", "state"]`.
4. The `state` equals `pending.state`, compared in constant time. Otherwise `state_mismatch` with path `["callback", "state"]`.
5. The `iss` parameter equals the issuer. When it is absent and the provider advertises `authorization_response_iss_parameter_supported: true`, that is also a failure. Either way the issue is `iss_mismatch` with path `["callback", "iss"]` (RFC 9207).
6. The `error` parameter is absent. Otherwise `provider_error`, described below.
7. The `code` parameter is present. Otherwise `invalid_callback` with path `["callback", "code"]`.
8. The code is redeemed at the token endpoint. The failures are described under [Token requests](#token-requests).
9. The response has an `id_token`. Otherwise `invalid_token_response` with path `["response", "id_token"]`.
10. The ID token is validated, as described under [ID token checks](#id-token-checks).

When the provider sends an OAuth error to the redirect URI, the callback returns `provider_error` with `params.endpoint` of `authorization` and `params.error` set to the error code: one of the OAuth codes, such as `access_denied`, or `unknown` for any other text. The provider's own description is never returned. Because check 5 runs first, an error that arrives with a missing `iss` is reported as `iss_mismatch` when the provider advertises the parameter.

### ID token checks

The ID token's signature and its registered claims are checked by `@codenhub/jwt`. A problem there becomes `invalid_id_token`, with `path` set to the place in the token, such as `["id_token", "payload", "exp"]`, and `params.jwtCode` set to the `@codenhub/jwt` code, such as `expired`, `wrong_audience` or `bad_signature`. The checks below follow, and the OpenID Connect checks report every failure they find, not just the first:

- `iss` equals the provider's issuer, `aud` contains the client identifier, and `exp`, `iat` and `sub` are present. The times are compared with `clockTolerance`.
- The header's `typ` is not an access token type (`at+jwt`). Otherwise `invalid_id_token` with path `["id_token", "header", "typ"]` and `jwtCode` of `wrong_type`.
- `sub` is a non-empty string. Otherwise `invalid_id_token` with path `["id_token", "payload", "sub"]`.
- `azp` is required when `aud` has more than one value, and when it is present it must equal the client identifier. Otherwise `azp_mismatch`.
- `nonce` equals `pending.nonce`. Otherwise `nonce_mismatch`.
- `auth_time`, when present, is a number. Otherwise `invalid_id_token` with `jwtCode` of `invalid_claim`. When `pending.maxAge` is set, `auth_time` is required, and `auth_time_missing` is reported when it is absent. The token is too old when the time since `auth_time` is more than `maxAge` plus `clockTolerance`, which is `auth_too_old`.
- `at_hash`, when present, equals the hash of the access token, which is the left half of SHA-256 for `ES256`, `RS256`, `PS256` and `HS256`, and of SHA-512 for `EdDSA` and `Ed25519`. Otherwise `at_hash_mismatch`.

A successful callback returns the claims as the verifier read them, after these checks.

## Refreshing tokens

`client.refresh(options)` exchanges a refresh token for new tokens. It returns a promise of a result whose value is `{ tokens, claims? }`.

```ts
const refreshed = await client.refresh({ refreshToken, subject: claims.sub });
if (refreshed.ok) {
  // Store the new refresh token. The one you sent is spent.
  await save(refreshed.value.tokens.refreshToken);
}
```

| Option         | Meaning                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refreshToken` | The refresh token to exchange. A non-empty string.                                                                                                                                                                    |
| `subject`      | The `sub` of the original ID token. When the provider sends a new ID token, its `sub` must equal this, or the result is `subject_mismatch`.                                                                           |
| `scope`        | A narrower set of scopes to request, as a non-empty array of at most 100 scope tokens, at most 4096 characters when joined with spaces. It must be within the original grant; a wider set is refused by the provider. |

The provider rotates refresh tokens. Each exchange spends the one you sent and returns a new one in `tokens.refreshToken`, so **store the new refresh token and discard the old one**. Presenting a spent refresh token again is treated as theft: the provider refuses it with `provider_error` and `invalid_grant`, and it revokes every token issued from that sign-in. [The token endpoint](provider.md#refresh-tokens) describes the rotation in detail.

A refresh response need not carry an ID token. When it does, `claims` is the validated ID token's claims, checked against `subject` and the access token as described above, but without a nonce, because a refresh has none. When it carries none, `claims` is absent.

When the new ID token fails validation, `refresh` returns a failure with the ID token's issues and no tokens, even though the provider issued new ones. A response whose ID token cannot be trusted is not trusted at all, so its access and refresh tokens are dropped with it. The refresh token you sent is already spent at the provider, so it cannot be used again: treat this failure as the end of the session and sign the user in again.

## Fetching userinfo

`client.userinfo(options)` asks the provider's userinfo endpoint for the claims the granted scopes release. It returns a promise of a result whose value is the claims object, frozen.

```ts
const profile = await client.userinfo({ accessToken: tokens.accessToken, subject: claims.sub });
if (profile.ok) {
  console.log(profile.value.name);
}
```

The request sends the access token as a `Bearer` credential. The response's `sub` must equal `subject`, or the result is `subject_mismatch`, so a userinfo response about another user is refused. It fails with `invalid_userinfo` with path `["userinfo", "sub"]` when `sub` is missing or not a string, and with `request_failed` for every other failure of the request, with `params.endpoint` of `userinfo`. A `401` from the endpoint, for an access token that has expired or been revoked, is `request_failed` with `params.reason` of `status` and `params.status` of `401`.

`userinfo` rejects with `TypeError` when the metadata has no `userinfo_endpoint`, since the request cannot be made.

## Client authentication

The token endpoint must know which client is calling. The `auth` option picks how the client proves it, and it must match what the provider registered for the client.

| `auth.method`         | Credentials sent to the token endpoint                                                                              | `auth` field and how to get it                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`                | `client_id` in the body. For public clients, such as single-page and native apps, which rely on PKCE alone.         | Nothing else.                                                                                                                                                                                                                                                             |
| `client_secret_basic` | An `Authorization: Basic` header holding the client identifier and secret, each form-encoded and joined by a colon. | `secret`, a non-empty string. Generated with `generateClientSecret` on the provider side. Keep it out of logs and source code.                                                                                                                                            |
| `client_secret_post`  | `client_id` and `client_secret` in the body.                                                                        | `secret`, as for `client_secret_basic`.                                                                                                                                                                                                                                   |
| `client_secret_jwt`   | A client assertion, a JWT signed with the secret, sent as `client_assertion` with the JWT bearer assertion type.    | `key`, an HS256 `SecretKey` from `@codenhub/jwt`. Use `generateSecretKey({ alg: "HS256" })`, or `importSecretKey(bytes, { alg: "HS256" })` for an existing secret. `importSecretKey` returns a result, so unwrap its value. A secret shorter than 32 bytes is `weak_key`. |
| `private_key_jwt`     | A client assertion signed with the client's private key.                                                            | `key`, a `PrivateKey` from `@codenhub/jwt`, from `generateKeyPair` or `importPrivateKey`. Its public half is what the provider registered for the client.                                                                                                                 |

The assertion methods sign a JWT with `iss` and `sub` set to the client identifier, `aud` set to the issuer, a random `jti`, `iat`, and an `exp` 60 seconds ahead. A provider that verifies the assertion accepts it only if its `aud` names the issuer or the token endpoint.

`createClient` throws `TypeError` when the method is not advertised by the provider, or when `secret` or `key` is missing or of the wrong kind. A correct method with the wrong credentials is not caught at creation. The provider refuses it at the token endpoint, and the client returns `provider_error` with `params.endpoint` of `token` and `params.error` of `invalid_client`.

### Token requests

The client sends the token request for a sign-in, a refresh, and nothing else. The failures a token request can return are the same for every method:

- `provider_error` with `params.endpoint` of `token` and `params.error` set to the OAuth code the provider sent, such as `invalid_grant` for a spent or expired code, `invalid_client` for rejected credentials, or `invalid_scope` for a refresh that asked for more than the grant holds. Any other code is `unknown`.
- `request_failed` with `params.endpoint` of `token` for a non-`200` response that carries no OAuth error, and for the network, timeout, size and content-type failures described under [Discovering the provider](#discovering-the-provider).
- `invalid_token_response` with path `["response", <member>]` when a `200` response is not a valid token response. The members checked are `access_token` (a non-empty string of printable ASCII, as RFC 6749 §A.12 defines it), `token_type` (`Bearer`, in any letter case), `expires_in` (a non-negative number, when present), `refresh_token` and `id_token` (non-empty strings, when present), and `scope` (a string, when present). Every bad member is reported in one result.

`expiresAt` in a token set is computed from `expires_in` at the moment the response is received, in seconds since the Unix epoch. When the provider does not send `expires_in`, the field is absent.
