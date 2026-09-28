import { coerceToString } from "./coercion";
import { Validator } from "./core";
import {
  assertSize,
  constraint,
  invalidCoercion,
  invalidType,
  pass,
  type Outcome,
  type ParseContext,
} from "./internal";
import { type Message } from "./issue";

const PUBLIC_HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,}|xn--[a-z0-9-]{1,59})$/i;
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_MAX_LENGTH = 254;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CUID2_PATTERN = /^[a-z][a-z0-9]{23,31}$/;
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;
const NANOID_PATTERN = /^[A-Za-z0-9_-]{21}$/;
const HEX_PATTERN = /^[0-9a-f]+$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IPV4_PATTERN =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const IPV6_PATTERN =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/i;

/** Options of {@link StringValidator.email}. */
export interface EmailOptions {
  /**
   * Accepts `+` in the local part, as in `me+tag@example.com`.
   *
   * @defaultValue true
   */
  allowPlus?: boolean;
  /** Failure message. */
  message?: Message;
}

/** Options of {@link StringValidator.url}. */
export interface UrlOptions {
  /**
   * Accepted protocols, without the colon.
   *
   * @defaultValue ["http", "https"]
   */
  protocols?: readonly string[];
  /**
   * Accepts hosts that are not public domain names: `localhost`, single-label hosts and IP addresses.
   *
   * @defaultValue false
   */
  allowLocal?: boolean;
  /** Failure message. */
  message?: Message;
}

/** Options of {@link StringValidator.ip}. */
export interface IpOptions {
  /** Restricts the address family. Both are accepted when omitted. */
  version?: "v4" | "v6";
  /** Failure message. */
  message?: Message;
}

/** Options of {@link StringValidator.datetime}. */
export interface DatetimeOptions {
  /**
   * Accepts a UTC offset such as `+02:00` instead of only `Z`.
   *
   * @defaultValue false
   */
  offset?: boolean;
  /** Exact number of fractional-second digits. `0` forbids them; they are optional and unbounded when omitted. */
  precision?: number;
  /** Failure message. */
  message?: Message;
}

const buildDatetimePattern = ({ offset, precision }: DatetimeOptions): RegExp => {
  const fraction = precision === undefined ? "(?:\\.\\d+)?" : precision === 0 ? "" : `\\.\\d{${precision}}`;
  const zone = offset === true ? "(?:Z|[+-]\\d{2}:\\d{2})" : "Z";
  return new RegExp(`^(\\d{4}-\\d{2}-\\d{2})T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d${fraction}${zone}$`);
};

/** Tests whether `YYYY-MM-DD` names a day that exists, rejecting `2026-02-30`. */
const isCalendarDate = (text: string): boolean => {
  const [year, month, day] = text.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const isEmail = (text: string, allowPlus: boolean): boolean => {
  const [local, host, extra] = text.split("@");
  return (
    extra === undefined &&
    local !== undefined &&
    host !== undefined &&
    text.length <= EMAIL_MAX_LENGTH &&
    local.length <= EMAIL_LOCAL_MAX_LENGTH &&
    EMAIL_LOCAL_PATTERN.test(local) &&
    PUBLIC_HOST_PATTERN.test(host) &&
    (allowPlus || !local.includes("+"))
  );
};

const isUrl = (text: string, { protocols = ["http", "https"], allowLocal = false }: UrlOptions): boolean => {
  if (!URL.canParse(text)) {
    return false;
  }
  const url = new URL(text);
  return (
    protocols.includes(url.protocol.slice(0, -1)) &&
    url.username === "" &&
    url.password === "" &&
    (allowLocal || PUBLIC_HOST_PATTERN.test(url.hostname))
  );
};

/**
 * Validator for strings, created by {@link string}.
 *
 * Rules never change the value, except {@link StringValidator.trim},
 * {@link StringValidator.toLowerCase} and {@link StringValidator.toUpperCase}, which are
 * transforms and apply to the rules that follow them.
 */
export class StringValidator extends Validator<string> {
  /**
   * Creates a string validator.
   *
   * @param message - Message when the input is not a string.
   * @param isCoerced - Converts numbers, bigints and booleans to strings instead of rejecting them.
   */
  constructor(
    private readonly message?: Message,
    private readonly isCoerced = false,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): Outcome<string> {
    if (this.isCoerced) {
      const converted = coerceToString(input);
      return converted === undefined ? invalidCoercion(ctx, "string", input, this.message) : pass(converted);
    }
    return typeof input === "string" ? pass(input) : invalidType(ctx, "string", input, this.message);
  }

  private format(name: string, test: (value: string) => boolean, message: Message | undefined, fallback: string): this {
    return this.addStep(
      constraint(test, { code: "invalid_format", message: message ?? fallback, params: { format: name } }),
    );
  }

  /**
   * Requires at least `length` characters (UTF-16 code units, as `String.length` counts them).
   *
   * @param length - Minimum length, a non-negative integer.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   * @throws {RangeError} When `length` is not a non-negative integer.
   */
  min(length: number, message?: Message): this {
    assertSize("Minimum length", length);
    return this.addStep(
      constraint((value) => value.length >= length, {
        code: "too_small",
        message: message ?? `Must be at least ${length} characters`,
        params: { minimum: length, type: "string" },
      }),
    );
  }

  /**
   * Allows at most `length` characters.
   *
   * @param length - Maximum length, a non-negative integer.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   * @throws {RangeError} When `length` is not a non-negative integer.
   */
  max(length: number, message?: Message): this {
    assertSize("Maximum length", length);
    return this.addStep(
      constraint((value) => value.length <= length, {
        code: "too_big",
        message: message ?? `Must be at most ${length} characters`,
        params: { maximum: length, type: "string" },
      }),
    );
  }

  /**
   * Requires exactly `length` characters.
   *
   * @param length - Required length, a non-negative integer.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   * @throws {RangeError} When `length` is not a non-negative integer.
   */
  length(length: number, message?: Message): this {
    assertSize("Length", length);
    return this.addStep((value, ctx) => {
      if (value.length !== length) {
        const isShort = value.length < length;
        ctx.addIssue({
          code: isShort ? "too_small" : "too_big",
          message: message ?? `Must be exactly ${length} characters`,
          params: { [isShort ? "minimum" : "maximum"]: length, exact: true, type: "string" },
          input: value,
        });
      }
    });
  }

  /**
   * Requires at least one character. Whitespace counts, so trim first to reject blank strings.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  nonEmpty(message?: Message): this {
    return this.addStep(
      constraint((value) => value.length > 0, {
        code: "too_small",
        message: message ?? "Must not be empty",
        params: { minimum: 1, type: "string" },
      }),
    );
  }

  /**
   * Requires an email address with a public domain name. The value is not modified.
   *
   * @param options - Whether `+` is allowed, and the failure message.
   * @returns The validator with the rule added.
   */
  email(options: EmailOptions = {}): this {
    return this.format(
      "email",
      (value) => isEmail(value, options.allowPlus ?? true),
      options.message,
      "Invalid email address",
    );
  }

  /**
   * Requires an absolute URL with an allowed protocol and a public domain name, and without
   * embedded credentials. The value is not modified.
   *
   * @param options - Protocols, whether local hosts are allowed, and the failure message.
   * @returns The validator with the rule added.
   */
  url(options: UrlOptions = {}): this {
    return this.format("url", (value) => isUrl(value, options), options.message, "Invalid URL");
  }

  /**
   * Requires a UUID of version 1 to 8, in hyphenated form.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  uuid(message?: Message): this {
    return this.format("uuid", (value) => UUID_PATTERN.test(value), message, "Invalid UUID");
  }

  /**
   * Requires an IPv4 or IPv6 address.
   *
   * @param options - Address family, and the failure message.
   * @returns The validator with the rule added.
   */
  ip(options: IpOptions = {}): this {
    const { version } = options;
    return this.format(
      version === undefined ? "ip" : `ip${version}`,
      (value) => (version !== "v6" && IPV4_PATTERN.test(value)) || (version !== "v4" && IPV6_PATTERN.test(value)),
      options.message,
      version === "v4" ? "Invalid IPv4 address" : version === "v6" ? "Invalid IPv6 address" : "Invalid IP address",
    );
  }

  /**
   * Requires an ISO 8601 date and time such as `2026-09-28T14:30:00Z`, on a day that exists.
   *
   * @param options - Whether offsets are allowed, fractional precision, and the failure message.
   * @returns The validator with the rule added.
   */
  datetime(options: DatetimeOptions = {}): this {
    const pattern = buildDatetimePattern(options);
    return this.format(
      "datetime",
      (value) => {
        const date = pattern.exec(value)?.[1];
        return date !== undefined && isCalendarDate(date);
      },
      options.message,
      "Invalid datetime",
    );
  }

  /**
   * Requires an ISO 8601 calendar date such as `2026-09-28`, on a day that exists.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  date(message?: Message): this {
    return this.format("date", (value) => DATE_PATTERN.test(value) && isCalendarDate(value), message, "Invalid date");
  }

  /**
   * Requires standard base64 with padding.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  base64(message?: Message): this {
    return this.format("base64", (value) => BASE64_PATTERN.test(value), message, "Invalid base64 string");
  }

  /**
   * Requires hexadecimal digits of any case.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  hex(message?: Message): this {
    return this.format("hex", (value) => HEX_PATTERN.test(value), message, "Invalid hexadecimal string");
  }

  /**
   * Requires a hostname: dot-separated labels of letters, digits and hyphens. Unlike
   * {@link StringValidator.url}, single-label hosts such as `localhost` are accepted.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  hostname(message?: Message): this {
    return this.format("hostname", (value) => HOSTNAME_PATTERN.test(value), message, "Invalid hostname");
  }

  /**
   * Requires a CUID2 identifier.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  cuid2(message?: Message): this {
    return this.format("cuid2", (value) => CUID2_PATTERN.test(value), message, "Invalid cuid2");
  }

  /**
   * Requires a ULID, in any case.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  ulid(message?: Message): this {
    return this.format("ulid", (value) => ULID_PATTERN.test(value), message, "Invalid ULID");
  }

  /**
   * Requires a Nano ID in its default form: 21 characters of `A-Za-z0-9_-`.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  nanoid(message?: Message): this {
    return this.format("nanoid", (value) => NANOID_PATTERN.test(value), message, "Invalid Nano ID");
  }

  /**
   * Requires the string to match a regular expression.
   *
   * The `g` and `y` flags are ignored, so the same validator gives the same answer on every call.
   *
   * @param pattern - Expression to test against.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  regex(pattern: RegExp, message?: Message): this {
    const stateless = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
    return this.format("regex", (value) => stateless.test(value), message, `Must match ${pattern}`);
  }

  /**
   * Requires the string to start with a prefix.
   *
   * @param prefix - Required start.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  startsWith(prefix: string, message?: Message): this {
    return this.format("startsWith", (value) => value.startsWith(prefix), message, `Must start with "${prefix}"`);
  }

  /**
   * Requires the string to end with a suffix.
   *
   * @param suffix - Required end.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  endsWith(suffix: string, message?: Message): this {
    return this.format("endsWith", (value) => value.endsWith(suffix), message, `Must end with "${suffix}"`);
  }

  /**
   * Requires the string to contain a substring.
   *
   * @param search - Required substring.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  includes(search: string, message?: Message): this {
    return this.format("includes", (value) => value.includes(search), message, `Must include "${search}"`);
  }

  /**
   * Removes leading and trailing whitespace from the value, for the rules that follow and the output.
   *
   * @returns The validator with the step added.
   */
  trim(): this {
    return this.addStep((value) => value.trim());
  }

  /**
   * Lowercases the value, for the rules that follow and the output.
   *
   * @returns The validator with the step added.
   */
  toLowerCase(): this {
    return this.addStep((value) => value.toLowerCase());
  }

  /**
   * Uppercases the value, for the rules that follow and the output.
   *
   * @returns The validator with the step added.
   */
  toUpperCase(): this {
    return this.addStep((value) => value.toUpperCase());
  }
}

/**
 * Creates a validator for strings.
 *
 * @example
 * ```ts
 * const username = val.string().trim().min(3).max(30);
 * ```
 *
 * @param message - Message when the input is not a string.
 * @returns A string validator.
 */
export function string(message?: Message): StringValidator {
  return new StringValidator(message);
}
