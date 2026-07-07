import { normalizeValue } from "./helpers";

const TRANSLATION_ATTRIBUTE = "data-i18n";

/**
 * Interface for the DOM translation orchestrator.
 *
 * @internal
 */
export interface DomTranslator {
  /** Translates translatable elements inside the given root. */
  translateDocument(root: ParentNode | null, translate: (key: string) => string | undefined): void;
}

/**
 * Creates a DOM translator instance.
 *
 * @returns A DOM translator instance.
 * @internal
 */
export function createDomTranslator(): DomTranslator {
  const fallbackTextByElement = new WeakMap<Element, string>();

  const translatedTextByElement = new WeakMap<Element, string>();

  const isCustomElement = (element: Element): boolean => {
    return element.tagName.includes("-");
  };

  const getClosestCustomElement = (element: Element): Element | null => {
    let currentElement: Element | null = element;

    while (currentElement !== null) {
      if (isCustomElement(currentElement)) {
        return currentElement;
      }

      currentElement = currentElement.parentElement;
    }

    return null;
  };

  const collectTranslatableElements = (root: ParentNode): Element[] => {
    const elements = Array.from(root.querySelectorAll(`[${TRANSLATION_ATTRIBUTE}]`));

    if (root instanceof Element && root.hasAttribute(TRANSLATION_ATTRIBUTE)) {
      return [root, ...elements];
    }

    return elements;
  };

  const getElementFallbackText = (element: Element): string => {
    const existingFallback = fallbackTextByElement.get(element);
    const currentText = element.textContent ?? "";
    const lastTranslated = translatedTextByElement.get(element);

    if (existingFallback === undefined || (lastTranslated !== undefined && currentText !== lastTranslated)) {
      fallbackTextByElement.set(element, currentText);
      return currentText;
    }

    return existingFallback;
  };

  const translateElement = (element: Element, translate: (key: string) => string | undefined): boolean => {
    const key = normalizeValue(element.getAttribute(TRANSLATION_ATTRIBUTE));

    if (key === undefined) {
      return false;
    }

    if (element.childElementCount > 0) {
      console.warn(
        `[I18n] Skipping key "${key}" on <${element.tagName.toLowerCase()}> because translated elements must be leaves.`,
      );
      return false;
    }

    const fallbackText = getElementFallbackText(element);
    const translation = translate(key);

    if (translation === undefined) {
      element.textContent = fallbackText;
      translatedTextByElement.set(element, fallbackText);
      return false;
    }

    element.textContent = translation;
    translatedTextByElement.set(element, translation);
    return true;
  };

  return {
    translateDocument(root, translate) {
      if (root === null) {
        return;
      }

      collectTranslatableElements(root).forEach((element) => {
        if (getClosestCustomElement(element) === null) {
          translateElement(element, translate);
        }
      });
    },
  };
}
