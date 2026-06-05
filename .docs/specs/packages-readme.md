# Package README spec

**Status:** APPROVED
**Last updated:** 2026-06-05
**Scope:** README files for workspace packages.

This document defines what package README files MUST and MAY contain.

## Compliance

Every `private: false` package under `packages/*` MUST have a `README.md` that follows this spec.

Private packages and apps MAY follow this spec when it improves maintainability, onboarding, or usage clarity. They are not required to comply unless another document says so.

## Purpose

A package README is the package usage contract for humans. It should explain what the package does, how to use it, what it exports, and what constraints users must know before depending on it.

The README SHOULD document public behavior, not internal implementation details.

## Required sections

Each public package README MUST include these sections or equivalent content with clear headings:

- Title: package name exactly as published, such as `# @codenhub/theme`.
- Description: one short paragraph explaining purpose and primary use case.
- Install or import: how consumers import the package or its subpaths.
- Quick start: one minimal working example for the main use case.
- API or reference: exported functions, classes, types, options, subpaths, CSS files, or plugin entrypoints users are expected to use.
- Examples: examples for the main supported workflows, beyond quick start when needed.
- Runtime requirements: browser, Node, SSR, framework, peer dependency, CSS, storage, DOM, or build-tool requirements.
- Limitations and non-goals: important things the package does not do.

Sections MAY be merged when the package is very small and clarity improves. For example, `Quick start` and `API` MAY be combined for a package with one export.

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

Very small packages MAY use fewer headings when all required information remains present and easy to scan.

Large packages MAY move deep guides to package-level `.docs/`, but README MUST still cover the public usage contract and link to those guides.
