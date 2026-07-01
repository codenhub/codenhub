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
    let unlistenCreated: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;

    const timeoutId = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        if (unlistenCreated) {
          unlistenCreated();
        }
        if (unlistenError) {
          unlistenError();
        }
        reject(new Error(`Timeout spawning WebView window with label "${label}"`));
      }
    }, 5000);

    const handleCreated = () => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeoutId);
        if (unlistenCreated) {
          unlistenCreated();
        }
        if (unlistenError) {
          unlistenError();
        }
        resolve();
      }
    };

    const handleError = (err: unknown) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeoutId);
        if (unlistenCreated) {
          unlistenCreated();
        }
        if (unlistenError) {
          unlistenError();
        }
        reject(new Error(`Failed to create WebView window: ${JSON.stringify(err)}`));
      }
    };

    webviewWindow
      .once("tauri://created", handleCreated)
      .then((unlisten) => {
        unlistenCreated = unlisten;
        if (isFinished) {
          unlisten();
        }
      })
      .catch((err) => {
        if (!isFinished) {
          isFinished = true;
          clearTimeout(timeoutId);
          if (unlistenError) {
            unlistenError();
          }
          reject(err);
        }
      });

    webviewWindow
      .once("tauri://error", handleError)
      .then((unlisten) => {
        unlistenError = unlisten;
        if (isFinished) {
          unlisten();
        }
      })
      .catch((err) => {
        if (!isFinished) {
          isFinished = true;
          clearTimeout(timeoutId);
          if (unlistenCreated) {
            unlistenCreated();
          }
          reject(err);
        }
      });
  });

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
