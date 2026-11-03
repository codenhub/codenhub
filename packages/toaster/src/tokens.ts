import type { ToastTokens } from "./types";

/**
 * Every token key. Its CSS custom property is derived from the key -- see
 * {@link getTokenProperty} -- so `successBtnBg` is `--toast-color-success-btn-bg`.
 */
const TOKEN_KEYS: Record<keyof ToastTokens, true> = {
  successBg: true,
  successFg: true,
  successEdge: true,
  errorBg: true,
  errorFg: true,
  errorEdge: true,
  warningBg: true,
  warningFg: true,
  warningEdge: true,
  infoBg: true,
  infoFg: true,
  infoEdge: true,
  defaultBg: true,
  defaultFg: true,
  defaultEdge: true,
  border: true,
  surface: true,
  text: true,
  primaryBg: true,
  primaryFg: true,
  primaryBgHover: true,
  primaryEdge: true,
  secondaryBg: true,
  secondaryFg: true,
  secondaryBgHover: true,
  secondaryEdge: true,
  successBtnBg: true,
  successBtnFg: true,
  successBtnBgHover: true,
  successBtnEdge: true,
  errorBtnBg: true,
  errorBtnFg: true,
  errorBtnBgHover: true,
  errorBtnEdge: true,
};

function getTokenProperty(key: string): string {
  return `--toast-color-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

interface OwnedStyleEntry {
  readonly element: HTMLStyleElement;
  /** The exact `tokens` object last successfully applied, for the reference-equality skip in {@link applyGlobalTokens}. */
  tokens: ToastTokens;
  /** The nonce the element was inserted with. */
  nonce: string | undefined;
}

const ownedStyleElements = new Map<string, OwnedStyleEntry>();

function assertColor(value: string, documentRef?: Document): void {
  const css = documentRef?.defaultView?.CSS ?? globalThis.CSS;
  if (
    value.trim().length === 0 ||
    /[;{}]/.test(value) ||
    (typeof css?.supports === "function" && !css.supports("color", value))
  ) {
    throw new Error(`Toast token value must be a valid CSS color: ${value}`);
  }
}

/** Validates all consumer-provided color tokens before DOM use. */
export function assertValidTokens(tokens: ToastTokens | null | undefined, documentRef?: Document): void {
  if (!tokens) {
    return;
  }
  Object.values(tokens).forEach((value) => {
    if (value !== undefined) {
      assertColor(value, documentRef);
    }
  });
}

/** Applies validated token values through CSSOM declaration APIs. */
export function applyTokens(style: CSSStyleDeclaration, tokens: ToastTokens | null | undefined): void {
  if (!tokens) {
    return;
  }
  for (const [key, value] of Object.entries(tokens)) {
    // Own keys only: a key such as `constructor` never named a token.
    if (value !== undefined && Object.hasOwn(TOKEN_KEYS, key)) {
      style.setProperty(getTokenProperty(key), value);
    }
  }
}

/** Replaces all package token declarations on a style object. */
export function replaceTokens(style: CSSStyleDeclaration, tokens: ToastTokens | null | undefined): void {
  Object.keys(TOKEN_KEYS).forEach((key) => style.removeProperty(getTokenProperty(key)));
  applyTokens(style, tokens);
}

/**
 * Applies instance tokens using an owned stylesheet and CSSOM declarations.
 *
 * @param tokens Consumer-provided token overrides, or `null`/`undefined` to clear them.
 * @param styleId Toaster instance ID the owned `<style>` element is scoped to.
 * @param documentRef Document the style element is created in.
 * @param nonce Nonce to set on a newly created style element, for a host
 *   `style-src` CSP that requires one.
 * @throws {Error} If the stylesheet cannot be read back as a `CSSStyleRule`
 *   -- typically a CSP blocking the element outright. A newly created
 *   element is removed before this throws, so a caught failure leaves no
 *   new node behind; the previously working element, reused or about to be
 *   replaced, is left exactly as it was instead of being torn down.
 */
export function applyGlobalTokens(
  tokens: ToastTokens | null | undefined,
  styleId: string,
  documentRef: Document = document,
  nonce?: string,
): void {
  assertValidTokens(tokens, documentRef);
  const existing = ownedStyleElements.get(styleId);

  if (!tokens || Object.keys(tokens).length === 0) {
    existing?.element.remove();
    ownedStyleElements.delete(styleId);
    return;
  }

  // A changed nonce needs a new element: a browser checks the nonce when a
  // stylesheet is inserted, not when the attribute changes later.
  const isReusable = Boolean(
    existing &&
    existing.element.ownerDocument === documentRef &&
    existing.element.isConnected &&
    existing.nonce === nonce,
  );

  // A toaster instance reapplies its own tokens on every dispatch (see
  // core.ts's getParent()), not only when they actually change. `tokens` is
  // the same object reference across those repeat calls unless configure()
  // assigned a new one, so skipping here when it's still connected and
  // unchanged avoids resetting and rewriting the rule for nothing --
  // reconnection or a document change still falls through and reapplies.
  if (isReusable && existing!.tokens === tokens) {
    return;
  }

  const existingElement = existing?.element;
  const styleElement = isReusable ? existingElement! : documentRef.createElement("style");
  if (!isReusable) {
    styleElement.dataset.toastTokenOwner = styleId;
    if (nonce) {
      styleElement.nonce = nonce;
    }
  }

  try {
    if (!isReusable) {
      documentRef.head.appendChild(styleElement);
      styleElement.sheet?.insertRule(`[data-toast-instance="${styleId}"] {}`);
    }
    const rule = styleElement.sheet?.cssRules[0];
    if (!(rule instanceof documentRef.defaultView!.CSSStyleRule)) {
      throw new Error("Toast token stylesheet could not be initialized.");
    }
    rule.style.cssText = "";
    applyTokens(rule.style, tokens);
    ownedStyleElements.set(styleId, { element: styleElement, tokens, nonce });
    // Removed only once its replacement works, so a replacement a CSP blocks
    // does not take the working token rule with it.
    if (!isReusable) {
      existingElement?.remove();
    }
  } catch (error) {
    // A reused element was already working before this call: the failing
    // check above runs before any mutation, so its prior declarations are
    // untouched. Only a newly created element -- which never had a working
    // state to preserve -- is torn down here; the entry for the element it
    // would have replaced stays, so destroy() still removes that one.
    if (!isReusable) {
      styleElement.remove();
    }
    throw error;
  }
}

/** Removes only the stylesheet owned by the matching toaster instance. */
export function removeGlobalTokens(styleId: string): void {
  ownedStyleElements.get(styleId)?.element.remove();
  ownedStyleElements.delete(styleId);
}
