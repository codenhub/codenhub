import { isPlainObject } from "../core/plain";
import type { JwsAlgorithm, JwtIssue } from "../core/types";
import { decodeBase64Url, encodeBase64Url } from "../encoding";
import { ALGORITHM_PARAMS, type AlgorithmParams } from "./algorithms";

/** What the imported key will be used as. */
export type KeyRole = "public" | "private" | "secret";

/** A JWK that passed every structural check, reduced to what `crypto.subtle.importKey` needs. */
export interface CheckedJwk {
  readonly kid?: string;
  /** Only the key material members, without `alg`, `use`, `key_ops` or `ext`. */
  readonly importJwk: JsonWebKey;
  readonly signatureLength: number;
}

export const MIN_RSA_MODULUS_BITS = 2048;
export const MAX_RSA_MODULUS_BITS = 8192;
/** RFC 8017 Section 3.1: the public exponent is at least 3, so e = 1 and e = 2 are refused. */
const MIN_RSA_EXPONENT = 3;
/** Bounds the work spent on an exponent; every exponent in practical use fits in 3 bytes. */
const MAX_RSA_EXPONENT_BYTES = 4;

const MEMBER_NAMES = [
  "kty",
  "crv",
  "alg",
  "use",
  "key_ops",
  "kid",
  "x",
  "y",
  "n",
  "e",
  "d",
  "p",
  "q",
  "dp",
  "dq",
  "qi",
  "oth",
  "k",
] as const;
export type MemberName = (typeof MEMBER_NAMES)[number];
export type Members = Partial<Record<MemberName, unknown>>;

const RSA_PRIVATE_MEMBERS = ["d", "p", "q", "dp", "dq", "qi"] as const;
export const ASYMMETRIC_PRIVATE_MEMBERS = [...RSA_PRIVATE_MEMBERS, "oth", "k"] as const;

/** RFC 7517 §4.3 says unrelated operations SHOULD NOT share a key; a key that also encrypts is refused. */
const SIGNATURE_OPERATIONS: ReadonlySet<string> = new Set(["sign", "verify"]);

const REQUIRED_OPERATION: Readonly<Record<KeyRole, readonly string[]>> = {
  public: ["verify"],
  private: ["sign"],
  secret: ["sign", "verify"],
};

export const issue = (code: JwtIssue["code"], member?: MemberName, params?: JwtIssue["params"]): JwtIssue => ({
  code,
  ...(member === undefined ? {} : { path: [member] }),
  ...(params === undefined ? {} : { params }),
});

/**
 * Checks an untrusted JWK against the algorithm and role it is imported for. Never throws.
 *
 * @returns The members to import, or the first issue found.
 */
export function checkJwk(jwk: unknown, alg: JwsAlgorithm, role: KeyRole): CheckedJwk | JwtIssue {
  const members = readMembers(jwk);
  if (members === undefined) {
    return issue("invalid_key");
  }
  return checkHeaderMembers(members, alg, role) ?? checkMaterial(members, alg, role);
}

/** Snapshots the JWK's own data members, so later checks never run caller code. */
export function readMembers(jwk: unknown): Members | undefined {
  try {
    if (typeof jwk !== "object" || jwk === null || Array.isArray(jwk)) {
      return undefined;
    }
    if (!isPlainObject(jwk)) {
      return undefined;
    }
    const members: Members = {};
    for (const name of MEMBER_NAMES) {
      const descriptor = Object.getOwnPropertyDescriptor(jwk, name);
      if (descriptor === undefined) {
        continue;
      }
      if (!("value" in descriptor)) {
        return undefined;
      }
      members[name] = name === "key_ops" ? copyArray(descriptor.value) : descriptor.value;
    }
    return members;
  } catch {
    // A hostile Proxy can throw from any trap.
    return undefined;
  }
}

function copyArray(value: unknown): unknown {
  return Array.isArray(value) ? Array.from(value as unknown[]) : value;
}

function checkHeaderMembers(members: Members, alg: JwsAlgorithm, role: KeyRole): JwtIssue | undefined {
  const params = ALGORITHM_PARAMS[alg];
  if (typeof members.kty !== "string") {
    return issue("invalid_key", "kty");
  }
  if (members.kty !== params.kty) {
    return issue("unsupported_key", "kty");
  }
  if (params.crv !== undefined) {
    if (typeof members.crv !== "string") {
      return issue("invalid_key", "crv");
    }
    if (members.crv !== params.crv) {
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
    if (members.use !== "sig") {
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
      !operations.every((op) => SIGNATURE_OPERATIONS.has(op))
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

function checkMaterial(members: Members, alg: JwsAlgorithm, role: KeyRole): CheckedJwk | JwtIssue {
  const kid = members.kid as string | undefined;
  const result = materialFor(members, alg, role);
  if ("code" in result) {
    return result;
  }
  return { ...(kid === undefined ? {} : { kid }), ...result };
}

export type Material = Omit<CheckedJwk, "kid"> | JwtIssue;

function materialFor(members: Members, alg: JwsAlgorithm, role: KeyRole): Material {
  const params = ALGORITHM_PARAMS[alg];
  switch (params.kty) {
    case "EC":
      return curveMaterial(members, ["x", "y"], role, params);
    case "OKP":
      return curveMaterial(members, ["x"], role, params);
    case "RSA":
      return rsaMaterial(members, role);
    case "oct":
      return secretMaterial(members, params);
  }
}

/** Every coordinate, and `d`, must be exactly as long as the curve's coordinates (RFC 7518 §6.2.1.2). */
function curveMaterial(
  members: Members,
  publicMembers: readonly MemberName[],
  role: KeyRole,
  params: AlgorithmParams,
): Material {
  const names = role === "private" ? [...publicMembers, "d" as const] : publicMembers;
  const importJwk: JsonWebKey = { kty: members.kty as string, crv: members.crv as string };
  for (const name of names) {
    const bytes = decodeMember(members[name]);
    if (bytes === undefined || bytes.length !== params.coordinateBytes) {
      return issue("invalid_key", name);
    }
    (importJwk as Record<string, unknown>)[name] = members[name];
  }
  return { importJwk, signatureLength: params.signatureBytes as number };
}

export function rsaMaterial(members: Members, role: KeyRole): Material {
  const modulus = decodeMember(members.n);
  if (modulus === undefined) {
    return issue("invalid_key", "n");
  }
  const significant = stripLeadingZeros(modulus);
  if (significant.length === 0) {
    return issue("invalid_key", "n");
  }
  const bits = (significant.length - 1) * 8 + (32 - Math.clz32(significant[0]));
  if (bits < MIN_RSA_MODULUS_BITS) {
    return issue("weak_key", "n", { minimum: MIN_RSA_MODULUS_BITS });
  }
  if (bits > MAX_RSA_MODULUS_BITS) {
    return issue("unsupported_key", "n", { maximum: MAX_RSA_MODULUS_BITS });
  }
  const exponent = decodeMember(members.e);
  if (exponent === undefined) {
    return issue("invalid_key", "e");
  }
  const significantExponent = stripLeadingZeros(exponent);
  if (!isAcceptableExponent(significantExponent)) {
    return issue("invalid_key", "e");
  }
  const importJwk: JsonWebKey = {
    kty: "RSA",
    n: encodeBase64Url(significant),
    e: encodeBase64Url(significantExponent),
  };
  if (role === "private") {
    if (members.oth !== undefined) {
      return issue("unsupported_key", "oth");
    }
    for (const name of RSA_PRIVATE_MEMBERS) {
      if (!isNonEmptyMember(members[name])) {
        return issue("invalid_key", name);
      }
      importJwk[name] = members[name] as string;
    }
    if (!isPrivateExponentConsistent(importJwk)) {
      return issue("invalid_key", "d");
    }
  }
  return { importJwk, signatureLength: significant.length };
}

/**
 * Whether `d` agrees with the CRT members: `d mod (p - 1) = dp` and `d mod (q - 1) = dq`. Web Crypto signs with
 * the CRT members alone, so the probe signature cannot see a wrong `d`, which the exported JWK would carry to a
 * library that signs with it. The probe proves the CRT members themselves.
 */
function isPrivateExponentConsistent(jwk: JsonWebKey): boolean {
  const [d, p, q, dp, dq] = [jwk.d, jwk.p, jwk.q, jwk.dp, jwk.dq].map(memberToBigInt);
  if (d === undefined || p === undefined || q === undefined || dp === undefined || dq === undefined) {
    return false;
  }
  return p > 1n && q > 1n && d % (p - 1n) === dp && d % (q - 1n) === dq;
}

function memberToBigInt(value: string | undefined): bigint | undefined {
  const bytes = decodeMember(value);
  if (bytes === undefined) {
    return undefined;
  }
  let hex = "0x0";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return BigInt(hex);
}

function stripLeadingZeros(bytes: Uint8Array): Uint8Array {
  const firstSignificant = bytes.findIndex((byte) => byte !== 0);
  return firstSignificant === -1 ? new Uint8Array() : bytes.subarray(firstSignificant);
}

/** Odd, at least {@link MIN_RSA_EXPONENT}, and short enough to bound the cost of the check. */
function isAcceptableExponent(exponent: Uint8Array): boolean {
  if (exponent.length === 0 || exponent.length > MAX_RSA_EXPONENT_BYTES) {
    return false;
  }
  const value = exponent.reduce((accumulator, byte) => accumulator * 256 + byte, 0);
  return value >= MIN_RSA_EXPONENT && value % 2 === 1;
}

/** RFC 7518 §3.2: an HMAC secret is at least as long as the hash output, which is the signature length. */
function secretMaterial(members: Members, params: AlgorithmParams): Material {
  const minimum = params.signatureBytes as number;
  const secret = decodeMember(members.k);
  if (secret === undefined) {
    return issue("invalid_key", "k");
  }
  if (secret.length < minimum) {
    return issue("weak_key", "k", { minimum });
  }
  return { importJwk: { kty: "oct", k: members.k as string }, signatureLength: minimum };
}

export function decodeMember(value: unknown): Uint8Array | undefined {
  return typeof value === "string" ? decodeBase64Url(value) : undefined;
}

function isNonEmptyMember(value: unknown): boolean {
  const bytes = decodeMember(value);
  return bytes !== undefined && bytes.length > 0;
}
