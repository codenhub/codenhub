# @codenhub/tauri-plugin-webview

> **Experimental:** The frontend API, permission set, companion Rust setup, and
> platform support remain unstable. Test the complete integration on each target
> before production adoption.

`@codenhub/tauri-plugin-webview` creates and controls Tauri v2 `WebviewWindow`
instances from bundled frontend code. Use it when an app needs separately
addressable webview windows with typed navigation, reload, geometry, focus,
zoom, visibility, and destruction operations.

## Start With Tauri Setup

Follow [Tauri setup, permissions, and security](setup.md) before calling the
frontend API. Correct setup requires copying and registering the shipped Rust
navigation and reload commands, then granting only the Tauri capabilities each
bundled caller needs. The package does not register that backend work for you.

Treat every URL as security-sensitive: the companion command has no origin
allowlist, and displaying a remote page must not grant it Tauri API access.

After setup, use the [API and runtime reference](reference.md) to choose creation
and lookup functions, work with `WebviewHandle`, and understand lifecycle,
failure, and platform behavior. The package runs in a Tauri v2 WebView, not a
normal browser, SSR process, or Node.js runtime. Native behavior must be verified
on every target you ship.

For OS window state and chrome without webview navigation, use
`@codenhub/tauri-plugin-window` instead.
