import type { JwtIssue } from "../core/types";
import {
  ASYMMETRIC_PRIVATE_MEMBERS,
  decodeMember,
  issue,
  readMembers,
  rsaMaterial,
  type MemberName,
  type Members,
} from "../keys/jwk";
import {
  CONTENT_PARAMS,
  CURVE_PARAMS,
  isEcdhAlgorithm,
  isJweCurve,
  isRsaAlgorithm,
  KEY_WRAP_BYTES,
} from "./algorithms";
import type { ContentEncryptionAlgorithm, JweCurve, KeyManagementAlgorithm } from "./types";

/** What the imported key will be used as. */
export type JweKeyRole = "public" | "private" | "secret";

/** A JWK that passed every check, reduced to what `crypto.subtle.importKey` needs. */
export interface CheckedJweJwk {
  readonly kid?: string;
  /** Only the key material members, without `alg`, `use`, `key_ops` or `ext`. */
  readonly importJwk: JsonWebKey;
  /** For an `ECDH-ES` key, its curve. */
  readonly curve?: JweCurve;
  /** For an RSA key, the modulus length in bytes. */
  readonly modulusBytes?: number;
  /** For a secret, its decoded bytes, whose length is exactly the one its algorithm needs. */
  readonly secret?: Uint8Array<ArrayBuffer>;
}

/**
 * RFC 7517 §4.3 says unrelated operations SHOULD NOT share a key; an encryption key whose `key_ops` also signs is
 * refused, as a signing key that also encrypts is.
 */
const ENCRYPTION_OPERATIONS: ReadonlySet<string> = new Set([
  "encrypt",
  "decrypt",
  "wrapKey",
  "unwrapKey",
  "deriveKey",
  "deriveBits",
]);

const REQUIRED_OPERATION: Readonly<Record<JweKeyRole, readonly string[]>> = {
  public: ["encrypt", "wrapKey", "deriveKey", "deriveBits"],
  private: ["decrypt", "unwrapKey", "deriveKey", "deriveBits"],
  secret: ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
};

/**
 * Checks an untrusted JWK against the key management algorithm and role it is imported for, by the rules the JWS
 * import applies (scope.md decision 52), with `use: "enc"` and the encryption operations in place of the signing
 * ones. Never throws.
 *
 * @param enc - For a `dir` secret, the content encryption algorithm, which fixes the secret's length.
 * @returns The members to import, or the first issue found.
 */
export function checkJweJwk(
  jwk: unknown,
  alg: KeyManagementAlgorithm,
  role: JweKeyRole,
  enc?: ContentEncryptionAlgorithm,
): CheckedJweJwk | JwtIssue {
  const members = readMembers(jwk);
  if (members === undefined) {
    return issue("invalid_key");
  }
  const headerIssue = checkHeaderMembers(members, alg, role);
  if (headerIssue !== undefined) {
    return headerIssue;
  }
  const kid = members.kid as string | undefined;
  const material = materialFor(members, alg, role, enc);
  return "code" in material ? material : { ...(kid === undefined ? {} : { kid }), ...material };
}

function expectedKty(alg: KeyManagementAlgorithm): "RSA" | "EC/OKP" | "oct" {
  if (isRsaAlgorithm(alg)) {
    return "RSA";
  }
  return isEcdhAlgorithm(alg) ? "EC/OKP" : "oct";
}

function checkHeaderMembers(members: Members, alg: KeyManagementAlgorithm, role: JweKeyRole): JwtIssue | undefined {
  if (typeof members.kty !== "string") {
    return issue("invalid_key", "kty");
  }
  const kty = expectedKty(alg);
  if (kty === "EC/OKP" ? members.kty !== "EC" && members.kty !== "OKP" : members.kty !== kty) {
    return issue("unsupported_key", "kty");
  }
  if (kty === "EC/OKP") {
    if (typeof members.crv !== "string") {
      return issue("invalid_key", "crv");
    }
    if (!isJweCurve(members.crv) || CURVE_PARAMS[members.crv].kty !== members.kty) {
      return issue("unsupported_key", "crv");
    }
  }
  if (members.alg !== undefined) {
    if (typeof members.alg !== "string") {
      return issue("invalid_key", "alg");
    }
    if (members.alg !== alg) {
      return issue("alg_mismatch", "alg");
    }
  }
  if (members.use !== undefined) {
    if (typeof members.use !== "string") {
      return issue("invalid_key", "use");
    }
    if (members.use !== "enc") {
      return issue("wrong_use", "use");
    }
  }
  if (members.key_ops !== undefined) {
    const operations = members.key_ops;
    // RFC 7517 §4.3: duplicates MUST NOT be present.
    if (
      !Array.isArray(operations) ||
      !operations.every((op) => typeof op === "string") ||
      new Set(operations).size !== operations.length
    ) {
      return issue("invalid_key", "key_ops");
    }
    if (
      !REQUIRED_OPERATION[role].some((op) => operations.includes(op)) ||
      !operations.every((op) => ENCRYPTION_OPERATIONS.has(op))
    ) {
      return issue("wrong_use", "key_ops");
    }
  }
  if (members.kid !== undefined && typeof members.kid !== "string") {
    return issue("invalid_key", "kid");
  }
  if (role === "public") {
    const privateMember = ASYMMETRIC_PRIVATE_MEMBERS.find((name) => members[name] !== undefined);
    if (privateMember !== undefined) {
      return issue("unexpected_private_key", privateMember);
    }
  }
  return undefined;
}

type Material = Omit<CheckedJweJwk, "kid"> | JwtIssue;

function materialFor(
  members: Members,
  alg: KeyManagementAlgorithm,
  role: JweKeyRole,
  enc: ContentEncryptionAlgorithm | undefined,
): Material {
  if (isRsaAlgorithm(alg)) {
    const rsa = rsaMaterial(members, role);
    return "code" in rsa ? rsa : { importJwk: rsa.importJwk, modulusBytes: rsa.signatureLength };
  }
  if (isEcdhAlgorithm(alg)) {
    return curveMaterial(members, members.crv as JweCurve, role);
  }
  return secretMaterial(members, alg, enc);
}

/** Every coordinate, and `d`, must be exactly as long as the curve's coordinates (RFC 7518 §6.2.1.2, RFC 8037 §2). */
function curveMaterial(members: Members, curve: JweCurve, role: JweKeyRole): Material {
  const params = CURVE_PARAMS[curve];
  const publicMembers: readonly MemberName[] = params.kty === "EC" ? ["x", "y"] : ["x"];
  if (params.kty === "OKP" && members.y !== undefined) {
    return issue("invalid_key", "y");
  }
  const names = role === "private" ? [...publicMembers, "d" as const] : publicMembers;
  const importJwk: JsonWebKey = { kty: params.kty, crv: curve };
  for (const name of names) {
    const bytes = decodeMember(members[name]);
    if (bytes === undefined || bytes.length !== params.coordinateBytes) {
      return issue("invalid_key", name);
    }
    (importJwk as Record<string, unknown>)[name] = members[name];
  }
  return { importJwk, curve };
}

/**
 * A key-wrapping or direct secret must be exactly as long as its algorithm's key: shorter is `weak_key`, and
 * longer `invalid_key`, since AES takes no other length and a `dir` key is the content key itself.
 */
function secretMaterial(
  members: Members,
  alg: KeyManagementAlgorithm,
  enc: ContentEncryptionAlgorithm | undefined,
): Material {
  const length = secretLength(alg, enc);
  const secret = decodeMember(members.k);
  if (secret === undefined) {
    return issue("invalid_key", "k");
  }
  if (secret.length < length) {
    return issue("weak_key", "k", { minimum: length });
  }
  if (secret.length > length) {
    return issue("invalid_key", "k", { maximum: length });
  }
  return { importJwk: { kty: "oct", k: members.k as string }, secret: new Uint8Array(secret) };
}

/** The exact byte length of a secret for `alg`, and for a `dir` key its `enc`. */
export function secretLength(alg: KeyManagementAlgorithm, enc: ContentEncryptionAlgorithm | undefined): number {
  if (alg === "dir") {
    return CONTENT_PARAMS[enc as ContentEncryptionAlgorithm].keyBytes;
  }
  return KEY_WRAP_BYTES[alg as keyof typeof KEY_WRAP_BYTES];
}
