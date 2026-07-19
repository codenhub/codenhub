import type { ErrorFeedback } from "@codenhub/error";

/** Stable code for an operational i18n failure. */
export type I18nErrorCode = "locale_load_failed";

/** Options used to retain context from a rejected locale loader. */
export interface I18nErrorOptions {
  /** Locale whose translations could not be loaded. */
  readonly locale?: string;
  /** Original loader failure. */
  readonly cause?: unknown;
}

/**
 * Reports an operational locale loader failure without obscuring its cause.
 */
export class I18nError extends Error {
  /** Stable identifier for consumer classification. */
  readonly code: I18nErrorCode = "locale_load_failed";
  /** Locale whose loader rejected. */
  readonly locale?: string;
  /** Original loader failure retained for diagnostics and classification. */
  override readonly cause?: unknown;

  /**
   * Creates a locale loading error.
   *
   * @param options - Locale and original loader failure.
   */
  constructor(options: I18nErrorOptions) {
    const localeSuffix = options.locale === undefined ? "" : ` for locale "${options.locale}"`;
    super(`Failed to load translations${localeSuffix}.`, { cause: options.cause });
    this.name = "I18nError";
    this.locale = options.locale;
    this.cause = options.cause;
  }
}

/** Safe consumer feedback keyed by the stable i18n error code. */
export const i18nErrors = {
  locale_load_failed: {
    message: "Translations could not be loaded.",
    messageKey: "error.i18n.loader.localeLoadFailed",
    source: "i18n.loader",
  },
} satisfies Record<I18nErrorCode, ErrorFeedback>;
