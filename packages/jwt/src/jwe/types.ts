import type { JwtPayload, JwtResult, VerifiedJwt } from "../core/types";

/**
 * JWE key management algorithms (RFC 7518 §4) this package encrypts and decrypts with.
 *
 * `RSA1_5`, the `PBES2-*` algorithms and the 192-bit key wraps (`A192KW`, `A192GCMKW`, `ECDH-ES+A192KW`) are
 * never among them. A minor release may add one, so code that switches over it keeps a default branch.
 */
export type KeyManagementAlgorithm = SymmetricKeyManagementAlgorithm | AsymmetricKeyManagementAlgorithm;

/**
 * Key management algorithms whose key is a shared secret: `dir` uses it as the content key, and `A*KW` (AES key
 * wrap) and `A*GCMKW` (AES-GCM) wrap a fresh one for each token.
 */
export type SymmetricKeyManagementAlgorithm = "dir" | "A128KW" | "A256KW" | "A128GCMKW" | "A256GCMKW";

/** Key management algorithms whose key is a key pair: the sender encrypts to the recipient's public key. */
export type AsymmetricKeyManagementAlgorithm =
  | "RSA-OAEP"
  | "RSA-OAEP-256"
  | "RSA-OAEP-384"
  | "RSA-OAEP-512"
  | "ECDH-ES"
  | "ECDH-ES+A128KW"
  | "ECDH-ES+A256KW";

/**
 * JWE content encryption algorithms (RFC 7518 §5) this package encrypts and decrypts with. The 192-bit variants
 * are absent, since Chromium's Web Crypto has no 192-bit AES. A minor release may add one.
 */
export type ContentEncryptionAlgorithm = "A128GCM" | "A256GCM" | "A128CBC-HS256" | "A256CBC-HS512";

/** Curves an `ECDH-ES` key pair may use. */
export type JweCurve = "P-256" | "P-384" | "P-521" | "X25519";

/**
 * A public key bound to exactly one key management algorithm. It only encrypts: it never verifies a signature,
 * and no JWS function accepts it.
 *
 * Keys are opaque, as {@link PublicKey} is: the material never appears in the object or in any issue. Only keys
 * created by this package are accepted; a look-alike object throws `TypeError`.
 */
export interface JwePublicKey {
  /** Discriminates the JWE key kinds from each other and from the JWS ones. */
  readonly kind: "jwe-public";
  /** The one key management algorithm this key encrypts with. */
  readonly alg: AsymmetricKeyManagementAlgorithm;
  /** Key identifier written to the `kid` header of tokens encrypted to this key, unless overridden. */
  readonly kid?: string;
}

/** A private key bound to exactly one key management algorithm. It only decrypts, and no JWS function accepts it. */
export interface JwePrivateKey {
  /** Discriminates the JWE key kinds from each other and from the JWS ones. */
  readonly kind: "jwe-private";
  /** The one key management algorithm this key decrypts with. A token whose header names another fails. */
  readonly alg: AsymmetricKeyManagementAlgorithm;
  /** Key identifier used to select this key for a token. */
  readonly kid?: string;
  /** Whether {@link exportJwePrivateJwk} may export this key's material. */
  readonly extractable: boolean;
}

/**
 * A shared secret bound to exactly one key management algorithm. With `dir` it is the content key itself, and is
 * also bound to one `enc`; with `A128KW`, `A256KW`, `A128GCMKW` or `A256GCMKW` it wraps a fresh content key for
 * each token. It encrypts and decrypts, never signs, and is never interchangeable with a JWS {@link SecretKey}.
 */
export interface JweSecretKey {
  /** Discriminates the JWE key kinds from each other and from the JWS ones. */
  readonly kind: "jwe-secret";
  /** The one key management algorithm this key works with. */
  readonly alg: SymmetricKeyManagementAlgorithm;
  /** For a `dir` key, the one content encryption algorithm it is the key of. Absent for the others. */
  readonly enc?: ContentEncryptionAlgorithm;
  /** Key identifier used for selection and written to the `kid` header when encrypting. */
  readonly kid?: string;
  /** Whether {@link exportJweSecretJwk} may export this key's material. */
  readonly extractable: boolean;
}

/** A key that can encrypt a JWE. */
export type JweEncryptionKey = JwePublicKey | JweSecretKey;

/** A key that can decrypt a JWE. */
export type JweDecryptionKey = JwePrivateKey | JweSecretKey;

/** A JSON Web Key for encryption, as this package exports it. Every exported JWK is frozen. */
export interface JweJwk {
  readonly kty: "EC" | "OKP" | "RSA" | "oct";
  readonly alg: KeyManagementAlgorithm;
  readonly use: "enc";
  readonly kid?: string;
  readonly crv?: JweCurve;
  readonly x?: string;
  readonly y?: string;
  readonly n?: string;
  readonly e?: string;
  readonly d?: string;
  readonly p?: string;
  readonly q?: string;
  readonly dp?: string;
  readonly dq?: string;
  readonly qi?: string;
  readonly k?: string;
}

/** A JWE protected header that passed every structural check. Frozen. */
export interface JweHeader {
  /** The key management algorithm the token claims. Always one this package supports. */
  readonly alg: KeyManagementAlgorithm;
  /** The content encryption algorithm the token claims. Always one this package supports. */
  readonly enc: ContentEncryptionAlgorithm;
  /** Key identifier, when the token names one. */
  readonly kid?: string;
  /** Media type of the whole token. */
  readonly typ?: string;
  /** Media type of the plaintext: `JWT` for a signed token nested inside. */
  readonly cty?: string;
  /** The sender's ephemeral public key, for the `ECDH-ES` algorithms. */
  readonly epk?: Readonly<Record<string, unknown>>;
  /** Agreement PartyUInfo for the `ECDH-ES` algorithms, base64url. */
  readonly apu?: string;
  /** Agreement PartyVInfo for the `ECDH-ES` algorithms, base64url. */
  readonly apv?: string;
  /** Any other header parameter, unverified in meaning and never used by this package. */
  readonly [parameter: string]: unknown;
}

/**
 * A source of decryption keys. A decrypter asks it for the one key that matches a token's header, by `kid` and
 * `alg` exactly as {@link KeySet.select} does; keys are never tried in turn. {@link createJweKeySet} returns one.
 */
export interface JweKeySet {
  /**
   * Selects the single key for a header.
   *
   * @returns The key, or a failure with `unknown_kid`, `alg_mismatch`, `no_matching_key` or `ambiguous_key`.
   * Never throws for any header.
   */
  select(header: JweHeader): Promise<JwtResult<JweDecryptionKey>>;
}

/** A key set over a fixed list of decryption keys, from {@link createJweKeySet}. Frozen. */
export interface LocalJweKeySet extends JweKeySet {
  /** The keys the set selects from, in the order given. Frozen. */
  readonly keys: readonly JweDecryptionKey[];
}

/** What a sender picks a recipient's encryption key by: the key management algorithm, and the `kid` when known. */
export interface EncryptionKeyQuery {
  readonly alg: AsymmetricKeyManagementAlgorithm;
  readonly kid?: string;
}

/**
 * A source of a recipient's public encryption keys, such as the JWKS of a client an OpenID Provider encrypts ID
 * tokens to. `importEncryptionKeySet(jwks)` and `createRemoteEncryptionKeySet({ url })` return one.
 */
export interface EncryptionKeySet {
  /**
   * Selects the single key for an algorithm and an optional `kid`, by the rules of {@link KeySet.select}.
   *
   * @returns The key, or a failure with `unknown_kid`, `alg_mismatch`, `no_matching_key`, `ambiguous_key` or
   * `key_fetch_failed`. Never throws.
   */
  select(query: EncryptionKeyQuery): Promise<JwtResult<JwePublicKey>>;
}

/** An encryption key set over a fixed list of keys, from `importEncryptionKeySet(jwks)`. Frozen. */
export interface LocalEncryptionKeySet extends EncryptionKeySet {
  /** One key per JWK and algorithm it was bound to, in JWKS order. Frozen. */
  readonly keys: readonly JwePublicKey[];
}

/** A decrypted JWE. Frozen, except `plaintext`, a fresh array that belongs to the caller. */
export interface DecryptedJwe {
  /** The protected header. */
  readonly header: JweHeader;
  /** The decrypted bytes. {@link decodeJsonObject} reads a JSON object from them strictly. */
  readonly plaintext: Uint8Array<ArrayBuffer>;
  /** The key that decrypted the token. */
  readonly key: JweDecryptionKey;
}

/**
 * A configured decrypter. Call it with any value; it never throws for a token, whatever its content.
 *
 * @returns The decrypted token, or a failure with the first issue found.
 */
export type Decrypter = (token: unknown) => Promise<JwtResult<DecryptedJwe>>;

/** A signed token that was encrypted, then decrypted and verified. Frozen. */
export interface DecryptedJwt<TPayload extends JwtPayload = JwtPayload> extends VerifiedJwt<TPayload> {
  /** The outer JWE's protected header, and the key that decrypted it. */
  readonly encryption: {
    readonly header: JweHeader;
    readonly key: JweDecryptionKey;
  };
}

/** A configured decrypt-then-verify function. Never throws for a token, whatever its content. */
export type NestedVerifier<TPayload extends JwtPayload = JwtPayload> = (
  token: unknown,
) => Promise<JwtResult<DecryptedJwt<TPayload>>>;
