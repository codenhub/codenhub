import { formatFactory } from "./text-format";

/** Semantic Versioning 2.0.0: three numbers without leading zeros. */
const CORE_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
/** The characters of dot-separated identifiers, of a pre-release or of build metadata. */
const IDENTIFIER_CHARACTERS = /^[0-9a-zA-Z.-]+$/;
/** A pre-release identifier of digits only, with a leading zero, which Semantic Versioning forbids. */
const LEADING_ZERO_PATTERN = /(?:^|\.)0\d+(?:\.|$)/;

/** Dot-separated identifiers, none of them empty. */
const isIdentifiers = (text: string): boolean =>
  IDENTIFIER_CHARACTERS.test(text) && !text.startsWith(".") && !text.endsWith(".") && !text.includes("..");

/**
 * The three numbers, then optionally `-` and a pre-release and `+` and build metadata, each of
 * dot-separated identifiers. Read part by part, since a pattern repeating an identifier overflowed the
 * stack on a few megabytes of text. The numbers hold no `-` or `+`, so the first of each starts its part.
 */
const isSemver = (text: string): boolean => {
  const plus = text.indexOf("+");
  const main = plus === -1 ? text : text.slice(0, plus);
  const build = plus === -1 ? undefined : text.slice(plus + 1);
  const minus = main.indexOf("-");
  const core = minus === -1 ? main : main.slice(0, minus);
  const preRelease = minus === -1 ? undefined : main.slice(minus + 1);
  return (
    CORE_PATTERN.test(core) &&
    (preRelease === undefined || (isIdentifiers(preRelease) && !LEADING_ZERO_PATTERN.test(preRelease))) &&
    (build === undefined || isIdentifiers(build))
  );
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
