/**
 * The locales a package may translate into, as `docs/specs/packages-translations.md`
 * lists them under "Languages". Supporting another locale means adding it here
 * in the change that adds that support.
 */
export const TRANSLATION_LOCALES = ["pt-BR", "es"] as const;

/** A locale a package may translate into. */
export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number];

// A BCP 47 language of two letters, optionally with a two-letter region in either
// case. It is how a `docs/` folder or a `README.<x>.md` is recognized as a
// translation, listed or not, so that an unlisted locale is reported rather than
// published as English. Three-letter languages are not recognized: `docs/api/`
// and `docs/css/` are ordinary documentation areas.
const LOCALE_SHAPE = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;
const TRANSLATED_README = /^README\.(?<locale>[^./]+)\.md$/;

/** A package file recognized as a translation by its path. */
export interface TranslationPath {
  /** Locale segment as written, listed or not. */
  locale: string;
  /** Package-relative path of the English counterpart at the mirrored path. */
  englishPath: string;
  /** Whether the file translates the README or a `docs/` file. */
  kind: "document" | "readme";
}

/**
 * Reports whether a path segment is shaped like a locale.
 * @param segment Folder name or README infix.
 * @returns True for a two-letter language with an optional two-letter region.
 */
export function isLocaleShaped(segment: string): boolean {
  return LOCALE_SHAPE.test(segment);
}

/**
 * Reports whether a locale is one a package may translate into.
 * @param locale Locale as written.
 * @returns True only for an exact match with a listed locale, region case included.
 */
export function isTranslationLocale(locale: string): locale is TranslationLocale {
  return (TRANSLATION_LOCALES as readonly string[]).includes(locale);
}

/**
 * Recognizes a translation by its package-relative path.
 *
 * `README.<locale>.md` translates `README.md`, and any file under
 * `docs/<locale>/` translates the file at the mirrored path under `docs/`.
 * @param packagePath Package-relative POSIX path.
 * @returns The locale and English counterpart, or `undefined` for a file that is not a translation.
 */
export function parseTranslationPath(packagePath: string): TranslationPath | undefined {
  const readme = TRANSLATED_README.exec(packagePath);
  if (readme?.groups !== undefined) {
    const locale = readme.groups.locale as string;
    return isLocaleShaped(locale) ? { englishPath: "README.md", kind: "readme", locale } : undefined;
  }
  if (!packagePath.startsWith("docs/")) {
    return undefined;
  }
  const docsRelative = splitTranslatedDocsPath(packagePath.slice("docs/".length));
  return docsRelative === undefined
    ? undefined
    : { englishPath: `docs/${docsRelative.relativePath}`, kind: "document", locale: docsRelative.locale };
}

/**
 * Splits a `docs/`-relative path into its locale area and the English path it mirrors.
 * @param relativePath Path relative to the package `docs/` directory, such as `pt-BR/guides/setup.md`.
 * @returns The locale and the `docs/`-relative English path, or `undefined` outside a locale area.
 */
export function splitTranslatedDocsPath(relativePath: string): { locale: string; relativePath: string } | undefined {
  const separator = relativePath.indexOf("/");
  if (separator === -1) {
    return undefined;
  }
  const locale = relativePath.slice(0, separator);
  const rest = relativePath.slice(separator + 1);
  return isLocaleShaped(locale) && rest !== "" ? { locale, relativePath: rest } : undefined;
}

/**
 * The package-relative path a translation of an English file would have.
 * @param englishPath Package-relative path of `README.md` or a `docs/` file.
 * @param locale Locale of the translation.
 * @returns The mirrored translation path, or `undefined` for a file that is not translated.
 */
export function translatedPathOf(englishPath: string, locale: string): string | undefined {
  if (englishPath === "README.md") {
    return `README.${locale}.md`;
  }
  if (!englishPath.startsWith("docs/") || parseTranslationPath(englishPath) !== undefined) {
    return undefined;
  }
  return `docs/${locale}/${englishPath.slice("docs/".length)}`;
}
