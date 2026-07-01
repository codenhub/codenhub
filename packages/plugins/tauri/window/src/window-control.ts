import type { Window } from "@tauri-apps/api/window";

import { WindowState } from "./types.js";
import type { WindowHandle, WindowPosition, WindowSize } from "./types.js";

/**
 * Wraps a Tauri {@link Window} instance in a {@link WindowHandle}.
 * Internal factory — not part of the public API.
 */
export function createWindowHandle(win: Window): WindowHandle {
  return {
    get label() {
      return win.label;
    },

    async getState() {
      const [isMinimized, isMaximized, isFullscreen] = await Promise.all([
        win.isMinimized(),
        win.isMaximized(),
        win.isFullscreen(),
      ]);

      if (isFullscreen) {
        return WindowState.FULLSCREEN;
      }
      if (isMaximized) {
        return WindowState.MAXIMIZED;
      }
      if (isMinimized) {
        return WindowState.MINIMIZED;
      }
      return WindowState.NORMAL;
    },

    async minimize() {
      await win.minimize();
    },

    async maximize() {
      await win.maximize();
    },

    async unmaximize() {
      await win.unmaximize();
    },

    async toggleMaximize() {
      await win.toggleMaximize();
    },

    async fullscreen(enable) {
      await win.setFullscreen(enable);
    },

    async setTitle(title) {
      await win.setTitle(title);
    },

    async setDecorations(enabled) {
      await win.setDecorations(enabled);
    },

    async setResizable(enabled) {
      await win.setResizable(enabled);
    },

    async setAlwaysOnTop(enabled) {
      await win.setAlwaysOnTop(enabled);
    },

    async setSize({ width, height }: WindowSize) {
      const { LogicalSize } = await import("@tauri-apps/api/dpi");
      await win.setSize(new LogicalSize(width, height));
    },

    async setPosition({ x, y }: WindowPosition) {
      const { LogicalPosition } = await import("@tauri-apps/api/dpi");
      await win.setPosition(new LogicalPosition(x, y));
    },

    async setVisible(visible) {
      if (visible) {
        await win.show();
      } else {
        await win.hide();
      }
    },

    async close() {
      await win.close();
    },

    async destroy() {
      await win.destroy();
    },
  };
}
