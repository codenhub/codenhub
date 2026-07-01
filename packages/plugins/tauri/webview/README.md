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

## Rust Integration Setup

Because Tauri v2 does not expose programmatic URL navigation on the frontend, this plugin requires companion Rust commands.

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

## License

Apache-2.0
