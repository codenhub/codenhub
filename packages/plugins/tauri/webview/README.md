# @codenhub/tauri-plugin-webview

> **Draft** — This package is under active development. Public API, exports,
> and behavior are unstable and may change without notice. The standard package
> lifecycle and README guidelines do not apply until this notice is removed.

TypeScript plugin for spawning and controlling [Tauri v2](https://tauri.app) WebViews
from the frontend. Provides typed handles for navigation, resizing, repositioning,
and lifecycle management.

## Requirements

- Tauri v2 (`@tauri-apps/api ^2.0.0`) — must be installed by the consumer app.
- Must run inside a Tauri WebView context (not a standard browser).

## Scope

Covers WebView-level control: spawn, navigate, reload, resize, reposition, destroy.

Does **not** cover window chrome, decorations, or OS-level window state —
use [`@codenhub/tauri-plugin-window`](../window) for that.

## License

Apache-2.0
