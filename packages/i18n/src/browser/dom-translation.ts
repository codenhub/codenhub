const TRANSLATION_ATTRIBUTE = "data-i18n";
const ELEMENT_NODE = 1;

interface DomTranslatorOptions {
  readonly isSilent: boolean;
}

interface TranslateRootOptions {
  readonly root: ParentNode;
  readonly translate: (key: string) => string | undefined;
}

/** @internal */
export interface DomTranslator {
  /** Translates safe leaves at and below the configured root. */
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

const collectElements = (root: ParentNode): Element[] => {
  const descendants = Array.from(root.querySelectorAll(`[${TRANSLATION_ATTRIBUTE}]`));
  return isElementNode(root) && root.hasAttribute(TRANSLATION_ATTRIBUTE) ? [root, ...descendants] : descendants;
};

/** Creates isolated fallback-text tracking for one browser binding. @internal */
export function createDomTranslator(options: DomTranslatorOptions): DomTranslator {
  const fallbackTexts = new WeakMap<Element, string>();
  const translatedTexts = new WeakMap<Element, string>();

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

  const translateElement = (element: Element, translate: (key: string) => string | undefined): void => {
    const key = element.getAttribute(TRANSLATION_ATTRIBUTE)?.trim();

    if (!key) {
      return;
    }

    if (element.childElementCount > 0) {
      if (!options.isSilent) {
        console.warn(
          `[I18n] Skipping key "${key}" on <${element.tagName.toLowerCase()}> because translated elements must be leaves.`,
        );
      }
      return;
    }

    const fallbackText = getFallbackText(element);
    const nextText = translate(key) ?? fallbackText;

    if (element.textContent !== nextText) {
      element.textContent = nextText;
    }
    translatedTexts.set(element, nextText);
  };

  return {
    translateRoot({ root, translate }) {
      for (const element of collectElements(root)) {
        if (!isInsideCustomElement(element, root)) {
          translateElement(element, translate);
        }
      }
    },
  };
}
