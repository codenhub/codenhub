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

// /login: keep `pending` in the user's server-side session, then redirect the browser to `url`.
const { url, pending } = await client.authorize({ scope: ["openid", "profile"] });

// /callback: pass the URL the browser came back to, and the `pending` kept for it.
const signedIn = await client.callback(request.url, pending);
if (signedIn.ok) {
  console.log(signedIn.value.claims.sub);
}
```

Issue tokens, as an OpenID Provider. The app serves its own login and consent pages and the authorization endpoint, and the package answers the rest:

```ts
import { generateKeyPair } from "@codenhub/jwt";
import { createProvider, type OidcStore } from "@codenhub/oidc/provider";

declare const store: OidcStore; // your database adapter, see the Store page

const provider = createProvider({
  issuer: "https://sso.example",
  signingKeys: [await generateKeyPair({ alg: "ES256", kid: "2026-10" })],
  store,
  claims: ({ subject }) => ({ email: `${subject}@example.com` }), // your user lookup
});

export default {
  async fetch(request: Request): Promise<Response> {
    // Discovery, JWKS, token and userinfo. `null` for any other URL, including the authorization endpoint.
    const answered = await provider.handle(request);
    if (answered !== null) {
      return answered;
    }
    if (new URL(request.url).pathname === "/authorize") {
      const begun = await provider.beginAuthorization(request);
      // A redirect goes back to the client. `null` means the client could not be verified: show an error.
      return begun.ok ? showLogin(begun.value.id) : (begun.error.redirect ?? new Response("Invalid request.", { status: 400 }));
    }
    return new Response("Not found.", { status: 404 });
  },
};

declare function showLogin(interactionId: string): Response; // your login and consent page
```

## Documentation

- [Documentation overview](docs/index.md): what the code flow is, which entrypoint to import, the result shape, and a full sign-in walkthrough.
- [Client](docs/client.md): discovery, every `createClient` option, starting and finishing a sign-in, refresh, userinfo, and client authentication.
- [Provider](docs/provider.md): every `createProvider` option, routing, the authorization step, the token endpoint, userinfo, and the published metadata.
- [Store](docs/store.md): the persistence contract the provider needs, the atomicity it requires, and the in-memory reference for tests.
- [Hostile input](docs/security.md): what each kind of hostile input gets from each side, every limit, and what the package does not defend.
- [Issues](docs/errors.md): the result shape, every issue code with where it comes from, and what throws instead.

## Requirements

- Node.js 24 or newer. Browsers and edge runtimes such as Cloudflare Workers work too, when they provide Web Crypto, `fetch`, `Request`, `Response`, `URL`, `TextEncoder` and `TextDecoder`. The package uses no Node.js API.
- `@codenhub/jwt` `^0.0.1` as a peer dependency. The keys `@codenhub/jwt` creates are recognized only by the copy that created them. Your provider's signing keys and your client's keys must come from the copy this package loads, so install one version of it: `pnpm why @codenhub/jwt` should list one.
- ES modules only. `EdDSA` and `Ed25519` ID tokens need Web Crypto's Ed25519 support, which Node.js 24, Chrome 137, Firefox 129 and Safari 17 provide.

## Notes

- **Experimental.** See the note at the top. The security behavior, the meaning of each issue code, and the result shape are the parts meant to hold.
- **Authorization code flow only.** No implicit, hybrid or resource owner password flow. PKCE with `S256` is required of every client, and `plain` is refused.
- **Opaque access tokens only.** An access token is a random value the store looks up by digest. The package does not issue JWT access tokens.
- **Exact redirect matching.** A redirect URI must match a registered one byte for byte. Wildcards, prefixes, normalization and loopback redirects with variable ports are not supported.
- **The app keeps login, consent and sessions.** The provider decides what a request may ask for and checks the app's outcome against it. It does not decide who the user is, and it does not render pages.
- **Not yet:** token revocation (RFC 7009), logout, replay tracking for client assertion `jti` values, and certification by the OpenID conformance suite.

## License

Licensed under Apache-2.0. See [LICENSE](LICENSE).
