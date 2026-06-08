# Package README spec

**Status:** APPROVED
**Last updated:** 2026-06-08
**Scope:** README files for workspace packages.

This document defines the expected structure and content for package README files.

## Compliance

Every `private: false` package under `packages/*` MUST have a `README.md` that follows this spec.

Private packages and apps MAY follow this spec when it improves maintainability, onboarding, or usage clarity. They are not required to comply unless another document says so.

## Purpose

A package README is the public package usage contract for default behavior, the main use case, and the common happy path. It should explain what the package does, how to use it, what it exports for common consumer usage, and what constraints users must know before depending on it.

A package README SHOULD explain intended behavior in natural language before presenting code examples or API reference. Code examples should demonstrate the documented behavior, not replace it.

The README is not the only source of truth for complex packages. When full documentation would make the README noisy or difficult to scan, deeper guides SHOULD live in package-level `.docs/` files and the README SHOULD link to them.

The README SHOULD document public behavior, not internal implementation details.

## Required structure

Public package README files MUST follow this structure unless a section is explicitly omitted under the omission rules.

1. Title: package name exactly as published, such as `# @codenhub/theme`.
2. Description: short description of what the package does + important details users need to know.
3. Installation: package manager command, when the package is installed directly.
4. Usage: at least one minimal working example for the main use case.
5. Reference: documented public exports users are expected to call, instantiate, import, configure, or style against.
6. Examples: common workflows and real-world scenarios.
7. Requirements: browser, Node, SSR, framework, peer dependency, CSS, storage, DOM, or build-tool requirements.
8. Notes: flexible final section for limitations, non-goals, caveats, stability notes, or other package-specific considerations that do not fit earlier sections.

Headings should use these names when practical. Small wording changes are allowed when they improve clarity for the package, but the section purpose MUST stay recognizable.

## Reference

The Reference section MUST document the primary public entrypoint listed in `package.json` `exports`, plus any subpath entrypoints that are part of default or common consumer usage. For each covered entrypoint, document the consumer-facing symbols available from it, such as functions, classes, types, structures, CSS files, plugins, config objects, assets, or other public package surfaces.

The Reference section SHOULD describe what each public surface is for, when to use it, and the default behavior it guarantees. It should aim at default behavior, the happy path, and common consumer usage; signatures alone are not sufficient documentation, and the README does not need to be exhaustive when deeper package-level `.docs/` would be clearer.

Document only public behavior. Do not document private files, implementation details, or exports that consumers should not use.

If a package has many public entrypoints or advanced APIs, the README SHOULD cover the default and most common entrypoints, then link to package-level `.docs/` files for full details. The README should stay useful as a reference, not become exhaustive documentation when a separate guide would be clearer.

For each applicable item, include:

- Name and kind: function, class, type, interface, constant, event, CSS file, plugin, config object, or asset.
- Import path.
- Signature or shape, when applicable.
- Parameters, properties, or fields users need to provide or read.
- Return value, emitted value, generated output, or side effect.
- Error or failure behavior, when applicable.
- A short example when the item is not obvious from quick start.

## Omission rules

README files SHOULD stay concise, but they MUST NOT omit default behavior, the main use case, or common consumer usage to save space.

A section or API category MAY be omitted only when it does not apply to the README-level public usage contract:

- Omit `Installation` only when the package is never installed directly by consumers.
- Omit functions when the package has no public functions.
- Omit classes when the package has no public classes.
- Omit methods when the package has no public methods.
- Omit events when the package emits, listens to, or documents no public events.
- Omit types or interfaces when the package exposes no public consumer-facing types.
- Omit CSS, assets, or plugin entrypoints when the package exposes none, or when they are advanced surfaces documented in package-level `.docs/` instead of the README.
- Omit additional examples when there is only one meaningful workflow.

Very small packages MAY have fewer headings only when all required information remains present and easy to scan.

Large packages MAY move deep guides to package-level `.docs/`, but README MUST still cover the public usage contract for default behavior, the main use case, and common consumer usage, then link to those guides.

README files MUST NOT contradict APPROVED or IMPLEMENTED package-level `.docs/` source-of-truth documents. When public behavior changes, update the README and relevant package-level `.docs/` files together when both are affected.

## Template

Use [packages-readme-template.md](packages-readme-template.md) as the starting point for public package README files. Remove only sections that are allowed by the omission rules.

## Package type requirements

Utility packages MUST document:

- Main exports and subpath imports that are part of default or common consumer usage.
- Error behavior: throws, returns `Result`, returns `null`, or uses another failure model.
- Input boundary expectations, especially for `unknown`, validation, coercion, and parsing.

Browser packages MUST document:

- Browser APIs used, such as `window`, `document`, `localStorage`, events, or media queries.
- SSR behavior when browser APIs are unavailable.
- Cleanup or lifecycle APIs when listeners, subscriptions, timers, or DOM mutations are used.

UI or CSS packages MUST document:

- Required CSS imports.
- Theme, token, class, attribute, or customization model.
- Accessibility responsibilities that belong to the package versus the consumer.
- Framework requirements, if any.

Build-tool or plugin packages MUST document:

- Minimal config example.
- Plugin order requirements.
- Peer dependencies and supported version ranges.
- Generated files, transformed files, or build output behavior.

Type-only packages MUST document:

- Public type or interface entrypoints.
- Runtime behavior, if none, as explicitly none.
- Expected import style, such as regular imports or `import type`.

Asset or token packages MUST document:

- Public assets, token files, or generated structures consumers are expected to import.
- Naming, stability, and customization expectations.
- Build-tool, bundler, or runtime requirements for consuming the assets.

## Optional sections

Use these sections when they add value:

- Recipes.
- Troubleshooting.
- Migration notes.
- FAQ.
- Changelog link.
- Related packages.

Packages with deprecated, experimental, unstable, or partially stable public surfaces SHOULD state that status near the relevant README section when consumers need it to make safe adoption decisions. This is recommended when the package has behavior, APIs, generated output, styling hooks, or support levels that are not fully stable.

A status table MAY be used when a package has multiple public surfaces with different stability or lifecycle states. This is recommended when prose would make it hard to quickly see what is stable, experimental, deprecated, planned, or intentionally unsupported.

## Content rules

README content MUST be accurate for the published public API.

README content MUST NOT include:

- Undocumented exports or examples that require private internals.
- Stale TODOs, roadmap promises, or speculative features.
- Marketing copy that does not help usage.
- Long implementation explanations better kept in code or package-level `.docs/`.
- Secrets, private URLs, credentials, or environment-specific local paths.

Examples MUST be small, copyable, and realistic. Prefer complete snippets over fragments when missing context would confuse users.

If an example omits setup for brevity, the omission MUST be obvious or stated.

## Exceptions

Deprecated packages MUST state they are deprecated near the top and point to the replacement when one exists.

Experimental packages MUST state what is unstable: API shape, behavior, build output, or support level.
