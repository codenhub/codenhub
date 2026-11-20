import type { FoundText } from "../core/internals";
import { normalizeTranslationKey } from "../core/string-validation";
import { formatReportedKey } from "../locale/dictionary";

const TRANSLATION_ATTRIBUTE = "data-i18n";
const LANG_ATTRIBUTE = "lang";
// Keys whose message needs values are warned about once each, among the most recent.
const MAX_NEEDS_VALUES_WARNINGS = 1_000;
const ELEMENT_NODE = 1;
/**
 * Elements whose text can run, stay hidden, or be read as HTML. The HTML serializer writes the text of `xmp`, `iframe`,
 * `noembed`, `noframes`, and `plaintext` unescaped, so a page saved through `innerHTML`, as a prerender does, would turn
 * a translation such as `</xmp><img onerror=...>` into markup. Their attributes are still translated, since the
 * serializer escapes every attribute value.
 */
const BLOCKED_ELEMENT_NAMES = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
  "script",
  "style",
  "template",
  "xmp",
]);

/**
 * Whether the element's `title` names the style sheet set it belongs to rather than text people read, so translating
 * it could switch the preferred style sheet off. A `<link>` that is not a style sheet, such as a feed, has a readable
 * title.
 */
const namesStyleSheetSet = (element: Element): boolean =>
  element.localName === "style" ||
  (element.localName === "link" &&
    (element.getAttribute("rel") ?? "")
      .toLowerCase()
      .split(/[\t\n\f\r ]+/u)
      .includes("stylesheet"));

/**
 * Attributes that `data-i18n-<attribute>` may translate: text shown to people or assistive technology. URLs, styles,
 * and event handlers stay out, so a translation can never set them.
 */
const TRANSLATED_ATTRIBUTES = [
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "label",
  "placeholder",
  "title",
] as const;

/** Every attribute that carries a translation key. @internal */
export const TRANSLATION_KEY_ATTRIBUTES: readonly string[] = [
  TRANSLATION_ATTRIBUTE,
  ...TRANSLATED_ATTRIBUTES.map((attribute) => `${TRANSLATION_ATTRIBUTE}-${attribute}`),
];

const TRANSLATION_KEY_SELECTOR = TRANSLATION_KEY_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(",");

interface AttributeState {
  fallback: string | null;
  translated: string | null;
}

/** The `lang` a binding wrote to an element, and the value the element had before. */
interface LangState {
  readonly original: string | null;
  written: string;
}

interface DomTranslatorOptions {
  readonly isSilent: boolean;
}

interface TranslateRootOptions {
  readonly root: ParentNode;
  readonly boundary?: ParentNode | undefined;
  /** The active locale, which text from another dictionary is marked apart from with `lang`. */
  readonly locale: string;
  readonly translate: (key: string) => FoundText | undefined;
}

type Translate = TranslateRootOptions["translate"];

/** @internal */
export interface DomTranslator {
  /**
   * Translates safe leaves and attributes at and below the root, restoring the fallback where a key was removed, and
   * marks an element whose translations come from another locale's dictionary with that locale's `lang`. A message
   * that needs values keeps the fallback, with a warning. A text or attribute whose translation throws, such as from a
   * throwing `onMissingKey`, keeps its value; every other key is still translated, and the first error is thrown after
   * the pass.
   */
  translateRoot(options: TranslateRootOptions): void;
}

/**
 * Runs `run` for every item, even after one throws, then throws the first error, so one failure doesn't leave the rest
 * of a page in another language.
 *
 * @internal
 */
export const runEach = <T>(items: Iterable<T>, run: (item: T) => void): void => {
  let failure: { readonly error: unknown } | undefined;
  for (const item of items) {
    try {
      run(item);
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure !== undefined) {
    throw failure.error;
  }
};

const isElementNode = (node: ParentNode): node is Element => node.nodeType === ELEMENT_NODE;

const isInsideCustomElement = (element: Element, root: ParentNode): boolean => {
  let currentElement: Element | null = element;

  while (currentElement !== null && currentElement !== root) {
    // A customized built-in element, such as `<button is="x-button">`, is a component too.
    if (currentElement.tagName.includes("-") || currentElement.hasAttribute("is")) {
      return true;
    }

    currentElement = currentElement.parentElement;
  }

  return false;
};

const collectElements = (root: ParentNode, isTracked: (element: Element) => boolean): Element[] => {
  const descendants = Array.from(root.querySelectorAll(TRANSLATION_KEY_SELECTOR));
  return isElementNode(root) && (root.matches(TRANSLATION_KEY_SELECTOR) || isTracked(root))
    ? [root, ...descendants]
    : descendants;
};

// The same rule as `t()`, so an element is skipped exactly when its key could never be in a dictionary.
const isValidDomKey = (rawKey: string): boolean => normalizeTranslationKey(rawKey) !== undefined;

// Kept per element rather than per binding: a binding started after another's disconnect() would otherwise take the
// first binding's translations for the page's original text.
const fallbackTexts = new WeakMap<Element, string>();
const translatedTexts = new WeakMap<Element, string>();
const attributeStates = new WeakMap<Element, Map<string, AttributeState>>();
const langStates = new WeakMap<Element, LangState>();

/**
 * Whether the element shows the text a binding last wrote to it. Another binding whose root overlaps reads such a write
 * as its own rather than a change to translate again, so two bindings never answer each other's writes forever.
 *
 * @internal
 */
export const showsTranslatedText = (element: Element): boolean => translatedTexts.get(element) === element.textContent;

/** Creates the DOM translator of one browser binding. @internal */
export function createDomTranslator(options: DomTranslatorOptions): DomTranslator {
  // The element is passed too, so a browser console can point to it, and the message goes through `%s`, so a key such
  // as `%o` is not read as a format.
  const warnInvalidKey = (element: Element, keyAttribute: string, rawKey: string): void => {
    if (!options.isSilent) {
      console.warn(
        "%s",
        `[I18n] Skipping translation because ${keyAttribute} contains an invalid key, ${formatReportedKey(rawKey)}.`,
        element,
      );
    }
  };

  const warnedNeedsValues = new Set<string>();
  const warnNeedsValues = (element: Element, keyAttribute: string, key: string): void => {
    if (options.isSilent || warnedNeedsValues.has(key)) {
      return;
    }
    if (warnedNeedsValues.size >= MAX_NEEDS_VALUES_WARNINGS) {
      warnedNeedsValues.delete(warnedNeedsValues.values().next().value!);
    }
    warnedNeedsValues.add(key);
    console.warn(
      "%s",
      `[I18n] Skipping translation because ${keyAttribute} names a message that needs values, ` +
        `${formatReportedKey(key)}; render it with t().`,
      element,
    );
  };

  /** The translation to show for a key, or `undefined` for a miss or a message that needs values. */
  const readTranslation = (
    element: Element,
    keyAttribute: string,
    key: string,
    translate: Translate,
  ): FoundText | undefined => {
    const found = translate(key);
    if (found?.needsValues === true) {
      warnNeedsValues(element, keyAttribute, key);
      return undefined;
    }
    return found;
  };

  const getFallbackText = (element: Element): string => {
    const fallbackText = fallbackTexts.get(element);
    const currentText = element.textContent ?? "";
    const translatedText = translatedTexts.get(element);

    if (fallbackText === undefined || (translatedText !== undefined && currentText !== translatedText)) {
      fallbackTexts.set(element, currentText);
      return currentText;
    }

    return fallbackText;
  };

  const translateAttribute = (
    element: Element,
    attribute: string,
    rawKey: string,
    translate: Translate,
  ): string | undefined => {
    const keyAttribute = `${TRANSLATION_ATTRIBUTE}-${attribute}`;
    if (!isValidDomKey(rawKey)) {
      warnInvalidKey(element, keyAttribute, rawKey);
      return undefined;
    }

    let states = attributeStates.get(element);

    if (states === undefined) {
      states = new Map();
      attributeStates.set(element, states);
    }

    const currentValue = element.getAttribute(attribute);
    let state = states.get(attribute);

    if (state === undefined || currentValue !== state.translated) {
      state = { fallback: currentValue, translated: currentValue };
      states.set(attribute, state);
    }

    const found = readTranslation(element, keyAttribute, rawKey.trim(), translate);
    const nextValue = found?.text ?? state.fallback;

    if (nextValue === null) {
      element.removeAttribute(attribute);
    } else if (currentValue !== nextValue) {
      element.setAttribute(attribute, nextValue);
    }
    state.translated = nextValue;
    return found?.locale;
  };

  /** Restores the fallback of an attribute whose key was removed, unless the value changed since translation. */
  const restoreAttribute = (element: Element, attribute: string): void => {
    const states = attributeStates.get(element);
    const state = states?.get(attribute);

    if (states === undefined || state === undefined) {
      return;
    }

    if (element.getAttribute(attribute) === state.translated) {
      if (state.fallback === null) {
        element.removeAttribute(attribute);
      } else {
        element.setAttribute(attribute, state.fallback);
      }
    }
    states.delete(attribute);
  };

  /**
   * Restores the fallback text of an element whose key was removed, unless the text changed since translation or the
   * element is no longer a leaf, since setting its text would remove the children the application added.
   */
  const restoreText = (element: Element): void => {
    const fallbackText = fallbackTexts.get(element);
    const translatedText = translatedTexts.get(element);

    if (
      fallbackText !== undefined &&
      translatedText !== undefined &&
      element.childElementCount === 0 &&
      element.textContent === translatedText
    ) {
      element.textContent = fallbackText;
    }
    fallbackTexts.delete(element);
    translatedTexts.delete(element);
  };

  /**
   * Writes `lang` for translations in another locale than the active one, or with `undefined`, restores the element's
   * own value, unless other code changed it since.
   */
  const applyLang = (element: Element, lang: string | undefined): void => {
    const state = langStates.get(element);
    const currentLang = element.getAttribute(LANG_ATTRIBUTE);

    if (lang === undefined) {
      if (state !== undefined && currentLang === state.written) {
        if (state.original === null) {
          element.removeAttribute(LANG_ATTRIBUTE);
        } else {
          element.setAttribute(LANG_ATTRIBUTE, state.original);
        }
      }
      langStates.delete(element);
      return;
    }

    if (state === undefined) {
      langStates.set(element, { original: currentLang, written: lang });
    } else if (currentLang === state.written) {
      state.written = lang;
    } else {
      // Other code set `lang` over the one written, so it now owns the attribute.
      langStates.delete(element);
      return;
    }
    if (currentLang !== lang) {
      element.setAttribute(LANG_ATTRIBUTE, lang);
    }
  };

  const isTracked = (element: Element): boolean =>
    translatedTexts.has(element) || (attributeStates.get(element)?.size ?? 0) > 0 || langStates.has(element);

  /** Translates the text, returning the locale of the translation shown, or `undefined` when none is. */
  const translateText = (element: Element, rawKey: string, translate: Translate): string | undefined => {
    if (element.childElementCount > 0) {
      // The application owns its content now, so a translation recorded for an earlier locale no longer describes it.
      fallbackTexts.delete(element);
      translatedTexts.delete(element);
      if (!options.isSilent) {
        console.warn(
          "%s",
          `[I18n] Skipping translation on <${element.tagName.toLowerCase()}> because translated elements must be leaves; ` +
            `its ${TRANSLATION_ATTRIBUTE} is ${formatReportedKey(rawKey)}.`,
          element,
        );
      }
      return undefined;
    }

    if (!isValidDomKey(rawKey)) {
      warnInvalidKey(element, TRANSLATION_ATTRIBUTE, rawKey);
      return undefined;
    }

    const fallbackText = getFallbackText(element);
    const found = readTranslation(element, TRANSLATION_ATTRIBUTE, rawKey.trim(), translate);
    const nextText = found?.text ?? fallbackText;

    if (element.textContent !== nextText) {
      element.textContent = nextText;
    }
    translatedTexts.set(element, nextText);
    return found?.locale;
  };

  const translateElement = (element: Element, locale: string, translate: Translate): void => {
    // The locale of each translation shown, or `null` where the element's own value is shown, of unknown language.
    const shownLocales: (string | null)[] = [];
    let hasTextKey = false;
    const translateOwnText = (): void => {
      const rawKey = element.getAttribute(TRANSLATION_ATTRIBUTE);

      // Only the text is blocked: the serializer escapes every attribute, so an `<iframe>`'s `title` is translated.
      if (rawKey !== null && BLOCKED_ELEMENT_NAMES.has(element.localName)) {
        if (!options.isSilent) {
          console.warn(
            "%s",
            `[I18n] Skipping translation on <${element.tagName.toLowerCase()}> because the element can run, hide, or ` +
              `reparse its text as HTML; its ${TRANSLATION_ATTRIBUTE} is ${formatReportedKey(rawKey)}.`,
            element,
          );
        }
      } else if (rawKey !== null) {
        hasTextKey = true;
        // Counted as unknown before translating, so a key whose missing-key handling throws keeps the element unmarked.
        const index = shownLocales.push(null) - 1;
        shownLocales[index] = translateText(element, rawKey, translate) ?? null;
      } else {
        restoreText(element);
      }
    };
    const translateOwnAttribute = (attribute: string): void => {
      const rawAttributeKey = element.getAttribute(`${TRANSLATION_ATTRIBUTE}-${attribute}`);

      if (rawAttributeKey !== null && attribute === "title" && namesStyleSheetSet(element)) {
        if (!options.isSilent) {
          console.warn(
            "%s",
            `[I18n] Skipping translation of the title of <${element.localName}> because it names a style sheet set; ` +
              `its ${TRANSLATION_ATTRIBUTE}-title is ${formatReportedKey(rawAttributeKey)}.`,
            element,
          );
        }
      } else if (rawAttributeKey !== null) {
        const index = shownLocales.push(null) - 1;
        const shown = translateAttribute(element, attribute, rawAttributeKey, translate);
        // An attribute neither translated nor in the HTML shows no text, so it says nothing about the language.
        if (shown === undefined && !element.hasAttribute(attribute)) {
          shownLocales.splice(index, 1);
        } else {
          shownLocales[index] = shown ?? null;
        }
      } else {
        restoreAttribute(element, attribute);
      }
    };

    // `lang` names the language of the element's text and attributes alike, so it is written only when every
    // translation shown comes from one other locale's dictionary. An element with children but no translated text,
    // such as a `<div>` with a translated `title`, is left alone, since `lang` would mislabel its children too.
    const markLanguage = (): void => {
      const [first] = shownLocales;
      const isMarkable = hasTextKey || element.childNodes.length === 0;
      applyLang(
        element,
        isMarkable && typeof first === "string" && first !== locale && shownLocales.every((shown) => shown === first)
          ? first
          : undefined,
      );
    };

    // The text and each attribute are translated even when another of the element's keys throws.
    runEach(
      [
        translateOwnText,
        ...TRANSLATED_ATTRIBUTES.map((attribute) => () => translateOwnAttribute(attribute)),
        markLanguage,
      ],
      (step) => step(),
    );
  };

  return {
    translateRoot({ root, boundary = root, locale, translate }) {
      runEach(collectElements(root, isTracked), (element) => {
        if (!isInsideCustomElement(element, boundary)) {
          translateElement(element, locale, translate);
        }
      });
    },
  };
}
