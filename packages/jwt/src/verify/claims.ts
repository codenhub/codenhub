import type { JwtHeader, JwtIssue, JwtPathSegment, JwtPayload } from "../core/types";
import type { StandardSchemaV1 } from "../interop/standard-schema";
import { normalizeType, type ResolvedOptions } from "./options";

const MILLISECONDS_PER_SECOND = 1000;

/** Registered claims and the type each must have, in the order their issues are reported. */
const CLAIM_TYPES: readonly (readonly [string, (value: unknown) => boolean])[] = [
  ["iss", (value) => typeof value === "string"],
  ["sub", (value) => typeof value === "string"],
  ["aud", (value) => typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"))],
  ["exp", (value) => typeof value === "number" && Number.isFinite(value)],
  ["nbf", (value) => typeof value === "number" && Number.isFinite(value)],
  ["iat", (value) => typeof value === "number" && Number.isFinite(value)],
  ["jti", (value) => typeof value === "string"],
];

/** The verified token's claims, viewed through the types their checks already confirmed. */
interface Claims {
  readonly present: (name: string) => boolean;
  /** A registered claim's value, or `undefined` when it is absent or ill-typed (already reported). */
  readonly valid: <TName extends keyof JwtPayload & string>(name: TName) => JwtPayload[TName] | undefined;
}

const missing = (claim: string): JwtIssue => ({ code: "missing_claim", path: ["payload", claim], params: { claim } });

/**
 * Runs every configured claim check on a verified header and payload, and returns every issue found, in
 * check order: registered claim types, `exp`, `nbf`, `iat`, `maxAge`, issuer, audience, `typ`, then
 * required claims. A claim with the wrong type is reported once and skipped by the later checks.
 */
export function checkClaims(header: JwtHeader, payload: JwtPayload, options: ResolvedOptions): JwtIssue[] {
  const issues: JwtIssue[] = [];
  const invalid = new Set<string>();
  for (const [name, isValid] of CLAIM_TYPES) {
    if (Object.hasOwn(payload, name) && !isValid(payload[name])) {
      invalid.add(name);
      issues.push({ code: "invalid_claim", path: ["payload", name] });
    }
  }
  const claims: Claims = {
    present: (name) => Object.hasOwn(payload, name),
    valid: (name) => (Object.hasOwn(payload, name) && !invalid.has(name) ? payload[name] : undefined),
  };
  const now = options.now() / MILLISECONDS_PER_SECOND;
  issues.push(...timeIssues(claims, now, options), ...identityIssues(claims, options));
  if (options.type !== undefined && (header.typ === undefined || normalizeType(header.typ) !== options.type)) {
    issues.push({ code: "wrong_type", path: ["header", "typ"] });
  }
  const reported = new Set(issues.flatMap((issue) => (issue.code === "missing_claim" ? [issue.params?.claim] : [])));
  for (const claim of options.requiredClaims) {
    if (!claims.present(claim) && !reported.has(claim)) {
      reported.add(claim);
      issues.push(missing(claim));
    }
  }
  return issues;
}

function timeIssues(claims: Claims, now: number, options: ResolvedOptions): JwtIssue[] {
  const issues: JwtIssue[] = [];
  const tolerance = options.clockTolerance;
  const exp = claims.valid("exp");
  if (exp !== undefined && now >= exp + tolerance) {
    issues.push({ code: "expired", path: ["payload", "exp"] });
  }
  const nbf = claims.valid("nbf");
  if (nbf !== undefined && now + tolerance < nbf) {
    issues.push({ code: "not_yet_valid", path: ["payload", "nbf"] });
  }
  const iat = claims.valid("iat");
  if (iat !== undefined && iat > now + tolerance) {
    issues.push({ code: "issued_in_future", path: ["payload", "iat"] });
  }
  if (options.maxAge !== undefined) {
    if (!claims.present("iat")) {
      issues.push(missing("iat"));
    } else if (iat !== undefined && now - iat > options.maxAge + tolerance) {
      issues.push({ code: "too_old", path: ["payload", "iat"], params: { maxAge: options.maxAge } });
    }
  }
  return issues;
}

function identityIssues(claims: Claims, options: ResolvedOptions): JwtIssue[] {
  const issues: JwtIssue[] = [];
  if (options.issuers !== undefined) {
    const iss = claims.valid("iss");
    if (!claims.present("iss")) {
      issues.push(missing("iss"));
    } else if (iss !== undefined && !options.issuers.includes(iss)) {
      issues.push({ code: "wrong_issuer", path: ["payload", "iss"] });
    }
  }
  if (options.audiences !== undefined) {
    const aud = claims.valid("aud");
    const audiences: readonly string[] = typeof aud === "string" ? [aud] : (aud ?? []);
    if (!claims.present("aud")) {
      issues.push(missing("aud"));
    } else if (aud !== undefined && !audiences.some((entry) => options.audiences?.includes(entry))) {
      issues.push({ code: "wrong_audience", path: ["payload", "aud"] });
    }
  }
  return issues;
}

/**
 * Runs a Standard Schema on the payload and maps its issues to `invalid_claims`, keeping only their
 * paths: schema messages may quote the input.
 */
export async function schemaIssues(schema: StandardSchemaV1, payload: JwtPayload): Promise<JwtIssue[]> {
  const result = await schema["~standard"].validate(payload);
  if (result.issues === undefined) {
    return [];
  }
  const issues = result.issues.map(
    (issue): JwtIssue => ({ code: "invalid_claims", path: ["payload", ...pathOf(issue)] }),
  );
  // A failure the schema reports without issues is still a failure.
  return issues.length > 0 ? issues : [{ code: "invalid_claims", path: ["payload"] }];
}

function pathOf(issue: StandardSchemaV1.Issue): JwtPathSegment[] {
  const segments: JwtPathSegment[] = [];
  for (const segment of issue.path ?? []) {
    const key = typeof segment === "object" && segment !== null ? segment.key : segment;
    if (typeof key === "string" || typeof key === "number") {
      segments.push(key);
    }
  }
  return segments;
}
