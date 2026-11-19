import { normalizeTranslationKey } from "../core/string-validation";
import { formatReportedKey } from "../locale/dictionary";

const TRANSLATION_ATTRIBUTE = "data-i18n";
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

interface DomTranslatorOptions {
  readonly isSilent: boolean;
}

interface TranslateRootOptions {
  readonly root: ParentNode;
  readonly boundary?: ParentNode | undefined;
  readonly translate: (key: string) => string | undefined;
}

/** @internal */
export interface DomTranslator {
  /**
   * Translates safe leaves and attributes at and below the root, restoring the fallback where a key was removed. A
   * text or attribute whose translation throws, such as from a throwing `onMissingKey`, keeps its value; every other
   * key is still translated, and the first error is thrown after the pass.
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
    translate: (key: string) => string | undefined,
  ): void => {
    if (!isValidDomKey(rawKey)) {
      warnInvalidKey(element, `${TRANSLATION_ATTRIBUTE}-${attribute}`, rawKey);
      return;
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

    const nextValue = translate(rawKey.trim()) ?? state.fallback;

    if (nextValue === null) {
      element.removeAttribute(attribute);
    } else if (currentValue !== nextValue) {
      element.setAttribute(attribute, nextValue);
    }
    state.translated = nextValue;
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

  const isTracked = (element: Element): boolean =>
    translatedTexts.has(element) || (attributeStates.get(element)?.size ?? 0) > 0;

  const translateText = (element: Element, rawKey: string, translate: (key: string) => string | undefined): void => {
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
      return;
    }

    if (!isValidDomKey(rawKey)) {
      warnInvalidKey(element, TRANSLATION_ATTRIBUTE, rawKey);
      return;
    }

    const fallbackText = getFallbackText(element);
    const nextText = translate(rawKey.trim()) ?? fallbackText;

    if (element.textContent !== nextText) {
      element.textContent = nextText;
    }
    translatedTexts.set(element, nextText);
  };

  const translateElement = (element: Element, translate: (key: string) => string | undefined): void => {
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
        translateText(element, rawKey, translate);
      } else {
        restoreText(element);
      }
    };
    const translateOwnAttribute = (attribute: string): void => {
      const rawAttributeKey = element.getAttribute(`${TRANSLATION_ATTRIBUTE}-${attribute}`);

      if (rawAttributeKey !== null) {
        translateAttribute(element, attribute, rawAttributeKey, translate);
      } else {
        restoreAttribute(element, attribute);
      }
    };

    // The text and each attribute are translated even when another of the element's keys throws.
    runEach(
      [translateOwnText, ...TRANSLATED_ATTRIBUTES.map((attribute) => () => translateOwnAttribute(attribute))],
      (step) => step(),
    );
  };

  return {
    translateRoot({ root, boundary = root, translate }) {
      runEach(collectElements(root, isTracked), (element) => {
        if (!isInsideCustomElement(element, boundary)) {
          translateElement(element, translate);
        }
      });
    },
  };
}
