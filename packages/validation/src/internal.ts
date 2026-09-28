import {
  type CheckContext,
  type IssueDetails,
  type IssueInput,
  type ValidationIssue,
  type ValidationOptions,
  type ValidationPathSegment,
  type Message,
} from "./issue";

/** Result of one validator run: the value it produced, or the issues that made it fail. */
export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

/** Where a validator is running, handed down from parent to child as validation descends. */
export interface ParseContext {
  readonly path: readonly ValidationPathSegment[];
  readonly options: ValidationOptions;
}

/** Wraps a validated value into a successful outcome. */
export const pass = <T>(value: T): Outcome<T> => ({ ok: true, value });

/** Wraps issues into a failed outcome. */
export const failWith = (issues: readonly ValidationIssue[]): Outcome<never> => ({ ok: false, issues });

/** Extends the context path into a child value. */
export const childContext = (ctx: ParseContext, segment: ValidationPathSegment): ParseContext => ({
  path: [...ctx.path, segment],
  options: ctx.options,
});

/** Builds an issue located at the context path, or under it when the input carries a relative path. */
export function createIssue(ctx: ParseContext, input: IssueInput): ValidationIssue {
  const details: { -readonly [K in keyof IssueDetails]: IssueDetails[K] } = {
    code: input.code ?? "custom",
    path: input.path === undefined ? ctx.path : [...ctx.path, ...input.path],
  };
  if (input.params !== undefined) {
    details.params = input.params;
  }
  if (ctx.options.includeInput === true && "input" in input) {
    details.input = input.input;
  }

  const message = typeof input.message === "function" ? input.message(details) : input.message;
  return { ...details, message };
}

/** Fails with a single issue. */
export const fail = (ctx: ParseContext, input: IssueInput): Outcome<never> => failWith([createIssue(ctx, input)]);

/** Names the runtime type of a value for messages: `null`, `array`, `nan`, `infinity`, `date`, `map`, `set`, a class instance's class name, or its `typeof`. */
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

/** Fails because the input is not the type a validator accepts, naming both without echoing the value. */
export function invalidType(ctx: ParseContext, expected: string, input: unknown, message?: Message): Outcome<never> {
  const received = describeType(input);
  return fail(ctx, {
    code: "invalid_type",
    message: message ?? `Expected ${expected}, received ${received}`,
    params: { expected, received },
    input,
  });
}

/**
 * Builds a check that reports `issue` when `test` returns `false`.
 *
 * Every built-in constraint is one of these, so they all report the offending value the same way.
 */
export function constraint<T>(
  test: (value: T) => boolean,
  issue: { code: string; message: Message; params?: Readonly<Record<string, unknown>> },
): (value: T, ctx: CheckContext) => void {
  return (value, ctx) => {
    if (!test(value)) {
      ctx.addIssue({ ...issue, input: value });
    }
  };
}

/** Tests whether a value is a plain object: created by `{}`, `Object.create(null)`, or `JSON.parse`. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Defines an own enumerable property, so a key such as `__proto__` becomes data instead of a prototype write. */
export function setOwn(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

/** Builds the context handed to a check or transform, and collects what it reports in `issues`. */
export function createCheckContext(ctx: ParseContext): CheckContext & { readonly issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  return {
    path: ctx.path,
    options: ctx.options,
    issues,
    addIssue: (input) => {
      issues.push(createIssue(ctx, input));
    },
  };
}

/** Rejects a size limit that is not a non-negative integer, since it is a mistake in the schema and not in the input. */
export function assertSize(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, received ${value}`);
  }
}

/** Fails because coercion could not convert the input, naming both types without echoing the value. */
export function invalidCoercion(
  ctx: ParseContext,
  expected: string,
  input: unknown,
  message?: Message,
): Outcome<never> {
  const received = describeType(input);
  return fail(ctx, {
    code: "invalid_type",
    message: message ?? `Cannot convert ${received} to ${expected}`,
    params: { expected, received, coerced: true },
    input,
  });
}

/**
 * Builds a check that bounds a number or bigint from one side.
 *
 * Shared by the number and bigint validators so both word and report their bounds identically.
 */
export function limit<T extends number | bigint>(
  side: "min" | "max",
  bound: T,
  options: { isInclusive: boolean; type: string; message?: Message | undefined },
): (value: T, ctx: CheckContext) => void {
  const { isInclusive, type, message } = options;
  const isMin = side === "min";
  const wording = isMin ? (isInclusive ? "at least" : "greater than") : isInclusive ? "at most" : "less than";
  return constraint(
    (value) => (isMin ? (isInclusive ? value >= bound : value > bound) : isInclusive ? value <= bound : value < bound),
    {
      code: isMin ? "too_small" : "too_big",
      message: message ?? `Must be ${wording} ${bound}`,
      params: { [isMin ? "minimum" : "maximum"]: bound, inclusive: isInclusive, type },
    },
  );
}

/** Builds a check that bounds how many items a collection holds. Shared by arrays, sets and maps. */
export function sizeLimit<T>(
  side: "min" | "max" | "exact",
  size: number,
  options: { type: string; measure: (value: T) => number; message?: Message | undefined },
): (value: T, ctx: CheckContext) => void {
  assertSize(side === "min" ? "Minimum size" : side === "max" ? "Maximum size" : "Size", size);
  const { type, measure, message } = options;
  const wording = side === "min" ? "at least" : side === "max" ? "at most" : "exactly";
  return (value, ctx) => {
    const actual = measure(value);
    const isShort = actual < size;
    if (side === "exact" ? actual !== size : side === "min" ? isShort : actual > size) {
      ctx.addIssue({
        code: isShort ? "too_small" : "too_big",
        message: message ?? `Must contain ${wording} ${size} ${size === 1 ? "item" : "items"}`,
        params: { [isShort ? "minimum" : "maximum"]: size, exact: side === "exact", type },
        input: value,
      });
    }
  };
}
