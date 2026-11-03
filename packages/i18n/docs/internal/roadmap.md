---
status: DRAFT
last_updated: 2026-11-02
scope: `@codenhub/i18n` direction.
---

# Roadmap

## Purpose

Durable direction for `@codenhub/i18n`. The repo-wide roadmap is `docs/roadmap.md`. Reasons for past choices are in [decisions.md](decisions.md).

## Done

- **Plural selection (0.2.0).** Plural groups with CLDR forms, selected by a numeric `count`. Design in [decisions.md](decisions.md#plurals-020).
- **Translated path segments (0.2.0).** A `pathnames` table and `localePrefix: "when-ambiguous"`. Design in [decisions.md](decisions.md#translated-path-segments-ship-in-020-2026-11-02); consumer docs in `localized-urls.md`.
- **Regional fallback (0.2.0).** `pt-BR` falls back to `pt`. Design in [decisions.md](decisions.md#regional-locales-fall-back-to-their-parents-020).
- **Catch-all route parameters (0.2.0).** `:name*`. Design in [decisions.md](decisions.md#catch-all-parameters-2026-11-02).
- **ICU messages and formatters (0.2.0).** Design in [decisions.md](decisions.md#icu-messages-and-formatters-020).
- **Typed values (0.2.0).** From literal dictionaries. Design in [decisions.md](decisions.md#values-are-typed-from-literal-messages-020).

## Planned

- **Explicit fallback locales**, such as `es-MX` to `es-419`, if an application needs a chain subtags can't express.
- **A dictionary type generator** for typed values from JSON, if keeping the default language in TypeScript proves impractical.
