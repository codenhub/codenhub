# API and Runtime Reference

All symbols are exported from `@codenhub/tauri-plugin-window`.

## Creation and Lookup

### `createWindow(config)`

Creates a Tauri `Window`, waits for `tauri://created`, and returns a
`Promise<WindowHandle>`. It rejects when event registration or Tauri creation
fails, including a label conflict, or when creation does not complete within
five seconds. The package does not perform a separate duplicate-label precheck.

### `getWindow(label)`

Resolves to the matching handle or `undefined`. Enumeration can reject when IPC
or permissions fail.

### `getCurrentWindowHandle()`

Synchronously wraps the OS window containing the current WebView.

### `listWindows()`

Resolves to handles for all windows visible to Tauri. Enumeration can reject
when IPC or permissions fail.

## State and Configuration

`WindowState` is both a value object and a type. Its values are `NORMAL`,
`MINIMIZED`, `MAXIMIZED`, and `FULLSCREEN`, represented by lowercase strings.
`getState()` queries all three native flags and prioritizes fullscreen, then
maximized, then minimized when a platform reports overlapping states.

`WindowConfig` requires a `label`. Tauri labels accept ASCII alphanumeric
characters plus `-`, `/`, `:`, and `_`. It optionally accepts `title`, logical
pixel `size` and `position`, and the `decorations`, `resizable`, `alwaysOnTop`,
and `visible` booleans. Omitted options use Tauri defaults. `WindowSize` contains
numeric `width` and `height`; `WindowPosition` contains numeric `x` and `y`. The
package does not validate ranges, screen bounds, or finite values.

## `WindowHandle`

Every handle exposes its readonly `label` and these asynchronous methods:

| Method                                             | Effect                                                  |
| -------------------------------------------------- | ------------------------------------------------------- |
| `getState()`                                       | Returns the normalized `WindowState`.                   |
| `minimize()`                                       | Minimizes the window.                                   |
| `maximize()` / `unmaximize()` / `toggleMaximize()` | Changes maximized state.                                |
| `fullscreen(enable)`                               | Enters or exits fullscreen.                             |
| `setTitle(title)`                                  | Sets native title text.                                 |
| `setDecorations(enabled)`                          | Shows or hides native chrome.                           |
| `setResizable(enabled)`                            | Changes user resizing.                                  |
| `setAlwaysOnTop(enabled)`                          | Changes always-on-top state.                            |
| `setSize(size)` / `setPosition(position)`          | Changes logical geometry.                               |
| `setVisible(visible)`                              | Calls Tauri show or hide.                               |
| `close()`                                          | Requests close and emits Tauri's close-requested event. |
| `destroy()`                                        | Forces immediate destruction without close-requested.   |

Methods reject with Tauri's IPC/native failure when a capability is missing, a
handle is stale, or the platform cannot perform the operation.

## Lifecycle

Handles are lightweight wrappers. The caller does not dispose one separately.
`close()` can leave a window open when another Tauri listener prevents the
close; `destroy()` bypasses that request event. After destruction, existing
handles are stale and later operations can reject. `setVisible(false)` only
hides the window. Lookups and lists are snapshots, not subscriptions.

## Platforms

The package has no platform detection or compatibility shim. It delegates to
Tauri v2 and the native window manager. Decorations, always-on-top, fullscreen,
minimize/maximize, positioning, and exact logical-to-physical geometry can vary
or be unavailable by desktop environment or mobile target. The package does not
declare a tested desktop or mobile support matrix; verify every used operation
on every target the application supports.
