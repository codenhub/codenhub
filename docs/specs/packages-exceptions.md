---
status: IMPLEMENTED
last_updated: 2026-08-16
scope: Approved exceptions for workspace packages.
---

# Package exceptions

This document is the central register for package-specific exceptions to
repository guidelines and package specs. New exceptions MUST follow the
exception rules in `docs/docs-guidelines.md`.

An exception to a rule that `hub check` enforces MUST also declare a
`Checks bypassed` bullet listing the affected check codes in backticks, as shown
below. `hub check` reads that bullet, so a waiver cannot exist without being
recorded here. Run `pnpm check --json` to see the code behind any finding.

`hub check` reports a waiver that suppresses nothing, so a stale entry or a
mistyped code or package name surfaces instead of looking effective. Remove an
entry once the package no longer needs it.

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
- **Checks bypassed:** `metadata/main`, `metadata/module`, `metadata/types`.
- **Where it applies:** `packages/styles/`.
- **Why acceptable:** The package is CSS-only and exposes no JavaScript or
  TypeScript API. Adding `main`, `module`, and `types` would provide no usable
  runtime or declaration entrypoint.
- **Temporary or permanent:** Permanent.

## `@codenhub/styles`: Coverage report

- **Rules bypassed:** `docs/specs/tests.md` (`test:coverage` outputs a coverage
  report).
- **Where it applies:** The `test:coverage` script in
  `packages/styles/package.json`.
- **Why acceptable:** The package contains only CSS, so JavaScript or TypeScript
  instrumentation cannot produce meaningful code coverage. The script runs the
  package's real integration tests instead of reporting a false success or
  generating an irrelevant report, and its cross-browser computed-style tests
  run under `pnpm test:browser`.
- **Temporary or permanent:** Permanent while the package remains CSS-only.

## `@codenhub/styles`: no visual regression baselines

- **Rules bypassed:** `docs/specs/tests.md` (use visual regression testing for
  style sheets and components to capture visual changes before merge).
- **Where it applies:** `packages/styles/tests/browser/`.
- **Why acceptable:** The package is CSS-only, and the asserted contract is
  limited to token resolution, computed composition, state and accessibility
  behavior, material geometry, and related DOM behavior. The browser suite
  asserts those contracts directly in Chromium, Firefox, and WebKit, including
  glass and reduced-transparency behavior. These assertions do not detect every
  final-paint defect: clipping or compositing integration, font rendering,
  antialiasing, and interactions among properties that each compute correctly
  can still be wrong on screen. Screenshot baselines would add substantial
  platform variance without making those failures reliably diagnostic, so the
  current targeted assertions are the more effective gate for this package.
- **Temporary or permanent:** Permanent while the package remains CSS-only and
  this computed-style, cross-browser strategy remains effective.
- **Reevaluate when:** The package stops being CSS-only; the browser suite stops
  covering Chromium, Firefox, and WebKit or its glass and reduced-transparency
  branches; the public contract adds a visual outcome that computed styles and
  DOM behavior cannot assert; or a confirmed final-paint, clipping, compositing,
  font-rendering, antialiasing, or correct-property-interaction regression passes
  the suite. Reevaluation means choosing an effective test for the demonstrated
  gap and updating this exception; it does not presume screenshot baselines.

## `@codenhub/error`: built-in opt-in registry presets

- **Rules bypassed:** `docs/specs/errors.md` (general library packages must not
  instantiate or export preset registries when publishing error definitions).
- **Where it applies:** `packages/error/src/registries/` and the public registry
  preset exports from `@codenhub/error/registries` and its browser and Supabase
  subpaths.
- **Why acceptable:** `@codenhub/error` owns the shared registry implementation
  and built-in integrations. Its presets are frozen, opt-in snapshots; importing
  them does not mutate the global registry, establish external connections, or
  add runtime dependencies. Raw mapping exports remain available for consumers
  that need definitions without preset registries.
- **Temporary or permanent:** Permanent while `@codenhub/error` remains the
  designated owner of built-in error integrations.
