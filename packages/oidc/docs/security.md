---
title: Hostile input
description: What each kind of hostile input gets from the provider and from the client, every limit with its value, what never leaks into a result or a response, and what the package does not defend.
order: 4
---

# Hostile input

This page answers one question for each input that can come from the other side: what does it get? It covers the provider's endpoints and the client's callback, token, userinfo and discovery requests. For each input it states the exact outcome, so you can test your deployment against it.

Two results are used throughout. A **result** is the failed value `{ ok: false, error: { issues } }`, described in [Issues](errors.md). A **response** is the HTTP answer the provider sends. A `TypeError` is never an outcome of hostile input, because the package treats the input as data.

## Provider: the authorization endpoint

These inputs arrive at `beginAuthorization` and `completeAuthorization`. "Render" means `redirect` is `null` and the app shows its own error. "Redirect" means the client is sent back, with `error`, `state` and `iss`.

| Input                                                                                                                                                                         | Outcome                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A URL longer than 8192 characters                                                                                                                                             | Render, `invalid_request`.                                                                              |
| A method other than `GET` or `POST`, or a `POST` without a form body                                                                                                          | Render, `invalid_request`.                                                                              |
| A duplicated parameter, more than 32 parameters, or one longer than 4096 characters                                                                                           | Render, `invalid_request`, with `params.reason` of `duplicate`, `too_many` or `too_long`.               |
| No `client_id`                                                                                                                                                                | Render, `invalid_request`, path `["client_id"]`.                                                        |
| An unknown `client_id`                                                                                                                                                        | Render, `unknown_client`. Nothing is redirected, since no client was verified.                          |
| A `redirect_uri` that is not one of the client's registered URIs byte for byte: a trailing slash, a different case, a port, an added query, a fragment, or an encoded variant | Render, `invalid_redirect_uri`. Nothing is normalized, so a near miss never reaches a redirect.         |
| `request`, `request_uri` or `registration`                                                                                                                                    | Redirect, `request_not_supported`, `request_uri_not_supported` or `registration_not_supported`.         |
| `response_type` missing                                                                                                                                                       | Redirect, `invalid_request`, path `["response_type"]`.                                                  |
| `response_type` of `token`, `id_token`, or a hybrid value                                                                                                                     | Redirect, `unsupported_response_type`. Only the code flow exists, so no token goes through the browser. |
| `response_mode` other than `query`                                                                                                                                            | Redirect, `invalid_request`, path `["response_mode"]`.                                                  |
| `scope` missing `openid`, or missing altogether, or naming a scope the provider or the client does not have                                                                   | Redirect, `invalid_scope`.                                                                              |
| A `code_challenge` that is missing or is not the shape of an S256 challenge                                                                                                   | Redirect, `invalid_request`, path `["code_challenge"]`.                                                 |
| A `code_challenge_method` that is missing, `plain`, or anything but `S256`                                                                                                    | Redirect, `invalid_request`, path `["code_challenge_method"]`. `plain` is never accepted.               |
| `prompt` with an unknown value, a repeated value, or `none` with another value                                                                                                | Redirect, `invalid_request`, path `["prompt"]`.                                                         |
| `max_age` that is negative, has a sign, a decimal point, a space, or more than nine digits                                                                                    | Redirect, `invalid_request`, path `["max_age"]`.                                                        |
| An interaction id that is forged, empty, reused, or expired                                                                                                                   | `completeAuthorization` returns `interaction_not_found`, with no redirect.                              |
| An app outcome that grants scopes the request did not ask for, or grants no `openid`                                                                                          | `completeAuthorization` throws `TypeError`, and the interaction is already consumed.                    |

## Provider: the token endpoint

| Input                                                                                                                  | Outcome                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A method other than `POST`                                                                                             | `405`, with `Allow: POST, OPTIONS`.                                                                                                                |
| A `Content-Type` other than `application/x-www-form-urlencoded`, with `charset=utf-8` allowed                          | `400`, `invalid_request`.                                                                                                                          |
| A body larger than 16384 bytes. A declared `Content-Length` above the cap is refused without reading the body.         | `400`, `invalid_request`. The body is cancelled as soon as it passes the cap, even when the declared length lied.                                  |
| A body that is not valid UTF-8, or a duplicated, too-long or excess parameter                                          | `400`, `invalid_request`.                                                                                                                          |
| Credentials presented two ways at once (`Authorization`, `client_secret` and `client_assertion` together)              | `400`, `invalid_request`.                                                                                                                          |
| A Basic header that is malformed, is not the `Basic` scheme, or whose body `client_id` differs from its own            | `401`, `invalid_client`, with `WWW-Authenticate: Basic realm="token"` when Basic was presented. A differing body `client_id` is `invalid_request`. |
| An unknown client, a wrong secret, a wrong key, or a method the client did not register                                | `401`, `invalid_client`. The cases are not told apart, so an attacker cannot learn which clients exist.                                            |
| A client assertion with a wrong signature, a wrong `aud`, an expired `exp`, no `jti`, or a `sub` other than the client | `401`, `invalid_client`.                                                                                                                           |
| A `grant_type` that is missing, or is neither `authorization_code` nor `refresh_token`                                 | `400`, `invalid_request` when missing, or `unsupported_grant_type`.                                                                                |
| A code verifier that is not 43 to 128 unreserved characters                                                            | `400`, `invalid_grant`. The code is not spent.                                                                                                     |
| A code presented a second time                                                                                         | `400`, `invalid_grant`. The grant the code belongs to is revoked, so its access and refresh tokens stop working.                                   |
| A correct code with a wrong verifier, or with a different `redirect_uri`, or by another client, or after it expires    | `400`, `invalid_grant`. The code is spent, so a second attempt is a replay.                                                                        |
| An unknown code, or one that has been purged                                                                           | `400`, `invalid_grant`.                                                                                                                            |
| A refresh token presented a second time                                                                                | `400`, `invalid_grant`. The family is revoked, so every token issued from it stops working.                                                        |
| A refresh token that is unknown, or revoked                                                                            | `400`, `invalid_grant`. It is not spent, since there is nothing to spend.                                                                          |
| A refresh token that is expired, or presented by another client                                                        | `400`, `invalid_grant`. The token is spent.                                                                                                        |
| A refresh `scope` that names a scope the provider or the client does not have                                          | `400`, `invalid_scope`. The token is not spent.                                                                                                    |
| A refresh `scope` that names a scope the family does not hold                                                          | `400`, `invalid_scope`. The token is spent, and no new refresh token is issued.                                                                    |
| An access token sent as a `refresh_token`                                                                              | `400`, `invalid_grant`. Refresh tokens are looked up in their own table.                                                                           |

## Provider: userinfo

| Input                                                   | Outcome                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| No `Authorization` header                               | `401`, `WWW-Authenticate: Bearer`, with no error code.                                                  |
| A header that is not a well-formed `Bearer` credential  | `400`, `WWW-Authenticate: Bearer error="invalid_request"`.                                              |
| A token in the query or the body, and no header         | Ignored. The response is the same as for no header.                                                     |
| An ID token presented as an access token                | `401`, `WWW-Authenticate: Bearer error="invalid_token"`. ID tokens are never in the access token table. |
| A refresh token presented as an access token            | `401`, `invalid_token`, for the same reason.                                                            |
| An expired access token, or one whose grant was revoked | `401`, `invalid_token`.                                                                                 |

## Client: the callback

Each row is checked before any token request is sent, unless it says otherwise.

| Input                                                                                               | Outcome                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A URL longer than 8192 characters, or one that does not parse                                       | `invalid_callback`, path `["callback"]`.                                                                                         |
| A duplicated parameter, more than 32 parameters, or one longer than 4096 characters                 | `invalid_callback`, path `["callback"]`, with `params.reason` of `duplicate`, `too_many` or `too_long`.                          |
| No `state`                                                                                          | `invalid_callback`, path `["callback", "state"]`.                                                                                |
| A `state` that does not equal the one in `pending`, compared in constant time                       | `state_mismatch`, path `["callback", "state"]`.                                                                                  |
| An `iss` that is not the issuer, or no `iss` when the provider advertises it                        | `iss_mismatch`, path `["callback", "iss"]`.                                                                                      |
| An `error` from the provider, with a matching `state`                                               | `provider_error`, with `params.endpoint` of `authorization` and `params.error` of the code, or `unknown`.                        |
| No `code`                                                                                           | `invalid_callback`, path `["callback", "code"]`.                                                                                 |
| A code the provider rejects as replayed, expired or mismatched                                      | `provider_error`, with `params.endpoint` of `token` and `params.error` of `invalid_grant`.                                       |
| A token response with a missing or invalid member, or a `token_type` other than `Bearer`            | `invalid_token_response`, with the path of each bad member.                                                                      |
| A token response with no `id_token`                                                                 | `invalid_token_response`, path `["response", "id_token"]`.                                                                       |
| An ID token with `alg` of `none`, or `HS256`, or an algorithm the provider did not advertise        | `invalid_id_token`. An HMAC or unsigned token is never accepted.                                                                 |
| An ID token whose signature does not verify, or whose `kid` is unknown                              | `invalid_id_token`, with `params.jwtCode` of `bad_signature` or `unknown_kid`.                                                   |
| An ID token that is expired, not yet valid, issued in the future, or for another audience or issuer | `invalid_id_token`, with `params.jwtCode` of `expired`, `not_yet_valid`, `issued_in_future`, `wrong_audience` or `wrong_issuer`. |
| An ID token with a `typ` of `at+jwt`, meaning an access token                                       | `invalid_id_token`, with `jwtCode` of `wrong_type`, at path `["id_token", "header", "typ"]`.                                     |
| An ID token missing `sub`, `exp` or `iat`                                                           | `invalid_id_token`, with `jwtCode` of `missing_claim`.                                                                           |
| An ID token whose `nonce` is not the one sent, or was replayed                                      | `nonce_mismatch`.                                                                                                                |
| An `azp` that is not this client, or is missing when `aud` lists several                            | `azp_mismatch`.                                                                                                                  |
| An `at_hash` that does not match the access token                                                   | `at_hash_mismatch`.                                                                                                              |
| No `auth_time` when `max_age` was requested, or one older than `max_age`                            | `auth_time_missing` or `auth_too_old`.                                                                                           |
| An ID token longer than 8192 characters                                                             | `invalid_id_token`, with `jwtCode` of `too_large`. See [Limits](#limits).                                                        |
| A JWKS the client cannot fetch, or that is not valid                                                | `invalid_id_token`, with `jwtCode` of `key_fetch_failed` and `params.reason`.                                                    |

## Client: discovery, token, userinfo and JWKS responses

| Input                                                           | Outcome                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A discovery document whose `issuer` is not the issuer requested | `issuer_mismatch`, path `["metadata", "issuer"]`. The document is refused.                             |
| A discovery document with a missing or invalid member           | `invalid_metadata`, one issue for each member, with its path.                                          |
| A redirect from any endpoint                                    | Not followed. `request_failed`, with `params.reason` of `status`, and `params.status` of the redirect. |
| A non-`200` response with no OAuth error                        | `request_failed`, `params.reason` of `status`.                                                         |
| A `200` response that is not JSON                               | `request_failed`, `params.reason` of `content_type`.                                                   |
| A JSON body that is not an object, or is not valid UTF-8        | `request_failed`, `params.reason` of `malformed`.                                                      |
| A response larger than 65536 bytes, declared or streamed        | `request_failed`, `params.reason` of `too_large`. The body is cancelled as soon as it passes the cap.  |
| A response slower than the timeout, including its body          | `request_failed`, `params.reason` of `timeout`. The request is aborted.                                |
| A network failure                                               | `request_failed`, `params.reason` of `network`.                                                        |
| A userinfo response whose `sub` is missing or not a string      | `invalid_userinfo`, path `["userinfo", "sub"]`.                                                        |
| A userinfo response for another user                            | `subject_mismatch`, path `["userinfo", "sub"]`.                                                        |
| A refreshed ID token for another user                           | `subject_mismatch`, path `["id_token", "payload", "sub"]`.                                             |

## Limits

Every limit the package enforces, with its value. Where a limit applies to one place only, the place is named.

| Limit                                           | Value                                                                         | Applies to                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Request URL                                     | 8192 characters                                                               | The provider's authorization request, and the client's callback URL. The other endpoints read no URL beyond routing.         |
| Request body                                    | 16384 bytes                                                                   | The token endpoint, and a `POST` to the authorization endpoint.                                                              |
| Parameters per request                          | 32                                                                            | Every parsed query and form: the authorization request, the token request and the callback.                                  |
| Parameter length, name or value                 | 4096 characters                                                               | Every parsed query and form.                                                                                                 |
| Response body                                   | 65536 bytes                                                                   | Discovery, token, userinfo and JWKS responses.                                                                               |
| Client request timeout                          | 5 seconds by default, 1 to 60                                                 | Discovery, token, userinfo and JWKS requests, including the body.                                                            |
| Client clock tolerance                          | 0 seconds by default, at most 300                                             | The ID token's `exp`, `iat` and `auth_time`.                                                                                 |
| ID token length                                 | 8192 characters                                                               | The client's ID token check. Not configurable from `createClient`.                                                           |
| JWT JSON nesting                                | 32 levels                                                                     | Every JSON the verifier reads in a token.                                                                                    |
| JWKS cache                                      | 600 seconds, refetch cooldown 30 seconds, stale keys for at most 3600 seconds | The client's key set, as `@codenhub/jwt` defaults. The client does not change them.                                          |
| `max_age` in a request                          | At most nine digits                                                           | The authorization request.                                                                                                   |
| Authorization code lifetime                     | 60 seconds by default, 1 to 600                                               | `ttl.code`.                                                                                                                  |
| Interaction lifetime                            | 1800 seconds by default, 60 to 86400                                          | `ttl.interaction`.                                                                                                           |
| Access token and ID token lifetime              | 600 seconds by default, 60 to 86400                                           | `ttl.accessToken` and `ttl.idToken`.                                                                                         |
| Refresh token family lifetime                   | 30 days by default, 60 seconds to 365 days                                    | `ttl.refreshToken`.                                                                                                          |
| Client assertion lifetime created by the client | 60 seconds                                                                    | The assertion the client signs. The provider does not cap the lifetime of an assertion it verifies, so it checks only `exp`. |

## What never leaks

A result, a response and a `TypeError` message reveal no input value, by construction:

- Every issue's `path` names a place, such as a claim or a header member. Its `params` hold fixed vocabulary, numbers such as a limit or an HTTP status, and facts from the configuration. Never a token, code, verifier, secret, claim value or response body.
- The token endpoint's error responses hold only the OAuth code. They carry no `error_description`, so no input is echoed.
- A provider error that reaches the client is narrowed to a known OAuth code, or `unknown`, so the provider's text never becomes an issue.
- The store sees digests of every code, token and interaction id, and a client secret only as its SHA-256 digest. The PKCE verifier is never stored, only the challenge.
- The userinfo response holds only the claims the granted scopes release, taken from the callback's own data properties, and the `sub` the token was issued to.
- `TypeError` messages name the option or the record member that is wrong, and never its value.

## What the package does not defend

These are outside its scope. Each one is either the app's job or a known gap.

- **Rate limiting.** No endpoint limits how many requests a client or an IP sends. Limit the login, the token and the userinfo endpoints at the edge or in the app.
- **The app's session and cookies.** Where `pending` and the interaction id live, CSRF on the login and consent pages, session fixation, and phishing of the login page are the app's to get right. The package gives the values; it does not protect the place they are kept.
- **Store atomicity.** A store that does not satisfy the contract in [Store](store.md) breaks single use for codes and refresh tokens. The package cannot detect that, and it does not try.
- **Assertion replay.** A client assertion's `jti` is required but not remembered, so an assertion can be replayed within its lifetime. The provider does not cap an assertion's lifetime either. Both are on the roadmap.
- **Revocation.** There is no endpoint to revoke a token. A stolen access token works until `ttl.accessToken` seconds have passed, and only a replay of a code or refresh token revokes a grant.
- **Sender-constrained tokens.** Access tokens are bearer tokens. DPoP and mutual TLS are not supported.
- **How the user authenticates.** The package records what the app says about the login in `authTime`, `amr` and `acr`. It does not verify them, and an `amr` of `["pwd"]` is what the app claims, not a check.
- **Key management.** The package signs with the keys it is given. Storage of the private keys, the timing of rotation, and a compromised signing key are the app's. A key that leaks lets anyone forge ID tokens for that provider.
- **Redirect URI registration.** The app registers each client's URIs. The package matches them exactly and does not decide which are safe.
- **The provider's identity on the client side.** The client trusts discovery over `https`, the issuer match and the signatures from the provider's keys. It does not pin the keys or the endpoints beyond that.
