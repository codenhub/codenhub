/** @public */
export const WindowState = {
  NORMAL: "normal",
  MINIMIZED: "minimized",
  MAXIMIZED: "maximized",
  FULLSCREEN: "fullscreen",
} as const;

/** @public */
export type WindowState = (typeof WindowState)[keyof typeof WindowState];

/**
 * Logical pixel position of a window on screen.
 * All values are in CSS (logical) pixels.
 */
export interface WindowPosition {
  x: number;
  y: number;
}

/**
 * Logical pixel dimensions of a window.
 * All values are in CSS (logical) pixels.
 */
export interface WindowSize {
  width: number;
  height: number;
}

/**
 * Options passed to {@link createWindow} when creating a new OS window.
 */
export interface WindowConfig {
  /** Unique label identifying this window within the Tauri app. */
  label: string;
  /** Window title bar text. */
  title?: string;
  /** Initial window size. */
  size?: WindowSize;
  /** Initial window position on screen. */
  position?: WindowPosition;
  /** Whether the window has OS chrome (title bar, borders). Defaults to `true`. */
  decorations?: boolean;
  /** Whether the user can resize the window. Defaults to `true`. */
  resizable?: boolean;
  /** Whether the window floats above all other windows. Defaults to `false`. */
  alwaysOnTop?: boolean;
  /** Whether the window is visible on creation. Defaults to `true`. */
  visible?: boolean;
}

/**
 * Live handle to an OS window. Obtain via {@link createWindow}, {@link getWindow},
 * or {@link getCurrentWindow}. All methods are async and communicate over Tauri IPC.
 */
export interface WindowHandle {
  /** The unique label that identifies this window in the Tauri runtime. */
  readonly label: string;
  /** Returns the current visual state of the window. */
  getState(): Promise<WindowState>;
  /** Minimizes the window to the taskbar/dock. */
  minimize(): Promise<void>;
  /** Maximizes the window to fill the screen. */
  maximize(): Promise<void>;
  /** Restores a maximized window to its previous size. */
  unmaximize(): Promise<void>;
  /** Toggles between maximized and restored states. */
  toggleMaximize(): Promise<void>;
  /** Enters or exits fullscreen mode. */
  fullscreen(enable: boolean): Promise<void>;
  /** Sets the window title bar text. */
  setTitle(title: string): Promise<void>;
  /** Shows or hides OS chrome (title bar, borders, resize handles). */
  setDecorations(enabled: boolean): Promise<void>;
  /** Enables or disables user resizing. */
  setResizable(enabled: boolean): Promise<void>;
  /** Pins the window above all others, or releases the pin. */
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  /** Resizes the window to the given logical pixel dimensions. */
  setSize(size: WindowSize): Promise<void>;
  /** Moves the window to the given logical pixel position on screen. */
  setPosition(position: WindowPosition): Promise<void>;
  /** Shows or hides the window without destroying it. */
  setVisible(visible: boolean): Promise<void>;
  /**
   * Requests the OS to close the window. Triggers the `close-requested` event;
   * the window may stay open if a listener prevents the default action.
   */
  close(): Promise<void>;
  /** Destroys the window immediately, bypassing `close-requested`. */
  destroy(): Promise<void>;
}
