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

  const getCustomElementBoundary = (root: ParentNode): Element | null => {
    if (!(root instanceof Element)) {
      return null;
    }

    return getClosestCustomElement(root);
  };

  const belongsToCustomElementBoundary = (element: Element, boundary: Element | null): boolean => {
    return getClosestCustomElement(element) === boundary;
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

    if (existingFallback !== undefined) {
      return existingFallback;
    }

    const fallbackText = element.textContent ?? "";
    fallbackTextByElement.set(element, fallbackText);
    return fallbackText;
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
      return false;
    }

    element.textContent = translation;
    return true;
  };

  return {
    translateDocument(root, translate) {
      if (root === null) {
        return;
      }

      if (root instanceof Element && getClosestCustomElement(root) !== null) {
        return;
      }

      const customElementBoundary = getCustomElementBoundary(root);

      collectTranslatableElements(root).forEach((element) => {
        if (belongsToCustomElementBoundary(element, customElementBoundary)) {
          translateElement(element, translate);
        }
      });
    },
  };
}
