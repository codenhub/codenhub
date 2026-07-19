/** Configuration snapshotted for locale-prefixed pathname parsing and generation. */
export interface LocaleRoutingConfig<TLocale extends string> {
  /** The trimmed, case-insensitively matched locale used for unprefixed paths. */
  defaultLocale: TLocale;
  /** Supported locale identifiers, trimmed and preserved in `localizeAll` order. */
  locales: readonly TLocale[];
  /** Whether paths require a default-locale prefix, snapshotted when routing is created. */
  prefixDefaultLocale: boolean;
}

/** A pathname resolved to its canonical configured locale. */
export interface ParsedLocalePath<TLocale extends string> {
  /** The trimmed canonical configured locale identified by the pathname. */
  locale: TLocale;
  /** The absolute application pathname with the recognized locale prefix removed. */
  pathname: string;
}

/** A generated pathname paired with its canonical configured locale. */
export interface LocalizedPath<TLocale extends string> {
  /** The trimmed canonical configured locale used to generate the pathname. */
  locale: TLocale;
  /** The absolute localized application pathname. */
  pathname: string;
}

/** Pure operations for parsing and generating locale-prefixed application pathnames. */
export interface LocaleRouting<TLocale extends string> {
  /**
   * Parses a pathname using configured, case-insensitive locale prefixes.
   *
   * @param pathname - An absolute application pathname without a URL, query, or fragment.
   * @returns The canonical locale and unprefixed pathname, or `undefined` when a required prefix is absent.
   * @throws {TypeError} When `pathname` is not a valid application pathname.
   */
  parse(pathname: string): ParsedLocalePath<TLocale> | undefined;

  /**
   * Generates the canonical pathname for one supported locale.
   *
   * @param pathname - An absolute application pathname without a URL, query, or fragment.
   * @param locale - A supported locale, trimmed and matched case-insensitively.
   * @returns The pathname with the configured locale-prefix policy applied.
   * @throws {TypeError} When `pathname` is not a valid application pathname.
   * @throws {RangeError} When `locale` is unsupported or is not a string at runtime.
   */
  localize(pathname: string, locale: TLocale): string;

  /**
   * Generates localized pathnames for every locale in configuration order.
   *
   * @param pathname - An absolute application pathname without a URL, query, or fragment.
   * @returns Localized pathnames paired with their canonical locales.
   * @throws {TypeError} When `pathname` is not a valid application pathname.
   */
  localizeAll(pathname: string): readonly LocalizedPath<TLocale>[];
}

/**
 * Creates runtime-neutral locale-prefixed pathname operations.
 *
 * The factory trims locale identifiers and snapshots the validated configuration,
 * so later caller mutations do not affect routing behavior.
 *
 * @param config - Supported locales, default locale, and default-prefix policy.
 * @returns Pure parsing and generation operations bound to an immutable configuration snapshot.
 * @throws {TypeError} When locales are empty, blank, duplicated case-insensitively after trimming,
 * the trimmed default locale is unsupported, or `prefixDefaultLocale` is not a boolean.
 */
export const createLocaleRouting = <TLocale extends string>(
  config: LocaleRoutingConfig<TLocale>,
): LocaleRouting<TLocale> => {
  const configuredLocales = config.locales;
  const configuredDefaultLocale = config.defaultLocale;
  const prefixDefaultLocale = config.prefixDefaultLocale;

  if (!Array.isArray(configuredLocales) || configuredLocales.length === 0) {
    throw new TypeError("locales must contain at least one locale");
  }

  if (typeof prefixDefaultLocale !== "boolean") {
    throw new TypeError("prefixDefaultLocale must be a boolean");
  }

  const locales = Object.freeze(
    configuredLocales.map((locale) => {
      if (typeof locale !== "string" || locale.trim().length === 0) {
        throw new TypeError("locales must contain non-empty strings");
      }

      return locale.trim() as TLocale;
    }),
  );
  const normalizedLocales = new Set<string>();

  for (const locale of locales) {
    const normalizedLocale = locale.toLowerCase();
    if (normalizedLocales.has(normalizedLocale)) {
      throw new TypeError("locales must be unique case-insensitively");
    }
    normalizedLocales.add(normalizedLocale);
  }

  if (typeof configuredDefaultLocale !== "string") {
    throw new TypeError("defaultLocale must match a configured locale");
  }

  const normalizedDefaultLocale = configuredDefaultLocale.trim().toLowerCase();
  if (!normalizedLocales.has(normalizedDefaultLocale)) {
    throw new TypeError("defaultLocale must match a configured locale");
  }

  const findLocale = (value: string, shouldTrim = false): TLocale | undefined => {
    const normalizedValue = (shouldTrim ? value.trim() : value).toLowerCase();
    return locales.find((locale) => locale.toLowerCase() === normalizedValue);
  };
  const defaultLocale = findLocale(normalizedDefaultLocale) as TLocale;

  const validatePathname = (pathname: string): void => {
    if (
      typeof pathname !== "string" ||
      pathname.length === 0 ||
      !pathname.startsWith("/") ||
      pathname.includes("//") ||
      pathname.includes("?") ||
      pathname.includes("#") ||
      pathname.includes("\\") ||
      /%(?:2f|5c)/i.test(pathname)
    ) {
      throw new TypeError("pathname must be a valid absolute application pathname");
    }

    const hasDotSegment = pathname.split("/").some((segment) => [".", ".."].includes(segment.replaceAll(/%2e/gi, ".")));

    if (hasDotSegment) {
      throw new TypeError("pathname must not contain dot segments");
    }
  };

  const removeLocalePrefix = (pathname: string): string => {
    const [prefix, ...segments] = pathname.slice(1).split("/");

    if (findLocale(prefix ?? "") === undefined) {
      return pathname;
    }

    return segments.length === 0 || (segments.length === 1 && segments[0] === "") ? "/" : `/${segments.join("/")}`;
  };

  const localize = (pathname: string, locale: TLocale): string => {
    validatePathname(pathname);
    const canonicalLocale = typeof locale === "string" ? findLocale(locale, true) : undefined;

    if (canonicalLocale === undefined) {
      throw new RangeError("locale must be a supported string");
    }

    const unprefixedPathname = removeLocalePrefix(pathname);

    if (!prefixDefaultLocale && canonicalLocale === defaultLocale) {
      return unprefixedPathname;
    }

    return unprefixedPathname === "/" ? `/${canonicalLocale}` : `/${canonicalLocale}${unprefixedPathname}`;
  };

  return {
    parse(pathname) {
      validatePathname(pathname);
      const [prefix] = pathname.slice(1).split("/");
      const locale = findLocale(prefix ?? "");

      if (locale === undefined) {
        return prefixDefaultLocale
          ? undefined
          : {
              locale: defaultLocale,
              pathname,
            };
      }

      return {
        locale,
        pathname: removeLocalePrefix(pathname),
      };
    },
    localize,
    localizeAll(pathname) {
      return locales.map((locale) => ({
        locale,
        pathname: localize(pathname, locale),
      }));
    },
  };
};
