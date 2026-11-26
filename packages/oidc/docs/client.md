---
title: Client
description: Discovering a provider, creating a relying-party client, starting and finishing a sign-in, refreshing tokens, fetching userinfo, revoking tokens, ending the session at the provider, receiving back-channel logout, client credentials, and authenticating to the token endpoint.
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

The document is requested from `{issuer}/.well-known/openid-configuration`. A trailing slash on the issuer is removed before the well-known path is added, and an issuer with a path keeps that path. The request does not follow redirects. Its response must be a `200` with a JSON object of at most 65536 bytes, and it must finish within the timeout. The document's `issuer` member must equal the issuer you passed, byte for byte, so a document served for another issuer is refused. A UTF-8 byte order mark at the start of a discovery, token, userinfo or revocation response is accepted, as RFC 8259 §8.1 allows. The JWKS response is parsed by `@codenhub/jwt`, which does not strip a byte order mark. A `revocation_endpoint`, when present, must be an `https` URL, like the other endpoints.

| Option         | Meaning                                                                                                                                                                                                                                                                          | Default            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `fetch`        | The `fetch` to call. It is looked up on each call when you omit it.                                                                                                                                                                                                              | `globalThis.fetch` |
| `timeout`      | Seconds to wait for the whole request, including the body. An integer from 1 through 60.                                                                                                                                                                                         | `5`                |
| `tenantIssuer` | Accepts a document whose `issuer` is a `{tenantid}` template, as a multi-tenant Microsoft Entra ID endpoint publishes, when the issuer you passed is that template with one path segment, such as `common`, in its place. See [Multi-tenant providers](#multi-tenant-providers). | `false`            |

`discover` returns a failed result, with no exception, for every failure of the network, the response or the document:

- `request_failed` with `params.reason` of `timeout`, `network`, `status` (with `params.status`, for any response other than `200`, including redirects), `content_type` (a `200` that is not JSON), `too_large` or `malformed` (a body that is not a JSON object). `params.endpoint` is `discovery`.
- `issuer_mismatch` when the document's `issuer` is not the issuer you passed.
- `invalid_metadata` for each member that is missing or invalid, with its path, such as `["metadata", "jwks_uri"]`. Every such member is reported in one result. An `authorization_endpoint` longer than 4096 characters is `invalid_metadata` too, so the 8192-character authorization URL that `authorize` builds always has room for it. An `end_session_endpoint` longer than 4096 characters is capped the same way, so it is `invalid_metadata` too, and an over-long one fails `discover` for every caller, not only those that log out. `revocation_endpoint_auth_methods_supported` and `revocation_endpoint_auth_signing_alg_values_supported`, when present, must be arrays of strings.

Only a bad argument throws `TypeError`: an issuer that is not an `https` URL or has a query, `options` that is not an object, a `fetch` that is not a function, or a timeout outside 1 through 60.

Cache the metadata, or the client, rather than calling `discover` on every sign-in. A provider's discovery document changes rarely, and each call is a request.

## Creating a client

`createClient(options)` returns a frozen client. It makes no request, and it throws `TypeError` when an option is invalid, so a misconfigured client never starts. Its message names the option and never its value. The client's `metadata` property holds the provider metadata it was created with.

```ts
const discovered = await discover("https://login.example.com");
if (!discovered.ok) {
  throw new Error("provider unavailable");
}

const client = createClient({
  metadata: discovered.value,
  clientId: "my-app",
  redirectUri: "https://app.example.com/callback",
  auth: { method: "none" },
});
```

| Option              | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Default                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `metadata`          | The provider's metadata, from `discover` or written by hand. Checked as strictly as a fetched document.                                                                                                                                                                                                                                                                                                                                                                                                                                       | Required                  |
| `clientId`          | The client identifier the provider registered. A non-empty string of well-formed Unicode, with no lone surrogates.                                                                                                                                                                                                                                                                                                                                                                                                                            | Required                  |
| `redirectUri`       | The redirect URI registered for this client. Sent in the authorization request and in the code exchange at the token endpoint, but not in refresh requests (RFC 6749 §6). An absolute URI of visible ASCII (no spaces, control or non-ASCII characters; use punycode hosts and percent-encoding), with no fragment or credentials, and not `javascript:`, `data:`, `vbscript:` or `file:`. Required by `authorize` and `callback`, which throw `TypeError` without it. A service client that only calls `clientCredentials` can leave it out. | None; required to sign in |
| `auth`              | How the client authenticates to the token endpoint. See [Client authentication](#client-authentication).                                                                                                                                                                                                                                                                                                                                                                                                                                      | Required                  |
| `fetch`             | The `fetch` for the token, userinfo, revocation and JWKS requests. Looked up on each call when you omit it.                                                                                                                                                                                                                                                                                                                                                                                                                                   | `globalThis.fetch`        |
| `timeout`           | Seconds to wait for each response, including its body, before failing. An integer from 1 through 60.                                                                                                                                                                                                                                                                                                                                                                                                                                          | `5`                       |
| `clockTolerance`    | Seconds of clock skew allowed on the ID token's `exp`, `iat` and `auth_time`. An integer from 0 through 300. The default absorbs ordinary drift between the two servers: with `0`, a provider whose clock runs a second ahead makes sign-ins fail with `issued_in_future`.                                                                                                                                                                                                                                                                    | `60`                      |
| `backchannelLogout` | How the client receives back-channel logout: `{ sessionRequired?: boolean }`. With `sessionRequired: true`, a logout token without `sid` fails, as for a client registered with `backchannel_logout_session_required`. See [Receiving back-channel logout](#receiving-back-channel-logout).                                                                                                                                                                                                                                                   | `sessionRequired: false`  |
| `openid`            | `false` makes a plain OAuth 2.0 client, for a provider with no ID tokens such as GitHub. See [Plain OAuth 2.0 providers](#plain-oauth-20-providers).                                                                                                                                                                                                                                                                                                                                                                                          | `true`                    |
| `tenantIssuer`      | `true`, or `{ tenants }`, a non-empty array of at most 100 tenant identifiers, to accept tokens from the tenants of a `{tenantid}` issuer template. Required when `metadata.issuer` holds `{tenantid}`, and refused when it does not. See [Multi-tenant providers](#multi-tenant-providers).                                                                                                                                                                                                                                                  | None                      |
| `now`               | The current time in milliseconds since the Unix epoch. For tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `Date.now`                |

The client accepts an ID token only when its signature verifies with one of the provider's keys, and only with an asymmetric algorithm the provider advertises in `id_token_signing_alg_values_supported` that this package supports: `ES256`, `ES384`, `ES512`, `EdDSA`, `Ed25519`, `RS256`, `RS384`, `RS512`, `PS256`, `PS384` or `PS512`. An ID token signed with `HS256` or `none` is never accepted. The keys come from the provider's `jwks_uri`, which the client fetches on first use and caches.

`createClient` throws `TypeError` when:

- The issuer in `metadata` is not an own data property holding an `https` URL of visible ASCII with no query, fragment or credentials, or the metadata is not valid. The message names the first invalid member. Hand-written metadata may reuse one object for two members, such as one algorithms array, because each place is copied. A value nested deeper than 32 levels, or a copy that would hold more than 65536 containers, makes the whole metadata invalid, even for a member the package does not read.
- `auth.method` is not one of the five methods, or it is not in `metadata.token_endpoint_auth_methods_supported` when the provider lists those.
- `auth.key` is not a key of the kind the method needs, or `auth.secret` is empty or not well-formed Unicode.
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

| Option            | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Default      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `scope`           | Scopes to request, as a non-empty array of at most 100 scope tokens, at most 4096 characters when joined with spaces. It must include `openid`, except for a [plain OAuth 2.0 client](#plain-oauth-20-providers), which sends no scope by default. Duplicates are removed.                                                                                                                                                                                                                                                                                            | `["openid"]` |
| `prompt`          | Whether the provider must, or must not, show its pages: `none`, `login`, `consent`, `select_account` or `create`, which asks for the provider's sign-up page. `none` must stand alone, and a value may not repeat.                                                                                                                                                                                                                                                                                                                                                    | None sent    |
| `maxAge`          | The most seconds that may pass since the user last authenticated, as an integer from 0 through 999999999. The age is measured from the request, not the callback, so time spent signing in does not count. When set, the ID token must carry `auth_time`, and the callback checks its age. `0` asks for a login after the request.                                                                                                                                                                                                                                    | None sent    |
| `loginHint`       | A hint about the account to sign in with, such as an email address. A string of well-formed Unicode (no lone surrogates), at most 4096 characters.                                                                                                                                                                                                                                                                                                                                                                                                                    | None sent    |
| `uiLocales`       | Preferred languages for the provider's pages, as at most 100 BCP 47 tags, each non-empty, well-formed Unicode and without spaces. At most 4096 characters when joined with spaces.                                                                                                                                                                                                                                                                                                                                                                                    | None sent    |
| `resource`        | The resource servers the tokens are for (RFC 8707), as a non-empty array of at most 20 absolute URIs of visible ASCII without a fragment, each at most 4096 characters. Duplicates are removed. See [Resource servers](#resource-servers).                                                                                                                                                                                                                                                                                                                            | None sent    |
| `acrValues`       | The authentication context classes requested, in order of preference, as `acr_values`. Under the same rules as `uiLocales`.                                                                                                                                                                                                                                                                                                                                                                                                                                           | None sent    |
| `display`         | How the provider shows its pages: `page`, `popup`, `touch` or `wap`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | None sent    |
| `idTokenHint`     | An ID token the provider issued, as a hint about the user, such as for `prompt: ["none"]`. A string of well-formed Unicode with no cap of its own; only the 8192-character URL limit applies.                                                                                                                                                                                                                                                                                                                                                                         | None sent    |
| `claimsLocales`   | Preferred languages for the claims returned, as `claims_locales`. Under the same rules as `uiLocales`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | None sent    |
| `claims`          | Individual claims to request (OpenID Connect Core §5.5), as a plain object of JSON values nested at most 8 deep, such as `{ userinfo: { email: { essential: true } } }`. Sent JSON-encoded, at most 4096 characters. Whether the provider honours it, which it advertises with `claims_parameter_supported`, is not checked.                                                                                                                                                                                                                                          | None sent    |
| `responseMode`    | Where the provider puts its response: `query`, in the redirect URI's query, or `form_post`, in a form the browser posts to it. `form_post` is refused when the metadata lists `response_modes_supported` without it. See [Form post responses](#form-post-responses).                                                                                                                                                                                                                                                                                                 | `query`      |
| `extraParameters` | Other parameters a provider reads, such as `{ access_type: "offline" }`, as a plain object of non-empty strings of well-formed Unicode, each at most 4096 characters. Sent after the client's own. A name the client sets itself or an option covers is refused: `state`, `nonce`, `code_challenge`, `code_challenge_method`, `redirect_uri`, `client_id`, `response_type`, `response_mode`, `scope`, `prompt`, `max_age`, `login_hint`, `ui_locales`, `acr_values`, `display`, `id_token_hint`, `claims_locales`, `claims`, `resource`, `request` and `request_uri`. | None sent    |

The URL is the provider's authorization endpoint with the request's parameters added to any query it already has: `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `nonce`, `code_challenge` with `code_challenge_method=S256`, and whichever optional parameters you set. The `state`, `nonce` and PKCE verifier are random values from `crypto.getRandomValues`, generated for each call.

`authorize` rejects with `TypeError` for an invalid option, such as a scope list without `openid` or a `prompt` value it does not know. A refused request leaves nothing behind, since everything is validated before any value is generated. A member that is not an option, such as a misspelt `login_hint`, rejects too, so a typo is never silently dropped. The encoded URL must be at most 8192 characters, and hold at most 32 parameters, the most the provider reads, counting any query the authorization endpoint already has. Percent-encoding can grow capped values past the limit the provider reads, so a request whose options are each within their caps can still be refused.

```ts
// Rejects with TypeError: the value is not well-formed Unicode.
await client.authorize({ loginHint: "\uD800" });
```

## Keeping `pending`

`pending` is a `PendingAuthorization`:

- `state`, a random value the callback must echo back.
- `nonce`, a random value the ID token must carry. Absent for a plain OAuth 2.0 client.
- `codeVerifier`, the PKCE verifier that redeems the code.
- `maxAge`, present only when you requested one.
- `requestedAt`, present exactly when `maxAge` is: the time of the request, in whole seconds since the Unix epoch. The callback compares the user's `auth_time` with it.
- `responseMode`, `"form_post"` when you requested that mode, and absent for `query`.

It is plain JSON, so `JSON.stringify` and `structuredClone` preserve it. Keep it where the user's browser cannot read or change it: a server-side session, or an encrypted, `HttpOnly` cookie. Treat it as a secret, because the verifier redeems the code. Take it out of the session before calling `callback`, in one step, whether the callback then succeeds or fails, so a second callback, such as from a double-clicked link or a second tab, cannot use the same values.

An app that signs users in with more than one provider gives each provider its own `redirectUri`, and keeps `pending` with the provider it was made for. The callback then always runs with the client of the provider the user was sent to, which is what stops a provider from collecting a code another provider issued (the mix-up attack of RFC 9700 §4.4). The `iss` check catches a provider that sends its issuer, and the separate redirect URI covers one that does not.

The callback checks the shape of `pending`, and a malformed value throws `TypeError`, since the application stored it and a bad value is a bug in the application. A `pending` with a `maxAge` but no non-negative integer `requestedAt` is malformed in the same way.

## Finishing a sign-in

`client.callback(input, pending)` takes the request the browser made to the redirect URI, as a Fetch API `Request`, or its URL as a string or a `URL`, and the `pending` you kept. It returns a promise of a result. On success the value is a `SignIn`, frozen:

- `claims`, the validated ID token's claims.
- `tokens`, a `TokenSet` with `idToken` always present.
- `parameters`, the response's other parameters, which the client did not read: every one but `state`, `code` and `iss`, such as `session_state`. The provider vouches for none of them.

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

1. The input is a string, a `URL` or a `Request` whose body was not read, and `pending` has the right shape, including `requestedAt` when `maxAge` is set. Otherwise `TypeError`.
2. The response arrived the way `pending` asked for: in the query of a URL or a `GET` request for `query`, and in a `POST` request for `form_post`. Otherwise `invalid_callback` with path `["callback", "method"]`. A `form_post` body is then read as [Form post responses](#form-post-responses) describes, and checks 3 and 4 are skipped.
3. The URL is at most 8192 characters. Otherwise `invalid_callback` with path `["callback"]`.
4. The URL is absolute, such as `request.url` of a Fetch API request. A relative URL, such as the path a framework hands over, is the app's mistake, not the browser's, so it throws `TypeError` whose message says so.
5. The query has no duplicated parameter, at most 32 parameters, and no parameter longer than 4096 characters. Otherwise `invalid_callback` with path `["callback"]`. For the parameter checks, `params.reason` is `duplicate`, `too_many`, `too_long`, or `malformed` for a percent-escape that is not valid UTF-8, such as `%E9`. A `%zz`, which is not an escape, is kept as it is.
6. The `state` parameter is present. Otherwise `invalid_callback` with path `["callback", "state"]`.
7. The `state` equals `pending.state`, compared in constant time. Otherwise `state_mismatch` with path `["callback", "state"]`.
8. The `iss` parameter equals the issuer, or for a [multi-tenant client](#multi-tenant-providers) the template with an allowed tenant in its place. When it is absent and the provider advertises `authorization_response_iss_parameter_supported: true`, that is also a failure. Either way the issue is `iss_mismatch` with path `["callback", "iss"]` (RFC 9207).
9. The `error` parameter is absent. Otherwise `provider_error`, described below.
10. The `code` parameter is present. Otherwise `invalid_callback` with path `["callback", "code"]`.
11. The code is redeemed at the token endpoint. The failures are described under [Token requests](#token-requests).
12. The response has an `id_token`. Otherwise `invalid_token_response` with path `["response", "id_token"]`.
13. The ID token is validated, as described under [ID token checks](#id-token-checks).

When the provider sends an OAuth error to the redirect URI, the callback returns `provider_error` with `params.endpoint` of `authorization` and `params.error` set to the error code: one of the OAuth codes, such as `access_denied`, or `unknown` for any other text. The provider's own description is never returned. Because check 8 runs first, an error that arrives with a missing `iss` is reported as `iss_mismatch` when the provider advertises the parameter.

The callback matches the response on `state` and `iss` only. It does not compare the URL's origin and path with `redirectUri`: a proxy in front of the app may show it another URL, and `state` already binds the response to the request.

### Form post responses

With `responseMode: "form_post"`, the provider answers with a page that makes the browser post the response to the redirect URI (OAuth 2.0 Form Post Response Mode). Sign in with Apple requires this mode when it asks for the user's name or email. Pass the `Request` to `callback`:

```ts
const { url, pending } = await client.authorize({ scope: ["openid", "name", "email"], responseMode: "form_post" });

// In the POST handler of the redirect URI:
const signedIn = await client.callback(request, pending);
if (signedIn.ok) {
  // Apple posts the user's name once, at the first sign-in. It is not signed: treat it as the user's own input.
  const user = signedIn.value.parameters.user;
}
```

The body is read as a back-channel logout request is: its `content-type` must be `application/x-www-form-urlencoded`, or the result is `invalid_callback` with path `["callback", "headers", "content-type"]`. It must be at most 16384 bytes of UTF-8 with at most 32 parameters, none duplicated or longer than 4096 characters. Otherwise the result is `invalid_callback` with path `["callback", "body"]` and `params.reason` of `too_large`, `unreadable`, `duplicate`, `too_many`, `too_long` or `malformed`. A `Request` whose body was already read throws `TypeError`, since that is the app's mistake.

The post is a cross-site request from the provider's origin, so a session cookie with `SameSite=Lax` or `Strict` is not sent with it, and the app cannot find `pending`. Keep `pending` in a cookie with `SameSite=None; Secure` for this mode, or in a store keyed by something the post carries, such as `state`.

### ID token checks

The ID token's signature and its registered claims are checked by `@codenhub/jwt`. A problem there becomes `invalid_id_token`, with `path` set to the place in the token, such as `["id_token", "payload", "exp"]`, and `params.jwtCode` set to the `@codenhub/jwt` code, such as `expired`, `wrong_audience` or `bad_signature`. The checks below follow, and the OpenID Connect checks report every failure they find, not just the first:

- `iss` equals the provider's issuer, `aud` contains the client identifier, and `iss`, `exp`, `iat` and `sub` are present. The times are compared with `clockTolerance`. For a [multi-tenant client](#multi-tenant-providers), `iss` is instead checked against the template after the signature.
- The header's `typ` is not an access token type (`at+jwt`) or a logout token type (`logout+jwt`), with an `application/` prefix and case ignored. Otherwise `invalid_id_token` with path `["id_token", "header", "typ"]` and `jwtCode` of `wrong_type`.
- The optional claims have their types when present: `amr` is an array of strings, and `acr`, `azp`, `nonce`, `at_hash` and `sid` are strings. A claim of another type is `invalid_id_token` with path `["id_token", "payload", <claim>]` and `params.jwtCode` of `invalid_claim`. The check that reads that claim is then skipped, so the same claim is not reported twice.
- `sub` is a non-empty string. Otherwise `invalid_id_token` with path `["id_token", "payload", "sub"]`.
- `azp`, when present, must equal the client identifier, and it is required when `aud` has more than one value. A wrong value, or a missing one where `aud` has several, is `azp_mismatch`.
- `nonce` equals `pending.nonce`. Otherwise `nonce_mismatch`.
- `auth_time`, when present, is a number. Otherwise `invalid_id_token` with `jwtCode` of `invalid_claim`. When `pending.maxAge` is set, `auth_time` is required, and `auth_time_missing` is reported when it is absent. The age is measured to the request, `pending.requestedAt`, not to the callback: the token is too old when `requestedAt` minus `auth_time` is more than `maxAge` plus `clockTolerance`, which is `auth_too_old`. Time the user spends on the provider's login and consent pages does not count. `maxAge: 0` therefore accepts only an authentication at or after the request, within `clockTolerance`.
- `at_hash`, when present, equals the hash of the access token, which is the left half of the digest the token's `alg` uses: SHA-256 for the `*256` algorithms, SHA-384 for the `*384` ones, and SHA-512 for the `*512` ones and for `EdDSA` and `Ed25519`. Otherwise `at_hash_mismatch`.

A successful callback returns the claims as the verifier read them, after these checks.

## Refreshing tokens

`client.refresh(options)` exchanges a refresh token for new tokens. It returns a promise of a result whose value is `{ tokens, claims? }`.

```ts
// `claims` are those of the ID token the session holds, from the sign-in or the last refresh that sent one.
const refreshed = await client.refresh({ refreshToken, previous: claims });
if (refreshed.ok) {
  // Store the new refresh token. The one you sent is spent.
  await save(refreshed.value.tokens.refreshToken ?? refreshToken);
}
```

| Option         | Meaning                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refreshToken` | The refresh token to exchange. A non-empty string.                                                                                                                                                                                                                                                                                             |
| `previous`     | The claims of the ID token the session holds: at least `iss`, `sub` and `aud`, and `azp`, `auth_time` and `nonce` when it had them. Pass the `claims` of the sign-in, or of the last refresh that returned some. A new ID token is checked against them, as below. Required, and checked like `pending`: a malformed value throws `TypeError`. |
| `scope`        | A narrower set of scopes to request, as a non-empty array of at most 100 scope tokens, at most 4096 characters when joined with spaces. It must be within the original grant; a wider set is refused by the provider.                                                                                                                          |
| `resource`     | The resource servers the new access token is for, under the same rules as `authorize`. Each must be one the sign-in asked for. Without it, this package's provider issues the token for every resource of the sign-in.                                                                                                                         |

The provider rotates refresh tokens. Each exchange spends the one you sent and returns a new one in `tokens.refreshToken`, so **store the new refresh token and discard the old one**. A provider that does not rotate sends no new one, so keep the one you sent when `tokens.refreshToken` is absent, as the example does. Run one refresh at a time for each refresh token: two concurrent refreshes present the same token, and the second one is a replay. Presenting a spent refresh token again is treated as theft: the provider refuses it with `provider_error` and `invalid_grant`, and it revokes every token issued from that sign-in. [The token endpoint](provider.md#refresh-tokens) describes the rotation in detail.

A lost response signs the user out. The provider spends the refresh token before it answers, so when the response never arrives, the new refresh token is lost and the one you hold is spent, and presenting it again revokes the sign-in. Two rules follow:

- **Persist the rotated refresh token before using the new access token.** Save it as soon as `refresh` resolves, as the example does, so a crash after that point does not leave you holding only the spent token.
- **Do not retry a refresh blindly after a network failure.** When `refresh` fails with `request_failed`, the first request may have reached the provider. A retry then presents a spent token, which revokes every token of the sign-in, including the access token you still hold. Retry at most once, and treat `provider_error` with `invalid_grant` as the end of the session.

[A lost refresh response](errors.md#a-lost-refresh-response) has the reasoning.

A refresh response need not carry an ID token. When it does, `claims` is the validated ID token's claims, checked as described above and against `previous`, as OpenID Connect Core §12.2 requires. Its `sub` must equal `previous.sub`, or the result is `subject_mismatch`. Its `iss`, `aud` (as a set, so `"app"` and `["app"]` match), and `azp` (or its absence) must equal those of `previous`, and its `auth_time` too when both carry one; otherwise `id_token_mismatch` with the claim's path. A `nonce` is not required, since a refresh sends none, but when the new token carries one it must equal `previous.nonce`, or the result is `nonce_mismatch`. When the response carries no ID token, `claims` is absent.

When the new ID token fails validation, `refresh` returns a failure with the ID token's issues and no tokens, even though the provider issued new ones. A response whose ID token cannot be trusted is not trusted at all, so its access and refresh tokens are dropped with it. The refresh token you sent is already spent at the provider, so it cannot be used again: treat this failure as the end of the session and sign the user in again.

## Fetching userinfo

`client.userinfo(options)` asks the provider's userinfo endpoint for the claims the granted scopes release. It returns a promise of a result whose value is the claims object, frozen.

```ts
const profile = await client.userinfo({ accessToken: tokens.accessToken, subject: claims.sub });
if (profile.ok) {
  console.log(profile.value.name);
}
```

The request sends the access token as a `Bearer` credential, and accepts `application/json` and `application/jwt`. A JWT response (OpenID Connect Core §5.3.2), which a client registered with `userinfo_signed_response_alg` receives, is verified with the ID token's keys and algorithms. Its `iss`, when present, must be the issuer, and its `aud`, when present, must contain the client identifier; otherwise `invalid_userinfo` with path `["userinfo", "payload", "iss"]` or `["userinfo", "payload", "aud"]` and `params.jwtCode` of `wrong_issuer` or `wrong_audience`. A JWT the verifier refuses, such as an unsigned one, a garbled one, or an access or logout token, is `invalid_userinfo` with path under `["userinfo"]` and `params.jwtCode`. An encrypted response, a JWE, is `invalid_userinfo` with path `["userinfo"]` and `params.reason` of `encrypted`: this package holds no decryption key, so register the client for signed responses only.

Either way, the response's `sub` must equal `subject`, or the result is `subject_mismatch`, so a userinfo response about another user is refused. It fails with `invalid_userinfo` with path `["userinfo", "sub"]` when `sub` is missing or not a string, and with `request_failed` for every other failure of the request, with `params.endpoint` of `userinfo`. A `401` from the endpoint, for an access token that has expired or been revoked, is `request_failed` with `params.reason` of `status` and `params.status` of `401`.

`userinfo` rejects with `TypeError` when the metadata has no `userinfo_endpoint`, since the request cannot be made. It also rejects with `TypeError` when `accessToken` holds a character outside printable ASCII (U+0020 through U+007E), since the token goes into a header. Such a value is a bug in the caller, not a network failure, so it is not reported as `request_failed`.

## Revoking tokens

`client.revoke(options)` asks the provider to revoke an access token or a refresh token, as RFC 7009 defines. Use it when the user signs out. It returns a promise of a result whose value is `undefined`.

```ts
// Sign out of the app: revoke the refresh token, then drop the session, whether or not revocation worked.
const revoked = await client.revoke({ token: refreshToken, tokenTypeHint: "refresh_token" });
if (!revoked.ok) {
  console.error(revoked.error.issues);
}
await session.destroy();
```

Revoking does not sign the user out of the provider. To end the provider's session as well, see [Ending the session at the provider](#ending-the-session-at-the-provider).

| Option          | Meaning                                                                                    | Default   |
| --------------- | ------------------------------------------------------------------------------------------ | --------- |
| `token`         | The access token or refresh token to revoke. A non-empty string.                           | Required  |
| `tokenTypeHint` | `"access_token"` or `"refresh_token"`, a hint to the provider about which kind `token` is. | None sent |

The request is sent with the client's configured authentication, as the token endpoint is. A `200` response is a success, whatever its body and whatever the token was. The provider answers `200` for an unknown or already revoked token too, so a success does not show that the token was valid. Providers such as this package's revoke the whole sign-in with either kind of token: the access and refresh tokens issued with it.

The failures are:

- `provider_error` with `params.endpoint` of `revocation` and `params.error` set to the OAuth code the provider sent, or `unknown`, for a non-`200` response that carries an OAuth `error`. `unsupported_token_type` (RFC 7009 §2.2.1) is one of those codes.
- `request_failed` with `params.endpoint` of `revocation` for any other failure: a non-`200` response with no OAuth error, which has `params.reason` of `status` and `params.status`, and the network, timeout, size and content-type failures described under [Discovering the provider](#discovering-the-provider).

`revoke` rejects with `TypeError` when the metadata has no `revocation_endpoint`, when `token` is not a non-empty string, or when `tokenTypeHint` is any other value. It also rejects when the metadata lists `revocation_endpoint_auth_methods_supported` and the list does not include the client's auth method, or, for `client_secret_jwt` and `private_key_jwt`, when the metadata lists `revocation_endpoint_auth_signing_alg_values_supported` and the list does not include the key's `alg`. Each of these is a configuration mismatch, so it fails before any request is sent.

## Ending the session at the provider

`client.endSessionUrl(options?)` builds the provider's `end_session_endpoint` URL for RP-initiated logout (OpenID Connect RP-Initiated Logout 1.0 §2). It is synchronous and makes no request. Redirect the browser to the URL it returns. The provider checks the request and, when one was given, sends the browser back to `postLogoutRedirectUri`.

Logging out at the provider does not revoke the user's tokens, and it does not end the application's session. The application does both itself.

```ts
// Sign out: build the logout URL, revoke the refresh token and end the app's session, then send the browser to the provider.
const logoutState = crypto.randomUUID(); // kept in a short-lived cookie, since the session is destroyed below
const logoutUrl = client.endSessionUrl({
  idTokenHint: idToken, // the ID token from the sign-in, read from the session before it is destroyed
  postLogoutRedirectUri: "https://app.example.com/signed-out",
  state: logoutState,
});
await client.revoke({ token: refreshToken, tokenTypeHint: "refresh_token" });
await session.destroy();
```

On the page at `postLogoutRedirectUri`, compare the `state` parameter with the `logoutState` in that cookie before you show the user as signed out. The provider returns `state` unchanged.

| Option                  | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                  | Default   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `idTokenHint`           | The ID token of the sign-in being ended. It tells the provider which user is leaving. An expired one is still sent, and this package's provider accepts it when it is otherwise valid. It has no length cap of its own; only the 8192-character URL limit applies. `callback` accepts an ID token of up to 65536 characters, so leave out one too long for the URL; the request still names the client with `client_id`. | None sent |
| `postLogoutRedirectUri` | Where the provider sends the browser afterwards. It must be registered for this client at the provider.                                                                                                                                                                                                                                                                                                                  | None sent |
| `state`                 | Returned unchanged to `postLogoutRedirectUri`.                                                                                                                                                                                                                                                                                                                                                                           | None sent |
| `logoutHint`            | A hint about the account being signed out, such as an email address.                                                                                                                                                                                                                                                                                                                                                     | None sent |
| `uiLocales`             | Preferred languages for the provider's logout page, as BCP 47 tags, under the same rules as `authorize`.                                                                                                                                                                                                                                                                                                                 | None sent |

The URL always carries `client_id`, so the provider can match `postLogoutRedirectUri` even after the hint has expired. A hint issued to a different client is refused: the provider returns `invalid_request` at `id_token_hint`, so send the hint from the client it was issued to. The URL keeps any query the endpoint already has. Empty strings are left out.

`endSessionUrl` throws `TypeError` when the metadata has no `end_session_endpoint`, when `postLogoutRedirectUri` breaks the redirect URI rules, when a string option is not a string, not well-formed Unicode or longer than 4096 characters (except `idTokenHint`, which has no cap of its own), when `uiLocales` is invalid, or when the URL is longer than 8192 characters once encoded.

## Receiving back-channel logout

When the user signs out at the provider, the provider can tell this client server to server, without the browser (OpenID Connect Back-Channel Logout 1.0). It sends a `POST` to the client's registered `backchannel_logout_uri` with a signed logout token in the form body. With this package's provider, that URI is the `uri` of the client record's `backchannelLogout`, and the provider's app sends what `provider.backchannelLogout` builds; see [Provider](provider.md#back-channel-logout).

`client.readBackchannelLogout(request)` reads that request and verifies its token. It returns a promise of a result whose value is a `BackchannelLogout`: `subject` (the token's `sub`), `sessionId` (its `sid`), `jti`, `issuedAt` and `expiresAt`. At least one of `subject` and `sessionId` is present. `client.verifyLogoutToken(logoutToken)` verifies a token the app has already taken from the form body itself; prefer the first, which also checks the request.

```ts
const noStore = { "cache-control": "no-store" };

// The route at the client's back-channel logout URI.
async function backchannelLogout(request: Request): Promise<Response> {
  const logout = await client.readBackchannelLogout(request);
  // rememberJti stores the jti until the given time and returns false when it was already stored, in one
  // atomic step (an insert that fails on a duplicate key), so two deliveries at once cannot both pass.
  if (!logout.ok || !(await rememberJti(logout.value.jti, logout.value.expiresAt + 60))) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: noStore });
  }
  const { subject, sessionId, jti } = logout.value;
  try {
    if (sessionId !== undefined) {
      await endSessionsWithSid(sessionId); // the sessions that signed in with an ID token carrying this sid
    } else if (subject !== undefined) {
      await endSessionsOfUser(subject); // every session of this user from this provider
    }
  } catch (error) {
    await forgetJti(jti); // so a retransmission of this token is not refused as a replay
    throw error;
  }
  return new Response(null, { status: 200, headers: noStore });
}
```

To find the session a `sessionId` names, keep the ID token's `sid` with the app's session at sign-in: `signedIn.value.claims.sid` after `callback`. With only `subject`, the provider means every session of that user that it issued tokens for.

Answer as §2.8 says: `200` when the logout succeeded, including when no session matched, since there is nothing left to end; `400` with a JSON body `{ "error": "invalid_request" }` when the request or token failed. Send `Cache-Control: no-store` with both. Never put the token or the issues in the response: the sender may be an attacker, and the issues are for your logs.

The client stores nothing, so it accepts the same token again until it expires. To refuse a replay, as the specification suggests, remember each `jti` until `expiresAt` plus your `clockTolerance`, when the client stops accepting the token anyway, and refuse one seen before. The example does that with the default tolerance of 60 seconds. It forgets the `jti` when ending the sessions fails, since the specification lets a provider send the same token again after a failure, and a remembered `jti` would refuse it while the sessions stay open. A provider of this package signs every token with a new `jti`, so a retry of the same logout is never refused as a replay.

### The request

`readBackchannelLogout` checks the request before it verifies anything, and stops at the first failure, which is `invalid_logout_request` with a path naming the part at fault:

- The method is `POST`. Otherwise path `["request", "method"]`.
- `Content-Type` is `application/x-www-form-urlencoded`, with no parameter other than a UTF-8 `charset`. Otherwise path `["request", "headers", "content-type"]`.
- The body is at most 16384 bytes of UTF-8. Otherwise path `["request", "body"]`, with `params.reason` of `too_large` or `unreadable`. The size is checked against `Content-Length` before reading and again while reading.
- The form parses under the same rules as every request the provider reads: no parameter twice, at most 32 parameters, none longer than 4096 characters, no percent-escape that is not UTF-8. Otherwise path `["request", "body"]`, with `params.reason` of `duplicate`, `too_many`, `too_long` or `malformed`. A second `logout_token`, even an empty one, is `duplicate`.
- `logout_token` is present and not empty. Otherwise path `["request", "body", "logout_token"]`. Other parameters are ignored.

It rejects with `TypeError` when the request's body was already read, such as by middleware that parsed the form first: route the request to it untouched.

### Logout token checks

A logout token is checked like an ID token where the two agree, and every problem found is reported. A failure is `invalid_logout_token`, with `path` set to the place in the token, such as `["logout_token", "header", "typ"]`, and `params.jwtCode` naming the check, as for [ID tokens](#id-token-checks):

- The signature verifies with one of the provider's keys, with an algorithm the client accepts for ID tokens. The key set is the one ID tokens use, fetched once and cached.
- The header's `typ` is `logout+jwt` (an `application/` prefix and case are ignored). A missing or other `typ` is `wrong_type`, so an ID token or an access token of the same provider never passes.
- `iss` equals the provider's issuer and `aud` contains the client identifier. `azp` is checked as for ID tokens, and a failure is `azp_mismatch` at `["logout_token", "payload", "azp"]`.
- `iat`, `exp`, `jti` and `events` are present (`missing_claim` otherwise), and `exp` and `iat` are compared with `clockTolerance`. An empty `jti` is `invalid_claim`.
- `events` is an object holding the member `http://schemas.openid.net/event/backchannel-logout`, whose value is an object. Otherwise `invalid_claim` at `["logout_token", "payload", "events"]`.
- `sub` and `sid` are non-empty strings when present, and at least one is present. With `backchannelLogout.sessionRequired`, `sid` is required. A missing one is `missing_claim` at `["logout_token", "payload", "sid"]`.
- There is no `nonce`, which the specification forbids so that an ID token cannot pass. A `nonce` of any value is `invalid_claim`.

`verifyLogoutToken` rejects with `TypeError` when `logoutToken` is not a string, and never for a string's content.

## Client credentials

A service client has no user, so it signs no one in. It can still get an access token for itself with the client credentials grant (RFC 6749 §4.4). `client.clientCredentials(options?)` sends the grant with the client's authentication. It returns a promise of a result whose value is a `TokenSet`. The client is created without a `redirectUri`, since it never redirects a user.

```ts
const service = createClient({
  metadata: discovered.value,
  clientId: "reports-service",
  auth: { method: "client_secret_basic", secret: secretFromVault() }, // the secret, from your secret store
});

const granted = await service.clientCredentials({ scope: ["reports:read"] });
if (granted.ok) {
  // Send granted.value.accessToken as a Bearer credential. Request a new one when it expires.
}
```

`scope` is optional. Without it, the provider grants every scope the client is registered for, except `openid` and `offline_access`, which need a user. With it, the scope list must be a non-empty array of at most 100 scope tokens. A scope the provider refuses is `provider_error` with `params.error` of `invalid_scope`.

`resource` is optional too, under the same rules as `authorize`, and restricts the token to those resource servers; see [Resource servers](#resource-servers).

The token set has no ID token and no refresh token. An ID token or a refresh token in the response is checked like any token response, then dropped: no user is signed in, and RFC 6749 §4.4.3 says a refresh token SHOULD NOT be included. Each token is its own grant, so `client.revoke` on one leaves the client's other tokens valid. Userinfo refuses such a token, because it has no `openid` scope: this package's provider answers `403` with `insufficient_scope`, which `client.userinfo` reports as `request_failed` with `params.reason` of `status` and `params.status` of `403`.

The provider must have registered the client for this grant. Otherwise the result is `provider_error` with `params.error` of `unauthorized_client`.

`clientCredentials` rejects with `TypeError` when `auth.method` is `none`, since only a client that authenticates may use the grant. It also rejects when the metadata lists `grant_types_supported` and does not include `client_credentials`, or when `options`, `scope` or `resource` is invalid.

## Resource servers

A client that calls more than one API can ask for tokens restricted to the ones it will call, with the `resource` parameter (RFC 8707). Each value names a resource server by an absolute URI without a fragment, such as `https://api.example`, and the provider must have registered it for the client. A token for one API is then refused by another.

```ts
const { url, pending } = await client.authorize({
  scope: ["openid", "offline_access", "data:notes:read"],
  resource: ["https://api.example", "https://data.example"],
});

// Later, a token for one of them only.
const refreshed = await client.refresh({ refreshToken, previous: claims, resource: ["https://data.example"] });
```

`authorize`, `refresh` and `clientCredentials` take `resource`, and send each value as a parameter of its own. The values are checked as the provider checks a client's registered resources, so a malformed one rejects with `TypeError`, and the message never repeats it. At most 20 are sent, since the provider reads at most 32 parameters in a request.

The sign-in's resources bound its refreshes: a refresh may ask for fewer of them, and this package's provider refuses one it did not grant with `invalid_target`. `callback` sends no `resource`, so the first access token is for every resource the sign-in asked for. A resource the provider refuses is `provider_error` with `params.error` of `invalid_target`, at the callback for `authorize` and in the result for the others. [Resource indicators](provider.md#resource-indicators) describes what the provider checks.

## Client authentication

The token endpoint must know which client is calling. The `auth` option picks how the client proves it, and it must match what the provider registered for the client.

| `auth.method`         | Credentials sent to the token endpoint                                                                              | `auth` field and how to get it                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`                | `client_id` in the body. For public clients, such as single-page and native apps, which rely on PKCE alone.         | Nothing else.                                                                                                                                                                                                                                                             |
| `client_secret_basic` | An `Authorization: Basic` header holding the client identifier and secret, each form-encoded and joined by a colon. | `secret`, a non-empty string of well-formed Unicode. Generated with `generateClientSecret` on the provider side. Keep it out of logs and source code.                                                                                                                     |
| `client_secret_post`  | `client_id` and `client_secret` in the body.                                                                        | `secret`, as for `client_secret_basic`.                                                                                                                                                                                                                                   |
| `client_secret_jwt`   | A client assertion, a JWT signed with the secret, sent as `client_assertion` with the JWT bearer assertion type.    | `key`, an HS256 `SecretKey` from `@codenhub/jwt`. Use `generateSecretKey({ alg: "HS256" })`, or `importSecretKey(bytes, { alg: "HS256" })` for an existing secret. `importSecretKey` returns a result, so unwrap its value. A secret shorter than 32 bytes is `weak_key`. |
| `private_key_jwt`     | A client assertion signed with the client's private key.                                                            | `key`, a `PrivateKey` from `@codenhub/jwt`: the `privateKey` of `generateKeyPair`'s result, or `importPrivateKey`, which returns a result, so unwrap its value. Its public half is what the provider registered for the client.                                           |

The assertion methods sign a JWT with `iss` and `sub` set to the client identifier, `aud` set to the issuer, a random `jti`, `iat`, and an `exp` 60 seconds ahead. The issuer is the audience draft-ietf-oauth-rfc7523bis requires, and the only one this package's provider accepts: an assertion addressed to one provider cannot be replayed at another. Some providers still expect the token endpoint URL instead. For those, set `audience`:

```ts
import { generateKeyPair } from "@codenhub/jwt";
import { createClient, type ProviderMetadata } from "@codenhub/oidc/client";

declare const metadata: ProviderMetadata;
const { privateKey } = await generateKeyPair({ alg: "ES256", kid: "app-2026" });

const client = createClient({
  metadata,
  clientId: "app",
  redirectUri: "https://app.example/callback",
  // "issuer" by default; "token_endpoint" for a provider that refuses the issuer as aud.
  auth: { method: "private_key_jwt", key: privateKey, audience: "token_endpoint" },
});
```

`audience` is `issuer` or `token_endpoint`, and any other value throws `TypeError`.

A provider that registers the client by its certificate, such as Microsoft Entra ID, finds the key by the certificate's thumbprint. For `private_key_jwt`, set `header` to `{ x5t }`, the base64url SHA-1 thumbprint of 27 characters, or `{ "x5t#S256" }`, the SHA-256 one of 43, or both. No other header parameter is allowed, and a thumbprint of another length, such as one in hex as certificate tools print it, throws `TypeError`.

```ts
// Entra ID: the certificate's SHA-1 thumbprint, base64url-encoded from its bytes, not its hex.
auth: { method: "private_key_jwt", key: privateKey, audience: "token_endpoint", header: { x5t: thumbprint } },
```

`createClient` throws `TypeError` when the method is not advertised by the provider, or when `secret` or `key` is missing or of the wrong kind. For `client_secret_jwt` and `private_key_jwt`, it also throws when the key's `alg` is not in `token_endpoint_auth_signing_alg_values_supported`, if the metadata lists that member; without the member, any key is accepted. A correct method with the wrong credentials is not caught at creation. The provider refuses it at the token endpoint, and the client returns `provider_error` with `params.endpoint` of `token` and `params.error` of `invalid_client`.

### Token requests

The client sends the token request for a sign-in, a refresh, a client credentials grant, and nothing else. The failures a token request can return are the same for every method:

- `provider_error` with `params.endpoint` of `token` and `params.error` set to the OAuth code the provider sent, whatever the status: a `200` with an `error` member, as GitHub answers, is an error too, such as `invalid_grant` for a spent or expired code, `invalid_client` for rejected credentials, `invalid_scope` for a refresh or client credentials request that asked for more than the grant holds, `unauthorized_client` for a grant the client is not registered for, or `invalid_target` for a `resource` the provider refuses. Any other code is `unknown`.
- `request_failed` with `params.endpoint` of `token` for a non-`200` response that carries no OAuth error, and for the network, timeout, size and content-type failures described under [Discovering the provider](#discovering-the-provider).
- `invalid_token_response` with path `["response", <member>]` when a `200` response is not a valid token response. The members checked are `access_token` (a non-empty string of printable ASCII, as RFC 6749 §A.12 defines it), `token_type` (`Bearer`, in any letter case), `expires_in` (a non-negative number, or a string of one to ten digits, which some providers send instead, when present), `refresh_token` and `id_token` (non-empty strings, when present), and `scope` (a string, when present). Every bad member is reported in one result.

Every token request sends `Accept: application/json`, without which GitHub answers with a form body.

`expiresAt` in a token set is computed from `expires_in` at the moment the response is received, in seconds since the Unix epoch. When the provider does not send `expires_in`, the field is absent.

## Multi-tenant providers

A multi-tenant Microsoft Entra ID application signs in users of any organization through one endpoint, such as `https://login.microsoftonline.com/organizations/v2.0`. Its discovery document names the issuer `https://login.microsoftonline.com/{tenantid}/v2.0`, a template, and each ID token names the issuer of the user's own tenant, with that tenant's identifier in its `tid` claim. Opt in with `tenantIssuer` on both calls:

```ts
const discovered = await discover("https://login.microsoftonline.com/organizations/v2.0", { tenantIssuer: true });
if (!discovered.ok) {
  throw new Error("provider unavailable");
}

const client = createClient({
  metadata: discovered.value,
  clientId: "00000000-0000-0000-0000-000000000000",
  redirectUri: "https://app.example.com/callback",
  auth: { method: "private_key_jwt", key: privateKey, audience: "token_endpoint", header: { x5t: thumbprint } },
  // `true` for any tenant, or only the organizations the app serves:
  tenantIssuer: { tenants: ["9188040d-6c67-4c5b-b112-36a304b66dad"] },
});
```

The template must hold `{tenantid}` once, as a whole path segment. The signature is verified first, then the token's `tid` must be a tenant identifier of ASCII letters, digits and `-`, one of `tenants` when they are listed, and its `iss` must equal the template with that `tid` in place. A `tid` that fails is `invalid_id_token` with path `["id_token", "payload", "tid"]`, and an `iss` that fails is the same issue at `["id_token", "payload", "iss"]`, both with `params.jwtCode` of `wrong_issuer`. The same rule applies to logout tokens and to signed userinfo responses that carry `iss`, and the callback's `iss` parameter must be the template with an allowed tenant in its place.

Without `tenants`, any organization's users can sign in, which is what a multi-tenant application means. Decide what each tenant may do from `tid` after the sign-in, or list the tenants. A client assertion is addressed to the token endpoint, since the template names no one issuer, so `auth.audience` must be `token_endpoint`.

## Plain OAuth 2.0 providers

Some providers sign users in with OAuth 2.0 alone and issue no ID token, such as GitHub. `openid: false` makes a client for them. It returns an `OAuthClient`, whose types carry no claims:

```ts
const github = createClient({
  openid: false,
  metadata: {
    // Any https URL the app chooses; it names the provider in the client, and no response is checked against it.
    issuer: "https://github.com",
    authorization_endpoint: "https://github.com/login/oauth/authorize",
    token_endpoint: "https://github.com/login/oauth/access_token",
    userinfo_endpoint: "https://api.github.com/user",
  },
  clientId: "Iv1.0000000000000000",
  redirectUri: "https://app.example.com/callback",
  auth: { method: "client_secret_post", secret },
});

const { url, pending } = await github.authorize({ scope: ["read:user"] });
// Later, in the callback:
const signedIn = await github.callback(request, pending);
if (signedIn.ok) {
  const user = await github.userinfo({ accessToken: signedIn.value.tokens.accessToken });
}
```

The differences from an OpenID client:

- The metadata needs no `jwks_uri`, `response_types_supported`, `subject_types_supported` or `id_token_signing_alg_values_supported`. They are checked when present. No key set is created, and nothing is fetched from one.
- `authorize` sends no `nonce`, and no `scope` unless you set one, which need not include `openid`. PKCE is still sent. `maxAge`, `idTokenHint`, `acrValues`, `claims` and `claimsLocales` reject with `TypeError`, since only an OpenID Provider reads them.
- `callback` returns `{ tokens, parameters }`. No ID token is required, and one in the response is ignored, even a malformed one: `tokens.idToken` is always absent.
- `refresh` takes no `previous`, and returns `{ tokens }`.
- `userinfo` takes no `subject`, accepts JSON only, and returns the object the provider sent, frozen, since such a provider promises no `sub`.
- `backchannelLogout` and `tenantIssuer` throw `TypeError`, and the client has no `verifyLogoutToken` or `readBackchannelLogout`.

`tokens.scope` is the provider's `scope` split on spaces. GitHub separates its scopes with commas, so its `"read:user,user:email"` comes back as one entry; split it on `,` yourself.
