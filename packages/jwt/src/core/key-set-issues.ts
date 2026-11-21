import type { JwtIssue, JwtPathSegment } from "./types";

/**
 * Reads the issues of a failure a caller's key set returned, copied, for a verifier or decrypter to pass on. A
 * Proxy's traps can still throw from here; callers already catch whatever a key set does.
 *
 * @returns The copied issues, or `undefined` unless `issues` is a non-empty array whose every entry is an issue as
 * `readIssue` below describes.
 */
export function readKeySetIssues(issues: unknown): [JwtIssue, ...JwtIssue[]] | undefined {
  // Copied by index, so a hole becomes `undefined` and fails the check; `every` would skip it.
  const list = Array.isArray(issues)
    ? Array.from({ length: issues.length }, (_, index) => readIssue(issues[index]))
    : [];
  return list.length > 0 && list.every((issue) => issue !== undefined)
    ? (list as [JwtIssue, ...JwtIssue[]])
    : undefined;
}

/**
 * A key set's issue, copied: `undefined` unless it is an object whose own data property `code` holds a string,
 * and whose `path`, when present, is an own data property holding an array of strings and finite numbers. The
 * copy keeps a JWS verifier, which prefixes the path with the signature's, from spreading a string into its
 * characters or throwing on a number, and keeps what was checked from changing afterwards. A getter does not
 * count and is never run. `params` is passed on unchecked, as the key set's own.
 */
function readIssue(issue: unknown): JwtIssue | undefined {
  if (typeof issue !== "object" || issue === null) {
    return undefined;
  }
  const code = Object.getOwnPropertyDescriptor(issue, "code");
  const path = Object.getOwnPropertyDescriptor(issue, "path");
  const params = Object.getOwnPropertyDescriptor(issue, "params");
  if (code === undefined || typeof code.value !== "string") {
    return undefined;
  }
  if ((path !== undefined && !("value" in path)) || (params !== undefined && !("value" in params))) {
    return undefined;
  }
  const value: unknown = path?.value;
  const segments = Array.isArray(value)
    ? Array.from({ length: value.length }, (_, index): unknown => value[index])
    : undefined;
  if (value !== undefined && (segments === undefined || !segments.every(isPathSegment))) {
    return undefined;
  }
  return {
    code: code.value as JwtIssue["code"],
    ...(segments === undefined ? {} : { path: segments as JwtPathSegment[] }),
    ...(params?.value === undefined ? {} : { params: params.value as JwtIssue["params"] }),
  };
}

function isPathSegment(segment: unknown): boolean {
  return typeof segment === "string" || (typeof segment === "number" && Number.isFinite(segment));
}
