/*
 * The English of `~standard`, in the pieces a validator may need. Every validator is a Standard Schema, and
 * a Standard Schema issue must carry a message, so a validator carries the wording of what it and its
 * children can report, and no more: a wording arrives with the code that reports the issue it words.
 *
 * An issue no wording here knows, such as one a validator written by hand reports under a built-in code,
 * reads `Invalid value`, unless it has a message of its own.
 */
import type { ValidationIssue } from "./types";

/** The wording of the issues it knows, or undefined for any other. */
export type Word = (issue: ValidationIssue) => string | undefined;

/** Words `invalid_type`. */
export const wordType: Word = ({ code, params }) =>
  code === "invalid_type"
    ? `Expected ${String(params?.["expected"])}, received ${String(params?.["received"])}`
    : undefined;

/** What a size counts, for the types whose size is not the value itself. */
const UNITS: Readonly<Record<string, string>> = {
  string: " characters",
  file: " bytes",
  array: " items",
  set: " items",
  map: " items",
  record: " keys",
  depth: " levels deep",
};

/** Words `too_small` and `too_big`. */
export const wordSize: Word = ({ code, params = {} }) => {
  const isMin = code === "too_small";
  if (!isMin && code !== "too_big") {
    return undefined;
  }
  const bound = params[isMin ? "minimum" : "maximum"];
  const type = String(params["type"]);
  const shown = bound instanceof Date ? bound.toISOString() : String(bound);
  if (type === "issues") {
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

/** Words `invalid_format`: a format with a name of its own is named, and a rule is not. */
export const wordFormat: Word = ({ code, params }) => {
  if (code !== "invalid_format") {
    return undefined;
  }
  const format = String(params?.["format"]);
  return /[a-z\d][A-Z]|^(?:regex|includes|lowercase|uppercase)$/.test(format) ? undefined : `Invalid ${format}`;
};

/** Words the `invalid_value` of a number that is not an integer. */
export const wordInteger: Word = ({ code, params }) =>
  code === "invalid_value" && (params?.["format"] === "int" || params?.["format"] === "safeInt")
    ? "Must be an integer"
    : undefined;

/** Words the `invalid_value` of a number that is not a multiple. */
export const wordMultiple: Word = ({ code, params }) =>
  code === "invalid_value" && params?.["format"] === "multipleOf"
    ? `Must be a multiple of ${String(params["value"])}`
    : undefined;

/** Words `invalid_key`. */
export const wordKey: Word = ({ code }) => (code === "invalid_key" ? "Invalid key" : undefined);

/** Words `unrecognized_key`. */
export const wordUnknownKey: Word = ({ code }) => (code === "unrecognized_key" ? "Unrecognized key" : undefined);

/** Words `invalid_union`. */
export const wordUnion: Word = ({ code }) => (code === "invalid_union" ? "Does not match any allowed type" : undefined);

/** The wording of a validator that reports nothing but a type. */
export const TYPE_WORDS: readonly Word[] = [wordType];

/** The wording of a validator that reports a type and a size. */
export const SIZE_WORDS: readonly Word[] = [wordType, wordSize];

/** The wording of a validator that reports a type and a format. */
export const FORMAT_WORDS: readonly Word[] = [wordType, wordFormat];

/** The wording of a validator that reports nothing a wording knows. */
export const NO_WORDS: readonly Word[] = [];
