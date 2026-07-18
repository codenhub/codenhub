# @codenhub/tauri-plugin-webview

Creates and controls Tauri v2 `WebviewWindow` instances from bundled frontend
code, including navigation and reload through shipped companion Rust commands.

> **Experimental:** The API, required permissions, Rust integration, and
> platform support may change before a stable release. Validate it against every
> Tauri target you ship.

## Installation

```sh
pnpm add @codenhub/tauri-plugin-webview @tauri-apps/api
```

## Usage

Copy and register the shipped `rust/webview_commands.rs`, then grant the Tauri
capability permissions listed in the [setup guide](docs/setup.md).

```ts
import { spawnWebview } from "@codenhub/tauri-plugin-webview";

const webview = await spawnWebview({
  label: "help",
  url: "https://example.com/help",
  size: { width: 800, height: 600 },
});

await webview.setFocus();
```

Creation rejects after five seconds if Tauri does not emit a creation result.
IPC calls reject when setup, permissions, labels, URLs, or native operations are
invalid.

## Documentation

- [Documentation overview](docs/index.md)
- [Tauri setup, permissions, and security](docs/setup.md)
- [API, lifecycle, platforms, and failures](docs/reference.md)

## Requirements

- Tauri v2 and a consumer-installed `@tauri-apps/api` compatible with `^2.0.0`.
- Bundled frontend code running in a Tauri WebView, not a normal browser.
- The shipped Rust commands and required Tauri v2 capabilities.

## Notes

This package controls a webview and its hosting window. It does not provide OS
window-state abstractions; use `@codenhub/tauri-plugin-window` for those.

## License

Licensed under Apache-2.0.
