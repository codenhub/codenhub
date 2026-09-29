import { isPlainObject } from "./objects";
import type {
  ValidationErr,
  ValidationFailure,
  ValidationIssue,
  ValidationIssueCode,
  ValidationOk,
  ValidationPathSegment,
} from "./types";

/** Shared by every issue at the root, so reporting one allocates no path. */
const ROOT_PATH: readonly ValidationPathSegment[] = Object.freeze([]);

/** An issue as a validator author writes it; {@link fail} fills in the rest. */
export interface IssueInput {
  /**
   * Failure category.
   *
   * @defaultValue "custom"
   */
  code?: ValidationIssueCode;
  /** Location of the failure relative to the value being validated. Defaults to that value itself. */
  path?: readonly ValidationPathSegment[];
  /** Facts about the failure, for building messages or branching in callers. Must not contain the input. */
  params?: Readonly<Record<string, unknown>>;
  /** Ready-made message text. Without it, `formatIssue` builds one from `code` and `params`. */
  message?: string;
}

/**
 * Wraps a value into a successful result.
 *
 * @example
 * ```ts
 * const even: Validator<number> = (input) =>
 *   typeof input === "number" && input % 2 === 0 ? pass(input) : fail({ code: "not_even" });
 * ```
 *
 * @typeParam T - The type of the value.
 * @param value - The validated value.
 * @returns A successful result holding `value`.
 */
export function pass<T>(value: T): ValidationOk<T> {
  return { ok: true, value };
}

/**
 * Builds a failed result from one or more issues.
 *
 * @param issues - What went wrong. Each defaults to code `"custom"` and to the value's own location.
 * @returns A failed result holding every issue, in order.
 */
export function fail(...issues: [IssueInput, ...IssueInput[]]): ValidationErr {
  return failWith(issues.map(toIssue));
}

/** Wraps issues that are already complete into a failed result. Every caller passes at least one. */
export const failWith = (issues: readonly ValidationIssue[]): ValidationErr => ({
  ok: false,
  error: { issues: issues as ValidationFailure["issues"] },
});

/** Fills in the defaults of an issue written by a validator author. */
export function toIssue({ code = "custom", path = ROOT_PATH, params, message }: IssueInput): ValidationIssue {
  const issue: { -readonly [K in keyof ValidationIssue]: ValidationIssue[K] } = { code, path };
  if (params !== undefined) {
    issue.params = params;
  }
  if (message !== undefined) {
    issue.message = message;
  }
  return issue;
}

/** Fails with one built-in issue at the value's own location. */
export const failIssue = (code: ValidationIssueCode, params?: Readonly<Record<string, unknown>>): ValidationErr =>
  failWith([toIssue(params === undefined ? { code } : { code, params })]);

/**
 * Adds the issues a child found to its parent's list, one level down under `segment`. It pushes one
 * by one because spreading a long list into `push` passes each as an argument, which overflows the
 * stack past about 120,000 issues and would turn bad input into an exception.
 */
export function collectNested(
  target: ValidationIssue[],
  issues: readonly ValidationIssue[],
  segment: ValidationPathSegment,
): void {
  for (const issue of issues) {
    target.push({ ...issue, path: [segment, ...issue.path] });
  }
}

/** Names the runtime type of a value for messages without echoing the value. */
export function describeType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return Number.isNaN(value) ? "nan" : "infinity";
  }
  if (typeof value !== "object") {
    return typeof value;
  }
  try {
    return describeObject(value);
  } catch {
    // A proxy trap or a constructor getter threw. Naming the type must never fail validation.
    return "object";
  }
}

/** Names an object by its kind, or by its class for an instance, reading its prototype. */
function describeObject(value: object): string {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "invalid date" : "date";
  }
  if (value instanceof Map) {
    return "map";
  }
  if (value instanceof Set) {
    return "set";
  }
  if (isPlainObject(value)) {
    return "object";
  }
  return (Object.getPrototypeOf(value) as { constructor?: { name?: string } }).constructor?.name || "object";
}

/** Fails because the input is not the type a validator accepts, naming both types and never the value. */
export const invalidType = (expected: string, input: unknown): ValidationErr =>
  failIssue("invalid_type", { expected, received: describeType(input) });

/** Fails because coercion could not convert the input, naming both types and never the value. */
export const invalidCoercion = (expected: string, input: unknown): ValidationErr =>
  failIssue("invalid_type", { expected, received: describeType(input), coerced: true });

/**
 * Rejects a lower and an upper bound that no value can satisfy, since that is a mistake in the schema
 * and not in the input. `isExclusive` is for a pair where either side excludes its bound, so equal
 * bounds leave nothing between them. A missing bound constrains nothing.
 */
export function assertOrder<T extends number | bigint>(
  lowerName: string,
  lower: T | undefined,
  upperName: string,
  upper: T | undefined,
  isExclusive = false,
): void {
  if (lower !== undefined && upper !== undefined && (isExclusive ? lower >= upper : lower > upper)) {
    throw new RangeError(`No value can satisfy ${lowerName} ${lower} and ${upperName} ${upper}`);
  }
}

/** Rejects inclusive and exclusive bounds of a number or bigint that no value can satisfy together. */
export function assertBounds<T extends number | bigint>({
  min,
  max,
  gt,
  lt,
}: {
  min?: T;
  max?: T;
  gt?: T;
  lt?: T;
}): void {
  assertOrder("min", min, "max", max);
  assertOrder("min", min, "lt", lt, true);
  assertOrder("gt", gt, "max", max, true);
  assertOrder("gt", gt, "lt", lt, true);
}

/** Rejects a size limit that is not a non-negative integer, since it is a mistake in the schema and not in the input. */
export function assertSize(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, received ${value}`);
  }
}
