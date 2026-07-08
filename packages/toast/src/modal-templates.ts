import { buildInlineStyle } from "./tokens";
import type { ToastTokens } from "./types";

export const DIALOG_CLASS =
  "relative m-0 rounded-xl border-2 border-border bg-surface p-5 text-text shadow-2xl w-full max-w-sm pointer-events-auto";
export const MESSAGE_CLASS = "text-sm font-medium mb-4 leading-relaxed";
export const ACTIONS_CLASS = "flex justify-end gap-2";

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
