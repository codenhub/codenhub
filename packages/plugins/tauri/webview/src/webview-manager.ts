import { WebviewWindow, getAllWebviewWindows, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import type { WebviewConfig, WebviewHandle } from "./types.js";
import { createWebviewHandle } from "./webview-control.js";

/**
 * Spawns a new WebviewWindow with the given configuration.
 *
 * The returned handle becomes valid as soon as the window is created in the
 * Tauri runtime. Control calls made immediately after may race with initial
 * page load — await them sequentially if ordering matters.
 *
 * @throws If a window with the same label already exists.
 */
export async function spawnWebview(config: WebviewConfig): Promise<WebviewHandle> {
  const { label, url, size, position, parentWindow } = config;

  const options: ConstructorParameters<typeof WebviewWindow>[1] = { url };

  if (size !== undefined) {
    const { LogicalSize } = await import("@tauri-apps/api/dpi");
    options.width = new LogicalSize(size.width, size.height).width;
    options.height = new LogicalSize(size.width, size.height).height;
  }

  if (position !== undefined) {
    const { LogicalPosition } = await import("@tauri-apps/api/dpi");
    options.x = new LogicalPosition(position.x, position.y).x;
    options.y = new LogicalPosition(position.x, position.y).y;
  }

  if (parentWindow !== undefined) {
    options.parent = parentWindow;
  }

  const webviewWindow = new WebviewWindow(label, options);
  await webviewWindow.once("tauri://created", () => undefined);

  return createWebviewHandle(webviewWindow);
}

/**
 * Returns a handle to an existing WebviewWindow by its label.
 *
 * @returns `undefined` if no window with the given label exists.
 */
export async function getWebview(label: string): Promise<WebviewHandle | undefined> {
  const webviewWindow = await WebviewWindow.getByLabel(label);
  if (webviewWindow === null) {
    return undefined;
  }
  return createWebviewHandle(webviewWindow);
}

/**
 * Returns a handle to the current WebviewWindow.
 */
export function getCurrentWebview(): WebviewHandle {
  return createWebviewHandle(getCurrentWebviewWindow());
}

/**
 * Returns handles for all currently active WebviewWindows in the Tauri app.
 */
export async function listWebviews(): Promise<WebviewHandle[]> {
  const all = await getAllWebviewWindows();
  return all.map(createWebviewHandle);
}
