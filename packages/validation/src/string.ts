import { BaseValidator, type ValidationContext } from "./core";
import { describeReceived, fail, type ValidationIssue, type ValidationOptions, type ValidationResult } from "./result";

const PUBLIC_HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_MAX_LENGTH = 254;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidLengthLimit = (value: number): boolean => Number.isFinite(value) && value >= 0;

type StringStep = (value: string, ctx: ValidationContext) => { nextValue: string; issue?: ValidationIssue };

/**
 * Validates and transforms string inputs with chained constraints.
 */
export class StringValidator extends BaseValidator<string, unknown> {
  private readonly steps: StringStep[] = [];

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<string> {
    if (typeof input !== "string") {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected string, got ${describeReceived(input)}`,
        expected: "string",
        received: describeReceived(input),
        input,
      });
    }

    let current = input;
    const localIssues: ValidationIssue[] = [];

    for (const step of this.steps) {
      const result = step(current, ctx);
      current = result.nextValue;

      if (result.issue !== undefined) {
        localIssues.push(result.issue);
        ctx.addIssue(result.issue);
        if (ctx.options.abortEarly) {
          return ctx.fail(result.issue);
        }
      }
    }

    if (localIssues.length > 0) {
      const firstIssue = localIssues[0];
      if (localIssues.length === 1 && firstIssue) {
        return ctx.fail(firstIssue);
      }
      return ctx.fail({
        code: firstIssue?.code ?? "invalid_value",
        message: firstIssue?.message ?? "String validation failed",
        path: ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(current);
  }

  /**
   * Enforces a minimum character length.
   *
   * @param length - Minimum required characters (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  min(length: number, message?: string): this {
    this.steps.push((val, ctx) => {
      if (!isValidLengthLimit(length)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Minimum length must be a finite non-negative number",
            path: ctx.path,
          },
        };
      }
      if (val.length < length) {
        return {
          nextValue: val,
          issue: {
            code: "too_small",
            message: message ?? `Must be at least ${length} characters`,
            path: ctx.path,
            expected: `at least ${length} characters`,
            received: `${val.length} characters`,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return this;
  }

  /**
   * Backward-compatible alias for {@link min}.
   *
   * @param length - Minimum required characters.
   * @param messageOrOptions - Custom error message string or legacy options containing `{ trim?: boolean }`.
   * @param message - Optional custom message when options are passed as the second argument.
   * @returns This validator instance for method chaining.
   */
  minLength(length: number, messageOrOptions?: string | { trim?: boolean }, message?: string): this {
    if (typeof messageOrOptions === "object" && messageOrOptions?.trim) {
      this.trim();
    }
    const msg = typeof messageOrOptions === "string" ? messageOrOptions : message;
    return this.min(length, msg);
  }

  /**
   * Enforces a maximum character length.
   *
   * @param length - Maximum allowed characters (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  max(length: number, message?: string): this {
    this.steps.push((val, ctx) => {
      if (!isValidLengthLimit(length)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Maximum length must be a finite non-negative number",
            path: ctx.path,
          },
        };
      }
      if (val.length > length) {
        return {
          nextValue: val,
          issue: {
            code: "too_big",
            message: message ?? `Must be at most ${length} characters`,
            path: ctx.path,
            expected: `at most ${length} characters`,
            received: `${val.length} characters`,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return this;
  }

  /**
   * Backward-compatible alias for {@link max}.
   *
   * @param length - Maximum allowed characters.
   * @param messageOrOptions - Custom error message string or legacy options containing `{ trim?: boolean }`.
   * @param message - Optional custom message when options are passed as the second argument.
   * @returns This validator instance for method chaining.
   */
  maxLength(length: number, messageOrOptions?: string | { trim?: boolean }, message?: string): this {
    if (typeof messageOrOptions === "object" && messageOrOptions?.trim) {
      this.trim();
    }
    const msg = typeof messageOrOptions === "string" ? messageOrOptions : message;
    return this.max(length, msg);
  }

  /**
   * Enforces an exact character length.
   *
   * @param length - Exact required length.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  length(length: number, message?: string): this {
    this.steps.push((val, ctx) => {
      if (!isValidLengthLimit(length)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Length limit must be a finite non-negative number",
            path: ctx.path,
          },
        };
      }
      if (val.length !== length) {
        return {
          nextValue: val,
          issue: {
            code: val.length < length ? "too_small" : "too_big",
            message: message ?? `Must be exactly ${length} characters`,
            path: ctx.path,
            expected: `exactly ${length} characters`,
            received: `${val.length} characters`,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return this;
  }

  /**
   * Enforces that the string contains at least one character.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  nonEmpty(message?: string): this {
    this.steps.push((val, ctx) => {
      if (val.length === 0) {
        return {
          nextValue: val,
          issue: {
            code: "too_small",
            message: message ?? "Value cannot be empty",
            path: ctx.path,
            expected: "non-empty string",
            received: "empty string",
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return this;
  }

  /**
   * Backward-compatible alias for {@link nonEmpty}.
   *
   * @param messageOrOptions - Custom error message string or legacy options containing `{ trim?: boolean }`.
   * @param message - Optional custom message when options are passed as the second argument.
   * @returns This validator instance for method chaining.
   */
  notEmpty(messageOrOptions?: string | { trim?: boolean }, message?: string): this {
    if (typeof messageOrOptions === "object" && messageOrOptions?.trim) {
      this.trim();
    }
    const msg = typeof messageOrOptions === "string" ? messageOrOptions : message;
    return this.nonEmpty(msg);
  }

  /**
   * Validates that the input represents a valid email address, lowercasing the domain.
   *
   * @param options - Configuration options, e.g. allowing or disallowing '+' sub-addressing.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  email(options?: { allowPlus?: boolean }, message?: string): this {
    const allowPlus = options?.allowPlus ?? true;
    this.steps.push((val, ctx) => {
      const trimmed = val.trim();
      const [local, host, extra] = trimmed.split("@");
      if (extra !== undefined || local === undefined || host === undefined) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? "Invalid email address",
            path: ctx.path,
            expected: "email address",
            received: val,
            input: val,
          },
        };
      }

      if (
        trimmed.length > EMAIL_MAX_LENGTH ||
        local.length > EMAIL_LOCAL_MAX_LENGTH ||
        !PUBLIC_HOST_PATTERN.test(host) ||
        !EMAIL_LOCAL_PATTERN.test(local) ||
        (!allowPlus && local.includes("+"))
      ) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? "Invalid email address",
            path: ctx.path,
            expected: "email address",
            received: val,
            input: val,
          },
        };
      }

      return { nextValue: `${local}@${host.toLowerCase()}` };
    });
    return this;
  }

  /**
   * Validates that the input is a valid public HTTP or HTTPS URL, normalizing the protocol.
   *
   * @param options - Configuration options, e.g. enforcing HTTPS protocol.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  url(options?: { forceHttps?: boolean }, message?: string): this {
    const forceHttps = options?.forceHttps ?? false;
    this.steps.push((val, ctx) => {
      let input = val.trim();
      if (!/^https?:\/\//i.test(input)) {
        input = "https://" + input;
      }

      try {
        const parsed = new URL(input);
        if (!PUBLIC_HOST_PATTERN.test(parsed.hostname) || parsed.username.length > 0 || parsed.password.length > 0) {
          return {
            nextValue: val,
            issue: {
              code: "invalid_format",
              message: message ?? "Invalid URL",
              path: ctx.path,
              expected: "public URL",
              received: val,
              input: val,
            },
          };
        }

        if (forceHttps && parsed.protocol !== "https:") {
          return {
            nextValue: val,
            issue: {
              code: "invalid_format",
              message: message ?? "Invalid URL",
              path: ctx.path,
              expected: "HTTPS URL",
              received: val,
              input: val,
            },
          };
        }

        return { nextValue: parsed.href };
      } catch {
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? "Invalid URL",
            path: ctx.path,
            expected: "URL",
            received: val,
            input: val,
          },
        };
      }
    });
    return this;
  }

  /**
   * Validates that the string is a valid RFC 4122 UUID.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  uuid(message?: string): this {
    this.steps.push((val, ctx) => {
      if (!UUID_PATTERN.test(val)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? "Invalid UUID",
            path: ctx.path,
            expected: "UUID",
            received: val,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return this;
  }

  /**
   * Validates that the string matches a regular expression pattern.
   *
   * @param pattern - Regular expression to test against.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  regex(pattern: RegExp, message?: string): this {
    const safePattern = new RegExp(pattern.source, pattern.flags);
    this.steps.push((val, ctx) => {
      if (!safePattern.test(val)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? "Value does not match the required format",
            path: ctx.path,
            expected: pattern.toString(),
            received: val,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return this;
  }

  /**
   * Alias for {@link regex}.
   *
   * @param pattern - Regular expression to test against.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  matches(pattern: RegExp, message?: string): this {
    return this.regex(pattern, message);
  }

  /**
   * Validates that the string begins with a specified prefix.
   *
   * @param prefix - The substring that must appear at the start.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  startsWith(prefix: string, message?: string): this {
    this.steps.push((val, ctx) => {
      if (!val.startsWith(prefix)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? `Must start with "${prefix}"`,
            path: ctx.path,
            expected: `string starting with "${prefix}"`,
            received: val,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return this;
  }

  /**
   * Validates that the string ends with a specified suffix.
   *
   * @param suffix - The substring that must appear at the end.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  endsWith(suffix: string, message?: string): this {
    this.steps.push((val, ctx) => {
      if (!val.endsWith(suffix)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? `Must end with "${suffix}"`,
            path: ctx.path,
            expected: `string ending with "${suffix}"`,
            received: val,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return this;
  }

  /**
   * Validates that the string includes a required substring.
   *
   * @param search - The substring that must be present.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  includes(search: string, message?: string): this {
    this.steps.push((val, ctx) => {
      if (!val.includes(search)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? `Must include "${search}"`,
            path: ctx.path,
            expected: `string containing "${search}"`,
            received: val,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return this;
  }

  /**
   * Validates a file extension against an allow list and extracts the normalized extension.
   *
   * @param allowed - List of allowed file extensions (with or without leading dots).
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  fileType(allowed: string[], message?: string): this {
    const normalized = allowed
      .map((entry) => entry.toLowerCase().replace(/^\./, ""))
      .filter((entry) => entry.length > 0);

    this.steps.push((val, ctx) => {
      if (normalized.length === 0) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Allowed file types cannot be empty",
            path: ctx.path,
            expected: "file type list",
          },
        };
      }

      const dotIndex = val.lastIndexOf(".");
      const ext = dotIndex > 0 && dotIndex < val.length - 1 ? val.slice(dotIndex + 1).toLowerCase() : undefined;

      if (ext === undefined || !normalized.includes(ext)) {
        const received = ext ?? "missing";
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? `File type "${received}" not allowed. Allowed: ${normalized.join(", ")}`,
            path: ctx.path,
            expected: normalized.join(", "),
            received,
            input: val,
          },
        };
      }

      return { nextValue: ext };
    });
    return this;
  }

  /**
   * Trims whitespace from both ends of the string.
   *
   * @returns This validator instance for method chaining.
   */
  trim(): this {
    this.steps.push((val) => ({ nextValue: val.trim() }));
    return this;
  }

  /**
   * Converts the string to lowercase.
   *
   * @returns This validator instance for method chaining.
   */
  toLowerCase(): this {
    this.steps.push((val) => ({ nextValue: val.toLowerCase() }));
    return this;
  }

  /**
   * Converts the string to uppercase.
   *
   * @returns This validator instance for method chaining.
   */
  toUpperCase(): this {
    this.steps.push((val) => ({ nextValue: val.toUpperCase() }));
    return this;
  }
}

/** Legacy StringValidators interface for backwards compatibility. */
export interface StringValidators {
  /** Validates and normalizes an email address, rejecting invalid public host or local-part formats. */
  email(options?: { allowPlus?: boolean }): ValidationResult<string>;
  /** Validates and normalizes a public HTTP(S) URL, adding `https://` when no protocol is present. */
  url(options?: { forceHttps?: boolean }): ValidationResult<string>;
  /** Validates a file extension against a non-empty allow list and returns the normalized extension. */
  fileType(allowed: string[]): ValidationResult<string>;
  /** Validates that the string length is at least `length`, optionally trimming before the check. */
  minLength(length: number, options?: { trim?: boolean }): ValidationResult<string>;
  /** Validates that the string length is at most `length`, optionally trimming before the check. */
  maxLength(length: number, options?: { trim?: boolean }): ValidationResult<string>;
  /** Validates that the string is not empty; trims by default before checking. */
  notEmpty(options?: { trim?: boolean }): ValidationResult<string>;
  /** Validates the string with a regular expression and returns the original value on success. */
  matches(pattern: RegExp, message?: string): ValidationResult<string>;
}

function legacyString(value: unknown, options: ValidationOptions = {}): StringValidators {
  if (typeof value !== "string") {
    const typeError = fail(
      {
        code: "invalid_type",
        message: `Expected string, got ${describeReceived(value)}`,
        expected: "string",
        received: describeReceived(value),
        input: value,
      },
      options,
    );
    const reject = () => typeError;

    return {
      email: reject,
      url: reject,
      fileType: reject,
      minLength: reject,
      maxLength: reject,
      notEmpty: reject,
      matches: reject,
    };
  }

  return {
    email({ allowPlus = true } = {}): ValidationResult<string> {
      return new StringValidator().email({ allowPlus }).validate(value, options);
    },
    url({ forceHttps = false } = {}): ValidationResult<string> {
      return new StringValidator().url({ forceHttps }).validate(value, options);
    },
    fileType(allowed: string[]): ValidationResult<string> {
      return new StringValidator().fileType(allowed).validate(value, options);
    },
    minLength(length: number, { trim = false } = {}): ValidationResult<string> {
      const v = new StringValidator();
      if (trim) {
        v.trim();
      }
      return v.min(length).validate(value, options);
    },
    maxLength(length: number, { trim = false } = {}): ValidationResult<string> {
      const v = new StringValidator();
      if (trim) {
        v.trim();
      }
      return v.max(length).validate(value, options);
    },
    notEmpty({ trim = true } = {}): ValidationResult<string> {
      const v = new StringValidator();
      if (trim) {
        v.trim();
      }
      return v.nonEmpty().validate(value, options);
    },
    matches(pattern: RegExp, message = "Value does not match the required format"): ValidationResult<string> {
      return new StringValidator().regex(pattern, message).validate(value, options);
    },
  };
}

/**
 * Creates a {@link StringValidator} instance or evaluates legacy string checks.
 *
 * @returns A new StringValidator when called with no arguments.
 */
export function string(): StringValidator;
/**
 * Legacy string validator evaluation on an input value.
 *
 * @param value - Target value to validate.
 * @param options - Optional validation configuration.
 * @returns Object providing legacy string validation methods.
 */
export function string(value: unknown, options?: ValidationOptions): StringValidators;
export function string(value?: unknown, options?: ValidationOptions): StringValidator | StringValidators {
  if (arguments.length === 0) {
    return new StringValidator();
  }
  return legacyString(value, options);
}
