export { type AnyValidator, type UnknownValidator } from "./any";
export { ArrayValidator, type ArrayValidators } from "./array";
export { type BooleanValidator } from "./boolean";
export { coerce, CoerceValidator, type ValCoerce } from "./coerce";
export { BaseValidator, type Infer, type InferInput, type ValidationContext, type Validator } from "./core";
export { custom, CustomValidator, type CustomValidatorFn } from "./custom";
export { type DateValidator } from "./date";
export { type EnumValidator, type LiteralValidator, type LiteralValue } from "./literal";
export { type NumberValidator, type NumberValidators } from "./number";
export { isPlainObject, ObjectValidator, type InferObject, type ObjectValidators, type PlainObject } from "./object";
export { pipe, PipedValidator } from "./pipe";
export { RecordValidator } from "./record";
export {
  describeReceived,
  err,
  fail,
  normalizeError,
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
export { type StringValidator, type StringValidators } from "./string";
export { TupleValidator, type InferTuple } from "./tuple";
export { UnionValidator } from "./union";

import { any, unknownValidator } from "./any";
import { array } from "./array";
import { boolean } from "./boolean";
import { valCoerce } from "./coerce";
import { type Validator } from "./core";
import { custom } from "./custom";
import { date } from "./date";
import { enumValidator, literal } from "./literal";
import { number } from "./number";
import { object } from "./object";
import { pipe } from "./pipe";
import { record } from "./record";
import { type ValidationOptions, type ValidationResult } from "./result";
import { string } from "./string";
import { tuple } from "./tuple";
import { union } from "./union";

/**
 * Validates arbitrary input data against a schema validator.
 *
 * @typeParam T - Output type inferred from the validator schema.
 * @param data - Raw data to validate.
 * @param validator - Validator schema instance.
 * @param options - Optional validation configuration.
 * @returns A discriminated ValidationResult.
 */
export function validate<T>(data: unknown, validator: Validator<T>, options?: ValidationOptions): ValidationResult<T> {
  return (validator as Validator<T, unknown>).validate(data, options);
}

/**
 * Type guard asserting that unknown input conforms to a validator schema.
 *
 * @typeParam T - Inferred output type.
 * @param data - Raw data to test.
 * @param validator - Validator schema instance.
 * @returns `true` if input is valid; otherwise `false`.
 */
export function is<T>(data: unknown, validator: Validator<T>): data is T {
  return validator.is(data);
}

/**
 * Registry of schema validator factories exposed by `val`.
 */
export interface ValidationFactories {
  /** Creates validators for string inputs. */
  string: typeof string;
  /** Creates validators for numeric inputs. */
  number: typeof number;
  /** Creates validators for boolean inputs. */
  boolean: typeof boolean;
  /** Creates validators for Date instances. */
  date: typeof date;
  /** Creates validators for exact literal values. */
  literal: typeof literal;
  /** Creates validators for allowed enum values. */
  enum: typeof enumValidator;
  /** Creates validators accepting any input. */
  any: typeof any;
  /** Creates validators accepting any unknown input. */
  unknown: typeof unknownValidator;
  /** Creates validators for plain objects. */
  object: typeof object;
  /** Creates validators for arrays. */
  array: typeof array;
  /** Creates validators for dictionary/record objects. */
  record: typeof record;
  /** Creates validators for fixed-length positional tuples. */
  tuple: typeof tuple;
  /** Creates validators for unions matching any allowed variant. */
  union: typeof union;
  /** Creates custom validators from user-provided functions. */
  custom: typeof custom;
  /** Composes multiple validators into a pipeline. */
  pipe: typeof pipe;
  /** Collection of coercing validator factories. */
  coerce: typeof valCoerce;
  /** Validates arbitrary input data against a schema validator. */
  validate: typeof validate;
  /** Type guard asserting that unknown input conforms to a validator schema. */
  is: typeof is;
}

/** Primary entrypoint exposing all schema validator factories. */
export const val: ValidationFactories = {
  string,
  number,
  boolean,
  date,
  literal,
  enum: enumValidator,
  any,
  unknown: unknownValidator,
  object,
  array,
  record,
  tuple,
  union,
  custom,
  pipe,
  coerce: valCoerce,
  validate,
  is,
};
