---
status: APPROVED
last_updated: 2026-07-19
scope: `@codenhub/i18n` package direction.
---

# Roadmap

## Purpose

This roadmap records durable direction for `@codenhub/i18n`: keep a small,
runtime-neutral translation primitive portable across capable browser, SSR, and
SSG frameworks without owning routing or rendering lifecycles.

The implemented architecture and its invariants are defined in the
[runtime-neutral refactor](./refactor.md).

## Current state

Version `0.1.0` implements the runtime-neutral refactor. The experimental
package currently:

- Exposes explicit root, browser, and routing entrypoints with matching built
  declarations.
- Injects locale payload loading and validates, flattens, freezes, caches, and
  deterministically falls back across dictionaries.
- Supports explicit isolated translation state in browsers, SSR, SSG, Node.js,
  and workers without reading browser globals from core.
- Provides an optional browser binding for locale preference resolution,
  persistence, document synchronization, safe leaf translation, observation,
  and cleanup.
- Provides pure locale-prefixed pathname parsing and generation without route
  registration, redirects, navigation, rendering, or page generation.
- Rejects invalid configuration, dictionaries, unsupported locales, and failed
  required loads instead of producing silently untranslated ready state.
- Covers core, browser, routing, concurrent SSR isolation, and parallel SSG
  behavior with automated tests.

The `0.1.0` public documentation includes browser, routed hydration, SSR, SSG,
loader, and breaking `0.0.1` migration guidance. The package remains
experimental while these boundaries are exercised by real consumers.

## Current focus

- Exercise the root, browser, and routing contracts in real applications and
  correct boundary defects without broadening framework ownership.
- Keep public examples, source documentation, package exports, and manually
  maintained derived LLM documentation synchronized as the experimental
  contract evolves.
- Verify publishable artifacts continue to include all public docs and entrypoint
  declarations while excluding maintainer-only docs.

## Planned

- Add package-local consumer scenarios only where automated tests fail to give
  enough confidence in source and built-package behavior across runtimes.
- Stabilize the implemented API based on concrete consumer evidence before
  changing the package documentation status from experimental.

## Later / possible

- Evaluate message parameters, plural selection, and formatting after the
  runtime and routing boundaries have proved stable.
- Evaluate optional first-party loader helpers only when multiple consumers need
  the same integration and shared code is materially better than local config.
- Add examples for specific capable frameworks when they clarify lifecycle
  wiring without creating framework support commitments.
- Evaluate standards-based request-header locale negotiation separately from
  pathname routing.

## Not planned

- Framework-specific route registration, middleware, rendering, static page
  emission, or navigation.
- Adapters that compensate for frameworks without complete SSR, SSG, or
  localized-routing support.
- Query-string locale routing such as `?lang=en`.
- A package-owned application router or framework abstraction layer.
- Module-global i18n state for normal browser or server usage.
- Compatibility support for the experimental `0.0.1` browser-coupled contract.

## Notes

- Framework portability means translation configuration, dictionaries, locale
  validation, fallback, and localized-path rules remain stable. Thin application
  boundaries still connect them to framework request, render, build, and
  navigation APIs.
- SSR instances remain request-scoped. Concurrent SSG renders use isolated
  manager instances, although immutable dictionary modules may be shared.
- Locale loading and dictionary validation fail builds rather than silently
  publishing untranslated localized pages.

## References

- [Runtime-neutral refactor](./refactor.md)
- [Public overview](../index.md)
- [Public reference](../reference.md)
- [Repository code guidelines](../../../../docs/code-guidelines.md)
- [Package lifecycle spec](../../../../docs/specs/packages-lifecycle.md)
- [Package documentation spec](../../../../docs/specs/packages-documentation.md)
- [Roadmap spec](../../../../docs/specs/roadmaps.md)
- [Testing spec](../../../../docs/specs/tests.md)
