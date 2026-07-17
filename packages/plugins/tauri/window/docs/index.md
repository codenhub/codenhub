# @codenhub/tauri-plugin-window

> **Experimental:** The frontend API, permission set, and platform support
> remain unstable. Test native behavior on each target before production
> adoption.

`@codenhub/tauri-plugin-window` wraps Tauri v2 OS window APIs with typed handles.
Use it when bundled frontend code needs to create or find windows and control
state, native chrome, geometry, visibility, or lifecycle.

## Start With Capabilities

Follow [Tauri setup, permissions, and security](setup.md) to install the package
and grant each bundled caller only the core window permissions it needs. No Rust
module or Cargo plugin registration is required, but calls reject when required
capabilities are missing.

Once capabilities are in place, use the [API and runtime reference](reference.md)
to choose creation and lookup functions, work with `WindowHandle`, and
understand state precedence, close versus destroy, failures, and platform
behavior.

The package runs in a Tauri v2 WebView, not a normal browser, SSR process, or
Node.js runtime. Window behavior varies by platform and window manager, so test
every operation you ship. Grant window-control capabilities only to trusted
bundled webviews because they can create, obscure, reposition, or destroy native
windows.

For webview content, navigation, and reload, use
`@codenhub/tauri-plugin-webview` instead.
