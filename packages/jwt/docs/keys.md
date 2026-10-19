---
title: Keys
description: Public, private and secret keys, importing JWKs and raw secrets, generating keys, exporting them, and what an import refuses.
order: 3
---

# Keys

A key in this package is a small frozen object such as `{ kind: "public", alg: "ES256", kid: "2026-10" }`. The key material itself is held inside the package, out of reach: it is not a property of the object, it does not appear in `JSON.stringify(key)`, and it never appears in an issue. Only key objects this package created are accepted anywhere a key is expected; a copy or a look-alike with the same fields throws a `TypeError`.

"This package" means one copy of it. A key is recognized only by the copy of `@codenhub/jwt` that created it, so a program that loads two copies, such as two versions installed side by side, gets keys that the other copy refuses:

- `createKeySet` throws the `TypeError` meant for look-alikes ("Expected a key created by @codenhub/jwt …, not a look-alike object"), although the key is real, and `sign` and the export functions reject with it.
- When a verifier's key set, whether one created by the other copy or a [custom key set](key-sets.md#your-own-key-set), selects a key from the other copy, the token fails with `key_fetch_failed` and `{ reason: "key_set_error" }`. Tokens that fail before or during selection keep their own issues.

To avoid it, make sure the program resolves one copy: deduplicate the install (for example with `npm dedupe` or `pnpm dedupe`, and `npm ls @codenhub/jwt` to check). A library built on this package should declare it as a `peerDependency`, not a `dependency`, so it uses the application's copy instead of bringing its own.

## Three kinds of key

| `kind`      | Type         | Algorithms                                    | Does               |
| ----------- | ------------ | --------------------------------------------- | ------------------ |
| `"public"`  | `PublicKey`  | `ES256`, `EdDSA`, `Ed25519`, `RS256`, `PS256` | verifies           |
| `"private"` | `PrivateKey` | `ES256`, `EdDSA`, `Ed25519`, `RS256`, `PS256` | signs              |
| `"secret"`  | `SecretKey`  | `HS256`                                       | signs and verifies |

Asymmetric algorithms use a key pair: the private key signs, and the public key, which you can share freely, verifies. `HS256` uses one shared secret for both, so everyone who can verify a token can also forge one; use it only between parties that already trust each other with the secret.

A secret key is never interchangeable with a public key. A key set holding public keys never selects a secret for an asymmetric token, and the reverse, because selection requires the key's `alg` to equal the token's.

Every key has an `alg`, the one algorithm it is bound to, and may have a `kid`, the identifier tokens use to name it. Private and secret keys also have `extractable`, which says whether their material may be exported again.

## Generating keys

```ts
import { generateKeyPair, generateSecretKey } from "@codenhub/jwt";

const { privateKey, publicKey } = await generateKeyPair({ alg: "ES256", kid: "2026-10" });
const rsa = await generateKeyPair({ alg: "RS256", kid: "rsa-1", modulusLength: 3072 });
const secret = await generateSecretKey({ alg: "HS256", kid: "internal" });
```

Both keys of a pair carry the same `alg` and `kid`. `modulusLength` is 2048, 3072 or 4096 bits, for `RS256` and `PS256` only, and defaults to 2048. A generated secret is 32 random bytes.

Generated private and secret keys are not extractable unless you pass `extractable: true`. Keep that default for keys that live only as long as the process; set it when you need to store the key, as shown under [Exporting keys](#exporting-keys).

On Linux builds of WebKit, such as WebKitGTK and WPE browsers and Playwright's Linux WebKit, generating an `EdDSA` or `Ed25519` pair rejects with Web Crypto's `OperationError` in about 1 call in 128, because of a WebKit bug fixed upstream that releases may not include yet. Each call fails independently, so retry `generateKeyPair` on `OperationError` a bounded number of times: three failures in a row happen about once in two million calls. Importing, signing, verifying and exporting Ed25519 keys are not affected: in a run of 50,000 generations on Playwright's Linux WebKit, only generation failed, and every key it did generate exported, imported, signed and verified.

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

| Issue                    | When                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_key`            | The JWK is not a plain object, or `kty`, `crv`, `alg`, `use`, `key_ops` or `kid` has the wrong type.                                                                                     |
| `unsupported_key`        | `kty` or `crv` does not fit the algorithm: `ES256` takes `EC` on `P-256`; `EdDSA` and `Ed25519` take `OKP` on `Ed25519`; `RS256` and `PS256` take `RSA`; `HS256` takes `oct`.            |
| `alg_mismatch`           | The JWK has an `alg` member naming another algorithm.                                                                                                                                    |
| `wrong_use`              | `use` is present and is not `sig`, or `key_ops` is present and lacks `verify` (`sign` for a private key; either for a secret).                                                           |
| `unexpected_private_key` | A public import holds a private member: `d`, `p`, `q`, `dp`, `dq`, `qi`, `oth` or `k`. A private JWK is refused rather than quietly stripped.                                            |
| `weak_key`               | An RSA modulus under 2048 bits, with `{ minimum: 2048 }`, or a secret under 32 bytes, with `{ minimum: 32 }`.                                                                            |
| `unsupported_key`        | An RSA modulus over 8192 bits, with `{ maximum: 8192 }`, which bounds the cost of a verification.                                                                                        |
| `invalid_key`            | Key material is missing, is not canonical base64url, has the wrong length (EC and Ed25519 coordinates are 32 bytes), or Web Crypto rejects it, such as a point that is not on the curve. |

Issue paths name the JWK member at fault, such as `["kty"]` or `["n"]`.

## Importing a private key

`importPrivateKey` takes the same arguments and runs the same checks, except that the private members are required: `d` for `EC` and `OKP` keys, and `d`, `p`, `q`, `dp`, `dq` and `qi` for `RSA` keys. Multi-prime RSA keys, with `oth`, are `unsupported_key`. Pass `extractable: true` if the key must be exportable again.

```ts
import { importPrivateKey } from "@codenhub/jwt";

const result = await importPrivateKey(jwk, { alg: "PS256", extractable: false });
```

## Importing a secret

`importSecretKey` takes either the secret's raw bytes or an `oct` JWK:

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

The secret must be at least 32 bytes, or the result is `weak_key` with `{ minimum: 32 }`: HMAC with SHA-256 is only as strong as its key, and a short or human-chosen secret can be guessed offline from a single token. Generate secrets with `generateSecretKey` or another source of random bytes, not by hand.

A JWK's `key_ops` is checked but does not restrict the secret key: one imported with `key_ops: ["verify"]` can still sign. Whoever holds an HMAC secret can compute the same signature with any other library, so a verify-only secret would protect nothing.

`kid` sets the identifier for raw bytes. For a JWK, the JWK's own `kid` is used and the option is ignored.

## Exporting keys

Export functions are separate and named for what they reveal, so code that exports private material says so:

```ts
import { exportPrivateJwk, exportPublicJwk, generateKeyPair } from "@codenhub/jwt";

const { privateKey, publicKey } = await generateKeyPair({ alg: "Ed25519", kid: "2026-10", extractable: true });

const publicJwk = await exportPublicJwk(publicKey);
// { kty: "OKP", alg: "Ed25519", use: "sig", kid: "2026-10", crv: "Ed25519", x: "…" }

const privateJwk = await exportPrivateJwk(privateKey); // store it as you would a password
```

- `exportPublicJwk` exports any public key, imported or generated, with its public members only. Publish its output in your JWKS as `{ keys: [publicJwk] }`.
- `exportPrivateJwk` exports a private key's public and private members, and `exportSecretJwk` a secret as an `oct` JWK. Both throw a `TypeError` for a key created without `extractable: true`.

Every exported JWK is frozen, names `kty`, `alg` and `use: "sig"`, includes `kid` when the key has one, lists its members in a stable order, and carries no `ext` or `key_ops`. Re-importing it with the same `alg` gives an equivalent key.
