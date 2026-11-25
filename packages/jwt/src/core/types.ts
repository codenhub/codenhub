import type { StandardSchemaV1 } from "../interop/standard-schema";

/** Object key or array index leading to a value inside a token's header or payload. */
export type JwtPathSegment = string | number;

/**
 * Stable category of a failure that callers can branch on without parsing messages.
 *
 * Token codes come from {@link Verifier} and {@link readHeader}; key codes from the `import*`
 * functions and key sets; `key_fetch_failed` from any key set that fails, remote or custom.
 *
 * A minor release may add codes, and values of `params.reason`, when a new check or failure needs its own
 * name; an existing one never changes meaning. Handle an unknown code as a failure like any other.
 */
export type JwtIssueCode =
  // Token structure
  | "malformed"
  | "too_large"
  | "duplicate_key"
  | "unsupported_crit"
  | "unsupported_alg"
  // Key selection and signature
  | "unknown_kid"
  | "no_matching_key"
  | "ambiguous_key"
  | "alg_mismatch"
  | "bad_signature"
  | "key_fetch_failed"
  // Claims
  | "expired"
  | "not_yet_valid"
  | "issued_in_future"
  | "too_old"
  | "wrong_issuer"
  | "wrong_subject"
  | "wrong_audience"
  | "wrong_type"
  | "missing_claim"
  | "invalid_claim"
  | "schema_failed"
  // Key import
  | "invalid_key"
  | "unsupported_key"
  | "weak_key"
  | "unexpected_private_key"
  | "wrong_use";

/**
 * A single reason a token or key was rejected.
 *
 * An issue this package creates never holds a value taken from the input: no token segment, claim value,
 * header value, or key material. It names which check failed and, where useful, the limit or the claim the
 * check used. A `schema_failed` path is whatever the caller's schema reports, which for a record-style
 * schema can include claim names from the token. A custom key set's issues are passed through, so those
 * hold only what the caller's code puts in them.
 */
export interface JwtIssue {
  /** Stable failure category. */
  readonly code: JwtIssueCode;
  /**
   * Location the issue refers to, such as `["payload", "exp"]` or `["header", "kid"]`. Omitted when the
   * issue concerns the token or key as a whole.
   */
  readonly path?: readonly JwtPathSegment[];
  /**
   * Facts taken from the caller's own configuration or from this package's limits, such as
   * `{ maximum: 8192 }` for `too_large` or `{ claim: "sub" }` for `missing_claim`. Never an input value.
   */
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}

/** Everything a failed operation found. */
export interface JwtFailure {
  /** Every issue found, in the order checks ran. Never empty. */
  readonly issues: readonly [JwtIssue, ...JwtIssue[]];
}

/** Successful outcome, carrying its value. */
export interface JwtOk<T> {
  readonly ok: true;
  /** The frozen result. */
  readonly value: T;
}

/** Failed outcome, carrying every issue found. */
export interface JwtErr {
  readonly ok: false;
  /** What went wrong. */
  readonly error: JwtFailure;
}

/**
 * What every operation on untrusted input returns instead of throwing. The shape matches
 * `@codenhub/validation`'s result, so code that handles one handles the other.
 */
export type JwtResult<T> = JwtOk<T> | JwtErr;

/**
 * Asymmetric JWS algorithms this package signs and verifies with.
 *
 * A minor release may add an algorithm to this union, so code that switches over it keeps a default
 * branch. An algorithm is removed or renamed only in a major release.
 */
export type AsymmetricAlgorithm =
  | "ES256"
  | "ES384"
  | "ES512"
  | "EdDSA"
  | "Ed25519"
  | "RS256"
  | "RS384"
  | "RS512"
  | "PS256"
  | "PS384"
  | "PS512";

/** Symmetric (HMAC) JWS algorithms this package signs and verifies with. A minor release may add one. */
export type SymmetricAlgorithm = "HS256" | "HS384" | "HS512";

/** Every JWS algorithm this package supports. `none` is never one of them. A minor release may add one. */
export type JwsAlgorithm = AsymmetricAlgorithm | SymmetricAlgorithm;

/**
 * An asymmetric public key bound to exactly one algorithm. It only verifies.
 *
 * Keys are opaque: the key material is held internally and never appears in the object, its JSON form,
 * or any issue. Only keys created by this package are accepted; a look-alike object throws `TypeError`.
 */
export interface PublicKey {
  /** Discriminates the three key kinds. */
  readonly kind: "public";
  /** The one algorithm this key verifies with. A token whose header names another fails. */
  readonly alg: AsymmetricAlgorithm;
  /** Key identifier used for selection, from the JWK `kid` or the generation options. */
  readonly kid?: string;
  /**
   * The issuer this key verifies tokens for, when a key set bound it with its `issuer` option. A verifier
   * that selects the key then requires the token's `iss` to equal it, whatever its own `issuer` option says.
   */
  readonly issuer?: string;
}

/** An asymmetric private key bound to exactly one algorithm. It only signs. */
export interface PrivateKey {
  /** Discriminates the three key kinds. */
  readonly kind: "private";
  /** The one algorithm this key signs with. */
  readonly alg: AsymmetricAlgorithm;
  /** Key identifier written to the `kid` header of tokens this key signs, unless overridden. */
  readonly kid?: string;
  /** Whether {@link exportPrivateJwk} may export this key's material. */
  readonly extractable: boolean;
}

/**
 * A symmetric (HMAC) secret bound to exactly one algorithm. It signs and verifies, and is never
 * interchangeable with an asymmetric key: a key set or verifier holding public keys never selects it
 * for a token whose header names an asymmetric algorithm, and the reverse.
 */
export interface SecretKey {
  /** Discriminates the three key kinds. */
  readonly kind: "secret";
  /** The one algorithm this key signs and verifies with. */
  readonly alg: SymmetricAlgorithm;
  /** Key identifier used for selection and written to the `kid` header when signing. */
  readonly kid?: string;
  /** Whether {@link exportSecretJwk} may export this key's material. */
  readonly extractable: boolean;
  /**
   * The issuer this key verifies tokens for, when a key set bound it with its `issuer` option. A verifier
   * that selects the key then requires the token's `iss` to equal it, whatever its own `issuer` option says.
   */
  readonly issuer?: string;
}

/** A key that can sign. */
export type SigningKey = PrivateKey | SecretKey;

/** A key that can verify. */
export type VerificationKey = PublicKey | SecretKey;

/** The key material members of a JWK, across every key type. */
type JwkMaterialMember = "crv" | "x" | "y" | "n" | "e" | "d" | "p" | "q" | "dp" | "dq" | "qi" | "k";

/**
 * The members every JWK this package exports has, and every material member of other key types as absent, so
 * a member of any JWK can still be read by name: `jwk.n` is `undefined` on an `EC` key rather than a compile
 * error, and `jwk.d !== undefined` tells a private JWK from a public one.
 */
type JwkMembers<TAlgorithm extends JwsAlgorithm, TOwn extends JwkMaterialMember> = {
  readonly alg: TAlgorithm;
  readonly use: "sig";
  readonly kid?: string;
} & { readonly [TMember in Exclude<JwkMaterialMember, TOwn>]?: never };

/** An elliptic-curve public key (RFC 7518 §6.2), as {@link exportPublicJwk} exports an `ES*` key. */
export interface EcPublicJwk extends JwkMembers<Extract<AsymmetricAlgorithm, `ES${string}`>, "crv" | "x" | "y"> {
  readonly kty: "EC";
  readonly crv: "P-256" | "P-384" | "P-521";
  readonly x: string;
  readonly y: string;
}

/** An elliptic-curve private key, as {@link exportPrivateJwk} exports an `ES*` key. */
export interface EcPrivateJwk
  extends
    JwkMembers<Extract<AsymmetricAlgorithm, `ES${string}`>, "crv" | "x" | "y" | "d">,
    Pick<EcPublicJwk, "kty" | "crv" | "x" | "y"> {
  readonly d: string;
}

/** An Ed25519 public key (RFC 8037 §2), as {@link exportPublicJwk} exports an `EdDSA` or `Ed25519` key. */
export interface OkpPublicJwk extends JwkMembers<Extract<AsymmetricAlgorithm, `Ed${string}`>, "crv" | "x"> {
  readonly kty: "OKP";
  readonly crv: "Ed25519";
  readonly x: string;
}

/** An Ed25519 private key, as {@link exportPrivateJwk} exports an `EdDSA` or `Ed25519` key. */
export interface OkpPrivateJwk
  extends
    JwkMembers<Extract<AsymmetricAlgorithm, `Ed${string}`>, "crv" | "x" | "d">,
    Pick<OkpPublicJwk, "kty" | "crv" | "x"> {
  readonly d: string;
}

/** An RSA public key (RFC 7518 §6.3), as {@link exportPublicJwk} exports an `RS*` or `PS*` key. */
export interface RsaPublicJwk extends JwkMembers<
  Extract<AsymmetricAlgorithm, `RS${string}` | `PS${string}`>,
  "n" | "e"
> {
  readonly kty: "RSA";
  readonly n: string;
  readonly e: string;
}

/** An RSA private key with its CRT members, as {@link exportPrivateJwk} exports an `RS*` or `PS*` key. */
export interface RsaPrivateJwk
  extends
    JwkMembers<
      Extract<AsymmetricAlgorithm, `RS${string}` | `PS${string}`>,
      "n" | "e" | "d" | "p" | "q" | "dp" | "dq" | "qi"
    >,
    Pick<RsaPublicJwk, "kty" | "n" | "e"> {
  readonly d: string;
  readonly p: string;
  readonly q: string;
  readonly dp: string;
  readonly dq: string;
  readonly qi: string;
}

/** An HMAC secret (RFC 7518 §6.4), as {@link exportSecretJwk} exports it. */
export interface OctJwk extends JwkMembers<SymmetricAlgorithm, "k"> {
  readonly kty: "oct";
  readonly k: string;
}

/** An elliptic-curve JWK, public or private. */
export type EcJwk = EcPublicJwk | EcPrivateJwk;
/** An Ed25519 JWK, public or private. */
export type OkpJwk = OkpPublicJwk | OkpPrivateJwk;
/** An RSA JWK, public or private. */
export type RsaJwk = RsaPublicJwk | RsaPrivateJwk;

/** A public JWK, as {@link exportPublicJwk} exports it. Narrow it on `kty`. */
export type PublicJwk = EcPublicJwk | OkpPublicJwk | RsaPublicJwk;
/** A private JWK, its public members included, as {@link exportPrivateJwk} exports it. Narrow it on `kty`. */
export type PrivateJwk = EcPrivateJwk | OkpPrivateJwk | RsaPrivateJwk;
/** A secret JWK, as {@link exportSecretJwk} exports it. */
export type SecretJwk = OctJwk;

/**
 * A JSON Web Key as this package exports it: one of the shapes above, told apart by `kty`, and by `d` or `k`
 * for private material. Every exported JWK is frozen.
 */
export type Jwk = PublicJwk | PrivateJwk | SecretJwk;

/** A verified or inspected JWS protected header. Frozen. */
export interface JwtHeader {
  /** The algorithm the token claims. Always one this package supports. */
  readonly alg: JwsAlgorithm;
  /** Key identifier, when the token names one. */
  readonly kid?: string;
  /** Media type of the whole token, such as `JWT` or `at+jwt`. */
  readonly typ?: string;
  /** Media type of the payload. */
  readonly cty?: string;
  /** Any other header parameter, unverified in meaning and never used by this package. */
  readonly [parameter: string]: unknown;
}

/**
 * The registered JWT claims (RFC 7519 §4.1) with the types they must have, and nothing else. A payload type
 * declared as an `interface` satisfies it, which {@link JwtPayload}'s index signature would not allow.
 */
export interface JwtRegisteredClaims {
  readonly iss?: string;
  readonly sub?: string;
  readonly aud?: string | readonly string[];
  /** Expiration time, in seconds since the Unix epoch. */
  readonly exp?: number;
  /** Not-before time, in seconds since the Unix epoch. */
  readonly nbf?: number;
  /** Issued-at time, in seconds since the Unix epoch. */
  readonly iat?: number;
  readonly jti?: string;
}

/** Registered JWT claims (RFC 7519 §4.1), plus any other claim. Frozen. */
export interface JwtPayload extends JwtRegisteredClaims {
  readonly [claim: string]: unknown;
}

/**
 * `T` as JSON can carry it: every member that is a function, or an object with methods such as a `Date`,
 * becomes `never`, so a value JSON would change fails to compile. Members typed `unknown` pass, and are
 * checked when signing.
 */
export type JsonCompatible<T> = unknown extends T
  ? T
  : T extends string | number | boolean | null
    ? T
    : T extends (...args: never[]) => unknown
      ? never
      : T extends object
        ? { readonly [K in keyof T]: JsonCompatible<T[K]> }
        : never;

/**
 * A source of verification keys. A verifier asks it for the one key that matches a token's header.
 *
 * {@link createKeySet}, {@link importKeySet} and {@link createRemoteKeySet} return one.
 */
export interface KeySet {
  /**
   * Selects the single key for a header. With a `kid`, only keys with that `kid` are candidates, or,
   * when none has it, keys without a `kid`; without one, the set must hold exactly one key compatible with
   * the header's `alg`. Keys are never tried in turn.
   *
   * @param header - The token's header, as {@link readHeader} returned it.
   * @returns The selected key, or a failure with `unknown_kid`, `alg_mismatch`, `no_matching_key`,
   * `ambiguous_key`, or `key_fetch_failed`. Never throws for any header.
   */
  select(header: JwtHeader): Promise<JwtResult<VerificationKey>>;
}

/**
 * Chooses the key set for a token by the issuer it claims, for a verifier that accepts tokens from several
 * issuers or several clients: `createVerifier({ keys: (issuer) => keySets.get(issuer) })`.
 *
 * The verifier calls it after the token's structure and header passed and before its signature is checked,
 * so `issuer` is the token's `iss` exactly as the token states it, and an attacker chooses it. Look it up in
 * keys you already hold, such as a `Map`; never build a URL or a query from it without an allowlist. The token
 * then verifies only with a key from the returned set, and its verified `iss` is the one passed here.
 *
 * @param issuer - The token's `iss` claim, a string. A token without one fails with `missing_claim` before
 * this is called, one whose `iss` is not a string with `invalid_claim`, and one the verifier's `issuer` option
 * does not accept with `wrong_issuer`.
 * @param header - The token's header, as {@link readHeader} returns it.
 * @returns The issuer's key set; a {@link KeySetRoute}, to also check that issuer's tokens for their own
 * audience or `typ`; or `undefined` for an issuer you do not accept, which fails the token with
 * `wrong_issuer`. Throwing, rejecting or returning anything else, an invalid route included, fails it with
 * `key_fetch_failed` and `{ reason: "key_set_error" }`, and {@link VerifierOptions.onKeySetError} gets the
 * error.
 */
export type KeySetResolver = (
  issuer: string,
  header: JwtHeader,
) => KeySet | KeySetRoute | undefined | Promise<KeySet | KeySetRoute | undefined>;

/**
 * What a {@link KeySetResolver} returns for an issuer whose tokens are checked differently from the verifier's
 * defaults, such as a tenant whose tokens name its own audience:
 * `{ keys: tenant.keySet, audience: tenant.clientId }`. A route with any other member, such as a misspelled
 * `audiance` or a `typ`, is invalid rather than ignored, like a route whose members have invalid values.
 */
export interface KeySetRoute {
  /** The issuer's key set. */
  readonly keys: KeySet;
  /**
   * The audiences this issuer's tokens must name, in place of {@link VerifierOptions.audience}, with the same
   * values allowed.
   *
   * @defaultValue the verifier's `audience`
   */
  readonly audience?: string | readonly string[] | false;
  /**
   * The `typ` values this issuer's tokens must carry, in place of {@link VerifierOptions.type}, with the same
   * values allowed.
   *
   * @defaultValue the verifier's `type`
   */
  readonly type?: string | readonly (string | null)[];
}

/** A key set over a fixed list of keys, from {@link createKeySet} or {@link importKeySet}. Frozen. */
export interface LocalKeySet extends KeySet {
  /**
   * The keys the set selects from, frozen. For {@link createKeySet}, the keys given, in order; for
   * {@link importKeySet}, one key per JWK and algorithm it was bound to, in JWKS order. With an `issuer`
   * option, each is a copy of its key bound to that issuer, which works wherever the original does.
   */
  readonly keys: readonly VerificationKey[];
}

/** A verified token. Frozen. */
export interface VerifiedJwt<TPayload extends JwtRegisteredClaims = JwtPayload> {
  /** The protected header. */
  readonly header: JwtHeader;
  /** The payload, after every configured claim check passed. */
  readonly payload: TPayload;
  /** The key whose signature matched. */
  readonly key: VerificationKey;
}

/** How {@link createVerifier} checks a token. Invalid options throw `TypeError` when the verifier is created. */
export interface VerifierOptions<TSchema extends StandardSchemaV1 | undefined = undefined> {
  /**
   * Where verification keys come from: a key set, or a {@link KeySetResolver} that picks one by the issuer the
   * token claims.
   */
  readonly keys: KeySet | KeySetResolver;
  /** Accepted `iss` values. When set, `iss` is required and must equal one exactly. */
  readonly issuer?: string | readonly string[];
  /**
   * Accepted `sub` values, for a verifier that accepts tokens about known subjects only, such as a client
   * assertion whose `sub` must be the client's own id. When set, `sub` is required and must equal one exactly.
   */
  readonly subject?: string | readonly string[];
  /**
   * Accepted audiences. When set, `aud` is required, and a token passes when its `aud` (a string or
   * an array) contains at least one of them.
   *
   * @remarks
   * When unset, a token that carries `aud` fails with `wrong_audience`: RFC 7519 §4.1.3 says a recipient
   * that does not identify itself in `aud` must reject the token, so a token minted for another service of
   * the same issuer is never accepted by accident. `false` skips the audience check for every token, for a
   * verifier that accepts tokens for any audience on purpose.
   */
  readonly audience?: string | readonly string[] | false;
  /**
   * Required `typ` header value, such as `JWT` or `at+jwt`, or a list of accepted ones. Compared
   * case-insensitively, with an `application/` prefix ignored on either side (RFC 7515 §4.1.9). When set,
   * `typ` is required, unless the list holds `null`, which accepts a token without `typ`: `["at+jwt", null]`
   * accepts `at+jwt` or no `typ` at all.
   */
  readonly type?: string | readonly (string | null)[];
  /**
   * Whether `exp` is required. A token without `exp` never expires, so it is required unless `maxAge`
   * bounds the token's age instead. Set `false` for tokens that carry no `exp` on purpose, and `true` to
   * require it alongside `maxAge`.
   *
   * @defaultValue `true` when `maxAge` is unset, `false` when it is set
   */
  readonly requireExpiration?: boolean;
  /**
   * Accept a token whose `exp` has passed. Every other check still runs, `exp` is still required when
   * {@link VerifierOptions.requireExpiration} says so, and `maxAge` still bounds the token's age. Meant for a
   * token whose signature and issuer still matter after it expired, such as an OpenID Connect
   * `id_token_hint` at logout; never for a token that grants access.
   *
   * @defaultValue false
   */
  readonly allowExpired?: boolean;
  /**
   * Seconds of clock skew allowed on `exp`, `nbf`, `iat` and `maxAge`. An integer from 0 through 300.
   *
   * @remarks
   * `nbf` and `iat` may always lie up to 60 seconds in the future, or `clockTolerance` seconds when that is
   * more, so a fresh token from an issuer whose clock runs a little ahead still verifies. `exp` and `maxAge`
   * get only `clockTolerance`.
   *
   * @defaultValue 0
   */
  readonly clockTolerance?: number;
  /** Maximum seconds since `iat`. When set, `iat` is required. A positive integer. */
  readonly maxAge?: number;
  /**
   * Maximum token length in characters, checked before any decoding. An integer from 1 through 65536.
   *
   * @defaultValue 8192
   */
  readonly maxLength?: number;
  /** Claims that must be present, whatever their value. */
  readonly requiredClaims?: readonly string[];
  /**
   * Standard Schema run on the payload after every other check passed. Its issues become
   * `schema_failed` issues carrying only their path; its messages are dropped, since they may quote
   * the input. The schema checks; it does not transform: the returned payload is the token's own.
   */
  readonly claims?: TSchema;
  /**
   * Current time in milliseconds since the Unix epoch, for tests. It must return a finite number: any
   * other result is a bug in the clock, so the verifier's promise rejects with a `TypeError` instead of
   * skipping the time checks. The clock is read only for a token whose signature checked out, so a token
   * that fails earlier still gets its failure result.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
  /**
   * Called with what went wrong when a key set or a {@link KeySetResolver} fails with `key_set_error`: the
   * value it threw or rejected with, or a `TypeError` naming what it returned instead of a result, a key set
   * or a route. The token's issue never carries it, since it may hold anything; this hands it to your logs.
   * Not called for a failure the key set returns itself, such as `unknown_kid`. Its errors, thrown or
   * rejected, are ignored.
   */
  readonly onKeySetError?: (error: unknown) => void;
}

/** The payload type a verifier with the given schema returns. */
export type VerifiedPayload<TSchema extends StandardSchemaV1 | undefined> = TSchema extends StandardSchemaV1
  ? JwtPayload & StandardSchemaV1.InferInput<TSchema>
  : JwtPayload;

/**
 * A configured verifier. Call it with any value; it never throws for a token, whatever its content.
 * `TPayload` is the payload type {@link createVerifier} gave it, from its `claims` schema or its type argument.
 * Only caller code makes its promise reject: a `claims` schema that throws or rejects, or an
 * `options.now` that returns something other than a finite number.
 *
 * @returns The verified token, or every issue found. Structural, key, and signature failures stop at
 * the first issue; claim checks report every failing claim.
 */
export type Verifier<TPayload extends JwtRegisteredClaims = JwtPayload> = (
  token: unknown,
) => Promise<JwtResult<VerifiedJwt<TPayload>>>;
