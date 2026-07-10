import { buildInlineStyle } from "./tokens";
import type { ToastTokens } from "./types";

export const DIALOG_CLASS = "toast-dialog";
export const TITLE_CLASS = "toast-dialog-title";
export const MESSAGE_CLASS = "toast-dialog-message";
export const ACTIONS_CLASS = "toast-dialog-actions";

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
  title?: string;
  tokens?: ToastTokens;
  className?: string;
}

export function buildDialogContent(params: BuildDialogContentParams): HTMLDivElement {
  const { dialog, message, title, tokens, className } = params;

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

  const container = createHTMLElement("div", "toast-dialog-container");

  if (title) {
    const titleEl = createHTMLElement("div", TITLE_CLASS);
    titleEl.textContent = title;
    container.appendChild(titleEl);
  }

  const p = createHTMLElement("p", MESSAGE_CLASS);
  p.textContent = message;
  container.appendChild(p);
  dialog.appendChild(container);
  return container;
}
