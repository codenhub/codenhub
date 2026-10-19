import { hasAsciiControlCharacter } from "../core/string-validation";

const TRANSLATION_ATTRIBUTE = "data-i18n";
const ELEMENT_NODE = 1;
const MAX_TRANSLATION_KEY_LENGTH = 1_000;
const BLOCKED_ELEMENT_NAMES = new Set(["noscript", "script", "style", "template"]);

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
  readonly boundary?: ParentNode;
  readonly translate: (key: string) => string | undefined;
}

/** @internal */
export interface DomTranslator {
  /** Translates safe leaves and attributes at and below the root, restoring the fallback where a key was removed. */
  translateRoot(options: TranslateRootOptions): void;
}

const isElementNode = (node: ParentNode): node is Element => node.nodeType === ELEMENT_NODE;

const isInsideCustomElement = (element: Element, root: ParentNode): boolean => {
  let currentElement: Element | null = element;

  while (currentElement !== null && currentElement !== root) {
    if (currentElement.tagName.includes("-")) {
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

const isValidDomKey = (rawKey: string): boolean =>
  rawKey.trim().length > 0 && rawKey.length <= MAX_TRANSLATION_KEY_LENGTH && !hasAsciiControlCharacter(rawKey);

/** Creates isolated fallback-text tracking for one browser binding. @internal */
export function createDomTranslator(options: DomTranslatorOptions): DomTranslator {
  const fallbackTexts = new WeakMap<Element, string>();
  const translatedTexts = new WeakMap<Element, string>();
  const attributeStates = new WeakMap<Element, Map<string, AttributeState>>();

  const warnInvalidKey = (keyAttribute: string): void => {
    if (!options.isSilent) {
      console.warn(`[I18n] Skipping translation because ${keyAttribute} contains an invalid key.`);
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
      warnInvalidKey(`${TRANSLATION_ATTRIBUTE}-${attribute}`);
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

  /** Restores the fallback text of an element whose key was removed, unless the text changed since translation. */
  const restoreText = (element: Element): void => {
    const fallbackText = fallbackTexts.get(element);
    const translatedText = translatedTexts.get(element);

    if (fallbackText !== undefined && translatedText !== undefined && element.textContent === translatedText) {
      element.textContent = fallbackText;
    }
    fallbackTexts.delete(element);
    translatedTexts.delete(element);
  };

  const isTracked = (element: Element): boolean =>
    translatedTexts.has(element) || (attributeStates.get(element)?.size ?? 0) > 0;

  const translateText = (element: Element, rawKey: string, translate: (key: string) => string | undefined): void => {
    if (element.childElementCount > 0) {
      if (!options.isSilent) {
        console.warn(
          `[I18n] Skipping translation on <${element.tagName.toLowerCase()}> because translated elements must be leaves.`,
        );
      }
      return;
    }

    if (!isValidDomKey(rawKey)) {
      warnInvalidKey(TRANSLATION_ATTRIBUTE);
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
    if (BLOCKED_ELEMENT_NAMES.has(element.localName)) {
      if (!options.isSilent) {
        console.warn(
          `[I18n] Skipping translation on <${element.tagName.toLowerCase()}> because the element can activate or hide translated content.`,
        );
      }
      return;
    }

    const rawKey = element.getAttribute(TRANSLATION_ATTRIBUTE);

    if (rawKey !== null) {
      translateText(element, rawKey, translate);
    } else {
      restoreText(element);
    }

    for (const attribute of TRANSLATED_ATTRIBUTES) {
      const rawAttributeKey = element.getAttribute(`${TRANSLATION_ATTRIBUTE}-${attribute}`);

      if (rawAttributeKey !== null) {
        translateAttribute(element, attribute, rawAttributeKey, translate);
      } else {
        restoreAttribute(element, attribute);
      }
    }
  };

  return {
    translateRoot({ root, boundary = root, translate }) {
      for (const element of collectElements(root, isTracked)) {
        if (!isInsideCustomElement(element, boundary)) {
          translateElement(element, translate);
        }
      }
    },
  };
}
