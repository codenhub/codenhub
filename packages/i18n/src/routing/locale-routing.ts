import { assertConfig, localeRoutingConfig } from "../locale/config-validators";
import { formatReportedKey } from "../locale/dictionary";
import { findPathnameProblem, isPathnameTooLong, joinPathname, normalizeSegment, splitPathname } from "./path";
import { buildPattern, compilePathnames, type ShapeIndex } from "./pathnames";

/** Normalizes a segment as {@link normalizeSegment} does. */
type Normalize = (segment: string) => string;

/**
 * A normalizer for one call, which normalizes each distinct segment once: a call reads the same segments several times,
 * and an escape that isn't UTF-8, such as `%C3`, costs about ten times a plain segment to normalize.
 */
const memoizeNormalize = (): Normalize => {
  const keys = new Map<string, string>();
  return (segment) => {
    let key = keys.get(segment);
    if (key === undefined) {
      key = normalizeSegment(segment);
      keys.set(segment, key);
    }
    return key;
  };
};

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
   * parameter, which wins over a catch-all. A path whose last segment is written `:name*`, such as `/help/:path*`, is
   * matched only by a catch-all, so it keeps its own form. A locale or path the table doesn't list keeps the canonical
   * words.
   */
  pathnames?: Readonly<Record<string, Readonly<Partial<Record<NoInfer<TLocale>, string>>>>> | undefined;
  /**
   * Whether the paths `localize` and `localizeAll` build end with `/`: `"preserve"`, the default, keeps the given
   * path's slash, so a locale's root, such as `/pt`, has none; `"always"` ends every path but `/` with one, such as
   * `/pt/`, for a site that serves pages as `pt/index.html`; `"never"` ends none with one. `parse` accepts both
   * spellings whatever the policy, and its `pathname` keeps the request's.
   */
  trailingSlash?: "preserve" | "always" | "never" | undefined;
}

/** A pathname resolved to its canonical configured locale. */
export interface ParsedLocalePath<TLocale extends string> {
  /** The trimmed canonical configured locale identified by the pathname. */
  locale: TLocale;
  /**
   * The canonical application pathname: the locale prefix removed and translated segments read back, with every
   * segment normalized as RFC 3986 says, so `/pt/%61/caf%c3%a9` reads as `/a/caf%C3%A9`, the same spelling `localize`
   * builds. It also encodes `|`, `[`, and `]`, which a URL's pathname leaves raw.
   */
  pathname: string;
  /**
   * This page's URL pathname in each locale that has one, in `locales` order, as `localize(pathname, locale)` builds
   * it: for a language switcher and `hreflang` tags. The parsed locale is always included. A locale is left out where
   * this page's URL would be read as another page or locale, or be longer than 8,192 characters or 100 segments, which is where
   * `localize` throws, such as Portuguese for an English product `/products/novo` when `/products/new` is the
   * Portuguese `/pt/produtos/novo`.
   */
  alternates: readonly LocalizedPath<TLocale>[];
}

/** A generated pathname paired with its canonical configured locale. */
export interface LocalizedPath<TLocale extends string> {
  /** The trimmed canonical configured locale used to generate the pathname. */
  locale: TLocale;
  /** The absolute localized application pathname, with every segment encoded as `ParsedLocalePath.pathname` is. */
  pathname: string;
}

/** A path's locale and canonical path, before its alternates are built. */
type CanonicalRoute<TLocale extends string> = Omit<ParsedLocalePath<TLocale>, "alternates">;

/** Pure operations for parsing and generating localized application pathnames. */
export interface LocaleRouting<TLocale extends string> {
  /**
   * Parses a URL's pathname into its locale and canonical pathname. Locale prefixes match case-insensitively, and a
   * prefixed path is accepted even where the canonical URL has none, such as `/en/about` for `/about`.
   *
   * @param pathname - A URL's pathname, such as `url.pathname`: it starts with `/` and has no query or fragment.
   * @returns The locale and canonical pathname, or `undefined` when a required prefix is absent, when no URL leads to the
   * path read, such as `/pt/en/sobre`, or `/en/sobre` when `/sobre` is the Portuguese about page, or when the path is one
   * routing refuses, such as `//wp-login.php`, a dot segment, an encoded slash, or one longer than 8,192 characters or
   * 100 segments, or when its canonical path or URL would be longer than that. A result always has a canonical URL that `localize`
   * builds, and lists the page's URL in every locale that has one, so a request never needs `localize`'s errors caught.
   * @throws {TypeError} When `pathname` is not a string, does not start with `/`, or contains `?` or `#`, which a URL's
   * pathname never does.
   */
  parse(pathname: string): ParsedLocalePath<TLocale> | undefined;

  /**
   * Generates the canonical URL pathname of a page for one supported locale.
   *
   * @param pathname - A canonical application pathname of at most 8,192 characters and 100 segments, without a URL,
   * query, or fragment, such as `parse(url).pathname`. It is never read as a URL, so `/pt/about` is not Portuguese.
   * @param locale - A supported locale, trimmed and matched case-insensitively.
   * @returns The pathname in the locale's words, with the configured locale-prefix and trailing-slash policies applied.
   * @throws {TypeError} When `pathname` is not a valid application pathname.
   * @throws {RangeError} When `locale` is unsupported or is not a string at runtime, when `pathname` starts with a
   * configured locale, such as `/my/orders` with Burmese, `my`, configured, since every URL of it would be that locale's
   * `/orders`, when the result would be longer
   * than 8,192 characters or 100 segments, or when the result would be parsed as another page or locale, such as a page the table
   * doesn't list whose path is another locale's translated path. A static build that localizes its page list finds
   * those clashes at build time; links built for a request can use `parse(url.pathname).alternates`, which leaves out
   * the locales where `localize` throws.
   */
  localize(pathname: string, locale: TLocale): string;

  /**
   * Generates localized pathnames for every locale in configuration order.
   *
   * @param pathname - A canonical application pathname, read as `localize` reads it.
   * @returns Localized pathnames paired with their canonical locales.
   * @throws {TypeError} When `pathname` is not a valid application pathname.
   * @throws {RangeError} When a result would be too long or be parsed as another page or locale, as with `localize`;
   * `parse().alternates` lists the locales that have a URL instead.
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
 * @throws {TypeError} When `config` is not a plain object, locales are empty, invalid conservative ASCII identifiers, or
 * duplicated case-insensitively after trimming, the trimmed default locale is unsupported, `localePrefix` is not a
 * supported policy, or `pathnames` is not an object of objects of strings or has an invalid path, an unsupported locale
 * or one listed twice ignoring case, a path that starts with a locale, a catch-all that is not last, a parameter whose
 * name has characters other than ASCII letters, digits, and `_` or is `__proto__`, `constructor`, or `prototype`, a
 * parameter repeated in one path, parameters that differ from the canonical path's, two canonical paths of the same
 * shape, such as `/products/:id` and `/products/:slug`, or two pages with the same path in one locale.
 */
export const createLocaleRouting = <TLocale extends string>(
  config: LocaleRoutingConfig<TLocale>,
): LocaleRouting<TLocale> => {
  const subject = "[I18n] Invalid locale routing configuration";
  const validated = assertConfig(localeRoutingConfig, config, subject);
  const locales = Object.freeze(validated.locales as TLocale[]);
  const { localePrefix, trailingSlash } = validated;
  const localeLookup = new Map<string, TLocale>(locales.map((locale) => [locale.toLowerCase(), locale]));

  const findLocale = (value: string | undefined, shouldTrim = false): TLocale | undefined =>
    value === undefined ? undefined : localeLookup.get((shouldTrim ? value.trim() : value).toLowerCase());
  // A prefix is read as a URL's pathname writes it, as table entries are, so `/%70t` is the `/pt` a server decodes.
  const findPrefixLocale = (segment: string | undefined, normalize: Normalize): TLocale | undefined =>
    segment === undefined ? undefined : findLocale(normalize(segment));
  const defaultLocale = findLocale(validated.defaultLocale, true)!;
  const pathnames = assertConfig(
    (entries: unknown) =>
      compilePathnames({
        entries: entries as typeof validated.pathnames,
        locales,
        defaultLocale,
        localePrefix,
        isLocale: (segment) => findLocale(segment) !== undefined,
      }),
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

  /** Finds the first item whose pattern matches, returning it with its parameters. */
  const findRoute = <T>(index: ShapeIndex<T>, segments: readonly string[], normalize: Normalize) =>
    index.find(segments.map(normalize), segments);

  /** Reads segments as a path in `locale`, returning the canonical segments; a path the table doesn't list is kept. */
  const readPath = (segments: readonly string[], locale: TLocale, normalize: Normalize): readonly string[] => {
    const found = findRoute(pathnames.byLocale.get(locale)!, segments, normalize);
    return found === undefined ? segments : buildPattern(found.item.canonical, found.parameters);
  };

  const isSameCanonical = (a: readonly string[], b: readonly string[], normalize: Normalize): boolean =>
    a.map(normalize).join("/") === b.map(normalize).join("/");

  /**
   * Builds the URL of canonical segments in `locale`, without checking how it reads back. A locale's root, such as
   * `/pt`, gets a slash only when `isRootSlashed`, since `/` itself says nothing about one.
   */
  const buildUrl = ({
    canonical,
    hasTrailingSlash,
    isRootSlashed = false,
    locale,
    normalize,
  }: {
    readonly canonical: readonly string[];
    readonly hasTrailingSlash: boolean;
    readonly isRootSlashed?: boolean | undefined;
    readonly locale: TLocale;
    readonly normalize: Normalize;
  }): string => {
    const found = findRoute(pathnames.byCanonical, canonical, normalize);
    // Every segment is normalized as RFC 3986 says, as listed words already are, so a raw `/café` and a
    // parameter such as `/produtos/café` come back as `caf%C3%A9`, ready for a `Location` header or a sitemap.
    const localized = (
      found === undefined ? canonical : buildPattern(found.item.forms.get(locale)!, found.parameters)
    ).map(normalize);
    const isPrefixed =
      localePrefix === "always" ||
      (locale !== defaultLocale && !(localePrefix === "when-ambiguous" && found?.item.unprefixed.has(locale) === true));

    return isPrefixed
      ? joinPathname([locale, ...localized], localized.length > 0 ? hasTrailingSlash : isRootSlashed)
      : joinPathname(localized, hasTrailingSlash);
  };

  /** Reads a valid pathname's locale and canonical path, whether or not any URL leads there. */
  const read = (pathname: string, normalize: Normalize): CanonicalRoute<TLocale> | undefined => {
    const { segments, hasTrailingSlash } = splitPathname(pathname);
    const prefixLocale = findPrefixLocale(segments[0], normalize);

    if (prefixLocale !== undefined) {
      return {
        locale: prefixLocale,
        pathname: joinPathname(readPath(segments.slice(1), prefixLocale, normalize), hasTrailingSlash),
      };
    }
    if (localePrefix === "always") {
      return undefined;
    }
    if (localePrefix === "when-ambiguous") {
      const found = findRoute(pathnames.unprefixed, segments, normalize);

      if (found !== undefined) {
        return {
          locale: found.item.locale,
          pathname: joinPathname(buildPattern(found.item.route.canonical, found.parameters), hasTrailingSlash),
        };
      }
    }

    return {
      locale: defaultLocale,
      pathname: joinPathname(readPath(segments, defaultLocale, normalize), hasTrailingSlash),
    };
  };

  /** Applies `trailingSlash` to a path's own slash, so `parse()` checks the URL `localize()` builds. */
  const slashPolicy = (hasTrailingSlash: boolean) => ({
    hasTrailingSlash: trailingSlash === "preserve" ? hasTrailingSlash : trailingSlash === "always",
    isRootSlashed: trailingSlash === "always",
  });

  const parseWith = (pathname: string, normalize: Normalize): CanonicalRoute<TLocale> | undefined => {
    // A value `url.pathname` never is, such as a full URL or a path with its query, is a mistake in the calling code.
    if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.includes("?") || pathname.includes("#")) {
      validatePathname(pathname);
    }
    // Anything else refused, such as `//wp-login.php` or `%2F`, can arrive in a request, and leads to no page.
    if (findPathnameProblem(pathname) !== undefined) {
      return undefined;
    }
    const route = read(pathname, normalize);
    // A canonical path longer than the limit can't be passed to localize(), though a shorter translation led to it.
    if (route === undefined || isPathnameTooLong(route.pathname)) {
      return undefined;
    }

    // A path no URL leads to, such as `/pt/en/sobre` or, with `when-ambiguous`, `/en/sobre`, is not a page: its
    // canonical URL would open another page, would be too long, or localize() would read its leading locale as a prefix.
    const { segments, hasTrailingSlash } = splitPathname(route.pathname);
    if (findPrefixLocale(segments[0], normalize) !== undefined) {
      return undefined;
    }
    const url = buildUrl({ canonical: segments, ...slashPolicy(hasTrailingSlash), locale: route.locale, normalize });
    const readBack = isPathnameTooLong(url) ? undefined : read(url, normalize);

    if (readBack?.locale !== route.locale) {
      return undefined;
    }
    // The read-back writes the table's words as a URL does, as reading a default-locale path does, so a canonical word
    // written percent-encoded, such as `/pt/%61`, comes back as `/a` in every locale.
    const canonical = splitPathname(readBack.pathname).segments;
    if (!isSameCanonical(canonical, segments, normalize)) {
      return undefined;
    }
    // That spelling can be longer than the path checked above, since `url.pathname` leaves characters such as `|` raw.
    const canonicalPathname = joinPathname(canonical, hasTrailingSlash);
    return isPathnameTooLong(canonicalPathname) ? undefined : { locale: route.locale, pathname: canonicalPathname };
  };

  /**
   * Builds the URL of canonical segments in `locale` and checks that it reads back as them: `problem` says why
   * `localize` refuses it, with what the URL would be read as.
   */
  const localizeCanonical = (
    canonical: readonly string[],
    hasTrailingSlash: boolean,
    locale: TLocale,
    normalize: Normalize,
  ):
    | { readonly url: string; readonly problem?: undefined }
    | { readonly url: string; readonly problem: "too-long" }
    | {
        readonly url: string;
        readonly problem: "clash";
        readonly readBack: CanonicalRoute<TLocale> | undefined;
      } => {
    const url = buildUrl({
      canonical,
      ...slashPolicy(hasTrailingSlash),
      locale,
      normalize,
    });

    if (isPathnameTooLong(url)) {
      return { url, problem: "too-long" };
    }
    // A page the table doesn't list can have the path of a translated one; a link to it would open that page instead.
    const readBack = parseWith(url, normalize);
    if (
      readBack?.locale !== locale ||
      !isSameCanonical(splitPathname(readBack.pathname).segments, canonical, normalize)
    ) {
      return { url, problem: "clash", readBack };
    }
    return { url };
  };

  const parse = (pathname: string): ParsedLocalePath<TLocale> | undefined => {
    const normalize = memoizeNormalize();
    const route = parseWith(pathname, normalize);

    if (route === undefined) {
      return undefined;
    }
    // One localize() per locale, sharing the normalized segments, so the cost grows with the number of locales only.
    const { segments, hasTrailingSlash } = splitPathname(route.pathname);
    const alternates = locales.flatMap((locale) => {
      const built = localizeCanonical(segments, hasTrailingSlash, locale, normalize);
      return built.problem === undefined ? [{ locale, pathname: built.url }] : [];
    });
    return { locale: route.locale, pathname: route.pathname, alternates };
  };

  const localize = (pathname: string, locale: TLocale): string => {
    validatePathname(pathname);
    const canonicalLocale = typeof locale === "string" ? findLocale(locale, true) : undefined;

    if (canonicalLocale === undefined) {
      throw new RangeError("[I18n] locale must be a supported string");
    }

    // Every path is canonical. One that starts with a locale, such as an English `/my/orders` when Burmese, `my`, is
    // configured, has no URL: every link to it would open that locale's page, as the table's own paths can't either.
    const normalize = memoizeNormalize();
    const { segments, hasTrailingSlash } = splitPathname(pathname);
    const prefixLocale = findPrefixLocale(segments[0], normalize);
    if (prefixLocale !== undefined) {
      throw new RangeError(
        `[I18n] ${formatReportedKey(pathname)} starts with the locale ${formatReportedKey(prefixLocale)}, so no URL ` +
          "leads to it. If it is a URL, pass parse(url).pathname instead; if it is a page, give it a path that doesn't " +
          "start with a locale",
      );
    }
    const canonical = segments;
    const built = localizeCanonical(canonical, hasTrailingSlash, canonicalLocale, normalize);

    if (built.problem === "too-long") {
      throw new RangeError(
        `[I18n] the path in ${formatReportedKey(canonicalLocale)} would be longer than 8,192 characters or 100 segments`,
      );
    }
    if (built.problem === "clash") {
      // The path may be a URL passed for a canonical path, or a canonical path whose URL is another page's, such as
      // parse().pathname for an English product `/products/novo` in Portuguese when `/products/new` is listed.
      const path = formatReportedKey(joinPathname(canonical, hasTrailingSlash));
      const { readBack } = built;
      const target =
        readBack === undefined
          ? `no page; its URL there, ${formatReportedKey(built.url)}, leads nowhere`
          : `${formatReportedKey(readBack.pathname)} in ${formatReportedKey(readBack.locale)}; its URL there, ` +
            `${formatReportedKey(built.url)}, is that page's`;
      throw new RangeError(
        `[I18n] ${path} in ${formatReportedKey(canonicalLocale)} would be read as ${target}. If ${path} is a URL, pass ` +
          `parse(url).pathname instead; if it is a canonical path, give one of the pages other words or list ${path} ` +
          "in pathnames, and build a request's links from parse(url).alternates, which leaves such a locale out",
      );
    }

    return built.url;
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
