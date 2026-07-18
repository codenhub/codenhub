---
title: Overview
---

# Create and control Tauri webviews

`@codenhub/tauri-plugin-webview` creates and controls Tauri v2 `WebviewWindow`
instances from bundled frontend code. It provides typed navigation, reload,
geometry, focus, zoom, visibility, and destruction operations.

## Setup

### Installation

```sh
pnpm add @codenhub/tauri-plugin-webview @tauri-apps/api
```

### Quick start

Before using the frontend API, copy and register the shipped Rust navigation and
reload commands, then grant the bundled caller the required Tauri capabilities.
Follow [Setup and security](setup.md) for the exact Rust registration and
least-privilege permission list.

```ts
import { spawnWebview } from "@codenhub/tauri-plugin-webview";

const webview = await spawnWebview({
  label: "help",
  url: "https://example.com/help",
  size: { width: 800, height: 600 },
});

await webview.setFocus();
```

Creation rejects after five seconds if Tauri does not emit a result. IPC calls
reject when command registration, capabilities, labels, URLs, or native
operations are invalid.

## Requirements

- Tauri v2 and a consumer-installed `@tauri-apps/api` compatible with `^2.0.0`.
- Bundled frontend code running in a Tauri v2 WebView. Normal browsers, SSR,
  and Node.js runtimes are not supported.
- The shipped `navigate_webview` and `reload_webview` Rust commands registered
  with the application.
- Tauri v2 capabilities for every operation the bundled caller uses.
- An application-enforced URL allowlist when navigation is restricted. The Rust
  command accepts any URL parsed by Tauri and provides no origin allowlist;
  remote pages must not receive Tauri API access merely because they are shown.
- Per-target testing. Focus, zoom, geometry, parenting, remote navigation, and
  creation vary by platform, window manager, and system webview; the package
  provides no compatibility shim or tested platform matrix.

## Next steps

- [Setup and security](setup.md): Register the Rust commands, configure
  least-privilege capabilities, and secure navigation.
- [API and runtime reference](reference.md): Choose creation and lookup APIs,
  use `WebviewHandle`, and understand lifecycle, failures, and platforms.

For OS window state and chrome without webview navigation, use
`@codenhub/tauri-plugin-window` instead.
