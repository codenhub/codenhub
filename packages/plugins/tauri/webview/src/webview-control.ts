import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import type { WebviewHandle, WebviewPosition, WebviewSize } from "./types.js";

/**
 * Wraps a Tauri {@link WebviewWindow} instance in a {@link WebviewHandle}.
 * Internal factory — not part of the public API.
 */
export function createWebviewHandle(webview: WebviewWindow): WebviewHandle {
  return {
    get label() {
      return webview.label;
    },

    async navigate(url: string) {
      await invoke("navigate_webview", { label: webview.label, url });
    },

    async reload() {
      await invoke("reload_webview", { label: webview.label });
    },

    async setSize(size: WebviewSize) {
      await webview.setSize(new LogicalSize(size.width, size.height));
    },

    async setPosition(position: WebviewPosition) {
      await webview.setPosition(new LogicalPosition(position.x, position.y));
    },

    async setFocus() {
      await webview.setFocus();
    },

    async setZoom(scaleFactor: number) {
      await webview.setZoom(scaleFactor);
    },

    async show() {
      await webview.show();
    },

    async hide() {
      await webview.hide();
    },

    async destroy() {
      await webview.destroy();
    },
  };
}
