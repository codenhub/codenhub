---
status: APPROVED
last_updated: 2026-07-19
scope: `@codenhub/i18n` package direction.
---

# Roadmap

## Purpose

This roadmap records the durable direction for `@codenhub/i18n`. The package
should become a runtime-neutral translation tool that preserves application
i18n logic across capable browser, SSR, and SSG frameworks without owning their
routing or rendering lifecycles.

The detailed target contract is defined in the
[runtime-neutral refactor](./refactor.md).

## Current state

`@codenhub/i18n` is an experimental browser-oriented package. It currently:

- Loads locale JSON through browser `fetch` using URLs returned by
  `getLocaleFile`.
- Selects an initial locale from `localStorage`, browser language preferences,
  or the configured default locale.
- Flattens dictionaries, caches successful loads, falls back to the default
  dictionary, and translates dot-notation keys.
- Synchronizes document language and direction and optionally translates and
  observes DOM leaves marked with `data-i18n`.
- Exposes locale lifecycle events and optional module-global instance helpers.
- Skips dictionary loading when `window` is unavailable, so it cannot generate
  translated SSR or SSG output.
- Does not parse, generate, register, or navigate locale-prefixed paths.

The implementation and public documentation describe this current behavior.
Where they conflict with the approved refactor specification, they are legacy
until the refactor is implemented.

## Current focus

- Separate the translation engine from browser locale selection, persistence,
  and DOM synchronization.
- Replace URL-based locale loading with a consumer-provided, runtime-neutral
  loader.
- Support explicit locale initialization and deterministic translated output in
  browser, SSR, SSG, Node.js, and worker runtimes.
- Add pure locale-path utilities for frameworks with complete localized routing
  and static path generation support.
- Preserve predictable fallback, caching, concurrency, and event behavior while
  making invalid configuration and dictionary failures explicit.

## Planned

- Publish explicit root, browser, and routing entrypoints after their contracts
  and package exports are verified together.
- Add isolated Node, browser, and routing tests, including SSR request isolation
  and SSG failure behavior.
- Replace the current global-instance pattern with consumer-owned instances and
  browser bindings that have explicit cleanup.
- Document the breaking migration from `getLocaleFile` and browser-coupled
  initialization to `loadLocale`, explicit core initialization, and the browser
  helper.
- Add framework-neutral browser, SSR, SSG, and localized-path examples to the
  public package documentation after implementation.
- Validate source and built-package usage through package-local scenarios if
  automated tests do not provide enough confidence across runtimes.

## Later / possible

- Evaluate message parameters, plural selection, and formatting only after the
  runtime and routing boundaries are stable.
- Evaluate optional first-party loader helpers when multiple consumers need the
  same integration and a small in-house helper is materially better than local
  configuration.
- Add examples for specific capable frameworks when they clarify lifecycle
  wiring without creating framework support commitments.
- Evaluate server locale negotiation helpers for standards-based request
  headers separately from path routing.

## Not planned

- Framework-specific route registration, middleware, rendering, static page
  emission, or navigation.
- Adapters that compensate for frameworks without complete SSR, SSG, or
  localized-routing support.
- Query-string locale routing such as `?lang=en`.
- A package-owned application router or framework abstraction layer.
- Module-global i18n state for normal browser or server usage.
- Compatibility support for the current experimental `getLocaleFile` contract;
  the approved refactor is intentionally breaking.

## Notes

- Framework portability means translation configuration, dictionaries, locale
  validation, fallback, and localized-path rules remain stable. A thin boundary
  must still connect those rules to each framework's request and build APIs.
- SSR instances must remain request-scoped. SSG work must use isolated instances
  when pages may render concurrently.
- Locale loading and dictionary validation must fail builds rather than silently
  publish untranslated localized pages.
- The package remains experimental until the new runtime boundaries and public
  API have been implemented and exercised through real consumer scenarios.

## References

- [Runtime-neutral refactor](./refactor.md)
- [Public overview](../index.md)
- [Current public reference](../reference.md)
- [Repository code guidelines](../../../../docs/code-guidelines.md)
- [Package lifecycle spec](../../../../docs/specs/packages-lifecycle.md)
- [Package documentation spec](../../../../docs/specs/packages-documentation.md)
- [Roadmap spec](../../../../docs/specs/roadmaps.md)
- [Testing spec](../../../../docs/specs/tests.md)
