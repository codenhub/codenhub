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

/** Validation failure payload returned by failed validators and coercers. */
export interface ValidationError extends ValidationIssue {
  issues?: readonly ValidationIssue[];
}

/** Shared options for validators and coercers. */
export interface ValidationOptions {
  /** Path to attach to failures produced by the validator or coercer. */
  path?: readonly ValidationPathSegment[];
  /** Whether failures should retain the original input value for caller-side debugging. */
  includeInput?: boolean;
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
 * Result-like values are preserved, `Error` and string values become custom failures,
 * structured objects with a message become validation failures, and everything else
 * becomes a generic custom failure.
 */
export function parseResult<T>(value: unknown): ValidationResult<T> {
  if (isRecord(value) && value.ok === true && "value" in value) {
    return ok(value.value as T);
  }

  if (isRecord(value) && value.ok === false && "error" in value) {
    return err(normalizeError(value.error));
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

export const normalizeError = (
  input: ValidationErrorInput | unknown,
  options: ValidationOptions = {},
): ValidationError => {
  if (typeof input === "string") {
    return {
      code: "custom",
      message: input,
      path: options.path ?? [],
    };
  }

  if (input instanceof Error) {
    return {
      code: "custom",
      message: input.message,
      path: options.path ?? [],
    };
  }

  if (!isRecord(input)) {
    return {
      code: "custom",
      message: GENERIC_VALIDATION_ERROR_MESSAGE,
      path: options.path ?? [],
    };
  }

  const message =
    typeof input.message === "string" && input.message.length > 0 ? input.message : GENERIC_VALIDATION_ERROR_MESSAGE;
  const path = options.path ?? getPath(input.path);
  const error: ValidationError = {
    code: getCode(input.code),
    message,
    path,
  };

  if ("input" in input) {
    error.input = input.input;
  }
  if (typeof input.expected === "string") {
    error.expected = input.expected;
  }
  if (typeof input.received === "string") {
    error.received = input.received;
  }

  const issues = getIssues(input.issues);
  if (issues !== undefined) {
    error.issues = issues;
  }

  return error;
};

export const fail = (input: ValidationErrorOptions, options: ValidationOptions = {}): ValidationErr => {
  const errorInput = options.includeInput ? input : { ...input, input: undefined };
  const error = normalizeError(errorInput, { path: input.path ?? options.path });

  if (!options.includeInput) {
    delete error.input;
  }

  return { ok: false, error };
};

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
