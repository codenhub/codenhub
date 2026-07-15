---
status: IMPLEMENTED
last_updated: 2026-07-15
scope: Approved exceptions for workspace packages under `packages/*`.
---

# Package exceptions

This document is the central register for package-specific exceptions to
repository guidelines and package specs. New exceptions MUST follow the
exception rules in `docs/docs-guidelines.md`.

## `@codenhub/tauri-plugin-webview` and `@codenhub/tauri-plugin-window`: draft phase

- **Rules bypassed:** `docs/specs/packages-lifecycle.md` (full JSDoc coverage,
  complete lifecycle scripts enforced in CI, and `prepublishOnly` checks) and
  `docs/specs/packages-readme.md` (required README structure and section
  completeness).
- **Where it applies:** `packages/plugins/tauri/webview/` and
  `packages/plugins/tauri/window/`.
- **Why acceptable:** Both packages are in active early development. APIs are
  unstable and will change. Each README carries a prominent `Draft` notice so
  consumers know the package is not ready for production. Enforcing full
  lifecycle compliance before the API stabilizes would create churn with no
  consumer benefit.
- **Temporary or permanent:** Temporary. This exception MUST be removed and both
  packages brought into full compliance, including complete JSDoc, README
  sections, and lifecycle scripts, before the draft notice is removed and either
  package is published.

## `@codenhub/tauri-plugin-webview`: Rust-specific conventions

- **Rules bypassed:** `docs/code-guidelines.md` (files and folders use kebab-case;
  variables and functions use camelCase).
- **Where it applies:**
  `packages/plugins/tauri/webview/src/webview_commands.rs` and associated Rust
  command and module identifiers, such as `webview_commands`,
  `navigate_webview`, and `reload_webview`.
- **Why acceptable:** Companion Rust code must follow idiomatic Rust naming
  conventions (snake_case for files, functions, and modules) to prevent compiler
  warnings and stay consistent with Tauri Rust APIs.
- **Temporary or permanent:** Permanent.

## `@codenhub/styles`: CSS-only package

- **Rules bypassed:** `docs/specs/packages-lifecycle.md` (metadata fields `main`,
  `module`, and `types` required in `package.json`).
- **Where it applies:** `packages/styles/`.
- **Why acceptable:** The package is CSS-only and exposes no JavaScript or
  TypeScript API. Adding `main`, `module`, and `types` would provide no usable
  runtime or declaration entrypoint.
- **Temporary or permanent:** Permanent.
