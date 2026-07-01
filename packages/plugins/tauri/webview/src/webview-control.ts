import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import type { WebviewHandle, WebviewPosition, WebviewSize } from "./types.js";

function wrapError(error: unknown): Error {
  return new Error(error instanceof Error ? error.message : String(error));
}

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
      try {
        await invoke("navigate_webview", { label: webview.label, url });
      } catch (error) {
        throw wrapError(error);
      }
    },

    async reload() {
      try {
        await invoke("reload_webview", { label: webview.label });
      } catch (error) {
        throw wrapError(error);
      }
    },

    async setSize(size: WebviewSize) {
      try {
        await webview.setSize(new LogicalSize(size.width, size.height));
      } catch (error) {
        throw wrapError(error);
      }
    },

    async setPosition(position: WebviewPosition) {
      try {
        await webview.setPosition(new LogicalPosition(position.x, position.y));
      } catch (error) {
        throw wrapError(error);
      }
    },

    async setFocus() {
      try {
        await webview.setFocus();
      } catch (error) {
        throw wrapError(error);
      }
    },

    async setZoom(scaleFactor: number) {
      try {
        await webview.setZoom(scaleFactor);
      } catch (error) {
        throw wrapError(error);
      }
    },

    async show() {
      try {
        await webview.show();
      } catch (error) {
        throw wrapError(error);
      }
    },

    async hide() {
      try {
        await webview.hide();
      } catch (error) {
        throw wrapError(error);
      }
    },

    async destroy() {
      try {
        await webview.destroy();
      } catch (error) {
        throw wrapError(error);
      }
    },
  };
}
