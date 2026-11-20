---
title: Encrypting tokens
description: Encrypting and decrypting compact JWE, the keys and algorithms it takes, signed tokens inside encrypted ones, a recipient's encryption JWKS, and what a forged token learns.
order: 7
---

# Encrypting tokens

A signed token proves who wrote it, and anyone holding it can read it. An encrypted token (JWE, RFC 7516) is the opposite: only the holder of the right key can read it, and on its own it proves nothing about who wrote it. `encrypt` seals bytes or text for a recipient's key, and a decrypter opens the token again:

```ts
import { createDecrypter, createJweKeySet, encrypt, generateJweKeyPair } from "@codenhub/jwt";

const recipient = await generateJweKeyPair({ alg: "ECDH-ES+A256KW", kid: "enc-2026-11" });

const token = await encrypt({ plaintext: "meet at the usual place", key: recipient.publicKey, enc: "A256GCM" });
// "eyJhbGciOiJFQ0RILUVTK0EyNTZLVyIsImVuYyI6IkEyNTZHQ00iLCJraWQiOi…" (five segments)

const decrypt = createDecrypter({ keys: createJweKeySet([recipient.privateKey]) });
const result = await decrypt(token);
if (result.ok) {
  new TextDecoder().decode(result.value.plaintext); // "meet at the usual place"
}
```

Only compact serialization is supported. As with signing, what you encrypt is your own data, so a mistake in it throws a `TypeError`; what you decrypt is someone else's, so it never throws and comes back as a result.

## Encryption keys are their own kind

JWE has its own three kinds of key, `JwePublicKey` (`kind: "jwe-public"`), `JwePrivateKey` (`"jwe-private"`) and `JweSecretKey` (`"jwe-secret"`), and they are never interchangeable with the signing keys of [Keys](keys.md): `sign`, `createKeySet` and a verifier throw for an encryption key, and `encrypt` and `createJweKeySet` throw for a signing key. Using one key both to sign and to encrypt is a cross-protocol mistake, and the types catch it before the code runs.

Each key is bound to exactly one **key management algorithm** (`alg`), the way a signing key is bound to one signature algorithm. The token's header never chooses: a decrypter fails a token whose `alg` is not its key's with `alg_mismatch`. The **content encryption algorithm** (`enc`) is chosen when encrypting, and a decrypter accepts the list in its `enc` option.

```ts
import { generateJweKeyPair, generateJweSecretKey, importJwePrivateKey, importJwePublicKey, importJweSecretKey } from "@codenhub/jwt";

const pair = await generateJweKeyPair({ alg: "RSA-OAEP-256", modulusLength: 3072, kid: "rsa-enc" });
const x25519 = await generateJweKeyPair({ alg: "ECDH-ES", crv: "X25519" });

const theirs = await importJwePublicKey(jwkFromTheirJwks, { alg: "RSA-OAEP-256" }); // result
const mine = await importJwePrivateKey(process.env.ENC_KEY_PEM, { alg: "ECDH-ES+A128KW" }); // result

const wrapping = await generateJweSecretKey({ alg: "A256KW", kid: "kek-1" });
const direct = await importJweSecretKey(thirtyTwoBytes, { alg: "dir", enc: "A256GCM" }); // result
```

The import functions take what their signing counterparts take, JWK, PEM and Web Crypto `CryptoKey`, and run the same checks for encryption: a JWK's `use`, when present, must be `enc`, its `key_ops` may hold only encryption operations, its `alg`, when present, must be the key's own, and an RSA modulus must be 2048 to 8192 bits. `importJweKeyPair` returns both halves, `getJwePublicKey` the public half of a private key, and `exportJwePublicJwk`, `exportJwePrivateJwk` and `exportJweSecretJwk` write JWKs with `use: "enc"`. `jwkThumbprint` takes JWE keys too. A secret must be exactly as long as its algorithm's key: 16 bytes for `A128KW`, 32 for `A256KW`, and for `dir` the length of its `enc` key.

A `dir` secret is the content key itself, so it is also bound to one `enc`: `encrypt` uses it, and a decrypter fails a token naming another `enc` for it with `alg_mismatch` at `["header", "enc"]`. A JWK of a `dir` key whose `alg` names the content algorithm, as RFC 7520's cookbook writes one, is `alg_mismatch`; drop its `alg` and pass `enc` instead.

## Encrypting

`encrypt` takes the plaintext, as a `Uint8Array` or as text encrypted as its UTF-8 bytes, the key, `enc`, and an optional `header`:

```ts
const token = await encrypt({
  plaintext: new TextEncoder().encode(JSON.stringify({ balance: 1200 })),
  key: wrapping,
  enc: "A128CBC-HS256",
  header: { typ: "secret+jwe" },
});
```

`alg` comes from the key, and `enc` is required except with a `dir` key, which already names its own. A fresh content key and IV are drawn for each token, and for `ECDH-ES` a fresh ephemeral key. The whole protected header is authenticated, so changing any byte of it makes the token fail.

`kid` defaults to the key's `kid`; `kid`, `typ` and `cty` must be strings. Other header parameters are written as given, with the JSON rules of [Signing tokens](signing.md), except those that change how a token is decrypted or ask the recipient to trust a key, which throw: `crit`, `zip`, `epk`, `apu`, `apv`, `iv`, `tag`, `p2s`, `p2c`, `b64`, `jwk`, `jku`, `x5u` and `x5c`.

## Decrypting

`createDecrypter` takes:

| Option      | Default             | Meaning                                                                                                    |
| ----------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `keys`      | required            | Where decryption keys come from: `createJweKeySet([...])`, or any object with a `select(header)` function. |
| `enc`       | every supported one | The content encryption algorithms accepted. Another fails with `unsupported_enc`, before any key is used.  |
| `maxLength` | 16384               | Maximum token length in characters, from 1 through 65536, checked before anything is decoded.              |

The decrypter resolves to `{ header, plaintext, key }`: the protected header, the decrypted bytes, and the key that opened the token. The header and result are frozen; `plaintext` is a fresh array that is yours. When the plaintext is JSON, `decodeJsonObject(plaintext)` reads it with the parser verifiers use, strict, depth-bounded and refusing repeated member names, and returns a result.

A decrypter's checks run in a fixed order and stop at the first failure:

1. The token is a string no longer than `maxLength`.
2. It has exactly five segments of strict base64url, and its header is a JSON object without repeated member names, with a supported `alg` and an accepted `enc`, and no `zip` or `crit`. The header is the protected one, the only header a compact token has.
3. The key set selects one key by `kid` and `alg`, as [Key sets](key-sets.md#how-a-key-is-selected) describes. Keys are never tried in turn.
4. For `ECDH-ES`, the header's `epk` is imported as a public key on the private key's curve, or fails with `malformed` at `["header", "epk"]`.
5. The content key is recovered, and the authentication tag is checked before any plaintext exists.

A decrypted token is not a verified one. Encrypting to a public key needs only the public key, which anyone can have, so a plaintext's claims say nothing about who wrote them until a signature does; that is what the next section is for. There is deliberately no function that reads claims from a bare JWE.

### What a forged token learns

Steps 1 to 4 fail with codes that describe the token's shape, which the attacker already knows. Step 5 is where a forger probes the key, so every failure there is the same: a key that does not unwrap, an RSA ciphertext that does not decrypt, a wrong tag, a tampered header, IV or ciphertext all give `decryption_failed`, with no path. When unwrapping fails, a random content key stands in and the token fails on its tag (RFC 7516 §11.5), so the answer is the same either way, and the CBC tag is compared in constant time. Log `decryption_failed` freely; it never holds a byte of the token.

Refused before any cryptography, with a result rather than a throw:

- **`RSA1_5`**, which RFC 8725 warns against: its padding oracle has decrypted traffic on real servers since 1998. It is `unsupported_alg`.
- **`PBES2-*`**, password-based keys, whose iteration count the token chooses, so a hostile one costs the recipient as much work as it asks for. It is `unsupported_alg`.
- **`zip`**, compression, which leaks the plaintext's content through the token's length and turns a small token into a large plaintext. It is `malformed` at `["header", "zip"]`.
- **`crit`**, as for signed tokens: `unsupported_crit`.

## Signed, then encrypted

A token that must be both private and authentic is signed, then encrypted (RFC 7519 §5.2). `encryptJwt` does both, taking `sign`'s input as `sign` and writing `cty: "JWT"`:

```ts
import { createNestedVerifier, createVerifier, encryptJwt } from "@codenhub/jwt";

const token = await encryptJwt({
  sign: { payload: { iss: "https://issuer.example", sub: "user-1", aud: "client-1", exp }, key: signingKey },
  key: clientEncryptionKey,
  enc: "A256GCM",
});

const verify = createNestedVerifier({
  decrypt: createDecrypter({ keys: createJweKeySet([clientDecryptionKey]) }),
  verify: createVerifier({ keys: issuerKeys, issuer: "https://issuer.example", audience: "client-1" }),
});
const result = await verify(token);
if (result.ok) {
  result.value.payload; // the verified claims
  result.value.encryption.header; // the outer JWE header
}
```

The nested verifier decrypts, requires a `cty` of `JWT` (in any casing, with or without `application/`) or none, and hands the plaintext to your verifier, which checks the inner token exactly as it would a bare one. A token that decrypts but does not verify fails with the verifier's issue; a different `cty` is `wrong_type` at `["header", "cty"]`.

## A recipient's encryption keys

To encrypt to someone, such as the client an OpenID Provider encrypts ID tokens for, you need their public key, usually from their JWKS. `importKeySet` and `createRemoteKeySet` read one with `use: "enc"`, and give an `EncryptionKeySet` whose `select` takes the algorithm you will use and, when you know it, the `kid`:

```ts
import { createRemoteKeySet, encrypt } from "@codenhub/jwt";

const clientKeys = createRemoteKeySet({ url: client.jwks_uri, use: "enc", algorithms: ["RSA-OAEP-256"] });
const selected = await clientKeys.select({ alg: "RSA-OAEP-256" });
if (selected.ok) {
  const token = await encrypt({ plaintext: idToken, key: selected.value, enc: "A256GCM" });
}
```

Only JWKs that say they encrypt are imported: `use: "enc"`, or, without `use`, a `key_ops` holding `encrypt`, `wrapKey`, `deriveKey` or `deriveBits`. A JWK with neither is skipped, so a JWKS that also lists signing keys never lends one to encryption. A JWK without `alg` is bound to each listed algorithm its key type fits, and `algorithms` defaults to every asymmetric key management algorithm. `issuer` is a signing option and throws here. Fetching, caching and cooldown work as [Key sets](key-sets.md#a-remote-key-set) describes.

## Algorithms

| `alg`            | Key management                                        | Key                                      |
| ---------------- | ----------------------------------------------------- | ---------------------------------------- |
| `dir`            | the secret is the content key                         | secret as long as its `enc` key          |
| `A128KW`         | AES key wrap                                          | 16-byte secret                           |
| `A256KW`         | AES key wrap                                          | 32-byte secret                           |
| `ECDH-ES`        | ephemeral ECDH, Concat KDF derives the content key    | `EC` on P-256, P-384 or P-521, or X25519 |
| `ECDH-ES+A128KW` | ephemeral ECDH, Concat KDF derives a 16-byte wrap key | `EC` on P-256, P-384 or P-521, or X25519 |
| `ECDH-ES+A256KW` | ephemeral ECDH, Concat KDF derives a 32-byte wrap key | `EC` on P-256, P-384 or P-521, or X25519 |
| `RSA-OAEP`       | RSAES-OAEP with SHA-1                                 | `RSA`, 2048 to 8192 bit                  |
| `RSA-OAEP-256`   | RSAES-OAEP with SHA-256                               | `RSA`, 2048 to 8192 bit                  |

| `enc`           | Content encryption                     | Content key |
| --------------- | -------------------------------------- | ----------- |
| `A128GCM`       | AES-GCM                                | 16 bytes    |
| `A256GCM`       | AES-GCM                                | 32 bytes    |
| `A128CBC-HS256` | AES-CBC with HMAC SHA-256, 16-byte tag | 32 bytes    |
| `A256CBC-HS512` | AES-CBC with HMAC SHA-512, 32-byte tag | 64 bytes    |

`RSA-OAEP` is here because providers still publish it; SHA-1's weaknesses do not reach OAEP, but prefer `RSA-OAEP-256` where both sides support it. The 192-bit variants, `A192KW`, `ECDH-ES+A192KW`, `A192GCM` and `A192CBC-HS384`, are not supported, because Chromium's Web Crypto has no 192-bit AES; a token using one fails with `unsupported_alg` or `unsupported_enc`.

X25519 needs Web Crypto's X25519 support: Node.js 26, Cloudflare Workers, Chrome and Firefox have it, and Playwright's WebKit on Windows does not. The other algorithms work wherever Web Crypto does. The lists may grow in a minor release, so give a `switch` over an `alg` or `enc` a default branch.
