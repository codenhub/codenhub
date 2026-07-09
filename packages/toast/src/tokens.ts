import type { ToastTokens } from "./types";

/**
 * Maps each ToastTokens key to its scoped CSS custom property name.
 *
 * Token cascade for every entry:
 *   consumer override (--toast-color-*)
 *     → @codenhub/styles theme token (--color-*)
 *       → hardcoded hex fallback (standalone / no styles package)
 *
 * Semantic variants (success / destructive / warning / info):
 *   Key              CSS var                          Fallback var                   Hex fallback
 *   ─────────────────────────────────────────────────────────────────────────────────────────────
 *   success          --toast-color-success            --color-success                #059669
 *   successContrast  --toast-color-success-contrast   --color-success-contrast       #f9fafb
 *   successSubtle    --toast-color-success-subtle     --color-success-subtle         #d1fae5
 *   successStrong    --toast-color-success-strong     --color-success-strong         #065f46
 *   destructive      --toast-color-destructive        --color-destructive            #be123c
 *   destructiveContrast --toast-color-destructive-contrast --color-destructive-contrast #f9fafb
 *   destructiveSubtle --toast-color-destructive-subtle --color-destructive-subtle    #ffe4e6
 *   destructiveStrong --toast-color-destructive-strong --color-destructive-strong    #9f1239
 *   warning          --toast-color-warning            --color-warning                #d97706
 *   warningContrast  --toast-color-warning-contrast   --color-warning-contrast       #f9fafb
 *   warningSubtle    --toast-color-warning-subtle     --color-warning-subtle         #fef3c7
 *   warningStrong    --toast-color-warning-strong     --color-warning-strong         #92400e
 *   info             --toast-color-info               --color-info                   #4f46e5
 *   infoContrast     --toast-color-info-contrast      --color-info-contrast          #f9fafb
 *   infoSubtle       --toast-color-info-subtle        --color-info-subtle            #e0e7ff
 *   infoStrong       --toast-color-info-strong        --color-info-strong            #3730a3
 *
 * Default/neutral variant (toast-default):
 *   Key     CSS var                  Fallback var       Hex fallback
 *   ────────────────────────────────────────────────────────────────
 *   border  --toast-color-border    --color-border     #d1d5db
 *   surface --toast-color-surface   --color-surface    #e5e7eb
 *   text    --toast-color-text      --color-text       #030712
 */
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
