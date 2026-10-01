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
 * @throws {TypeError} When called without an issue, which the types already forbid.
 */
export function fail(...issues: [IssueInput, ...IssueInput[]]): ValidationErr {
  if (issues.length === 0) {
    // The types forbid it, but a failure with no issue says nothing and breaks `issues[0]`.
    throw new TypeError("fail() needs at least one issue");
  }
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

/** Builds a built-in issue: a code, the facts behind it, and where it is, the value's own location by default. */
export const issue = (
  code: ValidationIssueCode,
  params?: Readonly<Record<string, unknown>>,
  path: readonly ValidationPathSegment[] = ROOT_PATH,
): ValidationIssue => (params === undefined ? { code, path } : { code, path, params });

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

/** The issue for an item equal to an earlier one, where a collection requires them distinct. */
export const repeatedItem = (segment: ValidationPathSegment): ValidationIssue =>
  issue("invalid_value", { unique: true }, [segment]);

/**
 * The issue for an entry whose key, once its validator has changed it, is one an earlier entry already
 * has. Reported as a bad key, since keeping both would silently drop one of the values.
 */
export const repeatedKey = (segment: ValidationPathSegment): ValidationIssue =>
  issue("invalid_key", { issues: [issue("invalid_value", { unique: true })] }, [segment]);

/**
 * Names the kind of a value for messages without echoing the value: its `typeof`, or `null`, `array`,
 * `date`, `invalid date`, `nan` or `infinity`. It never names a class, which would take reading the
 * prototype, and it reads nothing a getter or a proxy trap runs for, so naming a value never throws.
 */
export function describeType(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return Number.isNaN(value) ? "nan" : "infinity";
  }
  if (typeof value !== "object") {
    return typeof value;
  }
  if (value === null) {
    return "null";
  }
  try {
    // `getTime` reads the value's own slot, so a Date from another realm or without its prototype is
    // named too; it throws for anything else. `isArray` throws only for a revoked proxy.
    return Array.isArray(value) ? "array" : Number.isNaN(Date.prototype.getTime.call(value)) ? "invalid date" : "date";
  } catch {
    return "object";
  }
}

/** The issue for an input that is not the type a validator accepts, naming both types and never the value. */
export const typeIssue = (expected: string, input: unknown): ValidationIssue =>
  issue("invalid_type", { expected, received: describeType(input) });

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

/**
 * Rejects a child validator or callback that is not a function, such as an import that resolved to
 * nothing, since it is a mistake in the schema and would otherwise throw on the first input instead.
 */
export function assertFunction(name: string, value: unknown): void {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function, received ${value === null ? "null" : typeof value}`);
  }
}

/** Rejects a size limit that is not a non-negative integer, since it is a mistake in the schema and not in the input. */
export function assertSize(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, received ${value}`);
  }
}
