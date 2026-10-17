import { fail, ok } from "../shared/result";
import type { OidcIssue, OidcResult, ProviderMetadata } from "../shared/types";
import { isHttpsUrl } from "../shared/urls";

/**
 * The asymmetric algorithms this package verifies ID tokens with. A provider must advertise at least one,
 * or no ID token it issues could be checked.
 */
export const ID_TOKEN_ALGORITHMS = ["ES256", "EdDSA", "Ed25519", "RS256", "PS256"] as const;

/** One of {@link ID_TOKEN_ALGORITHMS}. */
export type IdTokenAlgorithm = (typeof ID_TOKEN_ALGORITHMS)[number];

const METADATA_ROOT = "metadata";
const ISSUER_MEMBER = "issuer";
const RESPONSE_TYPE_CODE = "code";
const CODE_CHALLENGE_METHOD_S256 = "S256";

type Predicate = (value: unknown) => boolean;

/** What one discovery member must hold, checked only when the member is present unless it is required. */
interface MemberRule {
  readonly name: string;
  readonly required: boolean;
  readonly accepts: Predicate;
}

/**
 * The outcome of reading one own member. An accessor is reported instead of its value because reading it
 * would run caller or document code, and a JSON document never has one.
 */
type MemberRead =
  | { readonly state: "absent" }
  | { readonly state: "accessor" }
  | { readonly state: "data"; readonly value: unknown };

const ABSENT: MemberRead = { state: "absent" };
const ACCESSOR: MemberRead = { state: "accessor" };

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const includesString =
  (expected: string): Predicate =>
  (value) =>
    isStringArray(value) && value.includes(expected);

const includesAnyOf =
  (expected: readonly string[]): Predicate =>
  (value) =>
    isStringArray(value) && value.some((item) => expected.includes(item));

const isBoolean = (value: unknown): boolean => typeof value === "boolean";

const required = (name: string, accepts: Predicate): MemberRule => ({ name, required: true, accepts });

const optional = (name: string, accepts: Predicate): MemberRule => ({ name, required: false, accepts });

/**
 * Every member this package reads, with its rule. A member missing from this list is kept in the copy but
 * not checked, because this package does not use it.
 */
const MEMBER_RULES: readonly MemberRule[] = [
  required("authorization_endpoint", isHttpsUrl),
  required("token_endpoint", isHttpsUrl),
  required("jwks_uri", isHttpsUrl),
  optional("userinfo_endpoint", isHttpsUrl),
  optional("revocation_endpoint", isHttpsUrl),
  required("response_types_supported", includesString(RESPONSE_TYPE_CODE)),
  required("subject_types_supported", isStringArray),
  required("id_token_signing_alg_values_supported", includesAnyOf(ID_TOKEN_ALGORITHMS)),
  optional("scopes_supported", isStringArray),
  optional("response_modes_supported", isStringArray),
  optional("grant_types_supported", isStringArray),
  optional("token_endpoint_auth_methods_supported", isStringArray),
  optional("token_endpoint_auth_signing_alg_values_supported", isStringArray),
  optional("claims_supported", isStringArray),
  // RFC 7636 §4.3: an S256 challenge is the only method this package uses, so a provider that lacks it cannot serve the client.
  optional("code_challenge_methods_supported", includesString(CODE_CHALLENGE_METHOD_S256)),
  optional("authorization_response_iss_parameter_supported", isBoolean),
  optional("claims_parameter_supported", isBoolean),
  optional("request_parameter_supported", isBoolean),
  optional("request_uri_parameter_supported", isBoolean),
];

const KNOWN_MEMBERS: ReadonlySet<string> = new Set([ISSUER_MEMBER, ...MEMBER_RULES.map((rule) => rule.name)]);

const isDocumentObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads an own member from its descriptor, so a getter is detected and never run. */
function readMember(document: object, name: string): MemberRead {
  if (!Object.hasOwn(document, name)) {
    return ABSENT;
  }
  const descriptor = Object.getOwnPropertyDescriptor(document, name);
  return descriptor !== undefined && "value" in descriptor ? { state: "data", value: descriptor.value } : ACCESSOR;
}

const invalid = (path: readonly string[]): OidcIssue => ({ code: "invalid_metadata", path });

/** `issuer` must equal the issuer the document was fetched for, byte for byte. */
function checkIssuer(document: object, issuer: string): OidcIssue[] {
  const read = readMember(document, ISSUER_MEMBER);
  const matches = read.state === "data" && read.value === issuer;
  return matches ? [] : [{ code: "issuer_mismatch", path: [METADATA_ROOT, ISSUER_MEMBER] }];
}

/**
 * Marks a value that cannot be copied: a getter anywhere inside it, a cycle, an array with holes or named members,
 * nesting deeper than {@link MAX_COPY_DEPTH}, or more containers than {@link MAX_COPY_NODES}. No JSON document has
 * any of these. An object referenced from two places is copied at each place, since a copy shares nothing.
 */
const UNCOPYABLE = Symbol("uncopyable");

/** Matches the depth `@codenhub/jwt` allows in a JSON object; discovery documents are far shallower. */
const MAX_COPY_DEPTH = 32;

/** Bounds the containers copied, since shared references can multiply them. A document of 65536 bytes cannot hold this many. */
const MAX_COPY_NODES = 65536;

type Container = Record<string, unknown> | unknown[];

/** The keys to copy, or `undefined` for an array that is not dense or carries named members. */
function memberKeys(source: object): readonly string[] | undefined {
  const keys = Reflect.ownKeys(source).filter((key): key is string => typeof key === "string");
  if (!Array.isArray(source)) {
    return keys;
  }
  // Own keys list integer indices first, in ascending order, so a dense array lists exactly 0 to length - 1.
  const indices = keys.filter((key) => key !== "length");
  const isDense = indices.length === source.length && indices.every((key, index) => key === String(index));
  return isDense ? indices : undefined;
}

/** Sets a member as an own data property, so a key such as `__proto__` never changes the prototype. */
function setMember(target: Container, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * Copies a value by its own data members, so the copy shares no object with the caller's and freezing it never
 * freezes an object the caller still holds. The walk keeps its own stack, so a deep value cannot overflow the
 * call stack, and it never runs a getter.
 */
function copyValue(value: unknown): unknown {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const root: Container = Array.isArray(value) ? [] : {};
  let nodes = 1;
  const pending: { readonly source: object; readonly target: Container; readonly depth: number }[] = [
    { source: value, target: root, depth: 1 },
  ];
  while (pending.length > 0) {
    const { source, target, depth } = pending.pop() as (typeof pending)[number];
    const keys = memberKeys(source);
    if (keys === undefined) {
      return UNCOPYABLE;
    }
    for (const key of keys) {
      const read = readMember(source, key);
      if (read.state !== "data") {
        return UNCOPYABLE;
      }
      const child = read.value;
      if (typeof child !== "object" || child === null) {
        setMember(target, key, child);
        continue;
      }
      // A cycle never ends, so it reaches the depth limit; the depth check is what refuses it.
      nodes += 1;
      if (depth >= MAX_COPY_DEPTH || nodes > MAX_COPY_NODES) {
        return UNCOPYABLE;
      }
      const childTarget: Container = Array.isArray(child) ? [] : {};
      setMember(target, key, childTarget);
      pending.push({ source: child, target: childTarget, depth: depth + 1 });
    }
  }
  return root;
}

/**
 * Checks one listed member against its rule. The rule reads a copy, so a getter inside an array or object is
 * found before the rule can run it.
 */
function checkRule(document: object, rule: MemberRule): OidcIssue[] {
  const read = readMember(document, rule.name);
  const path = [METADATA_ROOT, rule.name];
  if (read.state === "absent") {
    return rule.required ? [invalid(path)] : [];
  }
  if (read.state === "accessor") {
    return [invalid(path)];
  }
  // A hand-written metadata object may carry `undefined` for a member it does not have, as spreads do.
  if (read.value === undefined && !rule.required) {
    return [];
  }
  const copy = copyValue(read.value);
  if (copy === UNCOPYABLE) {
    return [invalid([METADATA_ROOT])];
  }
  return rule.accepts(copy) ? [] : [invalid(path)];
}

/**
 * A member this package does not read is kept in the copy, so it must still be copyable: an accessor, or a
 * getter anywhere inside it, is refused, and no getter is ever run.
 */
function checkUnlistedMembers(document: object): OidcIssue[] {
  return Reflect.ownKeys(document).flatMap((key) => {
    if (typeof key !== "string" || KNOWN_MEMBERS.has(key)) {
      return [];
    }
    const read = readMember(document, key);
    const refused = read.state === "accessor" || (read.state === "data" && copyValue(read.value) === UNCOPYABLE);
    return refused ? [invalid([METADATA_ROOT])] : [];
  });
}

/** Copies every own data member of the document. Called only after the checks pass, so nothing is refused here. */
function copyDocument(document: object): ProviderMetadata | typeof UNCOPYABLE {
  const copy = copyValue(document);
  return copy === UNCOPYABLE ? UNCOPYABLE : (copy as ProviderMetadata);
}

/**
 * Checks a discovery document (OpenID Connect Discovery 1.0 §3) and returns a copy of it.
 *
 * Every issue is collected before returning, so one check reports every problem. Members are read from
 * their descriptors, never by running getters.
 *
 * @param value - The parsed document, which may be any untrusted value.
 * @param issuer - The issuer the document must name, byte for byte.
 * @returns A deep-frozen copy of the document, or every issue found. Issues never hold a value from the
 * document.
 */
export function checkMetadata(value: unknown, issuer: string): OidcResult<ProviderMetadata> {
  if (!isDocumentObject(value)) {
    return fail(invalid([METADATA_ROOT]));
  }
  const issues = [
    ...checkIssuer(value, issuer),
    ...MEMBER_RULES.flatMap((rule) => checkRule(value, rule)),
    ...checkUnlistedMembers(value),
  ];
  const [first, ...rest] = issues;
  if (first !== undefined) {
    return fail(first, ...rest);
  }
  const copy = copyDocument(value);
  return copy === UNCOPYABLE ? fail(invalid([METADATA_ROOT])) : ok(copy);
}
