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

Encryption keys are three further kinds, `"jwe-public"`, `"jwe-private"` and `"jwe-secret"`, made by their own functions; no signing or verifying function accepts them, and only `jwkThumbprint` takes both; [Encrypting tokens](encrypting.md#encryption-keys-are-their-own-kind) covers them.

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

| Issue                    | When                                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_key`            | The JWK is not a plain object, `kty`, `crv`, `alg`, `use`, `key_ops` or `kid` has the wrong type, or `key_ops` repeats an operation.                                                                                                                                                |
| `unsupported_key`        | `kty` or `crv` does not fit the algorithm: `ES256`, `ES384` and `ES512` take `EC` on `P-256`, `P-384` and `P-521`; `EdDSA` and `Ed25519` take `OKP` on `Ed25519`; `RS*` and `PS*` take `RSA`; `HS*` takes `oct`.                                                                    |
| `alg_mismatch`           | The JWK has an `alg` member naming another algorithm.                                                                                                                                                                                                                               |
| `wrong_use`              | `use` is present and is not `sig`, or `key_ops` is present and lacks `verify` (`sign` for a private key; either for a secret) or allows anything but `sign` and `verify`.                                                                                                           |
| `unexpected_private_key` | A public import holds a private member: `d`, `p`, `q`, `dp`, `dq`, `qi`, `oth` or `k`. A private JWK is refused rather than quietly stripped.                                                                                                                                       |
| `weak_key`               | An RSA modulus under 2048 bits, with `{ minimum: 2048 }`, or a secret shorter than its hash, with `{ minimum: 32 }`, `48` or `64`.                                                                                                                                                  |
| `unsupported_key`        | An RSA modulus over 8192 bits, with `{ maximum: 8192 }`, which bounds the cost of a verification.                                                                                                                                                                                   |
| `invalid_key`            | Key material is missing, is not canonical base64url, has the wrong length (coordinates are 32 bytes for P-256 and Ed25519, 48 for P-384 and 66 for P-521), or Web Crypto rejects it, such as a point that is not on the curve. An `OKP` JWK with a `y` is `invalid_key` at `["y"]`. |

Issue paths name the JWK member at fault, such as `["kty"]` or `["n"]`.

The `kid` option names a JWK that has no `kid`, so a JWK stored without one gets an identifier on import. A JWK whose own `kid` differs from the option is `invalid_key` at `["kid"]`, rather than one of them silently winning; the same `kid` in both is fine.

As for `generateKeyPair`, `kid: "thumbprint"` names the key by its public key's [thumbprint](#thumbprints), for every import function and every form of key: a JWK, a PEM string or a `CryptoKey`. A JWK with its own `kid` is then accepted only when that `kid` is the thumbprint, so the literal string `"thumbprint"` cannot be a `kid` given to an import.

Import ignores a JWK's `ext` and any member it does not know. A public key is always exportable. For a private or secret key, only the `extractable` option decides whether it can be exported again, so a JWK that says `ext: true` still gives a non-extractable key unless you pass `extractable: true`.

## Importing a PEM key

`importPublicKey`, `importPrivateKey` and `importKeyPair` also take a PEM string, as OpenSSL, cloud key services and secret stores hand keys out. A public key is a `PUBLIC KEY` block (SPKI), an `RSA PUBLIC KEY` block (PKCS#1) or a `CERTIFICATE` block (X.509), and a private key a `PRIVATE KEY` block (PKCS#8), an `RSA PRIVATE KEY` block (PKCS#1) or an `EC PRIVATE KEY` block (SEC 1). A PEM has no `kid`, so pass one as an option, as for a JWK without one:

```ts
import { importKeyPair } from "@codenhub/jwt";

const result = await importKeyPair(process.env.SIGNING_KEY_PEM ?? "", { alg: "RS256", kid: "2026-11" });
```

The PEM is read into the JWK of its key and every check in the table above runs on that, so a 1024-bit RSA key is `weak_key` whichever way it arrives. The string must be one block of at most 16384 characters, with nothing but whitespace around it. Whitespace inside the block is ignored, so either line ending works, and so does a PEM flattened onto one line, as an environment variable often holds it. Line breaks written as the two characters `\n` or `\r\n`, as a `.env` file or a JSON-encoded secret often leaves them, count as line breaks too. A PKCS#1 or SEC 1 key is wrapped into SPKI or PKCS#8 as it is read, and an `EC PRIVATE KEY` must name its curve, as OpenSSL writes it by default. A key of another type or curve than `alg` is `unsupported_key` at `["kty"]` or `["crv"]`, as for a JWK. A private key block given to `importPublicKey` is `unexpected_private_key`. The rest is `invalid_key`:

- with `{ reason: "encrypted" }`, an encrypted key: an `ENCRYPTED PRIVATE KEY` block, or a block whose headers say `Proc-Type: 4,ENCRYPTED`. Decrypt it first, such as with `openssl pkcs8 -topk8 -nocrypt -in key.pem`, and keep it in a secret store instead.
- with `{ reason: "unsupported_format" }`, a label this package does not read, such as `OPENSSH PRIVATE KEY` or `DSA PRIVATE KEY`, headers that do not say the key is encrypted, and an `EC PRIVATE KEY` without its curve.
- without `params`, anything malformed, and a public key block given to a private import. The DER of a `PUBLIC KEY`, `PRIVATE KEY`, `RSA PUBLIC KEY` or `RSA PRIVATE KEY` block, and the key inside a `CERTIFICATE`, must be one element with its length in the shortest form and nothing after it, as an `EC PRIVATE KEY` must: Web Crypto engines disagree on the rest, such as Node.js importing a `PUBLIC KEY` with bytes after it that browsers refuse, so the same PEM would import on one runtime and fail on another.

From a certificate, `importPublicKey` takes the public key and nothing else. It does not check the certificate's dates, issuer, chain, extensions or signature, so a certificate is exactly as trusted as the key in it would be: use one you got from a source you already trust, such as an identity provider's admin console, and not one a token or a client sent you. A `CERTIFICATE` given to a private import is `invalid_key`.

Without a `kid`, the key still verifies tokens that name a `kid`, as long as it is the only key in its set without a `kid` for that algorithm ([how a key is selected](key-sets.md#how-a-key-is-selected)).

## Importing a private key

`importPrivateKey` takes the same arguments and runs the same checks, except that the private members are required: `d` for `EC` and `OKP` keys, and `d`, `p`, `q`, `dp`, `dq` and `qi` for `RSA` keys. Multi-prime RSA keys, with `oth`, are `unsupported_key`. The public members must belong to the private key: the key signs a fixed message that they must verify, and a JWK whose halves come from two keys is `invalid_key`. For RSA, no private member may be longer than `n`, without its leading zero bytes, or it is `invalid_key` at that member, which bounds the arithmetic below. `d` must agree with `p`, `q`, `dp` and `dq`, or it is `invalid_key` at `["d"]`; `qi` must be the inverse of `q` modulo `p`, or it is `invalid_key` at `["qi"]`; and `p` times `q` must be `n`, or it is `invalid_key` at `["n"]`. The signature cannot catch either: a signer that uses only `p`, `q`, `dp`, `dq` and `qi` never reads `d`, and OpenSSL, behind Node's Web Crypto, signs again with `d` when that result is wrong, so a wrong `qi` still signs correctly. Another library signing with the exported JWK would use the wrong member. Pass `extractable: true` if the key must be exportable again.

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

`importSecretKey` takes either the secret's raw bytes, as any typed array, `DataView` or `ArrayBuffer`, including one from another realm such as an iframe or a `node:vm` context, or an `oct` JWK. A string is a compile error, since it could be text, base64 or hex; encode it to bytes first. A string that reaches it anyway, from untyped code, returns `invalid_key`:

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

`kid` sets the identifier for raw bytes, and for a JWK as [for a public JWK](#importing-a-public-key): it names a JWK without a `kid`, and one with another `kid` is `invalid_key` at `["kid"]`. `kid: "thumbprint"` names the secret by its `oct` thumbprint (RFC 7638 §3.2), a SHA-256 hash of the secret; a `CryptoKey` must then be extractable, or the result is `invalid_key`, since its secret cannot be read.

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

## Keys held by a KMS or HSM

A key held by a cloud KMS or an HSM never leaves it: the service signs on request. `createExternalSigningKey` makes a private key from the public key and a function that asks the service for a signature, and `sign` uses it like any other private key:

```ts
import { GetPublicKeyCommand, KMSClient, SignCommand } from "@aws-sdk/client-kms";
import { createExternalSigningKey, importPublicKey, sign } from "@codenhub/jwt";

const kms = new KMSClient({});
const KeyId = "alias/jwt-signing";

// KMS returns the public key as DER SPKI; import it through Web Crypto.
const { PublicKey } = await kms.send(new GetPublicKeyCommand({ KeyId }));
const spki = await crypto.subtle.importKey("spki", new Uint8Array(PublicKey!), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
const imported = await importPublicKey(spki, { alg: "ES256", kid: "kms-2026" });
if (!imported.ok) throw new Error("The KMS public key could not be imported.");

const signingKey = createExternalSigningKey({
  publicKey: imported.value,
  signatureFormat: "der",
  sign: async (data) => {
    // Send the SHA-256 digest: MessageType "RAW" caps the message at 4096 bytes, which a token can exceed.
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    const command = new SignCommand({ KeyId, Message: digest, MessageType: "DIGEST", SigningAlgorithm: "ECDSA_SHA_256" });
    const { Signature } = await kms.send(command);
    return Signature!;
  },
});
const token = await sign({ payload: { sub: "u1", exp }, key: signingKey });
```

- `alg` and `kid` come from `publicKey`, so import it with the `kid` your JWKS publishes. `getPublicKey`, `jwkThumbprint` and `embedKey` work with the key; `exportPrivateJwk` throws, since the material is not here.
- `sign` receives the JWS signing input, the bytes the service must sign with `alg`'s hash, and resolves to a `Uint8Array` or an `ArrayBuffer`. It is called once per token, and only then: creating the key calls nothing.
- `signatureFormat: "der"` converts the DER `Ecdsa-Sig-Value` that AWS KMS and Google Cloud KMS return for an ECDSA key into the `r || s` form JWS uses. A PKCS#11 token's `CKM_ECDSA` signature is already `r || s`, so leave the default `"raw"` for it, unless an adapter in between returns DER. It is only for `ES256`, `ES384` and `ES512`; RSA and EdDSA signatures have one form. The DER must be strict, or `sign` throws.
- Every signature is checked for the length `alg` gives it, the modulus length for RSA, and verified with `publicKey` before `sign` returns the token, so a function that signs with another key, or the wrong format, makes `sign` throw a `TypeError` rather than hand out a token no one can verify. A rejection from the function rejects `sign` unchanged.

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
- `exportPublicPem` exports a public key as an SPKI `PUBLIC KEY` PEM, and `exportPrivatePem` a private key as an unencrypted PKCS#8 `PRIVATE KEY` PEM, for tools that read PEM rather than JWK, such as OpenSSL or a KMS that imports key material. They follow the same rules as their JWK counterparts, wrap the base64 at 64 characters and end with a line break. A PEM carries no `alg` or `kid`, so pass them again when importing it back.

Every exported JWK is frozen, names `kty`, `alg` and `use: "sig"`, includes `kid` when the key has one, lists its members in a stable order, and carries no `ext` or `key_ops`. Re-importing it with the same `alg` gives an equivalent key.

The results are typed by what they hold: `exportPublicJwk` returns a `PublicJwk`, `exportPrivateJwk` a `PrivateJwk` and `exportSecretJwk` a `SecretJwk`, and `Jwk` is the union of all three. Narrow one on `kty` to reach its members: `EcPublicJwk` and `EcPrivateJwk` for `EC`, `OkpPublicJwk` and `OkpPrivateJwk` for `OKP`, `RsaPublicJwk` and `RsaPrivateJwk` for `RSA`, and `OctJwk` for `oct`. A member another key type has is typed as absent, so `jwk.n` is `undefined` on an `EC` JWK rather than a compile error, and `jwk.d !== undefined` narrows a `Jwk` to a `PrivateJwk`. The import functions take any value, so a JWK parsed from JSON needs none of these types.

## Thumbprints

`jwkThumbprint` computes a key's JWK SHA-256 Thumbprint (RFC 7638): 43 base64url characters that name the key by its material alone, whatever its `alg` or `kid`. Pass the public key or the private key; both give the same thumbprint, and a private key need not be extractable. JWE public and private keys work too.

```ts
import { importPrivateKey, jwkThumbprint } from "@codenhub/jwt";

const result = await importPrivateKey(env.SIGNING_KEY_PEM, { alg: "ES256" });
if (!result.ok) throw new Error("The signing key could not be imported.");
const kid = await jwkThumbprint(result.value);
```

To generate or import a key already named by its thumbprint, pass `kid: "thumbprint"` to `generateKeyPair` or to an import function.

Use it for a `kid` that follows from the key, or for the `jkt` that binds an access token to a DPoP key, as [DPoP proofs](dpop.md#verifying-proofs) shows.

A secret has a thumbprint too, of its `oct` JWK, so `jwkThumbprint` takes a secret created with `extractable: true` and throws a `TypeError` for one created without it, since the thumbprint is computed from the secret itself.

`jwkThumbprintUri` gives the same thumbprint as a JWK Thumbprint URI (RFC 9278), `urn:ietf:params:oauth:jwk-thumbprint:sha-256:` followed by the thumbprint, for a protocol that names a key by URI.

`certificateThumbprint` computes the SHA-256 thumbprint of an X.509 certificate, the base64url SHA-256 of its DER: the `x5t#S256` of a JOSE header, or the `x5t#S256` of the `cnf` claim that binds an access token to a client certificate (RFC 8705). It takes one `CERTIFICATE` PEM block and throws a `TypeError` for anything else. It hashes the certificate as given and checks nothing in it, such as its validity period or its chain.

```ts
import { certificateThumbprint } from "@codenhub/jwt";

const cnf = { "x5t#S256": await certificateThumbprint(clientCertificatePem) };
```

## Algorithms

`JWS_ALGORITHMS` lists every algorithm this package signs and verifies with, `ASYMMETRIC_ALGORITHMS` and `SYMMETRIC_ALGORITHMS` split it by key kind, and `isJwsAlgorithm`, `isAsymmetricAlgorithm` and `isSymmetricAlgorithm` check a value against them, exactly and case-sensitively. Use them to validate an `alg` from configuration or a discovery document before passing it on:

```ts
import { isAsymmetricAlgorithm } from "@codenhub/jwt";

const algorithms = metadata.id_token_signing_alg_values_supported.filter(isAsymmetricAlgorithm);
```

The lists may grow in a minor release, as [the algorithm table](index.md#keys-are-bound-to-one-algorithm) says. Copy them into your own code and they will be out of date by exactly one release.
