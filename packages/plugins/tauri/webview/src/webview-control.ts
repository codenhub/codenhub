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
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("navigate_webview", { label: webview.label, url });
    },

    async reload() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("reload_webview", { label: webview.label });
    },

    async setSize(size: WebviewSize) {
      const { LogicalSize } = await import("@tauri-apps/api/dpi");
      await webview.setSize(new LogicalSize(size.width, size.height));
    },

    async setPosition(position: WebviewPosition) {
      const { LogicalPosition } = await import("@tauri-apps/api/dpi");
      await webview.setPosition(new LogicalPosition(position.x, position.y));
    },

    async setFocus() {
      await webview.setFocus();
    },

    async setZoom(scaleFactor) {
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
