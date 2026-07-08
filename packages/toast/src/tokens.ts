import type { ToastTokens } from "./types";

const TOKEN_MAP: Record<keyof ToastTokens, string> = {
  success: "--toast-color-success",
  successSubtle: "--toast-color-success-subtle",
  successStrong: "--toast-color-success-strong",
  destructive: "--toast-color-destructive",
  destructiveSubtle: "--toast-color-destructive-subtle",
  destructiveStrong: "--toast-color-destructive-strong",
  warning: "--toast-color-warning",
  warningSubtle: "--toast-color-warning-subtle",
  warningStrong: "--toast-color-warning-strong",
  info: "--toast-color-info",
  infoSubtle: "--toast-color-info-subtle",
  infoStrong: "--toast-color-info-strong",
  border: "--toast-color-border",
  surface: "--toast-color-surface",
  text: "--toast-color-text",
};

/**
 * Builds an inline CSS style string from the given tokens.
 */
export function buildInlineStyle(tokens: ToastTokens | null | undefined): string {
  if (!tokens) {
    return "";
  }

  const styles: string[] = [];
  for (const [key, value] of Object.entries(tokens)) {
    if (value && key in TOKEN_MAP) {
      const cssVar = TOKEN_MAP[key as keyof ToastTokens];
      styles.push(`${cssVar}: ${value};`);
    }
  }

  return styles.join(" ");
}

/**
 * Injects an instance-scoped <style> element into document.head with the
 * overridden tokens. Each toaster instance uses a unique styleId so multiple
 * toasters do not clobber each other.
 */
export function applyGlobalTokens(tokens: ToastTokens | null | undefined, styleId: string): void {
  if (typeof document === "undefined") {
    return;
  }

  let styleElement = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!tokens || Object.keys(tokens).length === 0) {
    if (styleElement) {
      styleElement.remove();
    }
    return;
  }

  const styles: string[] = [];
  for (const [key, value] of Object.entries(tokens)) {
    if (value && key in TOKEN_MAP) {
      const cssVar = TOKEN_MAP[key as keyof ToastTokens];
      styles.push(`  ${cssVar}: ${value};`);
    }
  }

  if (styles.length === 0) {
    if (styleElement) {
      styleElement.remove();
    }
    return;
  }

  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = styleId;
    document.head.appendChild(styleElement);
  }

  styleElement.textContent = `[data-toast-instance="${styleId}"] {\n${styles.join("\n")}\n}`;
}

/**
 * Removes the instance-scoped <style> element if it exists.
 */
export function removeGlobalTokens(styleId: string): void {
  if (typeof document === "undefined") {
    return;
  }
  document.getElementById(styleId)?.remove();
}
