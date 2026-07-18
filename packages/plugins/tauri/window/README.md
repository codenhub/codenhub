# @codenhub/tauri-plugin-window

Controls Tauri v2 OS window state, chrome, placement, visibility, and lifecycle
from bundled frontend code.

> **Experimental:** The API, required permissions, and platform support may
> change before a stable release. Validate native behavior against every Tauri
> target you ship.

## Installation

```sh
pnpm add @codenhub/tauri-plugin-window @tauri-apps/api
```

## Usage

Grant the Tauri capability permissions listed in the
[setup guide](docs/setup.md), then obtain or create a window handle.

```ts
import { getCurrentWindowHandle } from "@codenhub/tauri-plugin-window";

const windowHandle = getCurrentWindowHandle();
await windowHandle.setTitle("CodenHub");
await windowHandle.toggleMaximize();
```

Calls reject when permissions are missing or Tauri cannot perform the native
operation.

## Documentation

- [Documentation overview](docs/index.md)
- [Tauri setup, permissions, and security](docs/setup.md)
- [API, lifecycle, platforms, and failures](docs/reference.md)

## Requirements

- Tauri v2 and a consumer-installed `@tauri-apps/api` matching the package's
  declared peer dependency.
- Bundled frontend code running in a Tauri WebView, not a normal browser.
- Tauri v2 capabilities for every operation the application uses.

## Notes

This package does not navigate or manage webview content. Use
`@codenhub/tauri-plugin-webview` for that purpose. Native window behavior varies
by platform and window manager.

## License

Apache-2.0.
