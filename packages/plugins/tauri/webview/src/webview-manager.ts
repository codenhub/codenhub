import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
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

  if ((await WebviewWindow.getByLabel(label)) !== null) {
    throw new Error(`WebView window with label "${label}" already exists`);
  }

  const options: ConstructorParameters<typeof WebviewWindow>[1] = { url };

  if (size !== undefined) {
    const logicalSize = new LogicalSize(size.width, size.height);
    options.width = logicalSize.width;
    options.height = logicalSize.height;
  }

  if (position !== undefined) {
    const logicalPosition = new LogicalPosition(position.x, position.y);
    options.x = logicalPosition.x;
    options.y = logicalPosition.y;
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
