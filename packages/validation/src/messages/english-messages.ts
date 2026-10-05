import { timeOf } from "../core/objects";
import type { ValidationIssue } from "../core/types";
import { formatIssue, formatPath, type Messages } from "./format-issue";

const FORMAT_NAMES: Readonly<Record<string, string>> = {
  email: "email address",
  url: "URL",
  uuid: "UUID",
  ip: "IP address",
  ipv4: "IPv4 address",
  ipv6: "IPv6 address",
  datetime: "datetime",
  isoDate: "date",
  base64: "base64 string",
  hex: "hexadecimal string",
  hostname: "hostname",
  cuid2: "cuid2",
  ulid: "ULID",
  nanoid: "Nano ID",
  json: "JSON",
  base64url: "base64url string",
  domain: "domain name",
  port: "port",
  phone: "phone number",
  slug: "slug",
  semver: "version",
  jwt: "token",
  creditCard: "card number",
  cidr: "CIDR block",
  cidrv4: "IPv4 CIDR block",
  cidrv6: "IPv6 CIDR block",
  mac: "MAC address",
  time: "time",
  duration: "duration",
};

/** Singular and plural of what a string limit counts. */
const UNITS: Readonly<Record<string, readonly [string, string]>> = { string: ["character", "characters"] };
/** What each collection's size counts, singular and plural. */
const COLLECTIONS: Readonly<Record<string, readonly [string, string]>> = {
  array: ["item", "items"],
  set: ["item", "items"],
  map: ["item", "items"],
  record: ["key", "keys"],
};

/** Reads an entry of one of the tables above, so a name such as `constructor` is no entry of `Object.prototype`. */
const entryOf = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined;

/** The most allowed values a message lists before it says how many more there are. */
const LISTED_VALUES = 10;

/** Lists allowed values for a sentence, the first ten and a count of the rest, so a long list stays a sentence. */
const listOf = (values: readonly unknown[], word: (value: unknown) => string): string => {
  const listed = values.slice(0, LISTED_VALUES).map(word).join(", ");
  return values.length > LISTED_VALUES ? `${listed} or ${values.length - LISTED_VALUES} more` : listed;
};

/**
 * Words an issue quoted inside another, such as an option's inside a union or a part's inside a URL, with
 * where it sits inside the value the outer issue is shown at, so `width: Must be at least 1` says which
 * property of the box to fix.
 */
const quote = (found: ValidationIssue, messages: Messages): string =>
  `${found.path?.length > 0 ? `${formatPath(found.path)}: ` : ""}${formatIssue(found, messages)}`;

/** Reads a parameter as text, so a missing or unusual one degrades to a readable message and not a crash. */
const param = (issue: ValidationIssue, name: string): string => String(issue.params?.[name]);

/** Writes a literal value the way it would appear in code, so `"a"` and `a` are not confused. */
const formatValue = (value: unknown): string =>
  typeof value === "string" ? JSON.stringify(value) : typeof value === "bigint" ? `${value}n` : String(value);

const describeLimit = ({ code, params }: ValidationIssue): string => {
  const isMin = code === "too_small";
  const limit = params?.[isMin ? "minimum" : "maximum"];
  const bound = String(limit);
  const type = String(params?.type);
  // A `Date` of any realm is written as its moment, whatever `type` says, and the bound of a date as it is
  // otherwise: the ISO text `JSON.stringify` made of a `Date` when the issue was sent on reads the same,
  // and text is never read as a date, which would depend on the clock of the machine wording it.
  const time = timeOf(limit);
  if (type === "date" || time !== undefined) {
    const moment = time === undefined || Number.isNaN(time) ? bound : new Date(time).toISOString();
    return `Must be on or ${isMin ? "after" : "before"} ${moment}`;
  }
  if (type === "depth") {
    return `Must be nested at most ${bound} levels deep`;
  }
  if (type === "calls") {
    return `Too complex to check within ${bound} recursive steps`;
  }
  const counts = entryOf(COLLECTIONS, type);
  if (counts !== undefined) {
    const wording = params?.exact === true ? "exactly" : isMin ? "at least" : "at most";
    return `Must contain ${wording} ${bound} ${counts[limit === 1 ? 0 : 1]}`;
  }
  const unit = entryOf(UNITS, type);
  const counted = (count: unknown): string => (unit === undefined ? "items" : unit[count === 1 ? 0 : 1]);
  if (params?.exact === true) {
    return `Must be exactly ${bound} ${counted(limit)}`;
  }
  const isInclusive = params?.inclusive !== false;
  const wording = isMin ? (isInclusive ? "at least" : "greater than") : isInclusive ? "at most" : "less than";
  return unit === undefined ? `Must be ${wording} ${bound}` : `Must be ${wording} ${bound} ${counted(limit)}`;
};

const describeFormat = (issue: ValidationIssue, messages: Messages): string => {
  const format = param(issue, "format");
  const name = entryOf(FORMAT_NAMES, format) ?? format;
  // A part of a URL or an address that failed is worded with what its validator found first.
  const [found] = (issue.params?.["issues"] ?? []) as readonly ValidationIssue[];
  if (found !== undefined) {
    return `Invalid ${name} ${param(issue, "part")}: ${quote(found, messages)}`;
  }
  switch (format) {
    case "regex":
      return `Must match ${param(issue, "pattern")}`;
    case "startsWith":
      return `Must start with ${formatValue(issue.params?.["value"])}`;
    case "endsWith":
      return `Must end with ${formatValue(issue.params?.["value"])}`;
    case "includes":
      return `Must include ${formatValue(issue.params?.["value"])}`;
    case "lowercase":
      return "Must be lowercase";
    case "uppercase":
      return "Must be uppercase";
    default:
      return `Invalid ${name}`;
  }
};

/**
 * Tests whether what an option of a union found says only that the input is not of its kind: one issue
 * at the value itself, of the wrong type, or naming the values a `literal` or `oneOf` accepts. An issue
 * without a path, which a validator written by hand may report, is at the value, as everywhere else.
 */
const isOtherKind = (issues: readonly ValidationIssue[]): boolean => {
  const [only] = issues;
  return (
    issues.length === 1 &&
    only !== undefined &&
    !(only.path?.length > 0) &&
    (only.code === "invalid_type" ||
      (only.code === "invalid_value" &&
        only.params !== undefined &&
        ("expected" in only.params || Array.isArray(only.params["options"]))))
  );
};

/**
 * Words a union that no option accepted. When the input was of the kind of exactly one option, such as
 * text for `union([literal(""), email()])`, that option's first issue says what is wrong, "Invalid email
 * address"; otherwise no option is the one meant, and the wording is generic.
 */
const describeUnion = (issue: ValidationIssue, messages: Messages): string => {
  if (Array.isArray(issue.params?.options)) {
    return `Expected ${param(issue, "discriminator")} to be one of ${listOf(issue.params.options, formatValue)}`;
  }
  const found = (issue.params?.["issues"] ?? []) as readonly (readonly ValidationIssue[])[];
  const meant = Array.isArray(found) ? found.filter((issues) => Array.isArray(issues) && !isOtherKind(issues)) : [];
  const [first] = meant.length === 1 ? (meant[0] as readonly ValidationIssue[]) : [];
  return first === undefined ? "Does not match any of the allowed types" : quote(first, messages);
};

const describeValue = (issue: ValidationIssue): string => {
  // A bigint is reported as its digits, and `type: "bigint"` says so.
  const word = issue.params?.type === "bigint" ? (value: unknown) => `${String(value)}n` : formatValue;
  if (issue.params !== undefined && "expected" in issue.params) {
    return `Expected ${word(issue.params.expected)}`;
  }
  if (Array.isArray(issue.params?.options)) {
    return `Expected one of ${listOf(issue.params.options, word)}`;
  }
  switch (issue.params?.format) {
    case "multipleOf":
      return `Must be a multiple of ${param(issue, "value")}`;
    case "int":
      return "Must be an integer";
    case "safeInt":
      return "Must be a safe integer";
    case "nonZero":
      return "Must not be zero";
    default:
      return "Invalid value";
  }
};

/** The English wording of one issue code, as a function of the issue alone. */
type Wording = (issue: ValidationIssue) => string;

/**
 * The English wording of a code whose issue holds the issues behind it: it is also given the map in use,
 * which words the issue it quotes.
 */
type QuotingWording = (issue: ValidationIssue, messages: Messages) => string;

/**
 * Words an `invalid_type` issue in English, such as "Expected string, received number".
 *
 * @remarks
 * Each code's wording is a value of its own, so a program that can report only a few codes builds a
 * map of those and bundles no other wording: `{ invalid_type: invalidTypeMessage }`. Pass the map
 * wherever {@link englishMessages} goes. A code the map lacks is worded "Invalid value".
 *
 * @example
 * ```ts
 * const messages = { invalid_type: invalidTypeMessage, too_small: tooSmallMessage };
 * const result = string({ min: 2 })(1);
 * if (!result.ok) {
 *   formatIssue(result.error.issues[0], messages); // "Expected string, received number"
 * }
 * ```
 *
 * @param issue - The issue to word.
 * @returns The wording, without the issue's path.
 */
export const invalidTypeMessage: Wording = (issue) => {
  if (issue.params?.coerced === true) {
    return `Cannot convert ${param(issue, "received")} to a ${param(issue, "expected")}`;
  }
  if (issue.params?.received === "non-plain object") {
    // Such as `process.env` or a class instance, which a copy into a plain object passes.
    return "Expected a plain object; copy it first, as in { ...value }";
  }
  return issue.params?.expected === "never"
    ? "Not allowed"
    : `Expected ${param(issue, "expected")}, received ${param(issue, "received")}`;
};

/**
 * Words a `too_small` issue in English, such as "Must be at least 2 characters".
 *
 * @param issue - The issue to word.
 * @returns The wording, without the issue's path.
 */
export const tooSmallMessage: Wording = describeLimit;

/**
 * Words a `too_big` issue in English, such as "Must contain at most 10 items".
 *
 * @param issue - The issue to word.
 * @returns The wording, without the issue's path.
 */
export const tooBigMessage: Wording = describeLimit;

/**
 * Words an `invalid_format` issue in English, such as "Invalid email address" or "Must match /^a/".
 *
 * @param issue - The issue to word.
 * @param messages - The map in use, which words the issue a failed part of a URL or an address holds.
 * @returns The wording, without the issue's path.
 */
export const invalidFormatMessage: QuotingWording = describeFormat;

/**
 * Words an `invalid_value` issue in English, such as "Expected one of "a", "b"" or "Must be unique".
 *
 * @param issue - The issue to word.
 * @returns The wording, without the issue's path.
 */
export const invalidValueMessage: Wording = (issue) =>
  issue.params?.unique === true
    ? "Must be unique"
    : issue.params?.unreadable === true
      ? "Could not be read"
      : issue.params?.encodedSeparator === true
        ? "Must not hold an encoded / or \\"
        : issue.params?.dotSegment === true
          ? "Must not hold . or .. followed by ;"
          : describeValue(issue);

/**
 * Words an `invalid_key` issue in English, with what the key's validator found first.
 *
 * @remarks
 * A key given twice, in a query or by two keys a key validator made the same, is worded "Must be given
 * only once", since "must be unique" names no rule a person broke.
 *
 * @param issue - The issue to word.
 * @param messages - The map in use, which words the issue the key's validator reported, so a map that
 * overrides some of the wording reaches that issue too.
 * @returns The wording, without the issue's path.
 */
export const invalidKeyMessage: QuotingWording = (issue, messages) => {
  const [found] = (issue.params?.issues ?? []) as readonly ValidationIssue[];
  if (found?.code === "invalid_value" && found.params?.unique === true) {
    return "Must be given only once";
  }
  return found === undefined ? "Invalid key" : `Invalid key: ${quote(found, messages)}`;
};

/**
 * Words an `unrecognized_key` issue in English, with the key quoted as a literal, since it is text the
 * sender chose and may hold quotes or line breaks.
 *
 * @param issue - The issue to word.
 * @returns The wording, without the issue's path.
 */
export const unrecognizedKeyMessage: Wording = (issue) => `Unrecognized key ${formatValue(issue.params?.key)}`;

/** The English wording of an `invalid_intersection` issue. */
export const invalidIntersectionMessage = "Conflicting values";

/**
 * Words an `invalid_union` issue in English: with what the one option the input was meant for found,
 * and generically when no option is that one.
 *
 * @param issue - The issue to word.
 * @param messages - The map in use, which words the issue an option reported.
 * @returns The wording, without the issue's path.
 */
export const invalidUnionMessage: QuotingWording = describeUnion;

/**
 * The built-in English wording for every issue the validators can report, as a message map.
 *
 * @remarks
 * Pass it to `formatIssue`, `flatten`, `assert` or `standard` to get text such as "Must be at least
 * 18". It is a separate value, not something `formatIssue` carries, so a program that words its own
 * issues, or that never shows one, does not bundle it, and one that can report only a few codes takes
 * the wording of each on its own, such as {@link invalidTypeMessage}. To change some of the wording,
 * spread it and override the codes you want: `{ ...englishMessages, too_small: "Too short" }`. It is
 * frozen, so no code can reword the messages of every other user of it in the process. A custom
 * validator's own codes are not in it; give them a `message` on the issue or an entry of your own.
 *
 * @example
 * ```ts
 * const result = number({ min: 18 })(15);
 * if (!result.ok) {
 *   formatIssue(result.error.issues[0], englishMessages); // "Must be at least 18"
 * }
 * ```
 */
export const englishMessages: Messages = /* @__PURE__ */ Object.freeze({
  invalid_type: invalidTypeMessage,
  too_small: tooSmallMessage,
  too_big: tooBigMessage,
  invalid_format: invalidFormatMessage,
  invalid_value: invalidValueMessage,
  invalid_key: invalidKeyMessage,
  unrecognized_key: unrecognizedKeyMessage,
  invalid_intersection: invalidIntersectionMessage,
  invalid_union: invalidUnionMessage,
});
