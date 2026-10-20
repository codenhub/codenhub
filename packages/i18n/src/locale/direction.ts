import type { LocaleDirection } from "../core/types";

/**
 * Fixed lists rather than `Intl.Locale.prototype.getTextInfo()`, which not every supported engine provides, so the
 * default direction is the same in every runtime.
 */
const RTL_SCRIPTS = new Set(["adlm", "arab", "hebr", "mand", "mend", "nkoo", "rohg", "samr", "syrc", "thaa", "yezi"]);
const RTL_LANGUAGES = new Set([
  "ar",
  "arc",
  "ckb",
  "dv",
  "fa",
  "he",
  "iw",
  "ks",
  "lrc",
  "mzn",
  "nqo",
  "pnb",
  "ps",
  "sd",
  "syr",
  "ug",
  "ur",
  "yi",
]);
const SCRIPT_SUBTAG_PATTERN = /^[a-z]{4}$/;

/**
 * Resolves a locale's direction from its script subtag, or from its language when it names no script.
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
  const script = baseSubtags.find((subtag) => SCRIPT_SUBTAG_PATTERN.test(subtag));

  if (script !== undefined) {
    return RTL_SCRIPTS.has(script) ? "rtl" : "ltr";
  }

  return RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
}
