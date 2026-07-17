import { Window, getAllWindows, getCurrentWindow } from "@tauri-apps/api/window";

import type { WindowConfig, WindowHandle } from "./types.js";
import { createWindowHandle } from "./window-control.js";

/**
 * Creates a new OS window with the given configuration.
 *
 * @throws If Tauri rejects creation, event registration fails, or creation does
 * not complete within five seconds. A duplicate label is one possible reason
 * Tauri can reject creation.
 */
export async function createWindow(config: WindowConfig): Promise<WindowHandle> {
  const { label, title, size, position, decorations, resizable, alwaysOnTop, visible } = config;

  // WindowOptions uses raw logical pixel numbers for x/y/width/height —
  // no LogicalSize wrapper needed at construction time.
  const options: ConstructorParameters<typeof Window>[1] = {};

  if (title !== undefined) {
    options.title = title;
  }
  if (decorations !== undefined) {
    options.decorations = decorations;
  }
  if (resizable !== undefined) {
    options.resizable = resizable;
  }
  if (alwaysOnTop !== undefined) {
    options.alwaysOnTop = alwaysOnTop;
  }
  if (visible !== undefined) {
    options.visible = visible;
  }
  if (size !== undefined) {
    options.width = size.width;
    options.height = size.height;
  }
  if (position !== undefined) {
    options.x = position.x;
    options.y = position.y;
  }

  const win = new Window(label, options);

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
        reject(new Error(`Timeout spawning window with label "${label}"`));
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
        reject(new Error(`Failed to create window: ${JSON.stringify(err)}`));
      }
    };

    win
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

    win
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

  return createWindowHandle(win);
}

/**
 * Returns a handle to an existing window by its label.
 *
 * @returns `undefined` if no window with the given label exists.
 */
export async function getWindow(label: string): Promise<WindowHandle | undefined> {
  const win = await Window.getByLabel(label);
  if (win === null) {
    return undefined;
  }
  return createWindowHandle(win);
}

/**
 * Returns a handle to the window that contains the current WebView.
 */
export function getCurrentWindowHandle(): WindowHandle {
  return createWindowHandle(getCurrentWindow());
}

/**
 * Returns handles for all currently open windows in the Tauri app.
 */
export async function listWindows(): Promise<WindowHandle[]> {
  const windows = await getAllWindows();
  return windows.map(createWindowHandle);
}
