import type { ValidationIssue } from "../core/types";
import type { Messages } from "./format-issue";

const FORMAT_NAMES: Readonly<Record<string, string>> = {
  email: "email address",
  url: "URL",
  uuid: "UUID",
  ip: "IP address",
  ipv4: "IPv4 address",
  ipv6: "IPv6 address",
  datetime: "datetime",
  date: "date",
  base64: "base64 string",
  hex: "hexadecimal string",
  hostname: "hostname",
  cuid2: "cuid2",
  ulid: "ULID",
  nanoid: "Nano ID",
  json: "JSON",
};

/** Singular and plural of what a string limit counts. */
const UNITS: Readonly<Record<string, readonly [string, string]>> = { string: ["character", "characters"] };
const COLLECTIONS: ReadonlySet<string> = new Set(["array", "set", "map"]);

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
  if (COLLECTIONS.has(type)) {
    const wording = params?.exact === true ? "exactly" : isMin ? "at least" : "at most";
    return `Must contain ${wording} ${bound} ${limit === 1 ? "item" : "items"}`;
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

const describeFormat = (issue: ValidationIssue): string => {
  const format = param(issue, "format");
  switch (format) {
    case "regex":
      return `Must match ${param(issue, "pattern")}`;
    case "startsWith":
      return `Must start with "${param(issue, "value")}"`;
    case "endsWith":
      return `Must end with "${param(issue, "value")}"`;
    case "includes":
      return `Must include "${param(issue, "value")}"`;
    default:
      return `Invalid ${FORMAT_NAMES[format] ?? format}`;
  }
};

const describeValue = (issue: ValidationIssue): string => {
  if (issue.params !== undefined && "expected" in issue.params) {
    return `Expected ${formatValue(issue.params.expected)}`;
  }
  if (Array.isArray(issue.params?.options)) {
    return `Expected one of ${issue.params.options.map(formatValue).join(", ")}`;
  }
  if (issue.params?.multipleOf !== undefined) {
    return `Must be a multiple of ${param(issue, "multipleOf")}`;
  }
  switch (issue.params?.format) {
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
  invalid_key: "Invalid key",
  unrecognized_key: (issue) => `Unrecognized key "${param(issue, "key")}"`,
  invalid_union: (issue) =>
    Array.isArray(issue.params?.options)
      ? `Expected ${param(issue, "discriminator")} to be one of ${issue.params.options.map(formatValue).join(", ")}`
      : "Does not match any of the allowed types",
};
