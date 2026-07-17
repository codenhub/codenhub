# API and Runtime Reference

All symbols are exported from `@codenhub/tauri-plugin-webview`.

## Creation and Lookup

### `spawnWebview(config)`

Creates a Tauri `WebviewWindow`, waits for `tauri://created`, and returns a
`Promise<WebviewHandle>`. It rejects for an existing label detected before
creation, event-registration or Tauri creation errors, or a five-second timeout.
The initial page may still be loading when the promise resolves.

### `getWebview(label)`

Resolves to a handle for the matching label, or `undefined` when none exists.
Enumeration can reject if IPC or permissions fail.

### `getCurrentWebview()`

Synchronously wraps the current Tauri `WebviewWindow` context.

### `listWebviews()`

Resolves to handles for the webview windows visible to Tauri. Enumeration can
reject if IPC or permissions fail.

## Configuration Types

`WebviewConfig` requires a unique `label` and initial `url`. Tauri labels accept
ASCII alphanumeric characters plus `-`, `/`, `:`, and `_`. Optional `size` and
`position` use logical pixels. Optional `parentWindow` is the label of a parent
window; omitting it creates a top-level webview window.

`WebviewSize` contains numeric `width` and `height`. `WebviewPosition` contains
numeric `x` and `y`. The package does not validate ranges, screen bounds, or
finite values before passing them to Tauri.

## `WebviewHandle`

Every handle exposes its readonly `label` and these asynchronous methods:

| Method                  | Effect                                               |
| ----------------------- | ---------------------------------------------------- |
| `navigate(url)`         | Invokes the shipped Rust `navigate_webview` command. |
| `reload()`              | Invokes the shipped Rust `reload_webview` command.   |
| `setSize(size)`         | Sets logical width and height.                       |
| `setPosition(position)` | Sets logical screen coordinates.                     |
| `setFocus()`            | Requests focus.                                      |
| `setZoom(scaleFactor)`  | Sets webview zoom, where `1` represents 100%.        |
| `show()` / `hide()`     | Changes visibility without ending the handle.        |
| `destroy()`             | Immediately destroys the hosting window.             |

Methods reject with an `Error` when command registration, capabilities, URL
parsing, label lookup, IPC, or the native operation fails. The package preserves
the underlying failure as the error cause when wrapping handle method failures.

## Lifecycle

Handles are lightweight wrappers and own no listener after creation completes.
The caller does not dispose a handle separately. After `destroy()`, that handle
is stale; later operations can reject. `hide()` does not destroy the webview.
Lookups and lists are snapshots and do not subscribe to lifecycle changes.

## Platforms

The package has no platform detection or compatibility shim. It delegates to
the Tauri v2 `WebviewWindow`, window, DPI, and webview APIs and to the system
webview implementation. Focus, zoom, geometry, parenting, remote navigation,
and window creation can differ or be unavailable on a target. The package does
not declare a tested desktop or mobile support matrix; verify each used method
on every target and window manager the application supports.
