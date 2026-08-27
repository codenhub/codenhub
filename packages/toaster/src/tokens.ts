import type { ToastTokens } from "./types";

const TOKEN_MAP: Record<keyof ToastTokens, string> = {
  success: "--toast-color-success",
  successContrast: "--toast-color-success-contrast",
  successSubtle: "--toast-color-success-subtle",
  successStrong: "--toast-color-success-strong",
  destructive: "--toast-color-destructive",
  destructiveContrast: "--toast-color-destructive-contrast",
  destructiveSubtle: "--toast-color-destructive-subtle",
  destructiveStrong: "--toast-color-destructive-strong",
  warning: "--toast-color-warning",
  warningContrast: "--toast-color-warning-contrast",
  warningSubtle: "--toast-color-warning-subtle",
  warningStrong: "--toast-color-warning-strong",
  info: "--toast-color-info",
  infoContrast: "--toast-color-info-contrast",
  infoSubtle: "--toast-color-info-subtle",
  infoStrong: "--toast-color-info-strong",
  border: "--toast-color-border",
  surface: "--toast-color-surface",
  text: "--toast-color-text",
  primary: "--toast-color-primary",
  primaryContrast: "--toast-color-primary-contrast",
  primaryHover: "--toast-color-primary-hover",
  accent: "--toast-color-accent",
  accentContrast: "--toast-color-accent-contrast",
  accentHover: "--toast-color-accent-hover",
  successHover: "--toast-color-success-hover",
  destructiveHover: "--toast-color-destructive-hover",
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

/** Applies instance tokens using an owned stylesheet and CSSOM declarations. */
export function applyGlobalTokens(
  tokens: ToastTokens | null | undefined,
  styleId: string,
  documentRef: Document = document,
): void {
  assertValidTokens(tokens, documentRef);
  let styleElement = ownedStyleElements.get(styleId);

  if (!tokens || Object.keys(tokens).length === 0) {
    styleElement?.remove();
    ownedStyleElements.delete(styleId);
    return;
  }

  if (!styleElement || styleElement.ownerDocument !== documentRef || !styleElement.isConnected) {
    styleElement?.remove();
    styleElement = documentRef.createElement("style");
    styleElement.dataset.toastTokenOwner = styleId;
    documentRef.head.appendChild(styleElement);
    styleElement.sheet?.insertRule(`[data-toast-instance="${styleId}"] {}`);
    ownedStyleElements.set(styleId, styleElement);
  }

  const rule = styleElement.sheet?.cssRules[0];
  if (!(rule instanceof documentRef.defaultView!.CSSStyleRule)) {
    throw new Error("Toast token stylesheet could not be initialized.");
  }
  rule.style.cssText = "";
  applyTokens(rule.style, tokens);
}

/** Removes only the stylesheet owned by the matching toaster instance. */
export function removeGlobalTokens(styleId: string): void {
  ownedStyleElements.get(styleId)?.remove();
  ownedStyleElements.delete(styleId);
}
