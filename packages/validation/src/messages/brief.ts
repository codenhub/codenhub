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
  depth: " levels deep",
};

const limit = (params: Readonly<Record<string, unknown>>, isMin: boolean): string => {
  const bound = params[isMin ? "minimum" : "maximum"];
  const type = String(params["type"]);
  // A date is written as its moment in UTC, so the text does not depend on the clock of the machine.
  const shown = bound instanceof Date ? bound.toISOString() : String(bound);
  if (type === "issues") {
    // The limit of what a collection reports is the package's, not a size of the input.
    return `Stopped after ${shown} problems`;
  }
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
  return `Must be ${wording} ${shown}${Object.hasOwn(UNITS, type) ? UNITS[type] : ""}`;
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
    case "invalid_format": {
      const format = String(params["format"]);
      // A check's name and a camelCase format, such as `startsWith` or `creditCard`, are code identifiers,
      // which a form would show its user as they are.
      return /[a-z][A-Z]|^(?:regex|includes|lowercase|uppercase)$/.test(format) ? "Invalid value" : `Invalid ${format}`;
    }
    case "invalid_value":
      return params["format"] === "multipleOf"
        ? `Must be a multiple of ${String(params["value"])}`
        : params["format"] === "int" || params["format"] === "safeInt"
          ? "Must be an integer"
          : "Invalid value";
    case "invalid_key":
      return "Invalid key";
    case "unrecognized_key":
      // The key is the last segment of the path, where a reader of a Standard Schema shows it.
      return "Unrecognized key";
    case "invalid_union":
      return "Does not match any allowed type";
    default:
      return "Invalid value";
  }
}
