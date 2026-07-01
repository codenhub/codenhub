# Documentation guidelines

**Status:** IMPLEMENTED
**Last updated:** 2026-06-05

This document covers how the documentation in this project is structured, maintained, and how it should be interpreted, including this document itself.

## Required header

Every durable document in `docs/` MUST start with these fields, in this order:

- `Status`: how reliable and authoritative the document is.
- `Last updated`: date of the last meaningful content change.

Documents SHOULD include `Scope` when the title alone does not make ownership clear.

Allowed statuses:

- `DRAFT`: Work in progress. Use as context, not as binding source of truth.
- `APPROVED`: Agreed source of truth. Future work MUST follow it. Existing code may be non-compliant and should be treated as legacy until updated.
- `IMPLEMENTED`: Agreed source of truth and current implementation is expected to comply. New exceptions MUST be documented or the document MUST be updated.

## Source of truth

Documentation MUST be updated in the same change when behavior, architecture, conventions, or project decisions change.

Truth priority is:

1. APPROVED or IMPLEMENTED documentation.
2. DRAFT documentation.
3. Existing code.

When APPROVED or IMPLEMENTED documentation conflicts with code, the documentation describes the intended direction and the code should be treated as legacy unless the document is outdated.

When APPROVED or IMPLEMENTED documents conflict with each other, the conflict MUST be resolved in the same change if practical. If not practical, move the conflicting documents to `DRAFT` and add a short note explaining the conflict.

Prefer updating existing documents over creating new overlapping ones. Prefer updating documentation before changing code, so the intended direction is clear before implementation follows.

## Exceptions

Exceptions to APPROVED or IMPLEMENTED documents MUST be explicit, scoped, and justified.

An exception MUST state:

- What rule is being bypassed.
- Where the exception applies.
- Why the exception is acceptable.
- Whether it is temporary or permanent.

Do not create broad exceptions for one-off cases. Prefer changing the rule when repeated exceptions show the rule is wrong.

## What belongs here

Use `docs/` for durable project knowledge:

- Architecture decisions.
- Implementation guidelines.
- Long-term conventions.
- Feature specs.
- Source-of-truth decisions.

Do not use `docs/` for temporary notes, TODO lists, or information better expressed in code comments. Also do not use root `docs/` for package-specific documentation; those should be at `packages/<package-name>/docs/`, because each package should own its own package-level rules and documentation.

Plans and similar temporary documents MAY live in `docs/plans/`. This directory is git-ignored and should stay that way because these documents are short-lived planning aids, not long-term project documentation.

## Exceptions

### `@codenhub/tauri-plugin-webview` and `@codenhub/tauri-plugin-window` — draft phase

- **Rules bypassed:** `docs/specs/packages-lifecycle.md` (full JSDoc coverage, complete lifecycle scripts enforced in CI, prepublishOnly checks) and `docs/specs/packages-readme.md` (required README structure and section completeness).
- **Where it applies:** `packages/plugins/tauri/webview/` and `packages/plugins/tauri/window/`.
- **Why acceptable:** Both packages are in active early development. APIs are unstable and will change. Each README carries a prominent `> **Draft**` notice so consumers know the package is not ready for production. Enforcing full lifecycle compliance before the API stabilizes would create churn with no consumer benefit.
- **Temporary or permanent:** Temporary. This exception MUST be removed and both packages brought into full compliance — including complete JSDoc, README sections, and lifecycle scripts — before the draft notice is removed and either package is published.

### `@codenhub/tauri-plugin-webview` — Rust-specific conventions

- **Rules bypassed:** `docs/code-guidelines.md` (Files & Folders: kebab-case; Variables & Functions: camelCase).
- **Where it applies:** `packages/plugins/tauri/webview/src/webview_commands.rs` and associated Rust command/module identifiers (e.g. `webview_commands`, `navigate_webview`, `reload_webview`).
- **Why acceptable:** Companion Rust code must follow idiomatic Rust naming conventions (snake_case for files, functions, and modules) to prevent compiler warnings and maintain consistency with Tauri Rust APIs.
- **Temporary or permanent:** Permanent.
