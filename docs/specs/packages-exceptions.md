---
status: IMPLEMENTED
last_updated: 2026-07-22
scope: Approved exceptions for workspace packages.
---

# Package exceptions

This document is the central register for package-specific exceptions to
repository guidelines and package specs. New exceptions MUST follow the
exception rules in `docs/docs-guidelines.md`.

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

## `@codenhub/styles`: Coverage report

- **Rule bypassed:** `docs/specs/tests.md` (`test:coverage` outputs a coverage
  report).
- **Where it applies:** The `test:coverage` script in
  `packages/styles/package.json`.
- **Why acceptable:** The package contains only CSS, so JavaScript or TypeScript
  instrumentation cannot produce meaningful code coverage. The script runs the
  package's actual type, build, and cross-browser visual/computed-style tests
  instead of reporting a false success or generating an irrelevant report.
- **Temporary or permanent:** Permanent while the package remains CSS-only.
