# @codenhub/tauri-plugin-webview

TypeScript plugin for spawning and controlling [Tauri v2](https://tauri.app) WebViews from the frontend.

Provides typed handles for webview navigation, reloading, resizing, repositioning, and lifecycle management.

## Installation

```sh
pnpm add @codenhub/tauri-plugin-webview
npm install @codenhub/tauri-plugin-webview
yarn add @codenhub/tauri-plugin-webview
bun add @codenhub/tauri-plugin-webview
```

## Usage

First, ensure the companion Rust commands are set up in your Tauri Rust application (see [Rust Integration Setup](#rust-integration-setup)).

### Spawn and control a WebView

```ts
import { spawnWebview } from "@codenhub/tauri-plugin-webview";

// Spawn a new WebView window
const handle = await spawnWebview({
  label: "child-view",
  url: "https://tauri.app",
  size: { width: 800, height: 600 },
  position: { x: 100, y: 100 },
});

// Navigate to a different URL
await handle.navigate("https://github.com");

// Reload the page
await handle.reload();

// Resize and move
await handle.setSize({ width: 1024, height: 768 });
await handle.setPosition({ x: 50, y: 50 });

// Focus or hide
await handle.setFocus();
await handle.hide();

// Show and zoom
await handle.show();
await handle.setZoom(1.25);

// Close and destroy
await handle.destroy();
```

## Reference

### `@codenhub/tauri-plugin-webview`

Primary entrypoint for the package's public API.

```ts
import {
  spawnWebview,
  getWebview,
  getCurrentWebview,
  listWebviews,
  type WebviewHandle,
  type WebviewConfig,
  type WebviewSize,
  type WebviewPosition,
} from "@codenhub/tauri-plugin-webview";
```

#### `spawnWebview()`

Spawns a new WebviewWindow with the given configuration.

```ts
function spawnWebview(config: WebviewConfig): Promise<WebviewHandle>;
```

| Parameter | Type            | Description                               |
| --------- | --------------- | ----------------------------------------- |
| `config`  | `WebviewConfig` | Configuration for the new WebView window. |

Returns `Promise<WebviewHandle>`.

- **Observable Failure Behavior**:
  - Throws an `Error` if a window with the same `label` already exists.
  - Throws an `Error` if window creation fails in the Tauri runtime (receives `tauri://error`).
  - Throws an `Error` if the window fails to spawn within a 5-second timeout.

#### `getWebview()`

Returns a handle to an existing WebviewWindow by its unique label.

```ts
function getWebview(label: string): Promise<WebviewHandle | undefined>;
```

| Parameter | Type     | Description                     |
| --------- | -------- | ------------------------------- |
| `label`   | `string` | The unique label of the window. |

Returns `Promise<WebviewHandle | undefined>`. Resolves to `undefined` if no window with the given label is found.

#### `getCurrentWebview()`

Returns a handle to the current WebviewWindow context.

```ts
function getCurrentWebview(): WebviewHandle;
```

Returns `WebviewHandle` representing the current executing WebView context.

#### `listWebviews()`

Returns handles for all currently active WebviewWindows in the Tauri application.

```ts
function listWebviews(): Promise<WebviewHandle[]>;
```

Returns `Promise<WebviewHandle[]>`.

---

#### `WebviewHandle`

A live handle to a WebviewWindow in the Tauri runtime. All methods are asynchronous and communicate over Tauri IPC.

```ts
interface WebviewHandle {
  readonly label: string;
  navigate(url: string): Promise<void>;
  reload(): Promise<void>;
  setSize(size: WebviewSize): Promise<void>;
  setPosition(position: WebviewPosition): Promise<void>;
  setFocus(): Promise<void>;
  setZoom(scaleFactor: number): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  destroy(): Promise<void>;
}
```

- **`label`**: The unique identifier of the WebView window.
- **`navigate(url: string)`**: Navigates the WebView to the given URL. Throws `Error` if the window is not found or the URL is invalid.
- **`reload()`**: Reloads the current page. Throws `Error` if the window is not found.
- **`setSize(size: WebviewSize)`**: Resizes the window to the given logical dimensions. Throws `Error` if setting the size fails.
- **`setPosition(position: WebviewPosition)`**: Moves the window to the given logical coordinates. Throws `Error` if setting the position fails.
- **`setFocus()`**: Focuses the window. Throws `Error` if focusing fails.
- **`setZoom(scaleFactor: number)`**: Sets the zoom scale (e.g., `1.0` = 100%). Throws `Error` if setting zoom fails.
- **`show()`**: Shows the window. Throws `Error` if showing fails.
- **`hide()`**: Hides the window without destroying it. Throws `Error` if hiding fails.
- **`destroy()`**: Closes and destroys the window. The handle becomes invalid after this call. Throws `Error` if destruction fails.

---

#### `WebviewConfig`

Configuration options for spawning a new WebView.

```ts
interface WebviewConfig {
  label: string;
  url: string;
  size?: WebviewSize;
  position?: WebviewPosition;
  parentWindow?: string;
}
```

| Property       | Type              | Default     | Description                                              |
| -------------- | ----------------- | ----------- | -------------------------------------------------------- |
| `label`        | `string`          | _Required_  | Unique identifier for this WebView window.               |
| `url`          | `string`          | _Required_  | Initial URL to load.                                     |
| `size`         | `WebviewSize`     | `undefined` | Initial width/height of the window in logical pixels.    |
| `position`     | `WebviewPosition` | `undefined` | Initial x/y coordinates of the window on screen.         |
| `parentWindow` | `string`          | `undefined` | Label of the parent window. Omit for a top-level window. |

---

#### `WebviewSize`

Logical size dimensions.

```ts
interface WebviewSize {
  width: number;
  height: number;
}
```

#### `WebviewPosition`

Logical screen coordinates.

```ts
interface WebviewPosition {
  x: number;
  y: number;
}
```

## Rust Integration Setup

Because Tauri v2 does not expose programmatic URL navigation on the frontend, this plugin requires companion Rust commands in your Tauri backend.

1. Copy [webview_commands.rs](./src/webview_commands.rs) to your Tauri Rust project (e.g. at `src-tauri/src/webview_commands.rs`).
2. Include the module and register the commands in your `src-tauri/src/lib.rs` (or `main.rs`):

```rust
mod webview_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            webview_commands::navigate_webview,
            webview_commands::reload_webview,
        ])
        // ...
}
```

## Requirements

- **Tauri v2**: Requires `@tauri-apps/api ^2.0.0` installed by the consumer app.
- **Context**: Must run inside a Tauri WebView context, not a standard browser.
- **Backend Commands**: Requires registering the companion Rust commands (`navigate_webview`, `reload_webview`) to support navigation and reloading.

## Notes

- **Scope**: Covers WebView-level control (spawning, navigating, sizing, visibility, destruction). It does not cover OS window decorations or chrome; use `@codenhub/tauri-plugin-window` for window chrome, titlebars, and system window states.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
