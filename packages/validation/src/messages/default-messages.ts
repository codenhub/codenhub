import type { ValidationIssue } from "../core/types";

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
};

const UNITS: Readonly<Record<string, string>> = { string: "characters" };

/** Reads a parameter as text, so a missing or unusual one degrades to a readable message and not a crash. */
const param = (issue: ValidationIssue, name: string): string => String(issue.params?.[name]);

const describeLimit = ({ code, params }: ValidationIssue): string => {
  const isMin = code === "too_small";
  const bound = String(params?.[isMin ? "minimum" : "maximum"]);
  const type = String(params?.type);
  if (params?.exact === true) {
    return `Must be exactly ${bound} ${UNITS[type] ?? "items"}`;
  }
  const isInclusive = params?.inclusive !== false;
  const wording = isMin ? (isInclusive ? "at least" : "greater than") : isInclusive ? "at most" : "less than";
  return type in UNITS ? `Must be ${wording} ${bound} ${UNITS[type]}` : `Must be ${wording} ${bound}`;
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
 * The English text for an issue, built from its `code` and `params`.
 *
 * Kept as one function so a consumer that never formats an issue does not bundle any of it.
 */
export function defaultMessage(issue: ValidationIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.params?.coerced === true
        ? `Cannot convert ${param(issue, "received")} to ${param(issue, "expected")}`
        : `Expected ${param(issue, "expected")}, received ${param(issue, "received")}`;
    case "too_small":
    case "too_big":
      return describeLimit(issue);
    case "invalid_format":
      return describeFormat(issue);
    case "invalid_value":
      return describeValue(issue);
    case "unrecognized_key":
      return `Unrecognized key "${param(issue, "key")}"`;
    case "invalid_union":
      return "Does not match any of the allowed types";
    default:
      return "Invalid value";
  }
}
