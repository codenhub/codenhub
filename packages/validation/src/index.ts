export { type ArrayValidators } from "./array";
export { coerce } from "./coerce";
export { custom } from "./custom";
export { type NumberValidators } from "./number";
export { type ObjectValidators, type PlainObject } from "./object";
export {
  err,
  ok,
  parseResult,
  type ValidationErr,
  type ValidationError,
  type ValidationErrorCode,
  type ValidationErrorInput,
  type ValidationErrorOptions,
  type ValidationIssue,
  type ValidationOk,
  type ValidationOptions,
  type ValidationPathSegment,
  type ValidationResult,
} from "./result";
export { type StringValidators } from "./string";

import { array } from "./array";
import { number } from "./number";
import { object } from "./object";
import { string } from "./string";

interface ValidationFactories {
  /** Creates validators for unknown input that must be a string before applying string-specific checks. */
  string: typeof string;
  /** Creates validators for unknown input that must be a finite number before applying number-specific checks. */
  number: typeof number;
  /** Creates validators for unknown input that must be a plain object before applying object-specific checks. */
  object: typeof object;
  /** Creates validators for unknown input that must be an array before applying array-specific checks. */
  array: typeof array;
}

/** Validation factory for common string, number, object, and array checks. */
export const val: ValidationFactories = { string, number, object, array };
