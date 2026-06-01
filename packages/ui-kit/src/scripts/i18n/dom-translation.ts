import { normalizeValue } from "./helpers";

const TRANSLATION_ATTRIBUTE = "data-i18n";

interface TranslateElementOptions {
  element: Element;
  translate: (key: string) => string | undefined;
}

export class DomTranslator {
  private fallbackTextByElement = new WeakMap<Element, string>();

  translateDocument(root: ParentNode | null, translate: (key: string) => string | undefined): void {
    if (root === null) {
      return;
    }

    if (root instanceof Element && this.getClosestCustomElement(root) !== null) {
      return;
    }

    const customElementBoundary = this.getCustomElementBoundary(root);

    this.collectTranslatableElements(root).forEach((element) => {
      if (this.belongsToCustomElementBoundary(element, customElementBoundary)) {
        this.translateElement({ element, translate });
      }
    });
  }

  private translateElement({ element, translate }: TranslateElementOptions): boolean {
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

    const fallbackText = this.getElementFallbackText(element);
    const translation = translate(key);

    if (translation === undefined) {
      element.textContent = fallbackText;
      return false;
    }

    element.textContent = translation;
    return true;
  }

  private collectTranslatableElements(root: ParentNode): Element[] {
    const elements = Array.from(root.querySelectorAll(`[${TRANSLATION_ATTRIBUTE}]`));

    if (root instanceof Element && root.hasAttribute(TRANSLATION_ATTRIBUTE)) {
      return [root, ...elements];
    }

    return elements;
  }

  private getCustomElementBoundary(root: ParentNode): Element | null {
    if (!(root instanceof Element)) {
      return null;
    }

    return this.getClosestCustomElement(root);
  }

  private belongsToCustomElementBoundary(element: Element, boundary: Element | null): boolean {
    return this.getClosestCustomElement(element) === boundary;
  }

  private getClosestCustomElement(element: Element): Element | null {
    let currentElement: Element | null = element;

    while (currentElement !== null) {
      if (this.isCustomElement(currentElement)) {
        return currentElement;
      }

      currentElement = currentElement.parentElement;
    }

    return null;
  }

  private isCustomElement(element: Element): boolean {
    return element.tagName.includes("-");
  }

  private getElementFallbackText(element: Element): string {
    const existingFallback = this.fallbackTextByElement.get(element);

    if (existingFallback !== undefined) {
      return existingFallback;
    }

    const fallbackText = element.textContent ?? "";
    this.fallbackTextByElement.set(element, fallbackText);
    return fallbackText;
  }
}
