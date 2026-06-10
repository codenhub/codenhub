import { describeReceived, fail, ok, type ValidationOptions, type ValidationResult } from "./result";

const PUBLIC_HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_MAX_LENGTH = 254;

/** String validators returned by `val.string()`. */
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

const isValidLengthLimit = (value: number): boolean => Number.isFinite(value) && value >= 0;

/** Creates string validators that all return the same type failure when input is not a string. */
export function string(value: unknown, options: ValidationOptions = {}): StringValidators {
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
      const trimmed = value.trim();
      const [local, host, extra] = trimmed.split("@");
      if (extra !== undefined || local === undefined || host === undefined) {
        return fail(
          { code: "invalid_format", message: "Invalid email address", expected: "email address", received: value },
          options,
        );
      }
      if (
        trimmed.length > EMAIL_MAX_LENGTH ||
        local.length > EMAIL_LOCAL_MAX_LENGTH ||
        !PUBLIC_HOST_PATTERN.test(host)
      ) {
        return fail(
          { code: "invalid_format", message: "Invalid email address", expected: "email address", received: value },
          options,
        );
      }
      if (!EMAIL_LOCAL_PATTERN.test(local) || (!allowPlus && local.includes("+"))) {
        return fail(
          { code: "invalid_format", message: "Invalid email address", expected: "email address", received: value },
          options,
        );
      }

      return ok(`${local}@${host.toLowerCase()}`);
    },

    url({ forceHttps = false } = {}): ValidationResult<string> {
      let input = value.trim();
      if (!/^https?:\/\//i.test(input)) {
        input = "https://" + input;
      }

      try {
        const url = new URL(input);
        if (!PUBLIC_HOST_PATTERN.test(url.hostname) || url.username.length > 0 || url.password.length > 0) {
          return fail(
            { code: "invalid_format", message: "Invalid URL", expected: "public URL", received: value },
            options,
          );
        }
        if (forceHttps && url.protocol !== "https:") {
          return fail(
            { code: "invalid_format", message: "Invalid URL", expected: "HTTPS URL", received: value },
            options,
          );
        }

        return ok(url.href);
      } catch {
        return fail({ code: "invalid_format", message: "Invalid URL", expected: "URL", received: value }, options);
      }
    },

    fileType(allowed: string[]): ValidationResult<string> {
      const dotIndex = value.lastIndexOf(".");
      const ext = dotIndex > 0 && dotIndex < value.length - 1 ? value.slice(dotIndex + 1).toLowerCase() : undefined;
      const normalized = allowed
        .map((entry) => entry.toLowerCase().replace(/^\./, ""))
        .filter((entry) => entry.length > 0);
      if (normalized.length === 0) {
        return fail(
          { code: "invalid_value", message: "Allowed file types cannot be empty", expected: "file type list" },
          options,
        );
      }
      if (ext === undefined || !normalized.includes(ext)) {
        const received = ext ?? "missing";

        return fail(
          {
            code: "invalid_format",
            message: `File type "${received}" not allowed. Allowed: ${normalized.join(", ")}`,
            expected: normalized.join(", "),
            received,
          },
          options,
        );
      }

      return ok(ext);
    },

    minLength(length: number, { trim = false } = {}): ValidationResult<string> {
      if (!isValidLengthLimit(length)) {
        return fail({ code: "invalid_value", message: "Minimum length must be a finite non-negative number" }, options);
      }

      const input = trim ? value.trim() : value;
      if (input.length < length) {
        return fail(
          {
            code: "too_small",
            message: `Must be at least ${length} characters`,
            expected: `at least ${length} characters`,
            received: `${input.length} characters`,
          },
          options,
        );
      }

      return ok(input);
    },

    maxLength(length: number, { trim = false } = {}): ValidationResult<string> {
      if (!isValidLengthLimit(length)) {
        return fail({ code: "invalid_value", message: "Maximum length must be a finite non-negative number" }, options);
      }

      const input = trim ? value.trim() : value;
      if (input.length > length) {
        return fail(
          {
            code: "too_big",
            message: `Must be at most ${length} characters`,
            expected: `at most ${length} characters`,
            received: `${input.length} characters`,
          },
          options,
        );
      }

      return ok(input);
    },

    notEmpty({ trim = true } = {}): ValidationResult<string> {
      const input = trim ? value.trim() : value;
      if (input.length === 0) {
        return fail(
          {
            code: "too_small",
            message: "Value cannot be empty",
            expected: "non-empty string",
            received: "empty string",
          },
          options,
        );
      }

      return ok(input);
    },

    matches(pattern: RegExp, message = "Value does not match the required format"): ValidationResult<string> {
      const safePattern = new RegExp(pattern.source, pattern.flags);
      if (!safePattern.test(value)) {
        return fail({ code: "invalid_format", message, expected: pattern.toString(), received: value }, options);
      }

      return ok(value);
    },
  };
}
