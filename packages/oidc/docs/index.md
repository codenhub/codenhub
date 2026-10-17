---
title: Overview
description: What OpenID Connect is, which OidcKit entrypoint serves which side, the result shape every operation returns, and a full sign-in walkthrough.
---

# Sign users in and issue their tokens with OpenID Connect

`@codenhub/oidc` (OidcKit) implements OpenID Connect on both sides of the exchange. Its client is the relying party: the application that wants to know who a user is, and asks an identity provider to tell it. Its provider is the OpenID Provider: the service that authenticates users and issues the tokens a relying party can check. Both are written for the Fetch API, so the same code runs on Node.js, in browsers and on edge runtimes, and both use `@codenhub/jwt` for every signature.

It is written for both sides of a hostile network. Every response from the other side, such as a discovery document, a callback URL, a token response, a userinfo response or a token, is treated as untrusted input. An operation on such input returns a result, or an OAuth error response, and never throws.

## What OpenID Connect adds to OAuth 2.0

OAuth 2.0 lets an application call an API on a user's behalf: the user approves, the application receives an access token, and the API checks it. OAuth itself does not say who the user is. OpenID Connect adds that answer as a second token, an **ID token**, which is a JSON Web Token (JWT) signed by the provider. Its `sub` claim names the user, its `aud` claim names the application it was issued to, and its `iss` claim names the provider that signed it.

This package implements the **authorization code flow**, the one OpenID Connect recommends for every kind of application. The steps are:

1. The client sends the user's browser to the provider's authorization endpoint, with a random `state`, a random `nonce` and a PKCE challenge (RFC 7636).
2. The provider authenticates the user, asks for consent when the app requires it, and sends the browser back to the client's redirect URI with a short-lived, single-use `code`.
3. The client sends the code to the provider's token endpoint, together with the PKCE verifier, and receives an access token, an ID token and, when the user granted `offline_access`, a refresh token.
4. The client checks the ID token: its signature, issuer, audience, expiry, nonce and the other claims the spec names.

PKCE is required on every flow, including for confidential clients. The client and provider each see only what the other must see: the browser carries the code and the state, and the token endpoint, reached directly by the client, carries the verifier.

Beyond the code flow, the package also covers:

- **RP-initiated logout**, which ends the user's session at the provider. See [Client](client.md#ending-the-session-at-the-provider) and [Provider](provider.md#ending-sessions).
- **Client credentials** (RFC 6749 §4.4), which gives a service client a token for itself, with no user. See [Client](client.md#client-credentials).
- **JWT access tokens** (RFC 9068), as an option in place of the opaque default. See [Provider](provider.md#jwt-access-tokens).

## Which entrypoint to import

| Import                    | What it is for                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@codenhub/oidc`          | Types only: the result shape, the issue types, and the metadata, claims and token types. It has no runtime code.                                                   |
| `@codenhub/oidc/client`   | The relying party: `discover` and `createClient`, with the client's types.                                                                                         |
| `@codenhub/oidc/provider` | The OpenID Provider: `createProvider`, `generateClientSecret` and `hashClientSecret`, with the provider's types, including the `OidcStore` contract you implement. |
| `@codenhub/oidc/testing`  | `createMemoryStore`, an in-memory store for tests and examples. Not for production.                                                                                |

A deployment that runs a relying party imports from `/client`, and one that runs a provider imports from `/provider`. The two do not depend on each other, so a client bundle does not carry provider code.

## The result shape

Every operation on untrusted input returns this shape, which is the same as `@codenhub/jwt` returns:

```ts
import type { OidcIssue } from "@codenhub/oidc";

type OidcResult<T> = { ok: true; value: T } | { ok: false; error: { issues: [OidcIssue, ...OidcIssue[]] } };
```

A failed result lists every issue the operation found, in the order its checks ran, and the list is never empty. Each issue has a stable `code` to branch on, an optional `path` naming the place the issue concerns, and optional `params` of facts that are never input values. The result is deeply frozen. [Issues](errors.md) lists every code.

A few operations return a richer failure: `beginAuthorization` also returns a `redirect`, which is either the response to send to the client, or `null` when the app must render an error itself.

Failures the package cannot answer for a caller, such as an invalid option, a malformed store record or an outcome that contradicts the authorization request, are not results. They throw `TypeError`, or reject for the methods that are asynchronous, because they are bugs in the code calling the package and not something the other side did.

## Walkthrough: one sign-in

The two sides run in different processes, and the browser carries the messages between them. Here is one complete sign-in, with the step each side takes.

**At startup.** The relying party calls `discover("https://sso.example")`, which fetches the provider's discovery document, checks it, and returns the metadata. It creates a client from that metadata with `createClient`. Creating a client makes no request. The provider calls `createProvider` once, with its issuer, signing keys, store and claims callback, and serves the endpoints through `handle`.

**The user clicks sign in.** The relying party calls `client.authorize()` and gets back a `url` and a `pending` value. It stores `pending` in the user's server-side session, then redirects the browser to `url`. `pending` holds the state, the nonce and the PKCE verifier.

**The provider starts the request.** The browser reaches the provider's authorization endpoint, which the app serves. The app calls `provider.beginAuthorization(request)`. The package checks the request and saves it as an interaction. On success the app receives an `id` and the requested scopes, prompt and `max_age`. On failure the app either redirects the browser to the `redirect` it was given, or renders an error if `redirect` is `null`.

**The user signs in and consents.** The app authenticates the user by its own means, asks for consent when it must, and keeps the `id` in its own session. Then it calls `provider.completeAuthorization(id, { subject, authTime, scopes })`. The package returns a `302` to the client's redirect URI carrying a `code`, the `state` and the `iss`.

**The relying party finishes.** The browser arrives at the redirect URI, and the relying party calls `client.callback(url, pending)`. The client checks the `state` and the `iss`, redeems the code at the token endpoint with the PKCE verifier, and validates the ID token against the nonce. On success it returns the claims and the tokens.

**Later.** The relying party can call `client.userinfo` with the access token to get the profile claims the granted scopes release. When the access token is about to expire and it holds a refresh token, `client.refresh` exchanges that token for new tokens, and the app must store the new refresh token, since the old one is spent. To sign the user out, `client.revoke` revokes a token at the provider, see [Client](client.md#revoking-tokens), and `client.endSessionUrl` builds the URL that sends the browser to the provider's logout, see [Client](client.md#ending-the-session-at-the-provider). It does not end the session, so the app ends its own session too. A service client with no user gets its own token with `client.clientCredentials`, see [Client](client.md#client-credentials).

The detailed steps are in [Client](client.md) and [Provider](provider.md). The guarantees each step gives, and what an attacker gets by sending anything else, are in [Hostile input](security.md).

## Requirements

- Node.js 24 or newer, or a browser or edge runtime that provides Web Crypto, `fetch`, `Request`, `Response`, `URL`, `TextEncoder` and `TextDecoder`.
- `@codenhub/jwt` as a peer dependency, `^0.0.1`. Install one copy of it, because keys it creates are recognized only by the copy that created them.
- ES modules only. Ed25519 requires Web Crypto's Ed25519 support.

Every URL the package uses must be `https`, including the issuer, every endpoint and the JWKS URL, with no exception for `localhost`. The one exception is the redirect URI, which may use any scheme except `javascript:`, `data:`, `vbscript:` and `file:`, so a native app can register a custom scheme.

## Next steps

- [Client](client.md): Discovery, creating a client, sign-in, refresh, userinfo, revocation, ending the session at the provider, client credentials, and how the client authenticates to the token endpoint.
- [Provider](provider.md): Creating a provider, routing its endpoints, the authorization step, the token endpoint and its grants, ending sessions, JWT access tokens, and the published metadata.
- [Store](store.md): The persistence contract the provider needs, including the atomicity it requires and what cannot satisfy it.
- [Hostile input](security.md): What each input gets, every limit with its value, and what the package does not defend.
- [Issues](errors.md): Every issue code, where it comes from, and its path and params.
- [API reference](reference/index.md): Every export with its signature, generated from the TSDoc.
