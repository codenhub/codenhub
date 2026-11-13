---
title: Provider
description: Creating an OpenID Provider and its diagnostics, routing its endpoints, the authorization step, ending sessions with RP-initiated and back-channel logout, the token endpoint and its grants, userinfo, token revocation, the published metadata, and the CORS and error-response rules.
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
| `accessToken`  | How access tokens are issued: opaque, the default, or a signed JWT. See [JWT access tokens](#jwt-access-tokens).                                                       | `{ format: "opaque" }`      |
| `endpoints`    | The URLs of the authorization, end-session, token, userinfo, JWKS and revocation endpoints. See [Endpoints](#endpoints).                                               | Paths under the issuer      |
| `onDiagnostic` | Called with the reason each token, userinfo or revocation request is refused with an OAuth error response. See [Diagnostics](#diagnostics).                            | None                        |
| `now`          | The current time in milliseconds since the Unix epoch. For tests.                                                                                                      | `Date.now`                  |

`createProvider` throws `TypeError` when:

- The issuer is not an `https` URL of visible ASCII with no query, fragment or credentials.
- `signingKeys` is empty, is not an array of `{ privateKey, publicKey }` pairs, pairs a private and a public key of different algorithms, gives a pair's two keys different `kid`s, or repeats a `kid`.
- `store` is not an object, or one of its methods is not a function. The message names the first missing method, such as `store.findClient`.
- `claims` is not a function, or `now` or `onDiagnostic` is given and is not a function.
- `accessToken` is not `{ format: "opaque" }` or `{ format: "jwt", audience }`, or its `audience` is missing, empty or not well-formed Unicode. The message names `accessToken.format` or `accessToken.audience`.
- A lifetime is outside its range, an endpoint is not an `https` URL, two endpoints share an origin and path, or `scopes` breaks the rules under [Scopes](#scopes).

### Signing keys

Every public key in the list is published at the JWKS endpoint, so a key that is no longer used to sign stays verifiable while tokens it signed are still in circulation. To rotate, put the new pair before the old pair of the same algorithm, and keep the old pair after it until the ID tokens it signed have expired, which is `ttl.idToken` seconds after they were issued. Both keys of a pair carry the same `kid`, and the `kid` appears in each ID token's header, so a relying party can find the right key.

Which pair signs a client's ID tokens depends on the client:

- A client record with `idTokenSigningAlg` gets the first pair of that algorithm. A record that names an algorithm none of the pairs has, or a value that is not one of `ES256`, `EdDSA`, `Ed25519`, `RS256` or `PS256`, makes the provider throw `TypeError` when it reads the record.
- A client without it gets the first `RS256` pair when there is one, and otherwise the first pair. The reason is that [OpenID Connect Core §15.1](https://openid.net/specs/openid-connect-core-1_0.html#Signing) requires every provider to support `RS256`, and [OpenID Connect Registration](https://openid.net/specs/openid-connect-registration-1_0.html#ClientMetadata) makes it the default for a client that registers no algorithm, so a relying party library that never asked for an algorithm expects it. Listing an `RS256` pair therefore changes the algorithm of every ID token of the clients that name none, even when another algorithm comes first in the list.
- JWT access tokens are signed with the first pair, whatever the client says, and the first pair is the one a resource server verifies them with.

Signing ID tokens with a key other than the first changes nothing for `id_token_hint` at [logout](#ending-sessions), which accepts a token signed by any published key.

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

Use one algorithm per pair. The provider publishes the algorithms of all its keys as `id_token_signing_alg_values_supported`, and a relying party accepts only the asymmetric algorithms this package supports.

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
| `accessToken`  | `600`               | 60 through 86400    | An access token, opaque or JWT. It is also the `expires_in` the token endpoint returns.              |
| `idToken`      | `600`               | 60 through 86400    | An ID token's `exp`, counted from when it is issued.                                                 |
| `refreshToken` | `2592000` (30 days) | 60 through 31536000 | A refresh token family, counted from the code exchange that started it. Rotation does not extend it. |

A client can set its own `code`, `accessToken`, `idToken` and `refreshToken` in the `ttl` of its [client record](store.md#client-records), within the same ranges, and a lifetime it leaves out is the table's. The `interaction` lifetime is provider-wide. A client's lifetimes apply wherever the provider uses these for that client: the code, `expires_in`, the access token's `exp` and stored expiry, the ID token's `exp`, the refresh token family, and the `client_credentials` grant. A value out of range is a `TypeError` when the provider reads the record, not when the provider is created, since the store is the app's own code.

### Endpoints

The five endpoints the provider answers, and the authorization and end-session endpoints the app serves, default to paths under the issuer. The discovery document is always at `{issuer}/.well-known/openid-configuration`, and it cannot be moved. The authorization, token, userinfo, JWKS, revocation and end-session endpoints are all configurable.

| `endpoints` key | Default              |
| --------------- | -------------------- |
| `authorization` | `{issuer}/authorize` |
| `token`         | `{issuer}/token`     |
| `userinfo`      | `{issuer}/userinfo`  |
| `jwks`          | `{issuer}/jwks`      |
| `revocation`    | `{issuer}/revoke`    |
| `endSession`    | `{issuer}/logout`    |

Each value is an absolute `https` URL of visible ASCII (no spaces, control or non-ASCII characters, and no backslash, which the URL parser reads as a slash; use punycode hosts and percent-encoding), with no fragment or credentials, on any origin. The seven URLs, including discovery, must each have their own origin and path, because a request is routed by origin and path. The query string is ignored when a request is routed.

### The published metadata

`provider.metadata` is the discovery document, frozen. Every value comes from the options, so it cannot drift from what the endpoints enforce:

- `issuer`, the endpoint URLs (`end_session_endpoint` among them), and `scopes_supported`, which lists every scope the provider knows.
- `response_types_supported`: `["code"]`. `response_modes_supported`: `["query"]`.
- `grant_types_supported`: `["authorization_code", "refresh_token", "client_credentials"]`. `subject_types_supported`: `["public"]`.
- `id_token_signing_alg_values_supported`: the algorithms of every published key.
- `token_endpoint_auth_methods_supported`: `client_secret_basic`, `client_secret_post`, `client_secret_jwt`, `private_key_jwt` and `none`. `token_endpoint_auth_signing_alg_values_supported`: `ES256`, `EdDSA`, `Ed25519`, `RS256`, `PS256` and `HS256`. The revocation endpoint publishes the same two lists as `revocation_endpoint_auth_methods_supported` and `revocation_endpoint_auth_signing_alg_values_supported`, and `revocation_endpoint` holds its URL.
- `claims_supported`: the ID token's claims and every claim the scopes release.
- `code_challenge_methods_supported`: `["S256"]`. `authorization_response_iss_parameter_supported`: `true`.
- `backchannel_logout_supported` and `backchannel_logout_session_supported`: `true`. See [Back-channel logout](#back-channel-logout).
- `claims_parameter_supported`, `request_parameter_supported` and `request_uri_parameter_supported`: `false`, because the package does not implement them.

## Routing requests with handle

`provider.handle(request)` answers the five endpoints it owns. It returns a promise of a `Response`, or of `null` when the request is for none of them. It routes by method and by origin and path, and ignores the query, so a client may append parameters to the discovery URL.

Pass the request before anything reads its body. Middleware that parses the form first, such as a framework body parser, leaves an empty stream, so `beginAuthorization`, `endSession`, and `handle` for a token or revocation request reject with `TypeError` for a `POST` whose body was already read, rather than refuse a valid request. Userinfo reads no body, so it is unaffected.

Routing compares the request URL's origin with the origin of the provider's endpoints, so `request.url` must carry the public origin the endpoints use. Behind a TLS-terminating proxy, Node.js adapters often build `request.url` from `http://` and the internal host, and then `handle` returns `null` for every request. Rebuild the request with the public URL before calling `handle`:

```ts
const url = new URL(request.url);
url.protocol = "https:";
url.host = "sso.example";
const body = request.body === null ? undefined : await request.arrayBuffer();
const response = await provider.handle(new Request(url, { method: request.method, headers: request.headers, body }));
```

`beginAuthorization` reads only the query or body of the request, not its origin, so it does not need this.

| Endpoint   | Methods                  | Answer                                                                                   |
| ---------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| Discovery  | `GET`, `OPTIONS`         | The metadata as JSON, with `Cache-Control: public, max-age=300`.                         |
| JWKS       | `GET`, `OPTIONS`         | `{ "keys": [...] }`, the public keys as JWKs, with `Cache-Control: public, max-age=300`. |
| Token      | `POST`, `OPTIONS`        | The token response or an error. See [The token endpoint](#the-token-endpoint).           |
| Userinfo   | `GET`, `POST`, `OPTIONS` | The released claims or a bearer challenge. See [Userinfo](#userinfo).                    |
| Revocation | `POST`, `OPTIONS`        | `200` with no body, or an OAuth error. See [Token revocation](#token-revocation).        |

A method an endpoint does not accept is `405` with an `Allow` header. `HEAD` is not accepted by the discovery or JWKS endpoints, so it gets `405` too. The authorization and end-session endpoints are not among the five, so `handle` returns `null` for them. The app serves both itself: it calls `beginAuthorization` from the authorization endpoint and `endSession` from the end-session endpoint. `handle` never throws for a request. It rejects only when the store, the `claims` callback or `onDiagnostic` rejects, when the JWKS keys cannot be exported, or with `TypeError` for a token or revocation `POST` whose body was already read.

The routing sketch below uses only `Request` and `Response`, as a plain Worker would. It answers the five endpoints from `handle`, and passes the authorization and logout requests to the app's own handlers.

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
    if (new URL(request.url).pathname === "/logout") {
      return logout(request);
    }
    return new Response("Not found.", { status: 404 });
  },
};
```

## The authorization step

The authorization endpoint is served by the app, because the user's login and consent happen there. The app calls `beginAuthorization` with the browser's request, then, once the user has signed in and granted what the client asked for, calls `completeAuthorization`. Between the two calls the request is an **interaction**.

### Starting: beginAuthorization

`provider.beginAuthorization(request)` validates an authorization request. It accepts a `GET`, whose parameters are in the query, or a `POST` with an `application/x-www-form-urlencoded` body, whose `Content-Type` may carry only a UTF-8 `charset`, as the token endpoint requires. On success it saves the request as an interaction and returns it. On failure it returns a result whose `redirect` is either the response to return to the browser, or `null`:

```ts
import type { AuthorizationInteraction } from "@codenhub/oidc/provider";

async function authorize(request: Request): Promise<Response> {
  const begun = await provider.beginAuthorization(request);
  if (!begun.ok) {
    // A redirect goes back to the client. `null` means nothing could be verified, so the app renders its own error.
    return begun.error.redirect ?? new Response("Invalid authorization request.", { status: 400 });
  }
  // Keep the whole interaction in the user's server-side session, then show the login and consent page.
  return showLogin(begun.value);
}

declare function showLogin(interaction: AuthorizationInteraction): Response; // the app's login and consent page
```

The checks run in this order, and the first failure is the one reported. Failures before the client and its redirect URI are verified render an error; failures after are redirected to the client's registered redirect URI with `error`, `state` and `iss`, so the client can see why.

| Check                                                                                                                                                  | Failure                                                                                        | `redirect` |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------- |
| The URL is at most 8192 characters.                                                                                                                    | `invalid_request`                                                                              | `null`     |
| The method is `GET`, or `POST` with a form body. The body is at most 16384 bytes.                                                                      | `invalid_request`                                                                              | `null`     |
| The parameters parse: no duplicate, at most 32, none longer than 4096 characters, and no percent-escape that is not valid UTF-8.                       | `invalid_request`, with `params.reason` of `duplicate`, `too_many`, `too_long` or `malformed`  | `null`     |
| `client_id` is present.                                                                                                                                | `invalid_request`, path `["client_id"]`                                                        | `null`     |
| The client is registered.                                                                                                                              | `unknown_client`                                                                               | `null`     |
| `redirect_uri` is present and is one of the client's registered URIs, byte for byte.                                                                   | `invalid_redirect_uri`                                                                         | `null`     |
| The client is registered with `authorization_code` in its `grantTypes`. A client registered only for `client_credentials` signs no users in.           | `unauthorized_client`                                                                          | Redirect   |
| No `request`, `request_uri` or `registration` parameter is present.                                                                                    | `request_not_supported`, `request_uri_not_supported` or `registration_not_supported`           | Redirect   |
| `response_type` is present and is `code`.                                                                                                              | `invalid_request` with path `["response_type"]` when missing, else `unsupported_response_type` | Redirect   |
| `response_mode`, when present, is `query`.                                                                                                             | `invalid_request`, path `["response_mode"]`                                                    | Redirect   |
| `scope` contains `openid`, and every scope is one the provider defines and the client may request.                                                     | `invalid_scope`                                                                                | Redirect   |
| `code_challenge` is present and has the shape of an S256 challenge. A client with [`requirePkce: false`](#clients-that-send-no-pkce) may leave it out. | `invalid_request`, path `["code_challenge"]`                                                   | Redirect   |
| `code_challenge_method` is `S256`. `plain` is refused.                                                                                                 | `invalid_request`, path `["code_challenge_method"]`                                            | Redirect   |
| A client with `requirePkce: false` that sent no `code_challenge` sent a non-empty `nonce`.                                                             | `invalid_request`, path `["nonce"]`                                                            | Redirect   |
| `prompt`, when present, is one or more of `none`, `login`, `consent` and `select_account`, and `none` stands alone. A repeated value counts once.      | `invalid_request`, path `["prompt"]`                                                           | Redirect   |
| `max_age`, when present, is at most nine digits.                                                                                                       | `invalid_request`, path `["max_age"]`                                                          | Redirect   |

On success the result carries the interaction:

- `id`, the identifier to pass to `completeAuthorization`. A random 256-bit value, and the store holds only its digest.
- `clientId`, `redirectUri`, `scopes` and `prompt`, as validated.
- `maxAge`, `loginHint` and `uiLocales`, when the request carried them. `loginHint` is passed through as sent. `uiLocales` has its empty entries, from repeated or trailing spaces, dropped; no entries left means absent. Both are within the length limit.
- `acrValues`, `claimsLocales` and `display`, when the request carried them. See [Hints for the login pages](#hints-for-the-login-pages).
- `createdAt`, in seconds since the Unix epoch.

Keep the whole interaction in the user's server-side session. It is a frozen plain object, so it serializes as JSON. The pages between the two calls need it: the consent page shows `clientId` and `scopes`, the login page follows `prompt`, `maxAge` and `loginHint`, and the scopes the user grants must be among `scopes`. The provider offers no lookup by `id`, because the store's only read of an interaction is the atomic `consumeInteraction` that completes it. Do not put `id` in a URL the user can edit, because whoever holds it can complete the interaction. The interaction lasts `ttl.interaction` seconds, 1800 by default, and it can be completed once.

### Hints for the login pages

Three more parameters reach the app so it can shape its pages and its login. None of them can fail the request, and the provider checks nothing against them.

- `acr_values`, as `acrValues`: the authentication context classes the client would like, in its order of preference. The value is a space-separated list, and empty entries from repeated or trailing spaces are dropped. This is a **voluntary request** (OpenID Connect Core §3.1.2.1). The app chooses whether to satisfy one of the values, such as by asking for a second factor, and reports the class it actually used as the `acr` of the grant it passes to `completeAuthorization`. That class may be none of the requested ones, and the client decides whether to accept the ID token. The provider does not compare the two.
- `claims_locales`, as `claimsLocales`: the languages the client prefers for the claims, as a space-separated list under the same rules. It is a hint for the app's `claims` callback, and the provider does not use it.
- `display`, as `display`: one of `page`, `popup`, `touch` or `wap`, which asks the app to show its pages as a full page, a popup window, for a touch device or for a small-screen device. A value the provider does not know is ignored, as Core allows, so the interaction has no `display`, and the request is not refused.

A list is absent when it has no entries, as for `uiLocales`. Each parameter is within the usual limits, at most 4096 characters, and every list is a frozen array of strings on the interaction, saved in the store with the rest of the request. The `claims` parameter, which would ask for individual claims, remains unsupported: the provider ignores it, and claims are released by scope.

### Clients that send no PKCE

Every client must send a PKCE `S256` challenge by default. A confidential client can be registered with `requirePkce: false` in its record, which lets its authorization request leave the challenge out:

```ts
import type { ClientRecord } from "@codenhub/oidc/provider";

declare const secretHash: string; // from hashClientSecret

export const client: ClientRecord = {
  clientId: "legacy-app",
  redirectUris: ["https://legacy.example/callback"],
  scopes: ["openid", "profile"],
  auth: { method: "client_secret_basic", secretHashes: [secretHash] },
  requirePkce: false,
};
```

Turning it off is for a confidential client of a relying-party library that sends no PKCE, and for the OpenID conformance plans, which do not send it. It is a statement by the operator that the client checks the `nonce` of the ID token, because without PKCE the `nonce` is what ties the response to the request (OAuth 2.1 §7.5.1.1, RFC 9700 §2.1.1). Do not turn it off for a client that you do not know checks it. A public client cannot turn it off: a record with `requirePkce: false` and `auth.method` of `none` makes the provider throw `TypeError` when it reads the record, since such a client has nothing but PKCE to prove it is the one that started the request.

The rules for a client with `requirePkce: false`:

- A `code_challenge` that is sent is always checked, and enforced as for any client: only `S256`, and the token request must carry the matching `code_verifier`. Sending a challenge is never worse than leaving it out.
- A request with no `code_challenge` must carry a `nonce`. Without one it is redirected to the client with `invalid_request`, path `["nonce"]`, like any other missing parameter. A `code_challenge_method` without a `code_challenge` is `invalid_request` for every client.
- The interaction and the code then hold no `codeChallenge`. At the token endpoint, a code issued with a challenge needs its verifier, as for every client. A code issued without one refuses any request that carries a `code_verifier`, with `invalid_grant` and the diagnostic reason `code_verifier_unexpected`. That is the defense against a downgrade (RFC 9700 §2.1.1): an attacker who holds a code that was bound to nothing cannot pretend it was bound to a verifier of their own.

A client with the default `true` behaves as described elsewhere on this page: a missing challenge is `invalid_request`, and a missing verifier at the token endpoint is `invalid_request` before the code is spent.

### Prompt and max_age

The provider does not show pages, so the app enforces what the request asks for:

- `prompt=login`: the app must authenticate the user again for this request. `completeAuthorization` rejects a login that happened before the interaction was created, with `TypeError`.
- `prompt=consent`: the app must ask the user to consent, then pass the granted scopes.
- `prompt=select_account`: the app must let the user choose an account.
- `prompt=none`: the app must not show any page. If the user is not signed in, or consent is needed, the app completes the interaction with a denial such as `login_required`, `consent_required`, `interaction_required` or `account_selection_required`. The package does not check the user's session for `prompt=none`, so this is the app's responsibility.
- `max_age`: the app must not grant a login that happened more than `max_age` seconds before the request arrived. `completeAuthorization` rejects an `authTime` more than `max_age` seconds before the interaction's `createdAt`, with `TypeError`. Time spent on the login and consent pages does not count, so `max_age=0` asks for a login after the request.

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
  sessionId: "9f2c41d0a7", // optional: the app's identifier for this session, which becomes `sid`
});

// The user refused, or cannot be given the access the client asked for.
await provider.completeAuthorization(id, { error: "access_denied" });
```

`sessionId` identifies the app's own session for the sign-in. It is a non-empty string of visible ASCII, with no space, control character or non-ASCII character, and the provider never interprets it. The provider saves it with the code and with every access and refresh token of the grant, and every ID token of that grant, from the code exchange and from each refresh, carries it as the `sid` claim. That lets the app find the grants that belong to one session, such as to revoke them when the session ends, and it lets back-channel logout name the session it ends. Use a random identifier that is stable for the session, and not the session cookie itself, since the client receives it in the ID token. A grant without a `sessionId` has no `sid`, and a session id is never added later: a refresh carries the one the code exchange started with.

A denial's `error` is one of `access_denied`, `login_required`, `consent_required`, `interaction_required` or `account_selection_required`, and it is the only other member the object may hold.

The result is an `OidcResult<Response>`. A grant or denial answers with a `302` to the interaction's redirect URI. A grant adds a `code`, which the client exchanges at the token endpoint, and a denial adds `error`. Both carry the `state` the client sent, when it sent one, and `iss`, the issuer, for RFC 9207. The registered redirect URI is kept byte for byte, and the parameters are appended to its existing query. `completeAuthorization` returns `interaction_not_found` as a failed result, with no redirect, when the identifier is empty or unknown, was already completed, or has expired. The app renders its own error for that case.

A code lasts `ttl.code` seconds, 60 by default, or the client's own `ttl.code`, and the client can redeem it once. Because the code's lifetime can be the client's, `completeAuthorization` reads the client's record from the store when it issues a code. A client removed since `beginAuthorization` gets no code: the result is `interaction_not_found`.

The method throws `TypeError` in two cases, and they are different:

- **The outcome is the wrong shape**, such as a non-empty `subject` missing, an `authTime` that is not a non-negative integer, a `sessionId` that is empty or not visible ASCII, or a denial with extra members. This is checked before the interaction is taken, so the interaction is still usable and the app can fix the call and retry.
- **The outcome contradicts the request**: scopes the client did not request or no `openid`, an `authTime` in the future, an `authTime` before the interaction under `prompt=login`, or an `authTime` more than the requested `max_age` seconds before the request. The interaction has already been taken at this point, so it is gone. The app must restart the sign-in. These are bugs in the login flow, and the package refuses them rather than issue a code that would skip the step the client asked for.

## Ending sessions

The provider implements RP-initiated logout. Its end-session endpoint is `endpoints.endSession`, `{issuer}/logout` by default, and discovery advertises it as `end_session_endpoint`. Like the authorization endpoint, it is served by the app: `handle` returns `null` for it, and the app calls `provider.endSession(request)` from its logout route. The request is a `GET` with its parameters in the query, or a `POST` with a form body whose `Content-Type` may carry only a UTF-8 `charset`, as the token endpoint requires, read with the same limits and duplicate and UTF-8 rules as the authorization request. It reads `id_token_hint`, `client_id`, `post_logout_redirect_uri`, `state`, `logout_hint` and `ui_locales`.

`endSession` returns an `OidcResult<EndSession>`. A failed request never redirects, so the app renders its issues:

- A malformed request, such as a method or media type the endpoint does not accept, an oversized URL or request body, an unreadable body, or a parameter that does not parse: `invalid_request`, with `params.reason` for a parameter failure.
- An unknown `client_id`: `unknown_client`.
- A verified `id_token_hint` issued to another client than `client_id`: `invalid_request`, path `["id_token_hint"]`.
- A `post_logout_redirect_uri` that is not, byte for byte, one of the client's `postLogoutRedirectUris`, or that comes with no client known from `client_id` or the hint: `invalid_redirect_uri`, path `["post_logout_redirect_uri"]`.

A success carries `clientId` when a client is known, `subject` when the hint verified, `logoutHint` and `uiLocales` when given, and `redirect`. `redirect` is a `302` to `post_logout_redirect_uri`, with `state` appended when the request had one, or `null` when the request named no `post_logout_redirect_uri`.

The `id_token_hint` is verified as an ID token this provider issued: signed by one of its keys, with its issuer, typed `JWT`, and with `sub`, `aud`, `exp` and `iat`. The type keeps a JWT access token (`at+jwt`) from passing as a hint. A hint with several audiences must name one of them in `azp`.

An expired hint is accepted when expiry is its only fault: ID tokens are short-lived, so a hint has usually expired by the time the user signs out, and a relying party that sends no `client_id` is known only through it. RP-Initiated Logout 1.0 recommends accepting one while the relying party has a current or recent session at the provider. The provider keeps no sessions, so it cannot check that: a hint stays acceptable for as long as the key that signed it is among the provider's keys. Compare `subject` with the user of your own session, and ask the user to confirm when they differ or there is no session.

A hint that does not verify is ignored. It is not a failure, and the result has no `subject`. Nothing then ties the request to a user, so ask the user to confirm the logout before signing them out.

The URIs a client may redirect to after logout are listed in its record's `postLogoutRedirectUris`, each held to the redirect URI rules. See [Client records](store.md#client-records).

The provider keeps no sessions. The app ends its own session, and may revoke the user's grants in its store, before it returns `redirect`, or its own signed-out page when `redirect` is `null`:

```ts
declare function renderError(issues: unknown): Response;
declare function endAppSession(request: Request): Promise<void>;
declare function sessionSubject(request: Request): Promise<string | undefined>; // the user of the app's own session
declare function renderLogoutConfirmation(request: Request): Response;
declare function renderSignedOutPage(): Response;

// The app's logout route, e.g. GET or POST /logout
const result = await provider.endSession(request);
if (!result.ok) {
  return renderError(result.error.issues); // never redirect on failure
}
if (result.value.subject === undefined || result.value.subject !== (await sessionSubject(request))) {
  // No verified ID token hint, or one for another user than the session's, as an old hint may be: stop here, and
  // end the session only once the user confirms on the page the app renders.
  return renderLogoutConfirmation(request);
}
await endAppSession(request); // the app's own session
return result.value.redirect ?? renderSignedOutPage();
```

## Back-channel logout

RP-initiated logout ends the session at the provider when a client asks. Back-channel logout is the other direction: when the user signs out of the app, the app tells each client it signed the user into, server to server, so those clients can end their own sessions (OpenID Connect Back-Channel Logout 1.0). Discovery advertises it as `backchannel_logout_supported` and `backchannel_logout_session_supported`.

The provider keeps no sessions and makes no outbound request, so the app does the work around it. `provider.backchannelLogout(request)` builds the logout request for one client, and the app sends it with `fetch`:

```ts
const request = await provider.backchannelLogout({
  clientId: "billing", // required
  subject: "user-1", // the `sub` of the user who signed out
  sessionId: "9f2c41d0a7", // the `sessionId` the app gave completeAuthorization, which the client saw as `sid`
});
```

A client takes part by registering a [`backchannelLogout`](store.md#client-records) entry in its record: its `uri`, which must be an absolute `https` URL, and whether it needs the session (`sessionRequired`, `false` by default).

### What the method returns

- `null` when the client is unknown, or its record has no `backchannelLogout`. There is nothing to send, so the app skips it.
- Otherwise a `POST` `Request` to the client's `uri`, with `Content-Type: application/x-www-form-urlencoded` and the body `logout_token=<token>`.
- A `TypeError` when the call itself is wrong, which is a bug in the app: `clientId` is not a non-empty string, `subject` and `sessionId` are both absent, either is present and is not a non-empty string, or the client's `sessionRequired` is `true` and there is no `sessionId`. The call is checked before the store is read, so these throw whether or not the client exists, except `sessionRequired`, which needs the record. A store that returns a malformed record makes it reject with `TypeError`, like every other method.

Give `subject`, `sessionId` or both. A client that registered `sessionRequired: true` needs the `sessionId`, since it finds the session to end by `sid`. Giving both is the most useful when the client keeps sessions by either.

### The logout token

The logout token is a JWT signed like that client's ID tokens, with the key its `idTokenSigningAlg` selects (see [Signing keys](#signing-keys)), so the client verifies it against the same JWKS. Its header has `typ: "logout+jwt"`, and the `alg` and `kid` of the key. Its claims are:

| Claim    | Value                                                           |
| -------- | --------------------------------------------------------------- |
| `iss`    | The issuer.                                                     |
| `aud`    | The client identifier.                                          |
| `iat`    | Now, from the provider's clock.                                 |
| `exp`    | `iat` plus 120 seconds. This is not configurable.               |
| `jti`    | A random value of 256 bits, new for every token.                |
| `events` | `{ "http://schemas.openid.net/event/backchannel-logout": {} }`. |
| `sub`    | The `subject` you gave, when you gave one.                      |
| `sid`    | The `sessionId` you gave, when you gave one.                    |

It never has a `nonce`, which the specification forbids. Because its `typ` is `logout+jwt`, a verifier that expects an ID token (`typ: "JWT"`), such as this package's own, refuses it, and a verifier of logout tokens refuses an ID token. That is the same type separation that keeps an access token from passing as an ID token.

### Sending it

The app owns delivery: the provider sets no timeout, retries nothing and reads no answer.

- Send it with `fetch`. A client answers `200` when it ended the session, or `400` with an error (Back-Channel Logout 1.0 §2.8). Treat any `2xx` as success and anything else as a failure, and do not read the body, which is not part of the contract.
- Use a short timeout, a few seconds. A client that is down or slow must not hold up the user's sign-out, so send to all clients at once and do not make the user wait for the slowest.
- Do not follow redirects. The token is a bearer credential for that client, and the client's registered `uri` is the only place it should go. A `3xx` answer is a failure. Pass `redirect: "manual"` to `fetch`; the request the provider builds leaves the choice to you.
- A `Request` body can be read once, so to retry, call `backchannelLogout` again. The new token has a new `jti` and a fresh `exp`, and a client that remembers `jti` values, as the specification asks it to, accepts it.
- The logout token is not a secret you log. Keep it out of logs and error reports, and log the client and the status.

### Worked example

The app ends its session, and then, for each client it signed the user into during that session, builds the request and sends it:

```ts
import type { Provider } from "@codenhub/oidc/provider";

declare const provider: Provider;
declare function clientsSignedInDuring(sessionId: string): Promise<readonly string[]>; // the app's own record
declare function endAppSession(sessionId: string): Promise<void>;
declare function logFailure(clientId: string, outcome: number | "timeout" | "error"): void;

/** Ends the user's session in the app and tells every client that took part in it. */
async function signOut(session: { readonly id: string; readonly subject: string }): Promise<void> {
  const clientIds = await clientsSignedInDuring(session.id);
  await endAppSession(session.id);

  await Promise.allSettled(
    clientIds.map(async (clientId) => {
      const request = await provider.backchannelLogout({
        clientId,
        subject: session.subject,
        sessionId: session.id,
      });
      if (request === null) {
        return; // unknown client, or one that did not register a back-channel logout URI
      }
      try {
        const response = await fetch(request, { redirect: "manual", signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
          logFailure(clientId, response.status); // 400, 3xx or a server error: any non-2xx is a failure
        }
      } catch (error) {
        logFailure(clientId, error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "error");
      }
    }),
  );
}
```

`Promise.allSettled` keeps one failing client from stopping the others. The `TypeError` cases above are not caught here, since they are bugs to fix and not failures to log, but `allSettled` still lets the remaining clients go.

### What the app must track

The provider cannot tell which clients a user is signed into, because it keeps no sessions. The app must record, for each session, the clients it completed an authorization for with that `sessionId`: at the moment it calls `completeAuthorization` with a grant, add the interaction's `clientId` to that session's list. That list is what `clientsSignedInDuring` reads above. Without a `sessionId` on the grant, the client's ID tokens have no `sid`, and a client with `sessionRequired: true` cannot be told about the logout.

A client signed in during several sessions of the same user is told once per session you end. To end all of a user's sessions, call the method for each session, or give only the `subject` for a client that does not need the session.

### Not supported

Front-channel logout (a page in the browser that loads each client's logout URL) and session management (an iframe that polls the provider for the session's state) are not supported. Both need the provider to know the browser's session, which it does not. Back-channel logout and [RP-initiated logout](#ending-sessions) are the two ways to end a session.

## The token endpoint

The token endpoint answers `POST` with an `application/x-www-form-urlencoded` body. It refuses the request before doing any work when the method, content type or body is wrong, and then authenticates the client before it reads the grant.

### Requests

The checks run in this order:

1. The method. `OPTIONS` gets a preflight. Any other method but `POST` gets `405` with `Allow: POST, OPTIONS`.
2. The `Content-Type`. It must be `application/x-www-form-urlencoded`, optionally with `charset=utf-8`, which may be quoted (`charset="utf-8"`) and written in any letter case. Otherwise `invalid_request`.
3. The body. It is read as strict UTF-8 and is at most 16384 bytes. Otherwise `invalid_request`.
4. The parameters. No duplicate, at most 32, none longer than 4096 characters, and no percent-escape that is not valid UTF-8. Otherwise `invalid_request`.
5. The client's credentials. See [Client authentication](#client-authentication).
6. The `grant_type`. Missing is `invalid_request`. `authorization_code` and `refresh_token` are `unauthorized_client` for a client whose record does not list `authorization_code` in `grantTypes`, and `client_credentials` is `unauthorized_client` for a client whose record does not list it. A value other than these three is `unsupported_grant_type`.
7. The grant. See [Authorization code](#authorization-code), [Refresh tokens](#refresh-tokens) and [Client credentials](#client-credentials).

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

A request for `authorization_code` must carry `code`, `redirect_uri` and `code_verifier`. A missing one is `invalid_request`. The exception is a client with [`requirePkce: false`](#clients-that-send-no-pkce), which may omit `code_verifier` when its code was issued without a challenge. The checks that follow, in order:

1. The verifier, when there is one, has the shape RFC 7636 defines, 43 to 128 unreserved characters. Otherwise `invalid_grant`, and the code is **not** spent.
2. The code is redeemed atomically with `consumeCode`. An unknown or purged code is `invalid_grant`.
3. A code that was already redeemed is a **replay**. The provider revokes the grant the code belongs to, so every access token and refresh token issued from it stops working, and returns `invalid_grant`.
4. Otherwise the code is spent, and each of these checks returns `invalid_grant`: it has expired, it was issued to another client, its `redirect_uri` is not the one in the request, or the verifier does not fit the code. For a code with a challenge that means the verifier is missing or its S256 digest is not the challenge, which only a client with `requirePkce: false` can send, since another client's missing verifier was refused before step 2. For a code issued without a challenge, any verifier is a downgrade attempt and is refused. A failure here still burns the code, so a wrong verifier cannot be retried against the same code.

On success the provider starts a grant, and issues:

- An access token: by default an opaque random value that only its digest is stored under, or a JWT under [`accessToken`](#jwt-access-tokens). It lasts `ttl.accessToken` seconds.
- A refresh token, only when the granted scopes include `offline_access`. Its family lasts `ttl.refreshToken` seconds from this exchange.
- An ID token, signed with the signing key chosen for the client (see [Signing keys](#signing-keys)). Its claims are `iss`, `sub`, `aud` (the client identifier), `iat`, `exp` (`ttl.idToken` after `iat`), `auth_time`, and `amr` and `acr` when the grant had them, `nonce` when the authorization request had one, and `at_hash` for the access token. It also carries `sid` when the grant has a `sessionId`, and refreshes repeat it. Its header is `typ: JWT` and the key's `alg` and `kid`. An ID token carries no scope claims, which are released at userinfo.

### Refresh tokens

A request for `refresh_token` must carry `refresh_token`, or it is `invalid_request`. Each refresh token is single-use, and rotation replaces it:

1. The `scope` parameter, when given, must name only scopes the provider defines and the client may request, and it must include `openid`. Otherwise `invalid_scope`, and the token is not spent.
2. The token is spent atomically with `consumeRefreshToken`. An unknown or revoked token is `invalid_grant`, and it is not spent.
3. A token that was already spent is a **reuse**. The provider revokes the family, so the access tokens and refresh tokens issued from that sign-in stop working, and returns `invalid_grant`.
4. Otherwise the token is spent, and it must be unexpired and issued to this client. Otherwise `invalid_grant`.
5. The `scope` parameter, when given, must be a subset of the family's scopes. Otherwise `invalid_scope`. When it is omitted, the access token has every scope the family holds.
6. A new access token is issued, and a new refresh token that replaces the spent one. The new refresh token keeps the family's original scopes and its original expiry, so rotation neither widens the family nor extends it. An ID token is issued too, without a nonce, and with the `sid` the family carries.

The response has the same shape as the code exchange, with `scope` set to the scopes of the new access token.

A refresh token that is spent by a request for a scope its family does not hold is gone: the provider does not issue a new one, and the client must sign the user in again. The same is true of a refresh token that a different client presents, which is refused after it has been spent. Both checks need the token's record, and the store reads it only by spending it. A scope the provider or the client does not know is refused before the token is spent.

### Client credentials

A client may ask for a token for itself with `grant_type=client_credentials` (RFC 6749 §4.4). No user is involved. The client's record lists the grants it may use in `grantTypes`, which defaults to `["authorization_code"]`. The list must be non-empty, without repeats, and hold only `authorization_code` or `client_credentials`. A client that uses `client_credentials` must authenticate, so a record that gives it to a client whose `auth.method` is `none` throws `TypeError` when it is read. See [Client records](store.md#client-records).

The client authenticates as at any token request, and its `scope` parameter is read as follows:

- Absent: every scope in the client's record that the provider defines, except `openid` and `offline_access`.
- Present: each scope must be defined by the provider and listed in the client's record, and must not be `openid` or `offline_access`.

A scope that breaks these rules, or an empty result, is `invalid_scope` with status `400`.

On success the response is a `200` with `Cache-Control: no-store`, and a body with `access_token`, `token_type` (`Bearer`), `expires_in` and `scope`. It carries no `id_token` and no `refresh_token`. The access token is opaque or JWT, as [`accessToken`](#jwt-access-tokens) says. Its subject is the client identifier, and each response is its own grant, so revoking one token leaves the client's other tokens valid. The token has no `openid`, so [userinfo](#userinfo) answers `403` for it.

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

## JWT access tokens

The `accessToken` option chooses the format of access tokens. The default, `{ format: "opaque" }`, issues a random value. `{ format: "jwt", audience }` issues a signed JWT (RFC 9068) instead, whose `aud` is `audience`, usually the resource server's identifier. `audience` must be a non-empty string of well-formed Unicode.

```ts
import { createProvider, type ProviderOptions } from "@codenhub/oidc/provider";

declare const options: ProviderOptions; // the options shown above

export const provider = createProvider({
  ...options,
  accessToken: { format: "jwt", audience: "https://api.example" },
});
```

A JWT access token is signed with the first signing key, whatever `idTokenSigningAlg` the client has. Its header has `typ: "at+jwt"`. Its payload has `iss`, `exp` (`ttl.accessToken` after issue), `aud`, `sub`, `client_id`, `iat`, a random `jti`, and `scope` (space-separated). A user's token also has `auth_time`, `amr` and `acr` when the grant had them. A client credentials token has none of these three, and its `sub` is the client identifier.

A resource server must therefore not take `sub` alone for a user: a token whose `sub` equals its `client_id` belongs to the client itself (RFC 9068 §5). Tell the two apart by that comparison, and assign client identifiers that can never equal a user's subject, such as by giving them a prefix no subject has.

The provider stores a JWT access token by its digest, as it stores an opaque one, so userinfo and revocation accept it, and a revocation takes effect at the provider at once. A resource server that verifies the token offline sees a revocation only when the token expires, so keep `ttl.accessToken` short. The ID token's `at_hash` is computed over the JWT string.

A resource server verifies the token with `@codenhub/jwt`. The `at+jwt` type is what stops an ID token from passing as an access token:

```ts
import { createRemoteKeySet, createVerifier } from "@codenhub/jwt";

const verifyAccessToken = createVerifier({
  keys: createRemoteKeySet({ url: "https://sso.example/jwks" }),
  issuer: "https://sso.example",
  audience: "https://api.example",
  type: "at+jwt",
  requiredClaims: ["sub", "client_id", "exp", "iat", "jti"],
  // The provider's clock may run ahead of this server's. With the default of 0, a token issued a second
  // "in the future" is refused with `issued_in_future`.
  clockTolerance: 60,
});

declare const bearerToken: string; // from the Authorization header

const verified = await verifyAccessToken(bearerToken);
if (verified.ok) {
  // verified.value.payload.sub, .client_id, .scope
}
```

## Userinfo

The userinfo endpoint answers `GET` and `POST`, and `OPTIONS` for a preflight. It reads the access token from the `Authorization` header only, in the form `Bearer` followed by one or more spaces and an RFC 6750 token. The scheme's letter case does not matter. A token in the body or the query is never read, so a credential does not land in a URL a proxy or a log keeps.

| Request                                                   | Answer                                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `Authorization` header                                 | `401` with `WWW-Authenticate: Bearer`, and no error code, as RFC 6750 asks.                                                                                                                                                                                       |
| A header that is not a well-formed `Bearer` credential    | `400` with `WWW-Authenticate: Bearer error="invalid_request"`.                                                                                                                                                                                                    |
| A token that is unknown, expired, or from a revoked grant | `401` with `WWW-Authenticate: Bearer error="invalid_token"`.                                                                                                                                                                                                      |
| A valid access token                                      | `200` with the released claims as JSON, and `Cache-Control: no-store`.                                                                                                                                                                                            |
| A valid access token whose scopes do not include `openid` | `403` with `WWW-Authenticate: Bearer error="insufficient_scope"`, and `claims` is not called. A token from a user sign-in always has `openid`. A client-credentials token has none, so this is the answer it gets; see [Client credentials](#client-credentials). |

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

The discovery, JWKS, token, userinfo and revocation endpoints answer any origin, with `Access-Control-Allow-Origin: *`, and they answer CORS preflights. A response that carries a `WWW-Authenticate` challenge, from userinfo or from client authentication at the token and revocation endpoints, also sends `Access-Control-Expose-Headers: WWW-Authenticate`, so a browser client can read it. This is safe because none of them reads cookies or any other ambient credential: a request is authorized only by what it carries itself, so a page on another origin can do nothing through them that a server could not do with the same credentials.

The authorization endpoint never receives CORS headers. The app serves it, so the app decides its headers, and the package adds none, which means a cross-origin page cannot read its response. The endpoint is meant for top-level navigation. Protecting it from requests that other sites trigger is the app's job, as [Hostile input](security.md) notes.

## Client secrets

A confidential client's secret is generated and stored by the provider in a form that cannot be used if the store leaks.

- `generateClientSecret()` returns a new secret: 256 bits from the Web Crypto random number generator, base64url-encoded into 43 characters. Give it to the client once.
- `hashClientSecret(secret)` returns a promise of the base64url SHA-256 digest of the secret. Store it in the record's `auth.secretHashes`, a list, and never the secret itself.

### Rotating a secret

`auth.secretHashes` lists every secret the client may use, and a presented secret authenticates when it matches any entry. That lets a secret change without downtime:

1. Generate the new secret and add its hash to `secretHashes`, next to the old one.
2. Roll the new secret out to the client.
3. Remove the old hash once the client no longer sends the old secret.

The list must be non-empty and every entry a non-empty string, or the provider throws `TypeError` when it reads the record. The provider compares the presented secret with every entry, and does not stop at the first match, so the time a request takes does not show which entry matched or how many there are.

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

| Group                                   | Reasons                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The request, before the client is known | `content_type`, `body`, `parameters`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Client authentication                   | `client_credentials_missing`, `client_credentials_ambiguous`, `client_credentials_malformed`, `client_unknown`, `client_method_mismatch`, `client_credentials_wrong`                                                                                                                                                                                                                                                                                          |
| The token request                       | `grant_type_missing`, `grant_type_unsupported`, `grant_type_unauthorized`, `parameter_missing`, `code_verifier_malformed`, `code_verifier_missing`, `code_verifier_unexpected`, `code_unknown`, `code_replayed`, `code_expired`, `code_client_mismatch`, `redirect_uri_mismatch`, `code_verifier_mismatch`, `scope_invalid`, `refresh_token_unknown`, `refresh_token_replayed`, `refresh_token_expired`, `refresh_token_client_mismatch`, `scope_not_granted` |
| Userinfo                                | `access_token_missing`, `access_token_malformed`, `access_token_unknown`, `access_token_expired`, `access_token_without_openid`                                                                                                                                                                                                                                                                                                                               |
| Revocation                              | `token_missing`, `token_of_another_client`                                                                                                                                                                                                                                                                                                                                                                                                                    |

The callback is called once for each refusal that is answered with an OAuth error response, after the response is built and before `handle` resolves. A `405` for a method the endpoint does not accept, and an `OPTIONS` preflight, are not reported. Authorization failures are not reported either, since `beginAuthorization` and `completeAuthorization` return their issues. The diagnostic never holds a value the request carried: no token, code, verifier, secret or redirect URI.

The callback may return a promise. `handle` awaits it, so a slow callback delays the response. If it throws or its promise rejects, `handle` rejects, the same as for a store failure, so keep it from throwing. A value that is not a function makes `createProvider` throw `TypeError`.
