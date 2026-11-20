---
title: Keys
description: Public, private and secret keys, importing JWKs, PEM, Web Crypto keys and raw secrets, generating keys, exporting them, and what an import refuses.
order: 3
---

# Keys

A key in this package is a small frozen object such as `{ kind: "public", alg: "ES256", kid: "2026-10" }`. The key material itself is held inside the package, out of reach: it is not a property of the object, it does not appear in `JSON.stringify(key)`, and it never appears in an issue. Only key objects this package created are accepted anywhere a key is expected; a copy or a look-alike with the same fields throws a `TypeError`.

"This package" means one copy of it. A key is recognized only by the copy of `@codenhub/jwt` that created it, so a program that loads two copies, such as two versions installed side by side, gets keys that the other copy refuses:

- `createKeySet` throws the `TypeError` meant for look-alikes ("Expected a key created by @codenhub/jwt …, not a look-alike object"), although the key is real, and `sign` and the export functions reject with it.
- When a verifier's key set, whether one created by the other copy or a [custom key set](key-sets.md#your-own-key-set), selects a key from the other copy, the token fails with `key_fetch_failed` and `{ reason: "key_set_error" }`. Tokens that fail before or during selection keep their own issues.

To avoid it, make sure the program resolves one copy: deduplicate the install (for example with `npm dedupe` or `pnpm dedupe`, and `npm ls @codenhub/jwt` to check). A library built on this package should declare it as a `peerDependency`, not a `dependency`, so it uses the application's copy instead of bringing its own.

## Three kinds of key

| `kind`      | Type         | Algorithms                | Does               |
| ----------- | ------------ | ------------------------- | ------------------ |
| `"public"`  | `PublicKey`  | every asymmetric one      | verifies           |
| `"private"` | `PrivateKey` | every asymmetric one      | signs              |
| `"secret"`  | `SecretKey`  | `HS256`, `HS384`, `HS512` | signs and verifies |

The asymmetric algorithms are `ES256`, `ES384`, `ES512`, `EdDSA`, `Ed25519`, `RS256`, `RS384`, `RS512`, `PS256`, `PS384`, `PS512`. The list of algorithms may grow in a minor release, which widens `JwsAlgorithm` and the types built on it, so give a `switch` over an `alg` a default branch.

Asymmetric algorithms use a key pair: the private key signs, and the public key, which you can share freely, verifies. HMAC (`HS256`, `HS384`, `HS512`) uses one shared secret for both, so everyone who can verify a token can also forge one; use it only between parties that already trust each other with the secret.

A secret key is never interchangeable with a public key. A key set holding public keys never selects a secret for an asymmetric token, and the reverse, because selection requires the key's `alg` to equal the token's.

Every key has an `alg`, the one algorithm it is bound to, and may have a `kid`, the identifier tokens use to name it. Private and secret keys also have `extractable`, which says whether their material may be exported again.

## Generating keys

```ts
import { generateKeyPair, generateSecretKey } from "@codenhub/jwt";

const { privateKey, publicKey } = await generateKeyPair({ alg: "ES256", kid: "2026-10" });
const rsa = await generateKeyPair({ alg: "RS256", kid: "rsa-1", modulusLength: 3072 });
const secret = await generateSecretKey({ alg: "HS256", kid: "internal" });
```

Both keys of a pair carry the same `alg` and `kid`. `kid: "thumbprint"` names them by the public key's [thumbprint](#thumbprints) instead, so the literal string `"thumbprint"` cannot be a `kid` of a generated pair. `modulusLength` is 2048, 3072 or 4096 bits, for the `RS` and `PS` algorithms only, and defaults to 2048. A generated secret is as long as its hash: 32 random bytes for `HS256`, 48 for `HS384` and 64 for `HS512`.

Generated private and secret keys are not extractable unless you pass `extractable: true`. Keep that default for keys that live only as long as the process; set it when you need to store the key, as shown under [Exporting keys](#exporting-keys).

On Linux builds of WebKit, such as WebKitGTK and WPE browsers and Playwright's Linux WebKit, generating an `EdDSA` or `Ed25519` pair rejects with Web Crypto's `OperationError` in about 1 call in 128, because of a WebKit bug fixed upstream that releases may not include yet. Each call fails independently, so `generateKeyPair` retries that error up to three times for these two algorithms: it rejects with `OperationError` only after four failures in a row, about once in 270 million calls. Importing, signing, verifying and exporting Ed25519 keys are not affected: in a run of 50,000 generations on Playwright's Linux WebKit, only generation failed, and every key it did generate exported, imported, signed and verified.

If you are choosing an algorithm for tokens you issue, `ES256` and `Ed25519` give small keys and signatures and are fast. `RS256` is the one every JWT library supports. `EdDSA` exists for issuers that already publish it.

## Importing a public key

A JSON Web Key (JWK, RFC 7517) is a JSON object describing a key. Identity providers publish their public keys as JWKs. Import one with the algorithm you expect it to be used with:

```ts
import { importPublicKey } from "@codenhub/jwt";

const result = await importPublicKey(
  {
    kty: "EC",
    crv: "P-256",
    kid: "2026-10",
    x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
    y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
  },
  { alg: "ES256" },
);

if (result.ok) {
  const publicKey = result.value; // { kind: "public", alg: "ES256", kid: "2026-10" }
}
```

You always name the algorithm. A JWK's own `alg` member is optional in RFC 7517, and an attacker who controls a JWK controls it, so it is only checked against the algorithm you named, never used to pick one. To import every key of a JWKS document, use [`importKeySet`](key-sets.md#importing-a-jwks) instead, which works out each key's algorithms for you.

The JWK is untrusted input, so the import never throws for it, whatever it is: a failure is a result with one issue, and the issue never holds a value of the JWK. The checks, in order:

| Issue                    | When                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invalid_key`            | The JWK is not a plain object, `kty`, `crv`, `alg`, `use`, `key_ops` or `kid` has the wrong type, or `key_ops` repeats an operation.                                                                                           |
| `unsupported_key`        | `kty` or `crv` does not fit the algorithm: `ES256`, `ES384` and `ES512` take `EC` on `P-256`, `P-384` and `P-521`; `EdDSA` and `Ed25519` take `OKP` on `Ed25519`; `RS*` and `PS*` take `RSA`; `HS*` takes `oct`.               |
| `alg_mismatch`           | The JWK has an `alg` member naming another algorithm.                                                                                                                                                                          |
| `wrong_use`              | `use` is present and is not `sig`, or `key_ops` is present and lacks `verify` (`sign` for a private key; either for a secret) or allows anything but `sign` and `verify`.                                                      |
| `unexpected_private_key` | A public import holds a private member: `d`, `p`, `q`, `dp`, `dq`, `qi`, `oth` or `k`. A private JWK is refused rather than quietly stripped.                                                                                  |
| `weak_key`               | An RSA modulus under 2048 bits, with `{ minimum: 2048 }`, or a secret shorter than its hash, with `{ minimum: 32 }`, `48` or `64`.                                                                                             |
| `unsupported_key`        | An RSA modulus over 8192 bits, with `{ maximum: 8192 }`, which bounds the cost of a verification.                                                                                                                              |
| `invalid_key`            | Key material is missing, is not canonical base64url, has the wrong length (coordinates are 32 bytes for P-256 and Ed25519, 48 for P-384 and 66 for P-521), or Web Crypto rejects it, such as a point that is not on the curve. |

Issue paths name the JWK member at fault, such as `["kty"]` or `["n"]`.

The `kid` option names a JWK that has no `kid`, so a JWK stored without one gets an identifier on import. A JWK whose own `kid` differs from the option is `invalid_key` at `["kid"]`, rather than one of them silently winning; the same `kid` in both is fine.

Import ignores a JWK's `ext` and any member it does not know. A public key is always exportable. For a private or secret key, only the `extractable` option decides whether it can be exported again, so a JWK that says `ext: true` still gives a non-extractable key unless you pass `extractable: true`.

## Importing a PEM key

`importPublicKey`, `importPrivateKey` and `importKeyPair` also take a PEM string, as OpenSSL, cloud key services and secret stores hand keys out. A public key is a `PUBLIC KEY` block (SPKI) or a `CERTIFICATE` block (X.509), and a private key a `PRIVATE KEY` block (PKCS#8). A PEM has no `kid`, so pass one as an option, as for a JWK without one:

```ts
import { importKeyPair } from "@codenhub/jwt";

const result = await importKeyPair(process.env.SIGNING_KEY_PEM ?? "", { alg: "RS256", kid: "2026-11" });
```

The PEM is read into the JWK of its key and every check in the table above runs on that, so a 1024-bit RSA key is `weak_key` whichever way it arrives. The string must be one block of at most 16384 characters, with nothing but whitespace around it. Whitespace inside the block is ignored, so either line ending works, and so does a PEM flattened onto one line, as an environment variable often holds it. Line breaks written as the two characters `\n` or `\r\n`, as a `.env` file or a JSON-encoded secret often leaves them, count as line breaks too. Anything else is `invalid_key`: other labels, including `RSA PRIVATE KEY` (PKCS#1), `EC PRIVATE KEY` (SEC 1) and encrypted keys, which Web Crypto cannot read; a key of another type or curve than `alg`; and a `PUBLIC KEY` given to a private import. A `PRIVATE KEY` given to `importPublicKey` is `unexpected_private_key`. Convert other formats to PKCS#8 first, such as with `openssl pkcs8 -topk8 -nocrypt -in key.pem`.

From a certificate, `importPublicKey` takes the public key and nothing else. It does not check the certificate's dates, issuer, chain, extensions or signature, so a certificate is exactly as trusted as the key in it would be: use one you got from a source you already trust, such as an identity provider's admin console, and not one a token or a client sent you. A `CERTIFICATE` given to a private import is `invalid_key`.

Without a `kid`, the key still verifies tokens that name a `kid`, as long as it is the only key in its set without a `kid` for that algorithm ([how a key is selected](key-sets.md#how-a-key-is-selected)).

## Importing a private key

`importPrivateKey` takes the same arguments and runs the same checks, except that the private members are required: `d` for `EC` and `OKP` keys, and `d`, `p`, `q`, `dp`, `dq` and `qi` for `RSA` keys. Multi-prime RSA keys, with `oth`, are `unsupported_key`. The public members must belong to the private key: the key signs a fixed message that they must verify, and a JWK whose halves come from two keys is `invalid_key`. Pass `extractable: true` if the key must be exportable again.

```ts
import { importPrivateKey } from "@codenhub/jwt";

const result = await importPrivateKey(jwk, { alg: "PS256", extractable: false });
```

`getPublicKey(privateKey)` gives the public half of a private key, bound to the same `alg` and carrying the same `kid`, so a key loaded alone can still publish its JWK or verify its own tokens. It works for every private key this package creates, extractable or not, and returns the same public key each time it is called with the same private key.

## Importing a key pair

A private JWK also carries the key's public members, so one stored JWK is enough to load a signing key and publish its public half. `importKeyPair` takes the same arguments and runs the same checks as `importPrivateKey`, and returns `{ privateKey, publicKey }`, both bound to `alg` and carrying the JWK's `kid`, like `generateKeyPair`'s result:

```ts
import { exportPublicJwk, importKeyPair } from "@codenhub/jwt";

const result = await importKeyPair(storedPrivateJwk, { alg: "ES256" });
if (!result.ok) {
  throw new Error("The signing key could not be imported.");
}
const { privateKey, publicKey } = result.value;
const jwks = { keys: [await exportPublicJwk(publicKey)] };
```

Before returning the pair, it signs a fixed message with the private key and verifies it with the public one. A JWK whose public members belong to another key is `invalid_key`, so the pair can never issue tokens its own public key fails to verify. Prefer it to importing the two halves from separately stored JWKs, which nothing checks belong together.

## Importing a secret

`importSecretKey` takes either the secret's raw bytes or an `oct` JWK. A string is a compile error, since it could be text, base64 or hex; encode it to bytes first. A string that reaches it anyway, from untyped code, returns `invalid_key`:

```ts
import { importSecretKey } from "@codenhub/jwt";

const fromBytes = await importSecretKey(new TextEncoder().encode(process.env.JWT_SECRET ?? ""), {
  alg: "HS256",
  kid: "internal",
});
if (!fromBytes.ok) throw new Error(`JWT_SECRET is unusable: ${fromBytes.error.issues[0].code}`);
const internalKey = fromBytes.value;

const fromJwk = await importSecretKey({ kty: "oct", k: "GawgguFyGrWKav7AX4VKUg_XNIYiNtwWfhSJZK2uIEA" }, { alg: "HS256" });
if (!fromJwk.ok) throw new Error(`JWK is unusable: ${fromJwk.error.issues[0].code}`);
console.log(fromJwk.value.alg); // "HS256"
```

The `k` in that example is a published test vector, not a secret to reuse.

The secret must be at least as long as the hash, 32 bytes for `HS256`, 48 for `HS384` and 64 for `HS512`, or the result is `weak_key` with that `minimum`: HMAC is only as strong as its key, and a short or human-chosen secret can be guessed offline from a single token. Generate secrets with `generateSecretKey` or another source of random bytes, not by hand.

A JWK's `key_ops` is checked but does not restrict the secret key: one imported with `key_ops: ["verify"]` can still sign. Whoever holds an HMAC secret can compute the same signature with any other library, so a verify-only secret would protect nothing.

`kid` sets the identifier for raw bytes, and for a JWK as [for a public JWK](#importing-a-public-key): it names a JWK without a `kid`, and one with another `kid` is `invalid_key` at `["kid"]`.

## Importing a Web Crypto key

Every import function also takes a Web Crypto `CryptoKey`, for keys an application made or keeps with `crypto.subtle` itself. The main case is a browser that must sign without ever being able to read its key, such as a DPoP client: generate the pair non-extractable, keep it in IndexedDB, which stores a `CryptoKey` as it is, and import it each time the page loads:

```ts
import { importKeyPair } from "@codenhub/jwt";

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
// … store `pair` in IndexedDB, and read it back on a later visit …
const result = await importKeyPair(pair, { alg: "ES256" });
if (!result.ok) throw new Error("The device key could not be imported.");
const { privateKey, publicKey } = result.value;
```

- `importPublicKey` takes a public `CryptoKey`. It is exported and checked as a JWK, so it must be extractable, as every public key `generateKey` makes is. A private one is `unexpected_private_key`.
- `importPrivateKey` and `importKeyPair` take a `CryptoKeyPair`. The private `CryptoKey` is kept as it is, never exported, so a non-extractable key stays so; the public one runs through the JWK checks; and a probe signature proves the two belong together and that the private key fits `alg`, its hash and padding included. Anything that does not fit is `invalid_key`. They also take an extractable private `CryptoKey` alone, which is exported and read as a JWK; a non-extractable one alone is `invalid_key`, since its public half cannot be read from it.
- `importSecretKey` takes an HMAC `CryptoKey`, kept as it is. It must use the algorithm's hash and have both the `sign` and `verify` usages, or it is `invalid_key`, and be at least as long as the hash, or it is `weak_key`.

A `CryptoKey` must have been made for signing with `alg`: one whose Web Crypto algorithm or hash differs, such as an `RSA-OAEP` encryption key or an `ECDH` key, is `alg_mismatch`, even though its material would fit, and a public one without the `verify` usage is `wrong_use`. Exporting a `CryptoKey` drops what it was made for, so without this check one key could end up both encrypting and signing.

A `CryptoKey` has no `kid`, so pass one as an option. A public key is always exportable. For a private or secret key, `extractable: true` needs an extractable `CryptoKey`, or the result is `invalid_key`; without it, the imported key cannot be exported even when the `CryptoKey` could be.

## Exporting keys

Export functions are separate and named for what they reveal, so code that exports private material says so:

```ts
import { exportPrivateJwk, exportPublicJwk, generateKeyPair } from "@codenhub/jwt";

const { privateKey, publicKey } = await generateKeyPair({ alg: "Ed25519", kid: "2026-10", extractable: true });

const publicJwk = await exportPublicJwk(publicKey);
// { kty: "OKP", alg: "Ed25519", use: "sig", kid: "2026-10", crv: "Ed25519", x: "…" }

const privateJwk = await exportPrivateJwk(privateKey); // store it as you would a password
```

- `exportPublicJwk` exports any public key, imported or generated, with its public members only. Publish its output in your JWKS as `{ keys: [publicJwk] }`. For a private key, export `getPublicKey(privateKey)`; passing the private key itself throws a `TypeError` that says so.
- `exportPrivateJwk` exports a private key's public and private members, and `exportSecretJwk` a secret as an `oct` JWK. Both throw a `TypeError` for a key created without `extractable: true`.

Every exported JWK is frozen, names `kty`, `alg` and `use: "sig"`, includes `kid` when the key has one, lists its members in a stable order, and carries no `ext` or `key_ops`. Re-importing it with the same `alg` gives an equivalent key.

## Thumbprints

`jwkThumbprint` computes a key pair's JWK SHA-256 Thumbprint (RFC 7638): 43 base64url characters that name the key by its material alone, whatever its `alg` or `kid`. Pass the public key or the private key; both give the same thumbprint, and a private key need not be extractable.

```ts
import { importPrivateKey, jwkThumbprint } from "@codenhub/jwt";

const result = await importPrivateKey(env.SIGNING_KEY_PEM, { alg: "ES256" });
if (!result.ok) throw new Error("The signing key could not be imported.");
const kid = await jwkThumbprint(result.value);
```

To generate a pair already named by its thumbprint, pass `kid: "thumbprint"` to `generateKeyPair`.

Use it for a `kid` that follows from the key, or for the `jkt` that binds an access token to a DPoP key, as [Signing tokens](signing.md#dpop-proofs) shows.

## Algorithms

`JWS_ALGORITHMS` lists every algorithm this package signs and verifies with, `ASYMMETRIC_ALGORITHMS` and `SYMMETRIC_ALGORITHMS` split it by key kind, and `isJwsAlgorithm`, `isAsymmetricAlgorithm` and `isSymmetricAlgorithm` check a value against them, exactly and case-sensitively. Use them to validate an `alg` from configuration or a discovery document before passing it on:

```ts
import { isAsymmetricAlgorithm } from "@codenhub/jwt";

const algorithms = metadata.id_token_signing_alg_values_supported.filter(isAsymmetricAlgorithm);
```

The lists may grow in a minor release, as [the algorithm table](index.md#keys-are-bound-to-one-algorithm) says. Copy them into your own code and they will be out of date by exactly one release.
