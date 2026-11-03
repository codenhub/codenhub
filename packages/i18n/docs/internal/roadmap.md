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

## Planned

- **ICU messages and formatting.** `{count, plural, …}`, `select`, and number and date arguments, extending the `{name}` syntax. Plural groups stay supported.
