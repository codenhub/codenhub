# @codenhub/jwt

JwtKit signs and verifies JSON Web Tokens with Web Crypto, imports and exports JSON Web Keys, and picks verification keys from a local set or from an issuer's JWKS URL. It is written for the side that receives tokens it did not issue:

- **The algorithm comes from the key, never from the token.** Every key is bound to one algorithm when it is generated or imported, and `none` is not an algorithm here in any casing.
- **Claims are never read from an unverified token.** There is no `decode`; only the header can be read before verification, to choose a key.
- **Bad input is cheap and never throws.** A token's length is capped before it is decoded, JSON is parsed strictly and to a bounded depth, and a remote JWKS is fetched with a timeout, a size cap and a cooldown.
- **Issues never hold a value of the input**, so logging a failed verification cannot log a token or a key.

ES256, EdDSA, Ed25519, RS256, PS256 and HS256 are supported, with no dependencies.

> **Experimental:** 0.0.1, before its first minor release. Function names, option names, issue codes and their `params` may still change before 0.1.0; the security behavior above will not be weakened.

## Installation

```sh
pnpm add @codenhub/jwt
```

## Usage

Verify tokens from an issuer that publishes its keys, such as an OpenID Connect provider:

```ts
import { createRemoteKeySet, createVerifier } from "@codenhub/jwt";

const verify = createVerifier({
  keys: createRemoteKeySet({ url: "https://issuer.example/.well-known/jwks.json" }),
  issuer: "https://issuer.example",
  audience: "api",
  requiredClaims: ["sub", "exp"],
});

const result = await verify(token);

if (result.ok) {
  console.log(result.value.payload.sub); // verified, and present since it is required
} else {
  result.error.issues; // e.g. [{ code: "expired", path: ["payload", "exp"] }]
}
```

Create the verifier once and call it for every token. It accepts any value and never throws for a token; an invalid option throws a `TypeError` when the verifier is created.

Sign tokens with a key you generate or import:

```ts
import { createKeySet, createVerifier, generateKeyPair, sign } from "@codenhub/jwt";

const { privateKey, publicKey } = await generateKeyPair({ alg: "ES256", kid: "2026-10" });

const token = await sign({
  payload: { sub: "user-1", exp: Math.floor(Date.now() / 1000) + 300 },
  key: privateKey,
});

const result = await createVerifier({ keys: createKeySet([publicKey]) })(token);
```

Times in claims are seconds since the Unix epoch. `sign` adds no claim of its own, and a token without `exp` never expires unless you require it.

## What hostile input gets

Each line runs against the built package with the result its comment states:

```ts
import { createKeySet, createRemoteKeySet, createVerifier, generateKeyPair, generateSecretKey, sign } from "@codenhub/jwt";

const { privateKey, publicKey } = await generateKeyPair({ alg: "RS256" });
const verify = createVerifier({ keys: createKeySet([publicKey]) });
const part = (json: string) => Buffer.from(json).toString("base64url");

// `alg: none`, in any casing, is not an algorithm.
await verify(`${part('{"alg":"none"}')}.${part('{"sub":"admin"}')}.AAAA`); // code "unsupported_alg"

// An HMAC token is never checked with an RSA public key as its secret.
await verify(await sign({ payload: { sub: "admin" }, key: await generateSecretKey({ alg: "HS256" }) })); // code "no_matching_key"

// A header that names a member twice is refused, where JSON.parse would keep the last one.
await verify(`${part('{"alg":"RS256","alg":"none"}')}.${part("{}")}.AAAA`); // code "duplicate_key"

// A 10 MB token is refused before any of it is decoded.
await verify("a".repeat(10_000_000)); // code "too_large", params { limit: "length", maximum: 8192 }

// Claims are not read from a token whose signature fails, and the failure holds none of them.
const [header, , signature] = (await sign({ payload: { sub: "user-1" }, key: privateKey })).split(".");
const forged = await verify(`${header}.${part('{"sub":"admin"}')}.${signature}`); // code "bad_signature"
JSON.stringify(forged).includes("admin"); // false

// A thousand tokens with invented `kid`s cost the issuer one JWKS request, not a thousand.
let fetches = 0;
const remote = createRemoteKeySet({
  url: "https://issuer.example/jwks.json",
  fetch: async () => {
    fetches += 1;
    return Response.json({ keys: [] });
  },
});
const viaRemote = createVerifier({ keys: remote });
for (let index = 0; index < 1000; index += 1) {
  await viaRemote(`${part(`{"alg":"RS256","kid":"invented-${index}"}`)}.${part("{}")}.AAAA`); // code "unknown_kid"
}
fetches; // 1
```

## Documentation

- [Documentation overview](docs/index.md)
- [Verifying tokens](docs/verifying.md)
- [Signing tokens](docs/signing.md)
- [Keys](docs/keys.md)
- [Key sets](docs/key-sets.md)
- [Issues](docs/errors.md)

## Requirements

- Node.js 24 or newer, or another runtime with Web Crypto, `TextEncoder` and `TextDecoder`, plus `fetch`, `AbortController` and `setTimeout` for remote key sets. No Node.js API is used, so browsers, Deno, Bun and Cloudflare Workers work too.
- `EdDSA` and `Ed25519` need Web Crypto's Ed25519 support: Node.js 24, Chrome 137, Firefox 129 or Safari 17.
- ESM-aware package resolution. The package is ESM only and marked `sideEffects: false`.

## Notes

- **Only compact JWS.** No encrypted tokens (JWE), no JWS JSON serialization, no unencoded payloads (`b64`), and no `crit` header extensions; tokens using them are rejected.
- **Claim checks are generic.** Issuer, audience, `typ`, times, maximum age and required claims are checked here. Protocol rules such as OpenID Connect's `nonce`, `azp` or `at_hash` are left to the code above.
- **Clock tolerance defaults to 0 seconds**, and is capped at 300. Set `clockTolerance` when the issuer's clock may differ from yours.

## License

Licensed under Apache-2.0.
