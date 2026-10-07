/**
 * Validators for values and shapes, each a standalone function that returns a typed value or every issue found.
 *
 * @packageDocumentation
 */

export { check } from "./builders/check";
export { checkFields } from "./builders/check-fields";
export { endsWith } from "./checks/ends-with";
export { includes } from "./checks/includes";
export { lowercase } from "./checks/lowercase";
export { multipleOf } from "./checks/multiple-of";
export { nonBlank } from "./checks/non-blank";
export { nonZero } from "./checks/non-zero";
export { pattern } from "./checks/pattern";
export { startsWith } from "./checks/starts-with";
export { unique } from "./checks/unique";
export { uppercase } from "./checks/uppercase";
export { format } from "./builders/format";
export { guard } from "./builders/guard";
export { coerceBigint } from "./coercion/coerce-bigint";
export { coerceBoolean } from "./coercion/coerce-boolean";
export { coerceDate, type CoerceDateOptions } from "./coercion/coerce-date";
export { coerceNumber } from "./coercion/coerce-number";
export { coerceString } from "./coercion/coerce-string";
export { array, type ArrayOptions } from "./composition/array";
export { fallback } from "./composition/fallback";
export { intersection } from "./composition/intersection";
export { json } from "./composition/json";
export { lazy, type LazyOptions } from "./composition/lazy";
export { map } from "./composition/map";
export { nullable } from "./composition/nullable";
export { nullish } from "./composition/nullish";
export { object, type InferShape, type InferShapeInput, type ObjectOptions, type Shape } from "./composition/object";
export { objectLike } from "./composition/object-like";
export { optional } from "./composition/optional";
export { omit } from "./composition/omit";
export { partial, type AllOptional, type PartialShape } from "./composition/partial";
export { pick } from "./composition/pick";
export { pipe } from "./composition/pipe";
export { record, type InferRecord } from "./composition/record";
export { required } from "./composition/required";
export type { AllRequired, Omitted, Picked, Reshaped } from "./composition/reshape";
export { set } from "./composition/set";
export { type SizeOptions } from "./composition/size";
export { tagged, type InferTagged, type InferTaggedInput, type Variants } from "./composition/tagged";
export { transform } from "./composition/transform";
export { tuple, type InferTuple, type InferTupleInput, type TupleOptions } from "./composition/tuple";
export { union } from "./composition/union";
export { assert, type AssertOptions } from "./core/assert";
export { is } from "./core/is";
export { describe, type Description } from "./core/describe";
export { fail, pass, type IssueInput } from "./core/result";
export type {
  AnyValidator,
  AsyncCheck,
  AsyncRest,
  Check,
  AsyncValidator,
  Composed,
  Factory,
  Infer,
  InferInput,
  Message,
  MessageOptions,
  Rest,
  ValidationErr,
  ValidationFailure,
  ValidationIssue,
  ValidationIssueCode,
  ValidationOk,
  ValidationPathSegment,
  ValidationResult,
  Validator,
} from "./core/types";
export { base64, type Base64Options } from "./formats/base64";
export { cidr } from "./formats/cidr";
export { creditCard } from "./formats/credit-card";
export { cuid2 } from "./formats/cuid2";
export { datetime, type DatetimeOptions } from "./formats/datetime";
export { domain } from "./formats/domain";
export { duration } from "./formats/duration";
export { email, type EmailOptions } from "./formats/email";
export { hex } from "./formats/hex";
export { hostname } from "./formats/hostname";
export { ip, type IpOptions } from "./formats/ip";
export { isoDate } from "./formats/iso-date";
export { jwt } from "./formats/jwt";
export { mac } from "./formats/mac";
export { nanoid } from "./formats/nanoid";
export { phone } from "./formats/phone";
export { port } from "./formats/port";
export { searchParams, type SearchParamsOptions } from "./formats/search-params";
export { semver } from "./formats/semver";
export { slug } from "./formats/slug";
export { time, type TimeOptions } from "./formats/time";
export { ulid } from "./formats/ulid";
export { url, type UrlOptions } from "./formats/url";
export { uuid, type UuidOptions } from "./formats/uuid";
export { toJsonSchema, type JsonSchema, type JsonSchemaOptions } from "./interop/json-schema";
export { standard } from "./interop/standard";
export { type StandardSchemaV1 } from "./interop/standard-schema";
export {
  englishMessages,
  invalidFormatMessage,
  invalidIntersectionMessage,
  invalidKeyMessage,
  invalidTypeMessage,
  invalidUnionMessage,
  invalidValueMessage,
  tooBigMessage,
  tooSmallMessage,
  unrecognizedKeyMessage,
} from "./messages/english-messages";
export { flatten, formatIssue, formatPath, type FlattenedErrors, type Messages } from "./messages/format-issue";
export { bigint, type BigintOptions } from "./primitives/bigint";
export { boolean } from "./primitives/boolean";
export { date, type DateOptions } from "./primitives/date";
export { func, type AnyFunction } from "./primitives/func";
export { instanceOf, type Constructor } from "./primitives/instance-of";
export { literal, type LiteralValue } from "./primitives/literal";
export { never } from "./primitives/never";
export { number, type NumberOptions } from "./primitives/number";
export { oneOf, type EnumLike } from "./primitives/one-of";
export { string, type StringOptions } from "./primitives/string";
export { symbol } from "./primitives/symbol";
export { unknown } from "./primitives/unknown";
