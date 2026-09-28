/** String or numeric segment used to identify where invalid input was found. */
export type ValidationPathSegment = string | number;

/** Stable validation error category that consumers can branch on without parsing messages. */
export type ValidationErrorCode =
  | "invalid_type"
  | "invalid_value"
  | "invalid_format"
  | "too_small"
  | "too_big"
  | "missing_key"
  | "custom";

/**
 * Single validation issue, commonly used inside aggregated failures.
 *
 * `input` is present only when a caller opts in to retaining the original value.
 */
export interface ValidationIssue {
  code: ValidationErrorCode;
  message: string;
  path: readonly ValidationPathSegment[];
  input?: unknown;
  expected?: string;
  received?: string;
}

/** Shared options for validators and coercers. */
export interface ValidationOptions {
  /** Path to attach to failures produced by the validator or coercer. */
  path?: readonly ValidationPathSegment[];
  /** Whether failures should retain the original input value for caller-side debugging. */
  includeInput?: boolean;
  /** Whether to stop validation after the first issue encountered. Defaults to false. */
  abortEarly?: boolean;
}

/** Structured input accepted by `err()` when callers construct validation failures. */
export interface ValidationErrorOptions {
  /** Stable failure category; defaults to `custom` when omitted or unknown. */
  code?: ValidationErrorCode;
  /** Human-readable failure message for logs, forms, or API responses. */
  message: string;
  /** Path to the invalid value; defaults to an empty path. */
  path?: readonly ValidationPathSegment[];
  /** Original input value. Include only when retaining it is safe for the caller. */
  input?: unknown;
  /** Short description of the expected input shape or constraint. */
  expected?: string;
  /** Short description of the received input shape or value. */
  received?: string;
  /** Child validation issues for aggregate failures. */
  issues?: readonly ValidationIssue[];
}

/** String or structured failure accepted by `err()` and normalized into `ValidationError`. */
export type ValidationErrorInput = string | ValidationIssue | ValidationErrorOptions;

/**
 * Formats an array of path segments into dot-and-bracket notation.
 *
 * String segments are joined with dots (e.g. `user.profile`), while numeric segments
 * are enclosed in brackets (e.g. `items[0].name`).
 *
 * @example
 * ```ts
 * formatPath(["user", "addresses", 0, "street"]); // "user.addresses[0].street"
 * formatPath([0, "title"]); // "[0].title"
 * formatPath([]); // ""
 * ```
 *
 * @param path - Segments representing location within nested data.
 * @returns Formatted path string.
 */
export function formatPath(path: readonly ValidationPathSegment[]): string {
  let formatted = "";
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    if (typeof segment === "number") {
      formatted += `[${segment}]`;
    } else {
      formatted += formatted.length > 0 ? `.${segment}` : String(segment);
    }
  }
  return formatted;
}

/**
 * Result of flattening validation issues into form-level and field-level error messages.
 */
export interface FlattenedErrors {
  /** Form-level error messages for issues with an empty path. */
  formErrors: string[];
  /** Field-level error messages grouped by formatted path notation (e.g. `user.email`). */
  fieldErrors: Record<string, string[]>;
}

/**
 * Validation failure error thrown by schema parse methods and carried in `ValidationErr`.
 *
 * Implements {@link ValidationIssue} and provides issue flattening for form and field errors.
 */
export class ValidationError extends Error implements ValidationIssue {
  /** Stable failure category code. */
  readonly code: ValidationErrorCode;
  /** Path segments leading to the location of the invalid data. */
  readonly path: readonly ValidationPathSegment[];
  /** Retained original input value when `includeInput: true` is configured. */
  readonly input?: unknown;
  /** Short description of the expected shape or constraint. */
  readonly expected?: string;
  /** Short description of the received shape or value. */
  readonly received?: string;
  /** Child validation issues for aggregate failures. */
  readonly issues?: readonly ValidationIssue[];

  /**
   * Constructs a new ValidationError instance.
   *
   * @param options - Structured error details.
   */
  constructor(options: ValidationErrorOptions) {
    super(options.message);
    this.code = options.code ?? "custom";
    this.path = options.path ?? [];
    if ("input" in options && options.input !== undefined) {
      this.input = options.input;
    }
    if (options.expected !== undefined) {
      this.expected = options.expected;
    }
    if (options.received !== undefined) {
      this.received = options.received;
    }
    if (options.issues !== undefined) {
      this.issues = options.issues;
    }

    Object.defineProperty(this, "message", {
      value: options.message,
      enumerable: true,
      writable: true,
      configurable: true,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  get [Symbol.toStringTag](): string {
    return "Object";
  }

  /**
   * Flattens validation issues into form-level and field-level error messages.
   *
   * Issues with an empty path are placed into `formErrors`, while issues with non-empty
   * paths are grouped under `fieldErrors` keyed by their formatted path.
   *
   * @returns An object with `formErrors` and `fieldErrors`.
   */
  flatten(): FlattenedErrors {
    const formErrors: string[] = [];
    const fieldErrors: Record<string, string[]> = {};
    const issues = this.issues && this.issues.length > 0 ? this.issues : [this];

    for (const issue of issues) {
      if (!issue.path || issue.path.length === 0) {
        formErrors.push(issue.message);
      } else {
        const formatted = formatPath(issue.path);
        if (!fieldErrors[formatted]) {
          fieldErrors[formatted] = [];
        }
        fieldErrors[formatted].push(issue.message);
      }
    }

    return { formErrors, fieldErrors };
  }
}

ValidationError.prototype.name = "ValidationError";

/** Successful validation result carrying the validated or coerced value. */
export interface ValidationOk<T> {
  ok: true;
  value: T;
}

/** Failed validation result carrying a normalized validation error. */
export interface ValidationErr {
  ok: false;
  error: ValidationError;
}

/** Result returned by validators and coercers instead of throwing for invalid input. */
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

const GENERIC_VALIDATION_ERROR_MESSAGE = "Invalid value";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const getPath = (inputPath: unknown): readonly ValidationPathSegment[] => {
  if (!Array.isArray(inputPath)) {
    return [];
  }

  return inputPath.filter((segment): segment is ValidationPathSegment => {
    return typeof segment === "string" || typeof segment === "number";
  });
};

const getCode = (inputCode: unknown): ValidationErrorCode => {
  const codes = new Set<ValidationErrorCode>([
    "invalid_type",
    "invalid_value",
    "invalid_format",
    "too_small",
    "too_big",
    "missing_key",
    "custom",
  ]);

  return typeof inputCode === "string" && codes.has(inputCode as ValidationErrorCode)
    ? (inputCode as ValidationErrorCode)
    : "custom";
};

const getIssues = (inputIssues: unknown): readonly ValidationIssue[] | undefined => {
  if (!Array.isArray(inputIssues)) {
    return undefined;
  }

  return inputIssues.map((issue) => normalizeError(issue));
};

const stripIssueInput = (issue: ValidationIssue): ValidationIssue => {
  const result: ValidationIssue = {
    code: issue.code,
    message: issue.message,
    path: issue.path,
  };
  if (issue.expected !== undefined) {
    result.expected = issue.expected;
  }
  if (issue.received !== undefined) {
    result.received = issue.received;
  }
  return result;
};

/** Creates a successful validation result for values that already passed caller-defined checks. */
export function ok<T>(value: T): ValidationOk<T> {
  return { ok: true, value };
}

/** Creates a failed validation result and normalizes string or structured failure input. */
export function err(error: ValidationErrorInput): ValidationErr {
  return { ok: false, error: normalizeError(error) };
}

/**
 * Normalizes unknown custom validator output into a validation result.
 *
 * Result-like values are preserved, `ValidationError` instances are preserved, `Error`
 * and string values become custom failures, structured objects with a message become
 * validation failures, and everything else becomes a generic custom failure.
 */
export function parseResult<T>(value: unknown): ValidationResult<T> {
  if (isRecord(value) && value.ok === true && "value" in value) {
    return ok(value.value as T);
  }

  if (isRecord(value) && value.ok === false && "error" in value) {
    return err(normalizeError(value.error));
  }

  if (value instanceof ValidationError) {
    return { ok: false, error: value };
  }

  if (value instanceof Error) {
    return err(value.message);
  }

  if (typeof value === "string") {
    return err(value);
  }

  if (isRecord(value) && typeof value.message === "string") {
    return err(normalizeError(value));
  }

  return err(GENERIC_VALIDATION_ERROR_MESSAGE);
}

/**
 * Flattens validation issues from a ValidationError, a ValidationResult, or an array of ValidationIssues
 * into form-level and field-level error messages.
 *
 * Issues with an empty path are placed into `formErrors`, while issues with non-empty
 * paths are grouped under `fieldErrors` keyed by their formatted path string.
 *
 * @param target - A ValidationError, ValidationResult, or array of ValidationIssues.
 * @returns An object containing `formErrors` and `fieldErrors`.
 */
export function flatten(
  target: ValidationError | ValidationResult<unknown> | readonly ValidationIssue[],
): FlattenedErrors {
  if (target instanceof ValidationError) {
    return target.flatten();
  }
  if (isRecord(target) && target.ok === false && target.error instanceof ValidationError) {
    return target.error.flatten();
  }
  if (isRecord(target) && target.ok === true) {
    return { formErrors: [], fieldErrors: {} };
  }
  const formErrors: string[] = [];
  const fieldErrors: Record<string, string[]> = {};
  const issues = Array.isArray(target)
    ? target
    : isRecord(target) && "issues" in target && Array.isArray(target.issues)
      ? (target.issues as readonly ValidationIssue[])
      : isRecord(target) && "message" in target
        ? [target as unknown as ValidationIssue]
        : [];

  for (const issue of issues) {
    if (!issue.path || issue.path.length === 0) {
      formErrors.push(issue.message);
    } else {
      const formatted = formatPath(issue.path);
      if (!fieldErrors[formatted]) {
        fieldErrors[formatted] = [];
      }
      fieldErrors[formatted].push(issue.message);
    }
  }

  return { formErrors, fieldErrors };
}

/**
 * Normalizes validation error input (which can be a string, an Error instance,
 * or a custom object) into a standardized {@link ValidationError} structure.
 *
 * @param input - The error payload or message to normalize.
 * @param options - Additional options, such as overriding the path.
 * @returns The standardized validation error object.
 */
export const normalizeError = (
  input: ValidationErrorInput | unknown,
  options: ValidationOptions = {},
): ValidationError => {
  if (typeof input === "string") {
    return new ValidationError({
      code: "custom",
      message: input,
      path: options.path ?? [],
    });
  }

  if (input instanceof ValidationError) {
    if (options.path && options.path !== input.path) {
      return new ValidationError({
        code: input.code,
        message: input.message,
        path: options.path,
        input: options.includeInput === false ? undefined : input.input,
        expected: input.expected,
        received: input.received,
        issues: input.issues,
      });
    }
    return input;
  }

  if (input instanceof Error) {
    return new ValidationError({
      code: "custom",
      message: input.message,
      path: options.path ?? [],
    });
  }

  if (!isRecord(input)) {
    return new ValidationError({
      code: "custom",
      message: GENERIC_VALIDATION_ERROR_MESSAGE,
      path: options.path ?? [],
    });
  }

  const rawMessage = typeof input.message === "string" && input.message.length > 0 ? input.message : undefined;
  const issues = getIssues(input.issues);
  const message = rawMessage ?? issues?.[0]?.message ?? GENERIC_VALIDATION_ERROR_MESSAGE;
  const path = options.path ?? getPath(input.path);
  const errorOptions: ValidationErrorOptions = {
    code: getCode(input.code ?? issues?.[0]?.code),
    message,
    path,
  };

  if ("input" in input && options.includeInput !== false) {
    errorOptions.input = input.input;
  }
  if (typeof input.expected === "string") {
    errorOptions.expected = input.expected;
  }
  if (typeof input.received === "string") {
    errorOptions.received = input.received;
  }

  if (issues !== undefined) {
    errorOptions.issues = options.includeInput === false ? issues.map(stripIssueInput) : issues;
  }

  const err = new ValidationError(errorOptions);
  for (const sym of Object.getOwnPropertySymbols(input)) {
    Object.defineProperty(err, sym, {
      value: (input as Record<symbol, unknown>)[sym],
      enumerable: false,
      configurable: true,
    });
  }
  return err;
};

/**
 * Constructs a failed validation result containing a normalized validation error.
 *
 * @param input - Detailed properties of the validation error.
 * @param options - Validation settings, such as whether to include the original input.
 * @returns A failed validation result object.
 */
export const fail = (input: ValidationErrorOptions, options: ValidationOptions = {}): ValidationErr => {
  const errorInput = options.includeInput ? input : { ...input, input: undefined };
  const error = normalizeError(errorInput, {
    path: input.path ?? options.path,
    includeInput: options.includeInput,
    abortEarly: options.abortEarly,
  });

  if (!options.includeInput && "input" in error) {
    delete (error as { input?: unknown }).input;
    if (error.issues) {
      (error as { issues?: readonly ValidationIssue[] }).issues = error.issues.map(stripIssueInput);
    }
  }

  return { ok: false, error };
};

/**
 * Generates a human-readable string representation of a received value's type or value,
 * useful for constructing error messages detailing unexpected input.
 *
 * @param value - The received value to describe.
 * @returns A string description of the value's type or value.
 */
export const describeReceived = (value: unknown): string => {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "object") {
    return "object";
  }
  if (typeof value === "function") {
    return "function";
  }
  return String(value);
};
