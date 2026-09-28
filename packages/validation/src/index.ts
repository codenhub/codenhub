export { type AnyValidator, type UnknownValidator } from "./any";
export { ArrayValidator } from "./array";
export { BooleanValidator } from "./boolean";
export {
  coerce,
  CoerceValidator,
  CoercedBooleanValidator,
  CoercedDateValidator,
  CoercedNumberValidator,
  CoercedStringValidator,
  type ValCoerce,
} from "./coerce";
export { BaseValidator, type Infer, type InferInput, type ValidationContext, type Validator } from "./core";
export { custom, CustomValidator, type CustomValidatorFn } from "./custom";
export { DateValidator } from "./date";
export { DiscriminatedUnionValidator, type InferDiscriminatedUnion } from "./discriminated-union";
export { InstanceofValidator, type Constructor } from "./instanceof";
export { deepMerge, IntersectionValidator } from "./intersection";
export { LazyValidator } from "./lazy";
export { type EnumValidator, type LiteralValidator, type LiteralValue } from "./literal";
export { MapValidator } from "./map";
export { type EnumLike, NativeEnumValidator } from "./native-enum";
export { NumberValidator, type NumberStep } from "./number";
export { isPlainObject, ObjectValidator, type DeepPartial, type InferObject, type PlainObject } from "./object";
export { pipe, PipedValidator } from "./pipe";
export { NeverValidator, NullValidator, UndefinedValidator, VoidValidator } from "./primitives";
export { RecordValidator } from "./record";
export {
  describeReceived,
  err,
  fail,
  flatten,
  type FlattenedErrors,
  formatPath,
  normalizeError,
  ok,
  parseResult,
  ValidationError,
  type ValidationErr,
  type ValidationErrorCode,
  type ValidationErrorInput,
  type ValidationErrorOptions,
  type ValidationIssue,
  type ValidationOk,
  type ValidationOptions,
  type ValidationPathSegment,
  type ValidationResult,
} from "./result";
export { SetValidator } from "./set";
export { type StandardSchemaV1 } from "./standard-schema";
export { type DatetimeOptions, type IpOptions, JsonValidator, type StringStep, StringValidator } from "./string";
export { TupleValidator, type InferTuple, type InferTupleWithRest } from "./tuple";
export { UnionValidator } from "./union";

import { any, unknownValidator } from "./any";
import { array } from "./array";
import { boolean } from "./boolean";
import { valCoerce } from "./coerce";
import { type Validator } from "./core";
import { custom } from "./custom";
import { date } from "./date";
import { discriminatedUnion } from "./discriminated-union";
import { instanceOf } from "./instanceof";
import { intersection } from "./intersection";
import { lazy } from "./lazy";
import { enumValidator, literal } from "./literal";
import { map } from "./map";
import { nativeEnum } from "./native-enum";
import { number } from "./number";
import { object } from "./object";
import { pipe } from "./pipe";
import { neverValidator, nullValidator, undefinedValidator, voidValidator } from "./primitives";
import { record } from "./record";
import { type ValidationOptions, type ValidationResult } from "./result";
import { set } from "./set";
import { string } from "./string";
import { tuple } from "./tuple";
import { union } from "./union";

/**
 * Validates arbitrary input data against a schema validator synchronously.
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
 * Validates arbitrary input data against a schema validator asynchronously.
 *
 * @typeParam T - Output type inferred from the validator schema.
 * @param data - Raw data to validate.
 * @param validator - Validator schema instance.
 * @param options - Optional validation configuration.
 * @returns Promise resolving to a discriminated ValidationResult.
 */
export function validateAsync<T>(
  data: unknown,
  validator: Validator<T>,
  options?: ValidationOptions,
): Promise<ValidationResult<T>> {
  return (validator as Validator<T, unknown>).validateAsync(data, options);
}

/**
 * Validates arbitrary input data against a schema validator synchronously, returning the validated
 * value or throwing a {@link ValidationError} if invalid.
 *
 * @typeParam T - Output type inferred from the validator schema.
 * @param data - Raw data to validate.
 * @param validator - Validator schema instance.
 * @param options - Optional validation configuration.
 * @returns The validated output value.
 * @throws {@link ValidationError} when validation fails.
 */
export function parse<T>(data: unknown, validator: Validator<T>, options?: ValidationOptions): T {
  return (validator as Validator<T, unknown>).parse(data, options);
}

/**
 * Validates arbitrary input data against a schema validator asynchronously, returning the validated
 * value or throwing a {@link ValidationError} if invalid.
 *
 * @typeParam T - Output type inferred from the validator schema.
 * @param data - Raw data to validate.
 * @param validator - Validator schema instance.
 * @param options - Optional validation configuration.
 * @returns Promise resolving to the validated output value.
 * @throws {@link ValidationError} when validation fails.
 */
export function parseAsync<T>(data: unknown, validator: Validator<T>, options?: ValidationOptions): Promise<T> {
  return (validator as Validator<T, unknown>).parseAsync(data, options);
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
 * Asserts that arbitrary input data conforms to a validator schema, throwing a
 * {@link ValidationError} if invalid.
 *
 * @typeParam T - Output type asserted by the validator schema.
 * @param data - Raw data to validate.
 * @param validator - Validator schema instance.
 * @param options - Optional validation configuration.
 * @throws {@link ValidationError} when validation fails.
 */
export function assert<T>(data: unknown, validator: Validator<T>, options?: ValidationOptions): asserts data is T {
  (validator as Validator<T, unknown>).parse(data, options);
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
  /** Creates validators for discriminated unions indexed by a property key. */
  discriminatedUnion: typeof discriminatedUnion;
  /** Creates deferred validators enabling recursive data structures. */
  lazy: typeof lazy;
  /** Creates intersection validators requiring both schemas to succeed. */
  intersection: typeof intersection;
  /** Creates validators matching TypeScript runtime enums or `as const` object maps. */
  nativeEnum: typeof nativeEnum;
  /** Creates validators checking `instanceof` constraints. */
  instanceof: typeof instanceOf;
  /** Alias for {@link ValidationFactories.instanceof}. */
  instanceOf: typeof instanceOf;
  /** Creates validators for JavaScript Set instances. */
  set: typeof set;
  /** Creates validators for JavaScript Map instances. */
  map: typeof map;
  /** Creates validators strictly matching `null`. */
  null: typeof nullValidator;
  /** Creates validators strictly matching `undefined`. */
  undefined: typeof undefinedValidator;
  /** Creates validators matching `void` (accepts `undefined`). */
  void: typeof voidValidator;
  /** Creates validators representing `never` that unconditionally fail. */
  never: typeof neverValidator;
  /** Creates custom validators from user-provided functions. */
  custom: typeof custom;
  /** Composes multiple validators into a pipeline. */
  pipe: typeof pipe;
  /** Collection of coercing validator factories. */
  coerce: typeof valCoerce;
  /** Validates arbitrary input data against a schema validator synchronously. */
  validate: typeof validate;
  /** Validates arbitrary input data against a schema validator asynchronously. */
  validateAsync: typeof validateAsync;
  /** Validates arbitrary input data and returns the output value, throwing ValidationError if invalid. */
  parse: typeof parse;
  /** Validates arbitrary input data asynchronously and returns the output value, throwing ValidationError if invalid. */
  parseAsync: typeof parseAsync;
  /** Type guard asserting that unknown input conforms to a validator schema. */
  is: typeof is;
  /** Asserts that unknown input conforms to a validator schema, throwing ValidationError if invalid. */
  assert: typeof assert;
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
  discriminatedUnion,
  lazy,
  intersection,
  nativeEnum,
  instanceof: instanceOf,
  instanceOf,
  set,
  map,
  null: nullValidator,
  undefined: undefinedValidator,
  void: voidValidator,
  never: neverValidator,
  custom,
  pipe,
  coerce: valCoerce,
  validate,
  validateAsync,
  parse,
  parseAsync,
  is,
  assert,
};
