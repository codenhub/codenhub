import type { LocaleDirection } from "../core/types";

/**
 * Fixed lists rather than `Intl.Locale.prototype.getTextInfo()`, which not every supported engine provides, so the
 * default direction does not depend on that method. The likely script comes from `Intl.Locale.prototype.maximize()`,
 * which every supported engine has, though its likely-subtag data can differ between engine versions for rare tags.
 * Historic scripts, such as `phnx` (Phoenician), are listed too, since they cost nothing to check.
 */
const RTL_SCRIPTS = new Set([
  "adlm",
  "arab",
  "armi",
  "avst",
  "chrs",
  "cprt",
  "elym",
  "gara",
  "hatr",
  "hebr",
  "hung",
  "khar",
  "lydi",
  "mand",
  "mani",
  "mend",
  "merc",
  "mero",
  "narb",
  "nbat",
  "nkoo",
  "orkh",
  "ougr",
  "palm",
  "phli",
  "phlp",
  "phnx",
  "prti",
  "rohg",
  "samr",
  "sarb",
  "sidt",
  "sogd",
  "sogo",
  "syrc",
  "thaa",
  "yezi",
]);
/** Read only when `Intl.Locale` gives no likely script, such as for a tag it rejects or an engine without its data. */
const RTL_LANGUAGES = new Set([
  "acm",
  "aeb",
  "apc",
  "ar",
  "arc",
  "ars",
  "ary",
  "arz",
  "bal",
  "ckb",
  "dv",
  "fa",
  "glk",
  "he",
  "iw",
  "ji",
  "ks",
  "lad",
  "lrc",
  "mzn",
  "nqo",
  "pnb",
  "prs",
  "ps",
  "rhg",
  "sd",
  "sdh",
  "skr",
  "syr",
  "ug",
  "ur",
  "yi",
]);
const SCRIPT_SUBTAG_PATTERN = /^[a-z]{4}$/;

/** The likely script of a locale, such as `arab` for `pa-PK`, or undefined for a tag `Intl.Locale` rejects. */
const getLikelyScript = (locale: string): string | undefined => {
  try {
    return new Intl.Locale(locale).maximize().script?.toLowerCase();
  } catch {
    return undefined;
  }
};

/**
 * Resolves a locale's direction from its script subtag, else its likely script, such as Arabic for `pa-PK`, else its
 * language.
 *
 * @param locale - Configured locale identifier.
 * @returns `rtl` for a right-to-left script or language, otherwise `ltr`.
 * @internal
 */
export function getDefaultLocaleDirection(locale: string): LocaleDirection {
  const [language = "", ...subtags] = locale.toLowerCase().split("-");
  // A script subtag precedes any extension or private-use singleton, whose values, such as `u-nu-arab`, are not scripts.
  const singletonIndex = subtags.findIndex((subtag) => subtag.length === 1);
  const baseSubtags = singletonIndex === -1 ? subtags : subtags.slice(0, singletonIndex);
  const script = baseSubtags.find((subtag) => SCRIPT_SUBTAG_PATTERN.test(subtag)) ?? getLikelyScript(locale);

  if (script !== undefined) {
    return RTL_SCRIPTS.has(script) ? "rtl" : "ltr";
  }

  return RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
}
