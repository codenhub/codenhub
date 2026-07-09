import { buildInlineStyle } from "./tokens";
import type { ToastTokens } from "./types";

export const DIALOG_CLASS =
  "rounded-xl border border-(--color-border) bg-(--color-background) p-6 text-(--color-text) shadow-2xl w-full max-w-sm pointer-events-auto";
export const MESSAGE_CLASS = "text-[1.0625rem] font-medium mb-5 leading-snug";
export const ACTIONS_CLASS = "flex justify-end gap-3";

export function createHTMLElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
}

interface BuildDialogContentParams {
  dialog: HTMLDialogElement;
  message: string;
  tokens?: ToastTokens;
  className?: string;
}

export function buildDialogContent(params: BuildDialogContentParams): HTMLDivElement {
  const { dialog, message, tokens, className } = params;

  if (className) {
    dialog.className = `${DIALOG_CLASS} ${className}`;
  } else {
    dialog.className = DIALOG_CLASS;
  }

  if (tokens) {
    const inlineStyle = buildInlineStyle(tokens);
    if (inlineStyle) {
      dialog.style.cssText = inlineStyle;
    }
  } else {
    dialog.style.cssText = "";
  }

  const content = createHTMLElement("div");
  const p = createHTMLElement("p", MESSAGE_CLASS);
  p.textContent = message;
  content.appendChild(p);
  dialog.appendChild(content);
  return content;
}
