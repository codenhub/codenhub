import { assertConfig, localeRoutingConfig } from "../locale/config-validators";
import { findPathnameProblem, joinPathname, MAX_PATHNAME_LENGTH, normalizeSegment, splitPathname } from "./path";
import { buildPattern, compilePathnames, matchPattern, type Route, type ShapeIndex } from "./pathnames";

/** Configuration snapshotted for parsing and generating localized pathnames. */
export interface LocaleRoutingConfig<TLocale extends string> {
  /** The trimmed, case-insensitively matched locale used for unprefixed paths; its type is inferred from `locales` only. */
  defaultLocale: NoInfer<TLocale>;
  /** ASCII locale identifiers with alphanumeric hyphen-separated subtags, preserved in `localizeAll` order. */
  locales: readonly TLocale[];
  /**
   * Which paths start with their locale: `"always"` every path; `"except-default"` every path but the default
   * locale's; `"when-ambiguous"` like `"except-default"`, except that a translated path with a fixed segment that no
   * other locale's path could match drops the prefix, such as `/sobre`. A path the table doesn't list is read as the
   * default locale's, so with `"when-ambiguous"`, `localize` throws when such a path would be read as another page.
   */
  localePrefix: "always" | "except-default" | "when-ambiguous";
  /**
   * Translated paths, keyed by the canonical path the application routes on, with each locale's form, such as
   * `{ "/products/:id": { pt: "/produtos/:id" } }`. Paths have fixed segments, `:name` parameters, and a last
   * `:name*` catch-all that matches one or more segments, and every form uses the canonical path's parameters, in any
   * order. Fixed segments match case-sensitively, Unicode matches its percent-encoding, and a fixed segment wins over a
   * parameter, which wins over a catch-all. A locale or path the table doesn't list keeps the canonical words.
   */
  pathnames?: Readonly<Record<string, Readonly<Partial<Record<NoInfer<TLocale>, string>>>>> | undefined;
}

/** A pathname resolved to its canonical configured locale. */
export interface ParsedLocalePath<TLocale extends string> {
  /** The trimmed canonical configured locale identified by the pathname. */
  locale: TLocale;
  /** The canonical application pathname: the locale prefix removed and translated segments read back. */
  pathname: string;
}

/** A generated pathname paired with its canonical configured locale. */
export interface LocalizedPath<TLocale extends string> {
  /** The trimmed canonical configured locale used to generate the pathname. */
  locale: TLocale;
  /** The absolute localized application pathname. */
  pathname: string;
}

/** Pure operations for parsing and generating localized application pathnames. */
export interface LocaleRouting<TLocale extends string> {
  /**
   * Parses a URL's pathname into its locale and canonical pathname. Locale prefixes match case-insensitively, and a
   * prefixed path is accepted even where the canonical URL has none, such as `/en/about` for `/about`.
   *
   * @param pathname - An absolute application pathname of at most 8,192 characters without a URL, query, or fragment.
   * @returns The locale and canonical pathname, or `undefined` when a required prefix is absent or no URL leads to the
   * path read, such as `/pt/en/sobre`, or `/en/sobre` when `/sobre` is the Portuguese about page. A result always has a
   * canonical URL that `localize` builds.
   * @throws {TypeError} When `pathname` is not a valid application pathname.
   */
  parse(pathname: string): ParsedLocalePath<TLocale> | undefined;

  /**
   * Generates the canonical URL pathname of a page for one supported locale.
   *
   * @param pathname - A canonical application pathname of at most 8,192 characters without a URL, query, or fragment.
   * A path that starts with a locale is read as that locale's URL, as `parse` reads it.
   * @param locale - A supported locale, trimmed and matched case-insensitively.
   * @returns The pathname in the locale's words, with the configured locale-prefix policy applied.
   * @throws {TypeError} When `pathname` is not a valid application pathname.
   * @throws {RangeError} When `locale` is unsupported or is not a string at runtime, when the result would be longer
   * than 8,192 characters, or when the result would be parsed as another page or locale, such as a page the table
   * doesn't list whose path is another locale's translated path.
   */
  localize(pathname: string, locale: TLocale): string;

  /**
   * Generates localized pathnames for every locale in configuration order.
   *
   * @param pathname - A canonical application pathname, read as `localize` reads it.
   * @returns Localized pathnames paired with their canonical locales.
   * @throws {TypeError} When `pathname` is not a valid application pathname.
   * @throws {RangeError} When a result would be too long or be parsed as another page or locale, as with `localize`.
   */
  localizeAll(pathname: string): readonly LocalizedPath<TLocale>[];
}

/**
 * Creates runtime-neutral operations for localized pathnames: a locale prefix, translated paths, or both.
 *
 * The factory trims locale identifiers and snapshots the validated configuration,
 * so later caller mutations do not affect routing behavior.
 *
 * @param config - Supported locales, default locale, locale-prefix policy, and optional translated paths.
 * @returns Pure parsing and generation operations bound to an immutable configuration snapshot.
 * @throws {TypeError} When `config` is not a plain object, locales are empty, invalid conservative ASCII identifiers, duplicated
 * case-insensitively after trimming, the trimmed default locale is unsupported, `localePrefix` is not a supported policy, or `pathnames` has an
 * invalid path, an unsupported locale, a path that starts with a locale, a catch-all that is not last, parameters that
 * differ from the canonical path's, or two pages with the same path in one locale.
 */
export const createLocaleRouting = <TLocale extends string>(
  config: LocaleRoutingConfig<TLocale>,
): LocaleRouting<TLocale> => {
  const subject = "[I18n] Invalid locale routing configuration";
  const validated = assertConfig(localeRoutingConfig, config, subject);
  const locales = Object.freeze(validated.locales as TLocale[]);
  const { localePrefix } = validated;
  const localeLookup = new Map<string, TLocale>(locales.map((locale) => [locale.toLowerCase(), locale]));

  const findLocale = (value: string | undefined, shouldTrim = false): TLocale | undefined =>
    value === undefined ? undefined : localeLookup.get((shouldTrim ? value.trim() : value).toLowerCase());
  const defaultLocale = findLocale(validated.defaultLocale, true)!;
  const pathnames = assertConfig(
    (entries: unknown) =>
      compilePathnames(
        entries as typeof validated.pathnames,
        locales,
        defaultLocale,
        (segment) => findLocale(segment) !== undefined,
      ),
    validated.pathnames,
    subject,
  );

  const validatePathname = (pathname: string): void => {
    const problem = findPathnameProblem(pathname);

    if (problem === "invalid") {
      throw new TypeError("[I18n] pathname must be a valid absolute application pathname");
    }
    if (problem === "dot-segment") {
      throw new TypeError("[I18n] pathname must not contain dot segments");
    }
  };

  /** Finds the first route whose pattern matches, returning it with its parameters. */
  const findRoute = (
    routes: ShapeIndex<Route<TLocale>>,
    patternOf: (route: Route<TLocale>) => Route<TLocale>["canonical"],
    segments: readonly string[],
  ) => {
    const keys = segments.map(normalizeSegment);

    for (const route of routes.candidates(keys.length, keys[0])) {
      const parameters = matchPattern(patternOf(route), keys, segments);
      if (parameters !== undefined) {
        return { route, parameters };
      }
    }
    return undefined;
  };

  /** Reads segments as a path in `locale`, returning the canonical segments; a path the table doesn't list is kept. */
  const readPath = (segments: readonly string[], locale: TLocale): readonly string[] => {
    const found = findRoute(pathnames.byLocale.get(locale)!, (route) => route.forms.get(locale)!, segments);
    return found === undefined ? segments : buildPattern(found.route.canonical, found.parameters);
  };

  const isSameCanonical = (a: readonly string[], b: readonly string[]): boolean =>
    a.map(normalizeSegment).join("/") === b.map(normalizeSegment).join("/");

  /** Builds the URL of canonical segments in `locale`, without checking how it reads back. */
  const buildUrl = (canonical: readonly string[], hasTrailingSlash: boolean, locale: TLocale): string => {
    const found = findRoute(pathnames.byCanonical, (route) => route.canonical, canonical);
    const localized = found === undefined ? canonical : buildPattern(found.route.forms.get(locale)!, found.parameters);
    const isPrefixed =
      localePrefix === "always" ||
      (locale !== defaultLocale &&
        !(localePrefix === "when-ambiguous" && found?.route.unprefixed.has(locale) === true));

    return isPrefixed
      ? joinPathname([locale, ...localized], hasTrailingSlash && localized.length > 0)
      : joinPathname(localized, hasTrailingSlash);
  };

  /** Reads a valid pathname's locale and canonical path, whether or not any URL leads there. */
  const read = (pathname: string): ParsedLocalePath<TLocale> | undefined => {
    const { segments, hasTrailingSlash } = splitPathname(pathname);
    const prefixLocale = findLocale(segments[0]);

    if (prefixLocale !== undefined) {
      return {
        locale: prefixLocale,
        pathname: joinPathname(readPath(segments.slice(1), prefixLocale), hasTrailingSlash),
      };
    }
    if (localePrefix === "always") {
      return undefined;
    }
    if (localePrefix === "when-ambiguous") {
      const keys = segments.map(normalizeSegment);

      for (const { route, locale } of pathnames.unprefixed.candidates(keys.length, keys[0])) {
        const parameters = matchPattern(route.forms.get(locale)!, keys, segments);
        if (parameters !== undefined) {
          return {
            locale,
            pathname: joinPathname(buildPattern(route.canonical, parameters), hasTrailingSlash),
          };
        }
      }
    }

    return {
      locale: defaultLocale,
      pathname: joinPathname(readPath(segments, defaultLocale), hasTrailingSlash),
    };
  };

  const parse = (pathname: string): ParsedLocalePath<TLocale> | undefined => {
    validatePathname(pathname);
    const route = read(pathname);
    if (route === undefined) {
      return undefined;
    }

    // A path no URL leads to, such as `/pt/en/sobre` or, with `when-ambiguous`, `/en/sobre`, is not a page: its
    // canonical URL would open another page, would be too long, or localize() would read its leading locale as a prefix.
    const { segments, hasTrailingSlash } = splitPathname(route.pathname);
    if (findLocale(segments[0]) !== undefined) {
      return undefined;
    }
    const url = buildUrl(segments, hasTrailingSlash, route.locale);
    const readBack = url.length > MAX_PATHNAME_LENGTH ? undefined : read(url);

    return readBack?.locale === route.locale && isSameCanonical(splitPathname(readBack.pathname).segments, segments)
      ? route
      : undefined;
  };

  const localize = (pathname: string, locale: TLocale): string => {
    validatePathname(pathname);
    const canonicalLocale = typeof locale === "string" ? findLocale(locale, true) : undefined;

    if (canonicalLocale === undefined) {
      throw new RangeError("[I18n] locale must be a supported string");
    }

    // An unprefixed path is canonical; a prefixed one is read as a path in its locale, so a URL can switch language.
    const { segments, hasTrailingSlash } = splitPathname(pathname);
    const prefixLocale = findLocale(segments[0]);
    const canonical = prefixLocale === undefined ? segments : readPath(segments.slice(1), prefixLocale);
    const result = buildUrl(canonical, hasTrailingSlash, canonicalLocale);

    if (result.length > MAX_PATHNAME_LENGTH) {
      throw new RangeError(
        `[I18n] the path in ${JSON.stringify(canonicalLocale)} would be longer than 8,192 characters`,
      );
    }

    // A page the table doesn't list can have the path of a translated one; a link to it would open that page instead.
    const readBack = parse(result);
    const canonicalPathname = joinPathname(canonical, hasTrailingSlash);

    if (
      readBack?.locale !== canonicalLocale ||
      !isSameCanonical(splitPathname(readBack.pathname).segments, canonical)
    ) {
      throw new RangeError(
        `[I18n] ${JSON.stringify(canonicalPathname)} in ${JSON.stringify(canonicalLocale)} would be read as ` +
          `${JSON.stringify(readBack?.pathname)} in ${JSON.stringify(readBack?.locale)}; pass a canonical path, such as ` +
          "parse().pathname, or list the page in pathnames",
      );
    }

    return result;
  };

  return {
    parse,
    localize,
    localizeAll(pathname) {
      return locales.map((locale) => ({
        locale,
        pathname: localize(pathname, locale),
      }));
    },
  };
};
