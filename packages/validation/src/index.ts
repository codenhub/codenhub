import { array } from "./array";
import { bigint, BigintValidator } from "./bigint";
import { boolean, BooleanValidator } from "./boolean";
import { intersection, union } from "./core";
import { date, DateValidator } from "./date";
import { discriminatedUnion } from "./discriminated-union";
import { json } from "./json";
import { lazy } from "./lazy";
import { enumOf, literal, nativeEnum } from "./literal";
import { map } from "./map";
import { number, NumberValidator } from "./number";
import { object } from "./object";
import { custom, instanceOf, never, nullValidator, undefinedValidator, unknown } from "./primitives";
import { record } from "./record";
import { set } from "./set";
import { string, StringValidator } from "./string";
import { tuple } from "./tuple";

export { ArrayValidator } from "./array";
export { BigintValidator } from "./bigint";
export { BooleanValidator } from "./boolean";
export {
  IntersectionValidator,
  NEVER,
  NullableValidator,
  OptionalValidator,
  UnionValidator,
  Validator,
  type AnyValidator,
  type CheckFn,
  type Infer,
  type RefineOptions,
} from "./core";
export { DateValidator } from "./date";
export { DiscriminatedUnionValidator } from "./discriminated-union";
export {
  formatPath,
  ValidationError,
  type CheckContext,
  type FlattenedErrors,
  type IssueDetails,
  type IssueInput,
  type Message,
  type ValidationErr,
  type ValidationIssue,
  type ValidationIssueCode,
  type ValidationOk,
  type ValidationOptions,
  type ValidationPathSegment,
  type ValidationResult,
} from "./issue";
export { LazyValidator } from "./lazy";
export { EnumValidator, LiteralValidator, type EnumLike, type LiteralValue } from "./literal";
export { MapValidator } from "./map";
export { NumberValidator } from "./number";
export { ObjectValidator, type InferObject, type Shape } from "./object";
export { InstanceOfValidator, NeverValidator, UnknownValidator, type Constructor } from "./primitives";
export { RecordValidator, type InferRecord } from "./record";
export { SetValidator } from "./set";
export { type StandardSchemaV1 } from "./standard-schema";
export { StringValidator, type DatetimeOptions, type EmailOptions, type IpOptions, type UrlOptions } from "./string";
export { TupleValidator, type InferTuple } from "./tuple";

/** Validators that convert their input to the target type before validating it, for values that arrive as text. */
const coerce = {
  /** Accepts strings, numbers, bigints and booleans, and outputs them as strings. */
  string: (message?: Parameters<typeof string>[0]): StringValidator => new StringValidator(message, true),
  /** Accepts numbers and decimal strings such as `"42"` or `" 3.5 "`, and outputs a number. */
  number: (message?: Parameters<typeof number>[0]): NumberValidator => new NumberValidator(message, true),
  /** Accepts booleans, and the words true/false, yes/no, on/off and 1/0 in any case, and outputs a boolean. */
  boolean: (message?: Parameters<typeof boolean>[0]): BooleanValidator => new BooleanValidator(message, true),
  /** Accepts bigints, integer numbers and integer strings, and outputs a bigint. */
  bigint: (message?: Parameters<typeof bigint>[0]): BigintValidator => new BigintValidator(message, true),
  /** Accepts dates, timestamps and ISO 8601 strings, and outputs a valid Date. */
  date: (message?: Parameters<typeof date>[0]): DateValidator => new DateValidator(message, true),
};

/**
 * Entry point holding every validator factory.
 *
 * @example
 * ```ts
 * import { val, type Infer } from "@codenhub/validation";
 *
 * const user = val.object({ name: val.string().min(2), age: val.number().int().optional() });
 * type User = Infer<typeof user>;
 * ```
 */
export const val = {
  /** Strings, with rules such as `min`, `email`, `url` and `regex`. */
  string,
  /** Finite numbers, with rules such as `int`, `min` and `positive`. */
  number,
  /** Bigints. */
  bigint,
  /** Booleans. */
  boolean,
  /** Valid `Date` instances. */
  date,
  /** Exactly one value. */
  literal,
  /** One of a list of strings or numbers. */
  enum: enumOf,
  /** The values of a TypeScript `enum` or an `as const` object. */
  nativeEnum,
  /** Any value, unchecked. */
  unknown,
  /** No value at all. */
  never,
  /** Only `null`. */
  null: nullValidator,
  /** Only `undefined`. */
  undefined: undefinedValidator,
  /** Plain objects with a shape. */
  object,
  /** Arrays whose items share a validator. */
  array,
  /** Arrays with a fixed sequence of typed positions. */
  tuple,
  /** Objects used as dictionaries. */
  record,
  /** `Set` instances. */
  set,
  /** `Map` instances. */
  map,
  /** Any of several validators. */
  union,
  /** Objects of several shapes told apart by one property. */
  discriminatedUnion,
  /** Both of two validators. */
  intersection,
  /** A validator built on first use, so schemas can refer to themselves. */
  lazy,
  /** Instances of a class. */
  instanceOf,
  /** A predicate turned into a validator. */
  custom,
  /** Strings holding JSON, outputting the parsed value. */
  json,
  /** Validators that convert text input, such as environment variables and form values, before validating it. */
  coerce,
};
