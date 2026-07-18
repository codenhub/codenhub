---
title: Setup
---

# Setup and security

## Install

```sh
pnpm add @codenhub/tauri-plugin-window @tauri-apps/api
```

The package is ESM and must run in a Tauri v2 WebView. Browser-only, SSR, and
Node.js execution are not supported runtime contexts. No Rust module or Tauri
plugin registration is required.

## Grant Core Permissions

Assign a capability to each bundled caller and grant permissions for the methods
it uses. The complete public surface uses:

```json
{
  "permissions": [
    "core:window:default",
    "core:window:allow-close",
    "core:window:allow-create",
    "core:window:allow-destroy",
    "core:window:allow-hide",
    "core:window:allow-maximize",
    "core:window:allow-minimize",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-decorations",
    "core:window:allow-set-fullscreen",
    "core:window:allow-set-position",
    "core:window:allow-set-resizable",
    "core:window:allow-set-size",
    "core:window:allow-set-title",
    "core:window:allow-show",
    "core:window:allow-toggle-maximize",
    "core:window:allow-unmaximize"
  ]
}
```

`core:window:default` supplies window enumeration and the three state queries
used by `getState()`. The created and error events used during creation are local
to Tauri's `Window` object and do not need a core event permission. Remove
permissions for operations the caller does not use. Confirm identifiers against
the generated capability schema for the exact Tauri version in the consumer app.

## Trust Boundaries

Window capabilities can create, obscure, reposition, or destroy native windows.
Grant them only to trusted bundled webviews and scope capabilities by
window/webview label. Tauri merges permissions when a caller matches multiple
capabilities. This package does not add authorization, constrain target labels,
or sanitize numeric geometry values.
