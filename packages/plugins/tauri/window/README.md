# @codenhub/tauri-plugin-window

> **Draft** — This package is under active development. Public API, exports,
> and behavior are unstable and may change without notice. The standard package
> lifecycle and README guidelines do not apply until this notice is removed.

TypeScript plugin for controlling [Tauri v2](https://tauri.app) window state
from the frontend. Provides typed handles for window chrome, decorations,
min/max/fullscreen state, size, position, and visibility.

## Requirements

- Tauri v2 (`@tauri-apps/api ^2.0.0`) — must be installed by the consumer app.
- Must run inside a Tauri WebView context (not a standard browser).

## Scope

Covers OS window control: state (min/max/fullscreen), decorations, title, size,
position, visibility, and lifecycle.

Does **not** cover WebView content, navigation, or spawning child webviews —
use [`@codenhub/tauri-plugin-webview`](../webview) for that.

## License

Apache-2.0
