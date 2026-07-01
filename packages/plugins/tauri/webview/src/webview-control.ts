import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import type { WebviewHandle, WebviewPosition, WebviewSize } from "./types.js";

/**
 * Converts IPC errors of unknown shape into readable string messages, ensuring
 * that any downstream error propagation has a standardized, descriptive error message.
 *
 * @internal
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function runWrapped<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new Error(formatError(error));
  }
}

/**
 * Wraps a Tauri {@link WebviewWindow} instance in a {@link WebviewHandle}.
 * Internal factory — not part of the public API.
 *
 * @internal
 */
export function createWebviewHandle(webview: WebviewWindow): WebviewHandle {
  return {
    get label() {
      return webview.label;
    },

    async navigate(url: string) {
      return runWrapped(() => invoke("navigate_webview", { label: webview.label, url }));
    },

    async reload() {
      return runWrapped(() => invoke("reload_webview", { label: webview.label }));
    },

    async setSize(size: WebviewSize) {
      return runWrapped(() => webview.setSize(new LogicalSize(size.width, size.height)));
    },

    async setPosition(position: WebviewPosition) {
      return runWrapped(() => webview.setPosition(new LogicalPosition(position.x, position.y)));
    },

    async setFocus() {
      return runWrapped(() => webview.setFocus());
    },

    async setZoom(scaleFactor: number) {
      return runWrapped(() => webview.setZoom(scaleFactor));
    },

    async show() {
      return runWrapped(() => webview.show());
    },

    async hide() {
      return runWrapped(() => webview.hide());
    },

    async destroy() {
      return runWrapped(() => webview.destroy());
    },
  };
}
