/** Object key or array index leading to a value inside validated data. */
export type ValidationPathSegment = string | number;

/**
 * Stable category of a validation failure that callers can branch on without parsing messages.
 *
 * The built-in codes are listed for autocompletion; any other string is a valid code, so custom
 * checks can report their own, such as `"username_taken"`.
 */
export type ValidationIssueCode =
  | "invalid_type"
  | "invalid_value"
  | "invalid_format"
  | "too_small"
  | "too_big"
  | "unrecognized_key"
  | "invalid_union"
  | "custom"
  | (string & {});

/** Structured facts about a failure, everything an issue carries except its message. */
export interface IssueDetails {
  /** Stable failure category. */
  readonly code: ValidationIssueCode;
  /** Location of the invalid value, from the root of the validated data. */
  readonly path: readonly ValidationPathSegment[];
  /**
   * Facts a message can be built from, such as `{ minimum: 3 }` for `too_small` or
   * `{ expected: "string", received: "number" }` for `invalid_type`.
   */
  readonly params?: Readonly<Record<string, unknown>>;
  /** The invalid value. Present only when `includeInput` is enabled. */
  readonly input?: unknown;
}

/**
 * A failure message: a fixed string, or a function that builds one from the issue details.
 *
 * The function form is how a message is localized or worded from `params`.
 */
export type Message = string | ((details: IssueDetails) => string);

/** A single validation failure. */
export interface ValidationIssue extends IssueDetails {
  /** Human-readable description of the failure. */
  readonly message: string;
}

/** Issue a check reports through {@link CheckContext.addIssue}. */
export interface IssueInput {
  /** Failure category. Defaults to `"custom"`. */
  code?: ValidationIssueCode;
  /** Failure message. */
  message: Message;
  /** Location of the failure relative to the value being checked. Defaults to that value itself. */
  path?: readonly ValidationPathSegment[];
  /** Facts about the failure, for building messages or branching in callers. */
  params?: Readonly<Record<string, unknown>>;
  /** The offending value, retained only when `includeInput` is enabled. */
  input?: unknown;
}

/** Options shared by every validation call. */
export interface ValidationOptions {
  /**
   * Stops at the first issue instead of collecting them all.
   *
   * @defaultValue false
   */
  abortEarly?: boolean;
  /**
   * Keeps the invalid value on each issue as `input`. Enable it only when retaining input is safe.
   *
   * @defaultValue false
   */
  includeInput?: boolean;
  /** Caller data made available to checks and transforms as `ctx.options.context`. */
  context?: unknown;
}

/** What a check or transform receives besides the value being validated. */
export interface CheckContext {
  /** Location of the value being checked, from the root of the validated data. */
  readonly path: readonly ValidationPathSegment[];
  /** Options of the running validation call. */
  readonly options: ValidationOptions;
  /**
   * Reports a failure. Any reported issue makes the validation fail, and several can be reported.
   *
   * @param issue - Failure to record.
   */
  addIssue(issue: IssueInput): void;
}

/**
 * Formats a path as dot-and-bracket notation.
 *
 * @example
 * ```ts
 * formatPath(["user", "addresses", 0, "street"]); // "user.addresses[0].street"
 * formatPath([0, "title"]); // "[0].title"
 * ```
 *
 * @param path - Segments leading to a value.
 * @returns The formatted path, or an empty string for the root.
 */
export function formatPath(path: readonly ValidationPathSegment[]): string {
  let formatted = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      formatted += `[${segment}]`;
    } else {
      formatted += formatted.length > 0 ? `.${segment}` : segment;
    }
  }
  return formatted;
}

/** Issues grouped for display next to form fields. */
export interface FlattenedErrors {
  /** Messages of issues at the root, which belong to no field. */
  formErrors: string[];
  /** Messages grouped by {@link formatPath} notation, such as `user.email`. */
  fieldErrors: Record<string, string[]>;
}

const summarize = (issues: readonly ValidationIssue[]): string => {
  const describe = (issue: ValidationIssue): string =>
    issue.path.length > 0 ? `${formatPath(issue.path)}: ${issue.message}` : issue.message;

  const [first] = issues;
  if (issues.length === 1 && first !== undefined) {
    return describe(first);
  }
  return `${issues.length} validation issues:\n${issues.map((issue) => `- ${describe(issue)}`).join("\n")}`;
};

/**
 * Error carrying every issue of a failed validation.
 *
 * Failed `validate` calls hold one in `result.error`, and `parse` calls throw it.
 */
export class ValidationError extends Error {
  /** Every issue found, in the order the schema encountered them. Never empty. */
  readonly issues: readonly ValidationIssue[];

  /**
   * Creates the error for the given issues.
   *
   * @param issues - Issues that made the validation fail.
   */
  constructor(issues: readonly ValidationIssue[]) {
    super(summarize(issues));
    this.name = "ValidationError";
    this.issues = issues;
  }

  /**
   * Groups the messages of {@link ValidationError.issues} for display: issues at the root go to
   * `formErrors`, the rest are keyed by their {@link formatPath} notation in `fieldErrors`.
   *
   * @returns The grouped messages.
   */
  flatten(): FlattenedErrors {
    // No prototype, so a field named like an Object.prototype member cannot collide with it.
    const fieldErrors = Object.create(null) as Record<string, string[]>;
    const flattened: FlattenedErrors = { formErrors: [], fieldErrors };
    for (const issue of this.issues) {
      if (issue.path.length === 0) {
        flattened.formErrors.push(issue.message);
        continue;
      }
      const key = formatPath(issue.path);
      (flattened.fieldErrors[key] ??= []).push(issue.message);
    }
    return flattened;
  }
}

/** Successful validation, carrying the validated value. */
export interface ValidationOk<T> {
  ok: true;
  /** The validated value, after any transforms and defaults. */
  value: T;
}

/** Failed validation, carrying the error. */
export interface ValidationErr {
  ok: false;
  /** Every issue found. */
  error: ValidationError;
}

/** What `validate` returns instead of throwing on invalid input. */
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;
