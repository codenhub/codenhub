import type { JwtPayload } from "@codenhub/jwt";

import type { OidcIssue, OidcIssueCode } from "../shared/types";
import { denseCopy } from "./authorize";

/** The placeholder a multi-tenant issuer template holds, as the Microsoft identity platform writes it. */
export const TENANT_PLACEHOLDER = "{tenantid}";

/** A tenant identifier: what the template's placeholder may become. Never a `/`, `.` or `%`, so never another path. */
const TENANT_ID = /^[A-Za-z0-9-]+$/;

/** How a client resolves a `{tenantid}` issuer template. Frozen. */
export interface TenantRule {
  /** The issuer template, holding {@link TENANT_PLACEHOLDER} exactly once, as a whole path segment. */
  readonly template: string;
  /** The `tid` values allowed, or `undefined` for any. */
  readonly tenants: ReadonlySet<string> | undefined;
}

const isTenantId = (value: unknown): value is string => typeof value === "string" && TENANT_ID.test(value);

/**
 * Tests whether an issuer is a template this package resolves: {@link TENANT_PLACEHOLDER} exactly once, as a whole
 * path segment after the host, such as `https://login.microsoftonline.com/{tenantid}/v2.0`.
 */
export function isTenantTemplate(issuer: string): boolean {
  const segments = issuer.split("/");
  const at = segments.indexOf(TENANT_PLACEHOLDER);
  // `https:`, ``, the host: the placeholder comes after them.
  const HOST_SEGMENTS = 3;
  return at >= HOST_SEGMENTS && issuer.split(TENANT_PLACEHOLDER).length === 2;
}

/**
 * The tenant an issuer names under a template: the text that stands where the template has its placeholder, when
 * everything else matches byte for byte and that text is a tenant identifier. `undefined` otherwise.
 */
export function tenantOf(issuer: string, template: string): string | undefined {
  const [prefix = "", suffix = ""] = template.split(TENANT_PLACEHOLDER);
  if (issuer.length <= prefix.length + suffix.length || !issuer.startsWith(prefix) || !issuer.endsWith(suffix)) {
    return undefined;
  }
  const tenant = issuer.slice(prefix.length, issuer.length - suffix.length);
  return TENANT_ID.test(tenant) ? tenant : undefined;
}

/**
 * Reads {@link ClientOptions.tenantIssuer} against the metadata's issuer. A template without the option, or the
 * option without a template, is a configuration mistake, so it throws.
 *
 * @throws {TypeError} When the option and the issuer disagree, or the option is malformed.
 */
export function readTenantIssuer(value: unknown, issuer: string): TenantRule | undefined {
  const isTemplate = issuer.includes(TENANT_PLACEHOLDER);
  if (value === undefined) {
    if (isTemplate) {
      throw new TypeError("createClient: metadata.issuer is a {tenantid} template, which needs tenantIssuer");
    }
    return undefined;
  }
  if (!isTemplate) {
    throw new TypeError("createClient: tenantIssuer needs a metadata.issuer that holds {tenantid}");
  }
  if (!isTenantTemplate(issuer)) {
    throw new TypeError("createClient: metadata.issuer must hold {tenantid} once, as a whole path segment");
  }
  if (value === true) {
    return Object.freeze({ template: issuer, tenants: undefined });
  }
  const tenants =
    typeof value === "object" && value !== null
      ? denseCopy((value as { readonly tenants?: unknown }).tenants)
      : undefined;
  if (tenants === undefined || tenants.length === 0 || !tenants.every(isTenantId)) {
    throw new TypeError(
      "createClient: tenantIssuer must be true or { tenants }, a non-empty array of at most 100 tenant identifiers of ASCII letters, digits and -",
    );
  }
  return Object.freeze({ template: issuer, tenants: new Set(tenants as string[]) });
}

/** The issue codes of the three kinds of JWT the client verifies, and the path each starts with. */
type VerifiedToken =
  | { readonly code: "invalid_id_token"; readonly path: "id_token" }
  | { readonly code: "invalid_logout_token"; readonly path: "logout_token" }
  | { readonly code: "invalid_userinfo"; readonly path: "userinfo" };

const wrongIssuer = (token: VerifiedToken, claim: "iss" | "tid"): OidcIssue => ({
  code: token.code satisfies OidcIssueCode,
  path: [token.path, "payload", claim],
  params: { jwtCode: "wrong_issuer" },
});

/**
 * Checks a verified token's `iss` against a tenant template: `tid` must be a tenant identifier, one of the allowed
 * tenants when they are listed, and `iss` the template with that `tid` in place. The signature was already verified,
 * so `tid` is the provider's own statement.
 */
export function tenantIssuerIssues(payload: JwtPayload, rule: TenantRule, token: VerifiedToken): OidcIssue[] {
  const { tid } = payload;
  if (!isTenantId(tid) || (rule.tenants !== undefined && !rule.tenants.has(tid))) {
    return [wrongIssuer(token, "tid")];
  }
  return payload.iss === rule.template.replace(TENANT_PLACEHOLDER, tid) ? [] : [wrongIssuer(token, "iss")];
}

/** Tests an `iss` authorization response parameter (RFC 9207) against a tenant template, and the allowed tenants. */
export function matchesTenantIssuer(iss: string, rule: TenantRule): boolean {
  const tenant = tenantOf(iss, rule.template);
  return tenant !== undefined && (rule.tenants === undefined || rule.tenants.has(tenant));
}
