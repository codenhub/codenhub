import { WebviewWindow, getAllWebviewWindows, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import type { WebviewConfig, WebviewHandle } from "./types.js";
import { createWebviewHandle, formatError } from "./webview-control.js";

const SPAWN_TIMEOUT_MS = 5000;

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

  let unlistenCreated: (() => void) | undefined;
  let unlistenError: (() => void) | undefined;
  let isFinished = false;

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      settle(new Error(`Timeout spawning WebView window with label "${label}"`));
    }, SPAWN_TIMEOUT_MS);

    function settle(err?: Error) {
      if (isFinished) {
        return;
      }
      isFinished = true;
      clearTimeout(timeoutId);

      if (unlistenCreated) {
        unlistenCreated();
      }
      if (unlistenError) {
        unlistenError();
      }

      if (err) {
        reject(err);
      } else {
        resolve();
      }
    }

    webviewWindow
      .once("tauri://created", () => {
        settle();
      })
      .then((unlisten) => {
        unlistenCreated = unlisten;
        if (isFinished) {
          unlisten();
        }
      })
      .catch((err) => {
        settle(err instanceof Error ? err : new Error(formatError(err)));
      });

    webviewWindow
      .once("tauri://error", (err) => {
        settle(new Error(`Failed to create WebView window: ${formatError(err)}`));
      })
      .then((unlisten) => {
        unlistenError = unlisten;
        if (isFinished) {
          unlisten();
        }
      })
      .catch((err) => {
        settle(err instanceof Error ? err : new Error(formatError(err)));
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
