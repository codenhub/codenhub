import {
  array,
  boolean,
  formatIssue,
  formatPath,
  object,
  optional,
  pipe,
  refine,
  string,
  unknown,
  type Messages,
  type Validator,
} from "@codenhub/validation";

import { resolveConfiguredLocale } from "./configured-locale";
import { isValidLocaleIdentifier } from "./identifier";

/**
 * The wording for the issues a locale configuration can produce that the validators do not word
 * themselves. It is written out here, and not taken from the package's English wording, so the build
 * carries only these few lines.
 */
const CONFIG_MESSAGES: Messages = {
  invalid_type: (issue) => `Expected ${String(issue.params?.expected)}, received ${String(issue.params?.received)}`,
  too_small: (issue) => (issue.params?.type === "array" ? "Must contain at least 1 item" : "Must not be empty"),
  invalid_value: (issue) => (issue.params?.unique === true ? "Must be unique, ignoring letter case" : "Invalid value"),
};

/** A locale identifier: a non-blank string that, trimmed, is a conservative ASCII identifier. Produces the trimmed one. */
const localeIdentifier = pipe(
  string({ trim: true, min: 1 }),
  refine(string(), isValidLocaleIdentifier, {
    code: "invalid_format",
    message: "Must be an ASCII locale identifier with alphanumeric, hyphen-separated subtags",
  }),
);

/** Trimmed, non-empty, case-insensitively unique locale identifiers. */
const localeList = array(localeIdentifier, { min: 1, unique: (locale: string) => locale.toLowerCase() });

/** A function-valued option. Validators have no leaf for functions, so this is one. */
const callback = refine(unknown(), (value) => typeof value === "function", {
  code: "invalid_type",
  message: "Must be a function",
});

const defaultIsConfigured = (config: { locales: readonly string[]; defaultLocale: string }): boolean =>
  resolveConfiguredLocale(config.locales, config.defaultLocale) !== undefined;

const DEFAULT_LOCALE_ISSUE = {
  code: "invalid_value",
  message: "Must match a configured locale",
  path: ["defaultLocale"],
};

/**
 * Validates the configuration of an `I18n` manager: the locales, the default locale, the loader and
 * direction callbacks, and the optional silent flag. Properties it does not list are kept.
 *
 * @internal
 */
export const i18nConfig = refine(
  object(
    {
      locales: localeList,
      defaultLocale: string(),
      loadLocale: callback,
      getLocaleDirection: callback,
      isSilent: optional(boolean()),
    },
    { unknownKeys: "passthrough" },
  ),
  defaultIsConfigured,
  DEFAULT_LOCALE_ISSUE,
);

/**
 * Validates the configuration of locale routing: the locales, the default locale and the
 * default-prefix policy. Properties it does not list are kept.
 *
 * @internal
 */
export const localeRoutingConfig = refine(
  object(
    { locales: localeList, defaultLocale: string(), prefixDefaultLocale: boolean() },
    { unknownKeys: "passthrough" },
  ),
  defaultIsConfigured,
  DEFAULT_LOCALE_ISSUE,
);

/**
 * Returns the validated value, or throws a `TypeError` that names the first problem and where it is.
 *
 * @param validator - What the configuration must satisfy.
 * @param input - The consumer's configuration.
 * @param subject - What was being configured, for the start of the message.
 * @returns The validated configuration, with locales trimmed.
 * @throws {TypeError} When the configuration does not satisfy the validator.
 * @internal
 */
export function assertConfig<T>(validator: Validator<T>, input: unknown, subject: string): T {
  const result = validator(input);
  if (result.ok) {
    return result.value;
  }
  const [issue] = result.error.issues;
  if (issue === undefined) {
    throw new TypeError(subject);
  }
  const where = issue.path.length > 0 ? `${formatPath(issue.path)}: ` : "";
  throw new TypeError(`${subject}: ${where}${formatIssue(issue, CONFIG_MESSAGES)}`);
}
