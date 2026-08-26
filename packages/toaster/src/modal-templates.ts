import { replaceTokens } from "./tokens";
import type { ToastTokens } from "./types";

export const DIALOG_CLASS = "toast-dialog";
export const TITLE_CLASS = "toast-dialog-title";
export const MESSAGE_CLASS = "toast-dialog-message";
export const ACTIONS_CLASS = "toast-dialog-actions";

export function createHTMLElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  documentRef: Document = document,
): HTMLElementTagNameMap[K] {
  const node = documentRef.createElement(tag);
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
  titleId: string;
  messageId: string;
}

export function buildDialogContent(params: BuildDialogContentParams): HTMLDivElement {
  const { dialog, message, title, tokens, className, titleId, messageId } = params;

  if (className) {
    dialog.className = `${DIALOG_CLASS} ${className}`;
  } else {
    dialog.className = DIALOG_CLASS;
  }

  replaceTokens(dialog.style, tokens);

  const documentRef = dialog.ownerDocument;
  const container = createHTMLElement("div", "toast-dialog-container", documentRef);

  if (title) {
    const titleEl = createHTMLElement("h2", TITLE_CLASS, documentRef);
    titleEl.id = titleId;
    titleEl.textContent = title;
    container.appendChild(titleEl);
    dialog.setAttribute("aria-labelledby", titleId);
    dialog.setAttribute("aria-describedby", messageId);
  } else {
    dialog.setAttribute("aria-labelledby", messageId);
    dialog.removeAttribute("aria-describedby");
  }

  const p = createHTMLElement("p", MESSAGE_CLASS, documentRef);
  p.id = messageId;
  p.textContent = message;
  container.appendChild(p);
  dialog.appendChild(container);
  return container;
}
