/**
 * The language tags the package's text tracking stays off for: every tag a
 * reader writes for text in a script that joins its letters or hangs them
 * from a headstroke, as CLDR's likely subtags record them. The evidence for
 * each script is in `src/typography.rules.css`.
 *
 * The data is CLDR's, read through the ICU that Node.js ships rather than a
 * dependency: `Intl.Locale.prototype.maximize()` is CLDR's "Add Likely
 * Subtags" over its likely-subtags table and its language aliases. ICU does
 * not list the table's keys, so every two- and three-letter language subtag
 * is probed; one CLDR has no data for maximizes to no script. The result
 * changes only when the CLDR that Node.js carries does, which `CLDR_VERSION`
 * records.
 */

/* The scripts that join their letters (Arabic, Syriac, N'Ko, Mongolian,
   Adlam, Hanifi Rohingya) or hang them from a headstroke (Devanagari,
   Bengali, Gurmukhi). Tibetan was rendered and left out: on 2026-11-22, at
   0.05em on 160px text in Microsoft Himalaya, Chromium, Firefox, and WebKit
   only widened the gaps between letters that already stand apart, and kept
   each stack and vowel sign whole. */
export const UNTRACKED_SCRIPTS = ["Arab", "Syrc", "Nkoo", "Mong", "Adlm", "Rohg", "Deva", "Beng", "Guru"];

/* Tags the hand-written list named that CLDR's likely subtags cannot show,
   since each resolves to the region its language alone does: Santali in
   Devanagari. CLDR records the pair in its language data, which Node.js does
   not ship. `tests/integration/source.test.ts` fails once CLDR shows one. */
export const CARRIED_LANGUAGES = ["sat-Deva"];

export const CLDR_VERSION = process.versions.cldr;
export const ICU_VERSION = process.versions.icu;

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

const maximize = (tag) => {
  try {
    return new Intl.Locale(tag).maximize();
  } catch {
    return null;
  }
};

const languageSubtags = () => {
  const subtags = [];
  for (const first of LETTERS) {
    for (const second of LETTERS) {
      subtags.push(first + second);
      for (const third of LETTERS) {
        subtags.push(first + second + third);
      }
    }
  }
  return subtags;
};

const regionSubtags = () =>
  [...LETTERS].flatMap((first) => [...LETTERS].map((second) => `${first}${second}`.toUpperCase()));

/**
 * The tags CLDR's likely subtags put in `UNTRACKED_SCRIPTS`, sorted, each one
 * a `:lang()` argument.
 *
 * - A language whose likely script is one of `UNTRACKED_SCRIPTS`, by its own
 *   code and by every alias CLDR resolves to it (`gom` for Konkani, `ara` for
 *   Arabic): `:lang()` compares the tag as written, never its canonical form.
 * - A language usually written in another script, with the script subtag,
 *   where CLDR's likely subtags name the pair: either `xx-Scrp` resolves to a
 *   region other than `xx` alone does (`ky-Arab` to China, `ky` to
 *   Kyrgyzstan), or `und-Scrp-RR` resolves to `xx` (`und-Arab-NG` to Hausa).
 *   Also `und-Scrp`, text whose language is not known.
 * @returns {string[]} The tags, sorted.
 */
export const cldrLanguages = () => {
  const scripts = new Set(UNTRACKED_SCRIPTS);
  const tags = new Set();
  const known = new Map();

  for (const subtag of languageSubtags()) {
    const likely = maximize(subtag);
    if (likely?.script) {
      known.set(subtag, likely);
    }
  }
  known.set("und", maximize("und"));

  const isUntracked = (language) => scripts.has(maximize(language)?.script);

  for (const [subtag, likely] of known) {
    if (scripts.has(likely.script)) {
      tags.add(subtag);
      continue;
    }
    for (const script of scripts) {
      const pair = maximize(`${subtag}-${script}`);
      if (pair && pair.region !== likely.region) {
        tags.add(`${subtag}-${script}`);
      }
    }
  }

  for (const script of scripts) {
    for (const region of regionSubtags()) {
      const { language } = maximize(`und-${script}-${region}`) ?? {};
      if (language && language !== "und" && !isUntracked(language)) {
        tags.add(`${language}-${script}`);
      }
    }
  }

  return [...tags].toSorted();
};

/**
 * Every tag the package's tracking stays off for: CLDR's and the carried ones.
 * @returns {string[]} The tags, sorted.
 */
export const untrackedLanguages = () => [...new Set([...cldrLanguages(), ...CARRIED_LANGUAGES])].toSorted();
