import type { ToastTokens } from "./types";

const TOKEN_MAP: Record<keyof ToastTokens, string> = {
  successBg: "--toast-color-success-bg",
  successFg: "--toast-color-success-fg",
  successEdge: "--toast-color-success-edge",
  destructiveBg: "--toast-color-destructive-bg",
  destructiveFg: "--toast-color-destructive-fg",
  destructiveEdge: "--toast-color-destructive-edge",
  warningBg: "--toast-color-warning-bg",
  warningFg: "--toast-color-warning-fg",
  warningEdge: "--toast-color-warning-edge",
  infoBg: "--toast-color-info-bg",
  infoFg: "--toast-color-info-fg",
  infoEdge: "--toast-color-info-edge",
  defaultBg: "--toast-color-default-bg",
  defaultFg: "--toast-color-default-fg",
  defaultEdge: "--toast-color-default-edge",
  border: "--toast-color-border",
  surface: "--toast-color-surface",
  text: "--toast-color-text",
  primaryBg: "--toast-color-primary-bg",
  primaryFg: "--toast-color-primary-fg",
  primaryBgHover: "--toast-color-primary-bg-hover",
  primaryEdge: "--toast-color-primary-edge",
  secondaryBg: "--toast-color-secondary-bg",
  secondaryFg: "--toast-color-secondary-fg",
  secondaryBgHover: "--toast-color-secondary-bg-hover",
  secondaryEdge: "--toast-color-secondary-edge",
  successBtnBg: "--toast-color-success-btn-bg",
  successBtnFg: "--toast-color-success-btn-fg",
  successBtnBgHover: "--toast-color-success-btn-bg-hover",
  successBtnEdge: "--toast-color-success-btn-edge",
  destructiveBtnBg: "--toast-color-destructive-btn-bg",
  destructiveBtnFg: "--toast-color-destructive-btn-fg",
  destructiveBtnBgHover: "--toast-color-destructive-btn-bg-hover",
  destructiveBtnEdge: "--toast-color-destructive-btn-edge",
};

const ownedStyleElements = new Map<string, HTMLStyleElement>();

function assertColor(value: string, documentRef?: Document): void {
  if (value.trim().length === 0 || /[;{}]/.test(value)) {
    throw new Error(`Toast token value must be a valid CSS color: ${value}`);
  }

  const css = documentRef?.defaultView?.CSS ?? globalThis.CSS;
  if (typeof css?.supports === "function" && !css.supports("color", value)) {
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
    if (value !== undefined && key in TOKEN_MAP) {
      style.setProperty(TOKEN_MAP[key as keyof ToastTokens], value);
    }
  }
}

/** Replaces all package token declarations on a style object. */
export function replaceTokens(style: CSSStyleDeclaration, tokens: ToastTokens | null | undefined): void {
  Object.values(TOKEN_MAP).forEach((property) => style.removeProperty(property));
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
 * @throws {Error} If the created style element's stylesheet cannot be read
 *   back as a `CSSStyleRule` -- typically a CSP blocking the element outright.
 *   The element is removed before this throws, so a caught failure leaves no
 *   owned node behind.
 */
export function applyGlobalTokens(
  tokens: ToastTokens | null | undefined,
  styleId: string,
  documentRef: Document = document,
  nonce?: string,
): void {
  assertValidTokens(tokens, documentRef);
  const existingElement = ownedStyleElements.get(styleId);

  if (!tokens || Object.keys(tokens).length === 0) {
    existingElement?.remove();
    ownedStyleElements.delete(styleId);
    return;
  }

  const isReusable = Boolean(
    existingElement && existingElement.ownerDocument === documentRef && existingElement.isConnected,
  );
  if (!isReusable) {
    existingElement?.remove();
  }
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
    ownedStyleElements.set(styleId, styleElement);
  } catch (error) {
    styleElement.remove();
    ownedStyleElements.delete(styleId);
    throw error;
  }
}

/** Removes only the stylesheet owned by the matching toaster instance. */
export function removeGlobalTokens(styleId: string): void {
  ownedStyleElements.get(styleId)?.remove();
  ownedStyleElements.delete(styleId);
}
