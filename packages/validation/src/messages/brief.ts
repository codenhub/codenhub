/*
 * The short English every validator's own `~standard` words its issues with. It is kept small, since every
 * program that makes a validator carries it: the issue's own message, or one sentence for its code with the
 * limit it names. `englishMessages` is the full wording, which `formatIssue`, `flatten` and `standard` give.
 */
import type { ValidationIssue } from "../core/types";

const UNITS: Readonly<Record<string, string>> = {
  string: " characters",
  file: " bytes",
  array: " items",
  set: " items",
  map: " items",
  record: " keys",
};

const limit = (params: Readonly<Record<string, unknown>>, isMin: boolean): string => {
  const wording =
    params["exact"] === true
      ? "exactly"
      : params["inclusive"] === false
        ? isMin
          ? "greater than"
          : "less than"
        : isMin
          ? "at least"
          : "at most";
  const type = String(params["type"]);
  return `Must be ${wording} ${String(params[isMin ? "minimum" : "maximum"])}${Object.hasOwn(UNITS, type) ? UNITS[type] : ""}`;
};

/**
 * Words an issue in short English: its own `message`, or one sentence for its code, such as "Must be at
 * least 2 characters".
 */
export function brief(issue: ValidationIssue): string {
  if (issue.message !== undefined) {
    return issue.message;
  }
  const params = issue.params ?? {};
  switch (issue.code) {
    case "invalid_type":
      return `Expected ${String(params["expected"])}, received ${String(params["received"])}`;
    case "too_small":
      return limit(params, true);
    case "too_big":
      return limit(params, false);
    case "invalid_format":
      return `Invalid ${String(params["format"])}`;
    case "invalid_value":
      return params["format"] === "int" || params["format"] === "safeInt" ? "Must be an integer" : "Invalid value";
    case "unrecognized_key":
      return `Unrecognized key ${JSON.stringify(params["key"])}`;
    case "invalid_union":
      return "Does not match any allowed type";
    default:
      return "Invalid value";
  }
}
