import { formatFactory } from "./text-format";

/**
 * Semantic Versioning 2.0.0: three numbers without leading zeros, then optionally a pre-release of
 * dot-separated identifiers and build metadata. The identifiers are one class each, so matching stays
 * linear; the rule that a numeric pre-release identifier has no leading zero is checked apart.
 */
const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

/** A pre-release identifier of digits only, with a leading zero, which Semantic Versioning forbids. */
const LEADING_ZERO_PATTERN = /(?:^|\.)0\d+(?:\.|$)/;

const isSemver = (text: string): boolean => {
  const match = SEMVER_PATTERN.exec(text);
  return match !== null && (match[1] === undefined || !LEADING_ZERO_PATTERN.test(match[1]));
};

/**
 * Creates a validator for Semantic Versioning 2.0.0 versions, such as `1.2.3`, `1.0.0-rc.1` or
 * `1.0.0+build.5`. A leading `v` is not part of a version and is rejected. The value is not modified.
 *
 * @example
 * ```ts
 * semver()("1.4.0-beta.2"); // { ok: true, value: "1.4.0-beta.2" }
 * semver()("v1.4.0"); // { ok: false, ... }, code "invalid_format"
 * ```
 */
export const semver = /* @__PURE__ */ formatFactory("semver", (text) => (isSemver(text) ? text : undefined));
