/**
 * Sign and verify JSON Web Tokens with Web Crypto, and manage the keys they need: generate, import, export and select them, including from a remote JWKS.
 *
 * @packageDocumentation
 */
export type {
  AsymmetricAlgorithm,
  JsonCompatible,
  JwsAlgorithm,
  Jwk,
  JwtErr,
  JwtFailure,
  JwtHeader,
  JwtIssue,
  JwtIssueCode,
  JwtOk,
  JwtPathSegment,
  JwtPayload,
  JwtRegisteredClaims,
  JwtResult,
  KeySet,
  KeySetResolver,
  KeySetRoute,
  LocalKeySet,
  PrivateKey,
  PublicKey,
  SecretKey,
  SigningKey,
  SymmetricAlgorithm,
  VerificationKey,
  VerifiedJwt,
  VerifiedPayload,
  Verifier,
  VerifierOptions,
} from "./core/types";
export type {
  EcJwk,
  EcPrivateJwk,
  EcPublicJwk,
  OctJwk,
  OkpJwk,
  OkpPrivateJwk,
  OkpPublicJwk,
  PrivateJwk,
  PublicJwk,
  RsaJwk,
  RsaPrivateJwk,
  RsaPublicJwk,
  SecretJwk,
} from "./core/types";
export type { StandardSchemaV1 } from "./interop/standard-schema";
export { JWS_ALGORITHMS, isJwsAlgorithm } from "./core/limits";
export { decodeBase64Url, encodeBase64Url } from "./encoding";
export { readHeader, type ReadHeaderOptions } from "./jws/read-header";
export {
  ASYMMETRIC_ALGORITHMS,
  certificateThumbprint,
  createExternalSigningKey,
  exportPrivateJwk,
  exportPrivatePem,
  exportPublicJwk,
  exportPublicPem,
  exportSecretJwk,
  generateKeyPair,
  generateSecretKey,
  getPublicKey,
  importKeyPair,
  importPrivateKey,
  importPublicKey,
  importSecretKey,
  isAsymmetricAlgorithm,
  isSymmetricAlgorithm,
  jwkThumbprint,
  jwkThumbprintUri,
  SYMMETRIC_ALGORITHMS,
  tokenHash,
  type ExternalSigningKeyOptions,
  type GenerateKeyPairOptions,
  type GenerateSecretKeyOptions,
  type ImportPrivateKeyOptions,
  type ImportPublicKeyOptions,
  type ImportSecretKeyOptions,
  type KeyPair,
  type RsaModulusLength,
} from "./keys";
export {
  createKeySet,
  createRemoteKeySet,
  importKeySet,
  type CreateKeySetOptions,
  type ImportKeySetOptions,
  type RemoteKeySetOptions,
  type RemoteKeySetSnapshot,
} from "./keysets";
export { sign, type SignHeader, type SignInput } from "./sign";
export { createVerifier } from "./verify";
