import type {
  ValidationErr,
  ValidationFailure,
  ValidationIssue,
  ValidationIssueCode,
  ValidationOk,
  ValidationPathSegment,
} from "./types";

/** Shared by every issue at the root, so reporting one allocates no path. */
export const ROOT_PATH: readonly ValidationPathSegment[] = Object.freeze([]);

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
 * Tests whether a path written by a validator author is one: a list of keys and indexes. Text, such as
 * `"confirm"`, would be spread into one segment per letter, and a symbol cannot be written in a path or
 * a field name. The list is spread first, so a hole, which `every` would skip, is read as undefined.
 */
export const isPath = (path: unknown): boolean =>
  Array.isArray(path) && [...path].every((segment) => typeof segment === "string" || typeof segment === "number");

/**
 * Builds a failed result from one or more issues.
 *
 * @param issues - What went wrong. Each defaults to code `"custom"` and to the value's own location.
 * @returns A failed result holding every issue, in order.
 * @throws {TypeError} When called without an issue, with a `path` that is not a list of keys and
 * indexes, such as `"confirm"`, which would be split into one segment per letter, or with a `code` or
 * `message` that is not text. The types forbid all of them.
 */
export function fail(...issues: [IssueInput, ...IssueInput[]]): ValidationErr {
  if (issues.length === 0) {
    // The types forbid it, but a failure with no issue says nothing and breaks `issues[0]`.
    throw new TypeError("fail() needs at least one issue");
  }
  issues.forEach(assertIssue);
  return failWith(issues.map(toIssue));
}

/**
 * Rejects an issue written by hand that is not one: not an object, or with a `code` or `message` that is
 * not text, or a `path` that is not a list of keys and indexes. An issue is plain data a form or a log
 * shows, so a number as its message, or a symbol in its path, would surface as a bug far from its cause.
 */
export function assertIssue(each: unknown): asserts each is IssueInput {
  if (typeof each !== "object" || each === null) {
    throw new TypeError(`An issue must be an object, received ${each === null ? "null" : typeof each}`);
  }
  const { code, message, path } = each as IssueInput;
  assertOption("issue.code", code, "string");
  assertOption("issue.message", message, "string");
  if (path !== undefined && !isPath(path)) {
    throw new TypeError("issue.path must be a list of keys and indexes");
  }
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

/** Tests whether an issue is a limit of `lazy` that stopped a validation, rather than a fault of the input. */
const isLimit = ({ code, params }: ValidationIssue): boolean =>
  code === "too_big" && (params?.["type"] === "depth" || params?.["type"] === "calls");

/**
 * The limit of `lazy` held somewhere among the issues behind an issue, moved to a path in that issue's frame:
 * through a union, whose issues are relative to its value, to the limit's own place, and through a part or
 * a key, whose issues are relative to text a path cannot lead into, to the issue's place. The issues behind
 * have nested at most three deep already, so the search is short.
 */
function limitIn(found: ValidationIssue): ValidationIssue | undefined {
  if (isLimit(found)) {
    return found;
  }
  const behind: unknown = found.params?.["issues"];
  for (const each of Array.isArray(behind) ? (behind.flat() as ValidationIssue[]) : []) {
    const limit = typeof each === "object" && each !== null ? limitIn(each) : undefined;
    if (limit !== undefined) {
      // A path a validator written by hand left out is the value's own, as everywhere else.
      const place = found.path ?? ROOT_PATH;
      const path = found.code === "invalid_union" ? [...place, ...(limit.path ?? ROOT_PATH)] : place;
      return { ...limit, path };
    }
  }
  return undefined;
}

/**
 * An issue as another issue holds it in `params.issues`: as it is when the issues behind it carry none of
 * their own, such as a part's `{ minimum: 3 }` or a repeated key's `{ unique: true }`, and otherwise with
 * everything but those issues, as a `union`, whose issues are its options' lists, always is. So issues nest
 * at most three deep whatever composes them. A recursive schema otherwise nests them once per level, an
 * asynchronous one 10,000 times, past what a serializer can write, and where the levels share a result, as
 * the options of a recursive `union` share the children's through one `lazy`, each path through the
 * nesting writes it out again: 2^20 copies, 350 MB of JSON, for 430 bytes of input. Every built-in issue
 * that carries the issues behind it holds them this way: `invalid_union`, `invalid_key` and a failed part
 * of a URL or an email address.
 */
export function nested(found: ValidationIssue): ValidationIssue {
  const behind: unknown = found.params?.["issues"];
  if (
    behind === undefined ||
    (Array.isArray(behind) &&
      behind.every(
        (each: unknown) =>
          typeof each === "object" &&
          each !== null &&
          !Array.isArray(each) &&
          (each as ValidationIssue).params?.["issues"] === undefined,
      ))
  ) {
    return found;
  }
  // A limit stopped the validation somewhere behind it, so the limit stands in its place, and a caller
  // still sees `too_big` with its `maximum` to raise, however deep it was found.
  const limit = limitIn(found);
  if (limit !== undefined) {
    return limit;
  }
  const { params: all, ...rest } = found;
  const params = Object.fromEntries(Object.entries(all ?? {}).filter(([name]) => name !== "issues"));
  return Object.keys(params).length > 0 ? { ...rest, params } : rest;
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
 * `date`, `invalid date`, `nan` or `infinity`. It never names a class, and it reads no property of the
 * value, so no getter runs; a proxy trap that throws is caught, so naming a value never throws.
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
    // `isArray` throws only for a revoked proxy.
    if (Array.isArray(value)) {
      return "array";
    }
    // An object as `{}` and `JSON.parse` make it is not asked whether it is a Date: asking throws for one
    // that is not, and 100 kB of valid `{}` under a union of four options took 0.9 seconds over it. Nor is
    // one with no prototype, as `querystring.parse` and `Object.groupBy` make it.
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      return "object";
    }
    // `getTime` reads the value's own slot, so a Date from another realm or given another prototype
    // is named too; it throws for anything else.
    return Number.isNaN(Date.prototype.getTime.call(value)) ? "invalid date" : "date";
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
 * Whether a validator returned a result: an object that passed, or one that holds a list of issues. A
 * function, a primitive, nothing, a value given back as it is and a failure without its issues are none.
 * `ok` is read as true or false, not compared, so a result written by hand with `ok: 1` passes as before.
 */
export const isResult = (result: unknown): boolean =>
  typeof result === "object" &&
  result !== null &&
  (Boolean((result as ValidationOk<unknown>).ok) || Array.isArray((result as Partial<ValidationErr>).error?.issues));

/**
 * The error for a validator that returned no result. A factory given where its validator belongs,
 * `string` for `string()`, is a function too, so nothing rejects it when the schema is made: called with
 * the input as its options, it returns a validator, which read as a result failed on a property of
 * `undefined` and named neither the child nor the mistake.
 */
export const notResult = (where: string): TypeError =>
  new TypeError(`${where} returned no result. A factory is called first, as in string()`);

/**
 * Rejects a child validator or callback that is not a function, such as an import that resolved to
 * nothing, since it is a mistake in the schema and would otherwise throw on the first input instead.
 */
export function assertFunction(name: string, value: unknown): void {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function, received ${value === null ? "null" : typeof value}`);
  }
}

/**
 * Rejects what should be a list and is not, such as a single validator passed without its brackets,
 * since it is a mistake in the schema and not in the input. `of` says what the list holds, for the
 * message, and is validators unless given.
 */
export function assertList(name: string, value: unknown, of = "validators"): void {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be a list of ${of}, received ${value === null ? "null" : typeof value}`);
  }
}

/**
 * Rejects an option of the wrong type, such as `int: "yes"`, which would otherwise be read as another
 * value or ignored, since it is a mistake in the schema and not in the input. Undefined is no option.
 */
export function assertOption(name: string, value: unknown, type: "boolean" | "number" | "bigint" | "string"): void {
  if (value !== undefined && typeof value !== type) {
    throw new TypeError(`${name} must be a ${type}, received ${value === null ? "null" : typeof value}`);
  }
}

/**
 * Rejects what must be text and is not, such as a prefix read from a variable that is not set, which
 * would otherwise be converted to text and required as `"undefined"`.
 */
export function assertText(name: string, value: unknown): void {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be text, received ${value === null ? "null" : typeof value}`);
  }
}

/**
 * Rejects a size limit that is not a number, as a `TypeError`, or not a non-negative integer, as a
 * `RangeError`, since either is a mistake in the schema and not in the input.
 */
export function assertSize(name: string, value: number): void {
  assertOption(name, value, "number");
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, received ${value}`);
  }
}

/**
 * Rejects a default that is an object or a list, which every result would share, so a change to one
 * would show up in the next. A function that returns it makes a new one each time.
 */
export function assertUnshared(name: string, value: unknown): void {
  if (typeof value === "object" && value !== null) {
    throw new TypeError(`${name} would be shared by every result: pass a function that returns it, such as () => []`);
  }
}
