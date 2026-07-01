/**
 * Logical pixel dimensions for a WebviewWindow.
 * All values are in CSS (logical) pixels.
 */
export interface WebviewSize {
  width: number;
  height: number;
}

/**
 * Logical pixel position of a WebviewWindow on screen.
 * All values are in CSS (logical) pixels.
 */
export interface WebviewPosition {
  x: number;
  y: number;
}

/**
 * Options passed to {@link spawnWebview} when creating a new WebviewWindow.
 */
export interface WebviewConfig {
  /** Unique label identifying this WebviewWindow within the Tauri app. */
  label: string;
  /** Initial URL to load. */
  url: string;
  /** Initial window size in logical pixels. */
  size?: WebviewSize;
  /** Initial window position on screen in logical pixels. */
  position?: WebviewPosition;
  /**
   * Label of the parent Window. When omitted, Tauri creates a top-level window.
   * This is a plain string reference — no dependency on tauri-plugin-window.
   */
  parentWindow?: string;
}

/**
 * Live handle to a WebviewWindow. Obtain via {@link spawnWebview},
 * {@link getWebview}, or {@link getCurrentWebview}.
 *
 * All methods are async and communicate over Tauri IPC.
 *
 * > **Note:** Tauri v2 does not expose a programmatic URL navigation API on
 * > the frontend `Webview` type. Navigation and reloading are performed via
 * > custom Tauri IPC invoking companion Rust commands.
 */
export interface WebviewHandle {
  /** The unique label that identifies this WebviewWindow in the Tauri runtime. */
  readonly label: string;
  /** Navigates the WebView to the given URL. */
  navigate(url: string): Promise<void>;
  /** Reloads the current page in the WebView. */
  reload(): Promise<void>;
  /** Resizes the WebviewWindow to the given logical pixel dimensions. */
  setSize(size: WebviewSize): Promise<void>;
  /** Moves the WebviewWindow to the given logical pixel position on screen. */
  setPosition(position: WebviewPosition): Promise<void>;
  /** Focuses this WebviewWindow. */
  setFocus(): Promise<void>;
  /** Sets the zoom level of the webview content (1.0 = 100%). */
  setZoom(scaleFactor: number): Promise<void>;
  /** Shows this WebviewWindow. */
  show(): Promise<void>;
  /** Hides this WebviewWindow without destroying it. */
  hide(): Promise<void>;
  /** Close and destroy this WebviewWindow. The handle becomes invalid after this call. */
  destroy(): Promise<void>;
}
