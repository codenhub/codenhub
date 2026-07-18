---
title: Overview
---

# Control native Tauri windows

`@codenhub/tauri-plugin-window` wraps Tauri v2 OS window APIs with typed handles.
Use it from bundled frontend code to create or find windows and control state,
native chrome, geometry, visibility, and lifecycle.

## Setup

### Installation

```sh
pnpm add @codenhub/tauri-plugin-window @tauri-apps/api
```

No Rust module or Cargo plugin registration is required.

### Quick start

First grant the bundled caller the core window capabilities for every operation
it uses. The complete permission list and least-privilege guidance are in
[Setup and security](setup.md).

```ts
import { getCurrentWindowHandle } from "@codenhub/tauri-plugin-window";

const windowHandle = getCurrentWindowHandle();
await windowHandle.setTitle("CodenHub");
await windowHandle.toggleMaximize();
```

Calls reject when capabilities are missing, a handle is stale, or Tauri cannot
perform the native operation.

## Requirements

- Tauri v2 and a consumer-installed `@tauri-apps/api` matching the declared peer
  dependency.
- Bundled frontend code running in a Tauri v2 WebView. Normal browsers, SSR,
  and Node.js runtimes are not supported.
- Tauri v2 capabilities for every operation the application uses. Grant
  window-control permissions only to trusted bundled webviews because they can
  create, obscure, reposition, or destroy native windows.
- Per-target testing. Decorations, always-on-top, fullscreen, window state, and
  geometry vary by platform and window manager; the package provides no
  compatibility shim or tested platform matrix.

## Next steps

- [Setup and security](setup.md): Configure least-privilege Tauri capabilities
  and understand the trust boundary.
- [API and runtime reference](reference.md): Choose creation and lookup APIs,
  use `WindowHandle`, and understand state, lifecycle, failures, and platforms.

For webview content, navigation, and reload, use
`@codenhub/tauri-plugin-webview` instead.
