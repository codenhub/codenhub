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
 * a translation such as `</xmp><img onerror=...>` into markup. Their own attributes are still translated, since the
 * serializer escapes an attribute value outside them.
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
  /** The active locale, which text is marked apart from with `lang` where neither the element nor an ancestor declares a language. */
  readonly locale: string;
  /**
   * Leaves whose text other code replaced while it showed a translation, which the pass writes over, so their fallback
   * stays the text from before the replacement.
   */
  readonly replacedTexts?: ReadonlySet<Element> | undefined;
  readonly translate: (key: string) => FoundText | undefined;
}

type Translate = TranslateRootOptions["translate"];

/** @internal */
export interface DomTranslator {
  /**
   * Translates safe leaves and attributes at and below the root, restoring the fallback where a key was removed, and
   * marks an element whose translations come from a locale other than the language it has without the mark, its own
   * `lang` or the nearest ancestor's, with that locale's `lang`. An element inside a custom element is skipped silently.
   * A message that needs values or an invalid key shows the fallback, with a warning. A text or attribute whose translation throws, such as from a throwing `onMissingKey`,
   * shows the fallback too; every other key is still translated, and the first error is thrown after the pass.
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

/**
 * The language declared by the nearest ancestor's `lang`, through the hosts of shadow roots, or `undefined` when none
 * declares one. An empty `lang` counts as none.
 */
const readInheritedLang = (element: Element): string | undefined => {
  let scope: Element | null = element.parentElement;
  let node: Node = element;

  for (;;) {
    const declaring = scope?.closest("[lang]");
    if (declaring !== null && declaring !== undefined) {
      const lang = declaring.getAttribute(LANG_ATTRIBUTE);
      return lang === null || lang === "" ? undefined : lang;
    }
    // A shadow root's text inherits its host's language.
    const host = (node.getRootNode() as Partial<ShadowRoot>).host;
    if (host === undefined || host === null) {
      return undefined;
    }
    scope = host;
    node = host;
  }
};

// Language tags are case-insensitive, so `pt-br` names the same language as `pt-BR`.
const isSameLanguage = (left: string, right: string): boolean => left.toLowerCase() === right.toLowerCase();

const collectElements = (root: ParentNode, isTracked: (element: Element) => boolean): Element[] => {
  const descendants = Array.from(root.querySelectorAll(TRANSLATION_KEY_SELECTOR));
  return isElementNode(root) && (root.matches(TRANSLATION_KEY_SELECTOR) || isTracked(root))
    ? [root, ...descendants]
    : descendants;
};

// Kept per element rather than per binding: a binding started after another's disconnect() would otherwise take the
// first binding's translations for the page's original text.
const fallbackTexts = new WeakMap<Element, string>();
const translatedTexts = new WeakMap<Element, string>();
const attributeStates = new WeakMap<Element, Map<string, AttributeState>>();
const langStates = new WeakMap<Element, LangState>();
/** Elements whose `lang` other code changed after the binding wrote it, so the binding never writes it again. */
const appOwnedLangs = new WeakSet<Element>();

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

  /**
   * The translation to show for a key as the attribute holds it, or `undefined` for a miss, a message that needs values,
   * or a key that could never be in a dictionary, which shows the fallback just as a miss does.
   */
  const readTranslation = (
    element: Element,
    keyAttribute: string,
    rawKey: string,
    translate: Translate,
  ): FoundText | undefined => {
    // The same rule as `t()`, so a key is invalid exactly when it could never be in a dictionary.
    const key = normalizeTranslationKey(rawKey);
    if (key === undefined) {
      warnInvalidKey(element, keyAttribute, rawKey);
      return undefined;
    }
    const found = translate(key);
    if (found?.needsValues === true) {
      warnNeedsValues(element, keyAttribute, key);
      return undefined;
    }
    return found;
  };

  /** The text to show on a miss. Text other code set since the last pass replaces it, unless the pass writes over it. */
  const getFallbackText = (element: Element, isReplaced: boolean): string => {
    const fallbackText = fallbackTexts.get(element);
    const currentText = element.textContent ?? "";
    const translatedText = translatedTexts.get(element);

    if (fallbackText === undefined || (!isReplaced && translatedText !== undefined && currentText !== translatedText)) {
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

    const show = (nextValue: string | null): void => {
      if (nextValue === null) {
        element.removeAttribute(attribute);
      } else if (currentValue !== nextValue) {
        element.setAttribute(attribute, nextValue);
      }
      state.translated = nextValue;
    };
    let found: FoundText | undefined;
    try {
      found = readTranslation(element, keyAttribute, rawKey, translate);
    } catch (error) {
      // A throwing missing-key handler is still a miss, so the value shown for an earlier key or locale goes too.
      show(state.fallback);
      throw error;
    }
    show(found?.text ?? state.fallback);
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
   * own value. Once other code changes a `lang` the binding wrote, that code owns it, and the binding leaves it alone.
   */
  const applyLang = (element: Element, lang: string | undefined): void => {
    if (appOwnedLangs.has(element)) {
      return;
    }

    const state = langStates.get(element);
    const currentLang = element.getAttribute(LANG_ATTRIBUTE);

    if (state !== undefined && currentLang !== state.written) {
      appOwnedLangs.add(element);
      langStates.delete(element);
      return;
    }

    if (lang === undefined) {
      if (state !== undefined) {
        if (state.original === null) {
          element.removeAttribute(LANG_ATTRIBUTE);
        } else {
          element.setAttribute(LANG_ATTRIBUTE, state.original);
        }
        langStates.delete(element);
      }
      return;
    }

    if (state === undefined) {
      langStates.set(element, { original: currentLang, written: lang });
    } else {
      state.written = lang;
    }
    if (currentLang !== lang) {
      element.setAttribute(LANG_ATTRIBUTE, lang);
    }
  };

  const isTracked = (element: Element): boolean =>
    translatedTexts.has(element) || (attributeStates.get(element)?.size ?? 0) > 0 || langStates.has(element);

  /** Translates the text, returning the locale of the translation shown, or `undefined` when none is. */
  const translateText = (
    element: Element,
    rawKey: string,
    translate: Translate,
    isReplaced: boolean,
  ): string | undefined => {
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

    const fallbackText = getFallbackText(element, isReplaced);
    const show = (nextText: string): void => {
      if (element.textContent !== nextText) {
        element.textContent = nextText;
      }
      translatedTexts.set(element, nextText);
    };
    let found: FoundText | undefined;
    try {
      found = readTranslation(element, TRANSLATION_ATTRIBUTE, rawKey, translate);
    } catch (error) {
      // A throwing missing-key handler is still a miss, so the text shown for an earlier key or locale goes too.
      show(fallbackText);
      throw error;
    }
    show(found?.text ?? fallbackText);
    return found?.locale;
  };

  const translateElement = (
    element: Element,
    { locale, translate, replacedTexts }: Omit<TranslateRootOptions, "root" | "boundary">,
  ): void => {
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
        shownLocales[index] = translateText(element, rawKey, translate, replacedTexts?.has(element) === true) ?? null;
      } else {
        restoreText(element);
      }
    };
    const translateOwnAttribute = (attribute: string): void => {
      const rawAttributeKey = element.getAttribute(`${TRANSLATION_ATTRIBUTE}-${attribute}`);

      if (rawAttributeKey !== null) {
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
    // translation shown comes from one locale, and that locale is not the language the element has without the mark:
    // its own `lang`, or else the nearest ancestor's, or else the active locale. An element with children but no
    // translated text, such as a `<div>` with a translated `title`, is left alone, since `lang` would mislabel its
    // children too.
    const markLanguage = (): void => {
      const [first] = shownLocales;
      const isMarkable = hasTextKey || element.childNodes.length === 0;
      if (
        !isMarkable ||
        typeof first !== "string" ||
        !shownLocales.every((shown) => shown === first) ||
        appOwnedLangs.has(element)
      ) {
        applyLang(element, undefined);
        return;
      }
      const state = langStates.get(element);
      // A `lang` the binding wrote is not the element's; a `lang` it copied as a clone of a marked element is.
      const ownLang = state === undefined ? element.getAttribute(LANG_ATTRIBUTE) : state.original;
      const unmarkedLang = (ownLang === null || ownLang === "" ? undefined : ownLang) ?? readInheritedLang(element);
      applyLang(element, isSameLanguage(first, unmarkedLang ?? locale) ? undefined : first);
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
    translateRoot({ root, boundary = root, ...pass }) {
      runEach(collectElements(root, isTracked), (element) => {
        if (!isInsideCustomElement(element, boundary)) {
          translateElement(element, pass);
        }
      });
    },
  };
}
