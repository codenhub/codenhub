---
status: DRAFT
last_updated: 2026-11-08
scope: `@codenhub/i18n` direction.
---

# Roadmap

## Purpose

Durable direction for `@codenhub/i18n`. The repo-wide roadmap is `docs/roadmap.md`. Reasons for past choices are in [decisions.md](decisions.md), and what each release shipped is in the public changelog.

## Later / Possible

- **Explicit fallback locales**, such as `es-MX` to `es-419`, if an application needs a chain subtags can't express. Deferred, not rejected; see [decisions.md](decisions.md#regional-locales-fall-back-to-their-parents-020).
- **A dictionary type generator** for typed values from JSON, if keeping the default language in TypeScript proves impractical. Deferred, not rejected; see [decisions.md](decisions.md#values-are-typed-from-literal-messages-020).
