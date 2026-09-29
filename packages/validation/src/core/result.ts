import { isPlainObject } from "./objects";
import type { ValidationErr, ValidationIssue, ValidationIssueCode, ValidationOk, ValidationPathSegment } from "./types";

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

/** Wraps issues that are already complete into a failed result. */
export const failWith = (issues: readonly ValidationIssue[]): ValidationErr => ({ ok: false, error: { issues } });

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

/** Moves issues one level down, for a parent reporting what its child found under `segment`. */
export const nestIssues = (
  issues: readonly ValidationIssue[],
  segment: ValidationPathSegment,
): readonly ValidationIssue[] => issues.map((issue) => ({ ...issue, path: [segment, ...issue.path] }));

/** Names the runtime type of a value for messages without echoing the value. */
export function describeType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return Number.isNaN(value) ? "nan" : "infinity";
  }
  if (value instanceof Date) {
    return "date";
  }
  if (value instanceof Map) {
    return "map";
  }
  if (value instanceof Set) {
    return "set";
  }
  if (typeof value === "object" && !isPlainObject(value)) {
    return (Object.getPrototypeOf(value) as { constructor?: { name?: string } }).constructor?.name || "object";
  }
  return typeof value;
}

/** Fails because the input is not the type a validator accepts, naming both types and never the value. */
export const invalidType = (expected: string, input: unknown): ValidationErr =>
  failIssue("invalid_type", { expected, received: describeType(input) });

/** Fails because coercion could not convert the input, naming both types and never the value. */
export const invalidCoercion = (expected: string, input: unknown): ValidationErr =>
  failIssue("invalid_type", { expected, received: describeType(input), coerced: true });

/** Rejects a size limit that is not a non-negative integer, since it is a mistake in the schema and not in the input. */
export function assertSize(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, received ${value}`);
  }
}
