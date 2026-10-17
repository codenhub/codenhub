# @codenhub/oidc

OidcKit is OpenID Connect for both sides of the exchange: a relying-party client that signs users in through an identity provider, and an OpenID Provider that issues the tokens. Both sides run on the Fetch API (`Request`, `Response`, `fetch`) and Web Crypto, and both use `@codenhub/jwt` for every signature. Anything the other side sends, such as a discovery document, a callback URL, a token response or a token, is untrusted input: an operation on it returns a result or an OAuth error response and never throws.

> **Experimental:** 0.0.1, before its first minor release. Option names, the `OidcStore` contract, issue `params` and function names may change before 0.1.0. The security behavior in the docs is not expected to loosen.

## Installation

```sh
pnpm add @codenhub/oidc @codenhub/jwt
```

`@codenhub/jwt` is a peer dependency, so install it yourself and let both packages share one copy. [Requirements](#requirements) explains why.

## Usage

Sign a user in through a provider, as a relying party:

```ts
import { createClient, discover } from "@codenhub/oidc/client";

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

// Login: keep `pending` in the user's server-side session, then redirect the browser to `url`.
const { url, pending } = await client.authorize({ scope: ["openid", "profile"] });

// Callback: `request` is the request the browser sent back, and `pending` is the value kept for it at login.
const signedIn = await client.callback(request.url, pending);
if (signedIn.ok) {
  console.log(signedIn.value.claims.sub);
}
```

To issue tokens as an OpenID Provider instead, see [Provider](docs/provider.md).

## Documentation

- [Documentation overview](docs/index.md): what the code flow is, which entrypoint to import, the result shape, and a full sign-in walkthrough.
- [Client](docs/client.md): discovery, every `createClient` option, starting and finishing a sign-in, refresh, userinfo, revocation, ending the session at the provider, client credentials, and client authentication.
- [Provider](docs/provider.md): every `createProvider` option, routing, the authorization step, the token endpoint, userinfo, revocation, ending sessions, JWT access tokens, and the published metadata.
- [Store](docs/store.md): the persistence contract the provider needs, the atomicity it requires, the in-memory reference for tests, and the conformance suite for store adapters.
- [Hostile input](docs/security.md): what each kind of hostile input gets from each side, every limit, and what the package does not defend.
- [Issues](docs/errors.md): the result shape, every issue code with where it comes from, what the app does with each client issue, and what throws instead.
- [API reference](docs/reference/index.md): every export with its signature, generated from the TSDoc.

## Requirements

- Node.js 24 or newer. Browsers and edge runtimes such as Cloudflare Workers work too, when they provide Web Crypto, `fetch`, `Request`, `Response`, `URL`, `TextEncoder` and `TextDecoder`. The package uses no Node.js API.
- `@codenhub/jwt` `^0.0.1` as a peer dependency. The keys `@codenhub/jwt` creates are recognized only by the copy that created them. Your provider's signing keys and your client's keys must come from the copy this package loads, so install one version of it: `pnpm why @codenhub/jwt` should list one.
- ES modules only. `EdDSA` and `Ed25519` ID tokens need Web Crypto's Ed25519 support, which Node.js 24, Chrome 137, Firefox 129 and Safari 17 provide.

## Notes

- **Experimental.** See the note at the top. The security behavior, the meaning of each issue code, and the result shape are the parts meant to hold.
- **Authorization code flow for users, client credentials for services.** No implicit, hybrid or resource owner password flow. PKCE with `S256` is required of every client, and `plain` is refused.
- **Opaque access tokens by default.** An access token is a random value the store looks up by digest. The provider can issue JWT access tokens (RFC 9068) instead, with `accessToken: { format: "jwt", audience }`. See [Provider](docs/provider.md#jwt-access-tokens).
- **Logout and service tokens.** `client.endSessionUrl` ends the session at the provider (RP-initiated logout), and `client.clientCredentials` gets a token for a client with no user. See [Client](docs/client.md#ending-the-session-at-the-provider) and [Client](docs/client.md#client-credentials).
- **Exact redirect matching.** A redirect URI must match a registered one byte for byte. Wildcards, prefixes, normalization and loopback redirects with variable ports are not supported.
- **The app keeps login, consent and sessions.** The provider decides what a request may ask for and checks the app's outcome against it. It does not decide who the user is, and it does not render pages.
- **Token revocation.** A client revokes a token with `client.revoke` (RFC 7009), and the provider serves the revocation endpoint. The provider revokes the whole sign-in with either kind of token. A client presenting another client's access token is refused with `invalid_request`, and that token is left alone. See [Client](docs/client.md#revoking-tokens) and [Provider](docs/provider.md).
- **Client assertion `jti` replay.** A client assertion's `jti` is required but not remembered, so an assertion can be replayed within its capped lifetime, which is five minutes plus the clock tolerance. This is by design: a replayed assertion alone yields nothing, since a code also needs its PKCE verifier and a refresh token is single-use. See [Hostile input](docs/security.md).
- **Not yet:** certification by the OpenID conformance suite, the 0.1 criterion. Not planned: loopback redirect URIs with variable ports, PAR, pairwise subject identifiers, and front-channel and back-channel logout.

## License

Licensed under Apache-2.0. See [LICENSE](LICENSE).
