# Package README spec

**Status:** APPROVED
**Last updated:** 2026-06-05
**Scope:** README files for workspace packages.

This document defines the expected structure and content for package README files.

## Compliance

Every `private: false` package under `packages/*` MUST have a `README.md` that follows this spec.

Private packages and apps MAY follow this spec when it improves maintainability, onboarding, or usage clarity. They are not required to comply unless another document says so.

## Purpose

A package README is the public package usage contract. It should explain what the package does, how to use it, what it exports, and what constraints users must know before depending on it.

The README SHOULD document public behavior, not internal implementation details.

## Required structure

Public package README files MUST follow this structure unless a section is explicitly omitted under the omission rules.

1. Title: package name exactly as published, such as `# @codenhub/theme`.
2. Description: one short paragraph explaining purpose and primary use case.
3. Installation: package manager command, when the package is installed directly.
4. Usage: at least one minimal working example for the main use case.
5. API reference: documented public exports users are expected to call, instantiate, import, configure, or style against.
6. Examples: common workflows beyond quick start, when useful.
7. Runtime requirements: browser, Node, SSR, framework, peer dependency, CSS, storage, DOM, or build-tool requirements.
8. Limitations and non-goals: important things the package does not do.

Headings SHOULD use these names when practical. Small wording changes are allowed when they improve clarity for the package, but the section purpose MUST stay recognizable.

## API reference

The API reference MUST document every supported public export listed in `package.json` `exports`, except exports that are fully covered by another required section such as `Imports`.

Document only public behavior. Do not document private files, implementation details, or exports that consumers should not use.

For each applicable API item, include:

- Name and kind: function, class, type, interface, constant, event, CSS file, plugin, config object, or asset.
- Import path.
- Signature or shape, when applicable.
- Parameters, properties, or fields users need to provide or read.
- Return value, emitted value, generated output, or side effect.
- Error or failure behavior, when applicable.
- A short example when the item is not obvious from quick start.

## Omission rules

README files SHOULD stay concise, but they MUST NOT hide public behavior to save space.

A section or API category MAY be omitted only when it truly does not apply to the package:

- Omit `Install` only when the package is never installed directly by consumers.
- Omit functions when the package has no public functions.
- Omit classes when the package has no public classes.
- Omit methods when the package has no public methods.
- Omit events when the package emits, listens to, or documents no public events.
- Omit types or interfaces when the package exposes no public consumer-facing types.
- Omit CSS, assets, or plugin entrypoints when the package exposes none.
- Omit examples beyond quick start when there is only one meaningful workflow.

Very small packages MAY have fewer headings only when all required information remains present and easy to scan.

Large packages MAY move deep guides to package-level `.docs/`, but README MUST still cover the public usage contract and link to those guides.

## Template

Use [packages-readme-template.md](packages-readme-template.md) as the starting point for public package README files. Remove only sections that are allowed by the omission rules.

## Package type requirements

Utility packages MUST document:

- Main exports and subpath imports.
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

## Optional sections

Use these sections when they add value:

- Recipes.
- Troubleshooting.
- Migration notes.
- FAQ.
- Changelog link.
- Related packages.

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
