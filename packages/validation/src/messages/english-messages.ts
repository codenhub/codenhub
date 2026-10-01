import type { ValidationIssue } from "../core/types";
import { formatIssue, type Messages } from "./format-issue";

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
  if (limit instanceof Date) {
    return `Must be on or ${isMin ? "after" : "before"} ${limit.toISOString()}`;
  }
  if (type === "depth") {
    return `Must be nested at most ${bound} levels deep`;
  }
  if (type === "calls") {
    return `Too complex to check within ${bound} recursive steps`;
  }
  const counts = COLLECTIONS[type];
  if (counts !== undefined) {
    const wording = params?.exact === true ? "exactly" : isMin ? "at least" : "at most";
    return `Must contain ${wording} ${bound} ${counts[limit === 1 ? 0 : 1]}`;
  }
  const unit = UNITS[type];
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
  const name = FORMAT_NAMES[format] ?? format;
  // A part of a URL or an address that failed is worded with what its validator found first.
  const [found] = (issue.params?.["issues"] ?? []) as readonly ValidationIssue[];
  if (found !== undefined) {
    return `Invalid ${name} ${param(issue, "part")}: ${formatIssue(found, messages)}`;
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

const describeValue = (issue: ValidationIssue): string => {
  if (issue.params !== undefined && "expected" in issue.params) {
    return `Expected ${formatValue(issue.params.expected)}`;
  }
  if (Array.isArray(issue.params?.options)) {
    return `Expected one of ${issue.params.options.map(formatValue).join(", ")}`;
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

/**
 * The built-in English wording for every issue the validators can report, as a message map.
 *
 * @remarks
 * Pass it to `formatIssue`, `flatten` or `standard` to get text such as "Must be at least 18". It is
 * a separate value, not something `formatIssue` carries, so a program that words its own issues, or
 * that never shows one, does not bundle it. To change some of the wording, spread it and override
 * the codes you want: `{ ...englishMessages, too_small: "Too short" }`. A custom validator's own codes
 * are not in it; give them a `message` on the issue or an entry of your own.
 *
 * @example
 * ```ts
 * const result = number({ min: 18 })(15);
 * if (!result.ok) {
 *   formatIssue(result.error.issues[0], englishMessages); // "Must be at least 18"
 * }
 * ```
 */
export const englishMessages: Messages = {
  invalid_type: (issue) => {
    if (issue.params?.coerced === true) {
      return `Cannot convert ${param(issue, "received")} to ${param(issue, "expected")}`;
    }
    return issue.params?.expected === "never"
      ? "Not allowed"
      : `Expected ${param(issue, "expected")}, received ${param(issue, "received")}`;
  },
  too_small: describeLimit,
  too_big: describeLimit,
  invalid_format: describeFormat,
  invalid_value: (issue) => (issue.params?.unique === true ? "Must be unique" : describeValue(issue)),
  // Worded with what the key validator found first, so a form says why the key is wrong, not only that it
  // is, and with the map in use, so a map that overrides some of this wording reaches that issue too.
  invalid_key: (issue, messages) => {
    const [found] = (issue.params?.issues ?? []) as readonly ValidationIssue[];
    return found === undefined ? "Invalid key" : `Invalid key: ${formatIssue(found, messages)}`;
  },
  // Quoted as a literal, since the key is text the sender chose and may hold quotes or line breaks.
  unrecognized_key: (issue) => `Unrecognized key ${formatValue(issue.params?.key)}`,
  invalid_intersection: "Conflicting values",
  invalid_union: (issue) =>
    Array.isArray(issue.params?.options)
      ? `Expected ${param(issue, "discriminator")} to be one of ${issue.params.options.map(formatValue).join(", ")}`
      : "Does not match any of the allowed types",
};
