import { WebviewWindow, getAllWebviewWindows, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import type { WebviewConfig, WebviewHandle } from "./types.js";
import { createWebviewHandle } from "./webview-control.js";

const SPAWN_TIMEOUT_MS = 5000;

/**
 * Safely formats an unknown error into a descriptive string message.
 */
function formatError(err: unknown): string {
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

/**
 * Spawns a new WebviewWindow with the given configuration.
 *
 * The returned handle becomes valid as soon as the window is created in the
 * Tauri runtime. Control calls made immediately after may race with initial
 * page load — await them sequentially if ordering matters.
 *
 * @param config - Configuration options for spawning the WebView.
 * @throws {Error} If a window with the same label already exists.
 * @throws {Error} If the window creation fails (receives "tauri://error") or times out (5 seconds).
 */
export async function spawnWebview(config: WebviewConfig): Promise<WebviewHandle> {
  const { label, url, size, position, parentWindow } = config;

  if ((await WebviewWindow.getByLabel(label)) !== null) {
    throw new Error(`WebView window with label "${label}" already exists`);
  }

  const options: ConstructorParameters<typeof WebviewWindow>[1] = { url };

  if (size !== undefined) {
    options.width = size.width;
    options.height = size.height;
  }

  if (position !== undefined) {
    options.x = position.x;
    options.y = position.y;
  }

  if (parentWindow !== undefined) {
    options.parent = parentWindow;
  }

  const webviewWindow = new WebviewWindow(label, options);

  await new Promise<void>((resolve, reject) => {
    let isFinished = false;
    const cleanups: Array<() => void> = [];

    const cleanup = () => {
      for (const dispose of cleanups) {
        dispose();
      }
      cleanups.length = 0;
    };

    const timeoutId = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        cleanup();
        reject(new Error(`Timeout spawning WebView window with label "${label}"`));
      }
    }, SPAWN_TIMEOUT_MS);

    const handleCreated = () => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeoutId);
        cleanup();
        resolve();
      }
    };

    const handleError = (err: unknown) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeoutId);
        cleanup();
        reject(new Error(`Failed to create WebView window: ${formatError(err)}`));
      }
    };

    webviewWindow
      .once("tauri://created", handleCreated)
      .then((unlisten) => {
        cleanups.push(unlisten);
        if (isFinished) {
          unlisten();
        }
      })
      .catch((err) => {
        if (!isFinished) {
          isFinished = true;
          clearTimeout(timeoutId);
          cleanup();
          reject(err);
        }
      });

    webviewWindow
      .once("tauri://error", handleError)
      .then((unlisten) => {
        cleanups.push(unlisten);
        if (isFinished) {
          unlisten();
        }
      })
      .catch((err) => {
        if (!isFinished) {
          isFinished = true;
          clearTimeout(timeoutId);
          cleanup();
          reject(err);
        }
      });
  });

  return createWebviewHandle(webviewWindow);
}

/**
 * Returns a handle to an existing WebviewWindow by its label.
 *
 * @param label - The unique label of the WebView window.
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
 *
 * @returns The handle to the current WebviewWindow.
 */
export function getCurrentWebview(): WebviewHandle {
  return createWebviewHandle(getCurrentWebviewWindow());
}

/**
 * Returns handles for all currently active WebviewWindows in the Tauri app.
 *
 * @returns An array of handles for all active WebviewWindows.
 */
export async function listWebviews(): Promise<WebviewHandle[]> {
  const handles = await getAllWebviewWindows();
  return handles.map(createWebviewHandle);
}
