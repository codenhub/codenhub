import { BaseValidator, markAsyncRequired, type ValidationContext, type Validator } from "./core";
import { describeReceived, type ValidationIssue, type ValidationResult } from "./result";

const PUBLIC_HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_MAX_LENGTH = 254;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CUID2_PATTERN = /^[a-z][a-z0-9]{23,31}$/;
const IPV4_PATTERN =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const IPV6_PATTERN =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/i;

const isValidLengthLimit = (value: number): boolean => Number.isFinite(value) && value >= 0;

/** Step execution function used within {@link StringValidator}. */
export type StringStep = (value: string, ctx: ValidationContext) => { nextValue: string; issue?: ValidationIssue };

/**
 * Options for configuring IP address validation.
 */
export interface IpOptions {
  /** Optional IP protocol version constraint: "v4" or "v6". When omitted, both are accepted. */
  version?: "v4" | "v6";
}

/**
 * Options for configuring ISO 8601 datetime validation.
 */
export interface DatetimeOptions {
  /** Whether to allow timezone offsets (e.g. `+02:00` or `-05:00`). Defaults to false (UTC `Z` only). */
  offset?: boolean;
  /**
   * Expected exact fractional second precision length.
   * If `0`, fractional seconds are disallowed. If undefined, fractional seconds are optional.
   */
  precision?: number;
}

const buildDatetimeRegex = (options?: DatetimeOptions): RegExp => {
  let frac: string;
  if (options?.precision !== undefined) {
    frac = options.precision === 0 ? "" : `\\.\\d{${options.precision}}`;
  } else {
    frac = "(?:\\.\\d+)?";
  }
  const tz = options?.offset ? "(?:Z|[+-]\\d{2}:\\d{2})" : "Z";
  return new RegExp(
    `^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d${frac}${tz}$`,
  );
};

/**
 * Validates and transforms string inputs with chained constraints.
 */
export class StringValidator extends BaseValidator<string, unknown> {
  protected readonly steps: StringStep[] = [];

  protected clone(): StringValidator {
    const copy = new (this.constructor as new () => StringValidator)();
    copy.steps.push(...this.steps);
    return copy;
  }

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
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
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
    return copy as this;
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
    const msg = typeof messageOrOptions === "string" ? messageOrOptions : message;
    if (typeof messageOrOptions === "object" && messageOrOptions?.trim) {
      return this.trim().min(length, msg) as this;
    }
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
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
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
    return copy as this;
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
    const msg = typeof messageOrOptions === "string" ? messageOrOptions : message;
    if (typeof messageOrOptions === "object" && messageOrOptions?.trim) {
      return this.trim().max(length, msg) as this;
    }
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
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
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
    return copy as this;
  }

  /**
   * Enforces that the string contains at least one character.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  nonEmpty(message?: string): this {
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
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
    return copy as this;
  }

  /**
   * Backward-compatible alias for {@link nonEmpty}.
   *
   * By default trims whitespace before checking unless `trim: false` is provided.
   *
   * @param messageOrOptions - Custom error message string or legacy options containing `{ trim?: boolean }`.
   * @param message - Optional custom message when options are passed as the second argument.
   * @returns This validator instance for method chaining.
   */
  notEmpty(messageOrOptions?: string | { trim?: boolean }, message?: string): this {
    const isOptions = typeof messageOrOptions === "object" && messageOrOptions !== null;
    const trim = isOptions ? (messageOrOptions.trim ?? true) : true;
    const msg = typeof messageOrOptions === "string" ? messageOrOptions : message;
    if (trim) {
      return this.trim().nonEmpty(msg) as this;
    }
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
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
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
    return copy as this;
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
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
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
    return copy as this;
  }

  /**
   * Validates that the string is a valid RFC 9562 UUID.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  uuid(message?: string): this {
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
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
    return copy as this;
  }

  /**
   * Validates that the string matches an IPv4 or IPv6 network address.
   *
   * @param options - Configuration specifying whether to accept IPv4, IPv6, or both.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  ip(options?: IpOptions, message?: string): this {
    const version = options?.version;
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
      let isValid = false;
      if (version === "v4") {
        isValid = IPV4_PATTERN.test(val);
      } else if (version === "v6") {
        isValid = IPV6_PATTERN.test(val);
      } else {
        isValid = IPV4_PATTERN.test(val) || IPV6_PATTERN.test(val);
      }

      if (!isValid) {
        const expected = version === "v4" ? "IPv4 address" : version === "v6" ? "IPv6 address" : "IP address";
        const defaultMsg =
          version === "v4" ? "Invalid IPv4 address" : version === "v6" ? "Invalid IPv6 address" : "Invalid IP address";
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? defaultMsg,
            path: ctx.path,
            expected,
            received: val,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return copy as this;
  }

  /**
   * Validates that the string is an ISO 8601 formatted datetime string.
   *
   * @param options - Optional precision and timezone offset constraints.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  datetime(options?: DatetimeOptions, message?: string): this {
    const regex = buildDatetimeRegex(options);
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
      let isValid = regex.test(val);
      if (isValid) {
        const [datePart] = val.split("T");
        if (datePart) {
          const [y, m, d] = datePart.split("-").map(Number);
          if (y !== undefined && m !== undefined && d !== undefined) {
            const dateObj = new Date(Date.UTC(y, m - 1, d));
            if (dateObj.getUTCFullYear() !== y || dateObj.getUTCMonth() !== m - 1 || dateObj.getUTCDate() !== d) {
              isValid = false;
            }
          }
        }
      }

      if (!isValid || Number.isNaN(new Date(val).getTime())) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? "Invalid datetime format",
            path: ctx.path,
            expected: options?.offset ? "ISO 8601 datetime with offset" : "ISO 8601 datetime",
            received: val,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return copy as this;
  }

  /**
   * Validates that the string is formatted in standard Base64 encoding.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  base64(message?: string): this {
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
      if (!BASE64_PATTERN.test(val)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? "Invalid base64 string",
            path: ctx.path,
            expected: "base64",
            received: val,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return copy as this;
  }

  /**
   * Validates that the string matches the CUID2 identifier format.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  cuid2(message?: string): this {
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
      if (!CUID2_PATTERN.test(val)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_format",
            message: message ?? "Invalid cuid2",
            path: ctx.path,
            expected: "cuid2",
            received: val,
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return copy as this;
  }

  /**
   * Validates that the string is valid JSON without additional schema validation.
   *
   * @param message - Optional custom failure message for JSON parsing errors.
   * @returns A validator schema producing the parsed JSON data.
   */
  json(message?: string): Validator<unknown, unknown>;
  json(schema: undefined, message?: string): Validator<unknown, unknown>;
  /**
   * Validates that the string is valid JSON and validates the parsed JSON against a schema.
   *
   * @typeParam T - Inferred output type of the parsed JSON data.
   * @param schema - Validator schema to enforce on the parsed JSON data.
   * @param message - Optional custom failure message for JSON parsing errors.
   * @returns A validator schema producing the parsed JSON data.
   */
  json<T>(schema: Validator<T>, message?: string): Validator<T, unknown>;
  json<T = unknown>(schemaOrMessage?: Validator<T> | string, message?: string): Validator<T, unknown> {
    const isValidator =
      schemaOrMessage !== null && typeof schemaOrMessage === "object" && "validate" in schemaOrMessage;
    const schema = isValidator ? (schemaOrMessage as Validator<T>) : undefined;
    const msg = typeof schemaOrMessage === "string" ? schemaOrMessage : message;
    return new JsonValidator<T>(this.clone(), schema, msg);
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
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
      safePattern.lastIndex = 0;
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
    return copy as this;
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
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
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
    return copy as this;
  }

  /**
   * Validates that the string ends with a specified suffix.
   *
   * @param suffix - The substring that must appear at the end.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  endsWith(suffix: string, message?: string): this {
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
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
    return copy as this;
  }

  /**
   * Validates that the string includes a required substring.
   *
   * @param search - The substring that must be present.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  includes(search: string, message?: string): this {
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
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
    return copy as this;
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

    const copy = this.clone();
    copy.steps.push((val, ctx) => {
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
    return copy as this;
  }

  /**
   * Trims whitespace from both ends of the string.
   *
   * @returns This validator instance for method chaining.
   */
  trim(): this {
    const copy = this.clone();
    copy.steps.push((val) => ({ nextValue: val.trim() }));
    return copy as this;
  }

  /**
   * Converts the string to lowercase.
   *
   * @returns This validator instance for method chaining.
   */
  toLowerCase(): this {
    const copy = this.clone();
    copy.steps.push((val) => ({ nextValue: val.toLowerCase() }));
    return copy as this;
  }

  /**
   * Converts the string to uppercase.
   *
   * @returns This validator instance for method chaining.
   */
  toUpperCase(): this {
    const copy = this.clone();
    copy.steps.push((val) => ({ nextValue: val.toUpperCase() }));
    return copy as this;
  }
}

/**
 * Schema validator that parses input strings as JSON and optionally executes a schema against the parsed result.
 *
 * @typeParam TOutput - Output type after JSON parsing and schema validation.
 */
export class JsonValidator<TOutput = unknown> extends BaseValidator<TOutput, unknown> {
  constructor(
    private readonly stringValidator: StringValidator,
    private readonly schema?: Validator<TOutput>,
    private readonly message?: string,
  ) {
    super();
  }

  protected override isAsync(): boolean {
    return this.schema instanceof BaseValidator && (this.schema as unknown as { isAsync(): boolean }).isAsync();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
    const strRes = this.stringValidator["_validate"](input, ctx);
    if (!strRes.ok) {
      return strRes as unknown as ValidationResult<TOutput>;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(strRes.value);
    } catch {
      return ctx.fail({
        code: "invalid_format",
        message: this.message ?? "Invalid JSON",
        path: ctx.path,
        expected: "JSON string",
        received: strRes.value,
        input: strRes.value,
      });
    }

    if (this.schema) {
      if (this.isAsync()) {
        return ctx.fail(
          markAsyncRequired({
            code: "custom" as const,
            message: "Async schema requires validateAsync()",
            path: ctx.path,
            input: parsed,
          }),
        );
      }
      const schemaRes = this.schema.validate(parsed as unknown as Parameters<typeof this.schema.validate>[0], {
        ...ctx.options,
        path: ctx.path,
      });
      if (!schemaRes.ok) {
        if (schemaRes.error.issues && schemaRes.error.issues.length > 0) {
          for (const iss of schemaRes.error.issues) {
            ctx.addIssue(iss);
          }
        } else {
          ctx.addIssue(schemaRes.error);
        }
        return schemaRes;
      }
      return schemaRes;
    }

    return ctx.ok(parsed as TOutput);
  }

  protected override async _validateAsync(input: unknown, ctx: ValidationContext): Promise<ValidationResult<TOutput>> {
    const strRes = await this.stringValidator["_validateAsync"](input, ctx);
    if (!strRes.ok) {
      return strRes as unknown as ValidationResult<TOutput>;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(strRes.value);
    } catch {
      return ctx.fail({
        code: "invalid_format",
        message: this.message ?? "Invalid JSON",
        path: ctx.path,
        expected: "JSON string",
        received: strRes.value,
        input: strRes.value,
      });
    }

    if (this.schema) {
      const schemaRes = await this.schema.validateAsync(
        parsed as unknown as Parameters<typeof this.schema.validateAsync>[0],
        {
          ...ctx.options,
          path: ctx.path,
        },
      );
      if (!schemaRes.ok) {
        if (schemaRes.error.issues && schemaRes.error.issues.length > 0) {
          for (const iss of schemaRes.error.issues) {
            ctx.addIssue(iss);
          }
        } else {
          ctx.addIssue(schemaRes.error);
        }
        return schemaRes;
      }
      return schemaRes;
    }

    return ctx.ok(parsed as TOutput);
  }
}

/**
 * Creates a {@link StringValidator} schema instance.
 *
 * @returns A new StringValidator instance.
 */
export function string(): StringValidator {
  return new StringValidator();
}
