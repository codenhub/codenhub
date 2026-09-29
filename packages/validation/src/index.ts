export { email, type EmailOptions } from "./formats/email";
export { object, type InferShape, type ObjectOptions, type Shape } from "./composition/object";
export { optional } from "./composition/optional";
export { pipe } from "./composition/pipe";
export { refine, type RefineIssue } from "./composition/refine";
export { is } from "./core/is";
export { fail, pass, type IssueInput } from "./core/result";
export type {
  AnyValidator,
  AsyncValidator,
  Composed,
  Infer,
  ValidationErr,
  ValidationFailure,
  ValidationIssue,
  ValidationIssueCode,
  ValidationOk,
  ValidationPathSegment,
  ValidationResult,
  Validator,
} from "./core/types";
export { flatten, formatIssue, formatPath, type FlattenedErrors, type Messages } from "./messages/format-issue";
export { boolean } from "./primitives/boolean";
export { number, type NumberOptions } from "./primitives/number";
export { string, type StringOptions } from "./primitives/string";
