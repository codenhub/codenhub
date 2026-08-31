---
status: IMPLEMENTED
last_updated: 2026-08-31
scope: Durable repository-level documentation under root `docs/`.
---

# Repository documentation guidelines

This document defines how durable documentation for this monorepo is structured, maintained, and interpreted, including this document itself. Package documentation follows `docs/specs/packages-documentation.md`, which selectively adopts the metadata model defined here for internal package docs.

## Required header

Every durable repository document in root `docs/` MUST start with YAML frontmatter containing these fields, in this order:

- `status`: how reliable and authoritative the document is.
- `last_updated`: date of the last meaningful content change in `YYYY-MM-DD` format.

Documents SHOULD include `scope` when the title alone does not make ownership clear.

```yaml
---
status: APPROVED
last_updated: 2026-07-15
scope: Area governed by this document.
---
```

Templates that would copy repository governance metadata into consumer-facing output are exempt. `docs/specs/packages-readme-template.md` and `docs/specs/packages-index-template.md` MUST remain free of repository governance metadata.

## Formatting

Markdown in this repository is not hard-wrapped. Write each paragraph and list item as a single line and let the editor wrap it on screen. Markdown renders a lone newline inside a paragraph as a space, so wrapped and unwrapped source read identically once rendered, and leaving prose unwrapped keeps an edit to one word from reflowing a whole paragraph in the diff.

`pnpm format` enforces this: it runs Prettier over every Markdown file with `proseWrap` set to `never`, and `pnpm verify` and the `pre-commit` hook run the same check. The rule is the formatter's to keep — do not hand-wrap prose to a column, and do not add a `max_line_length` for Markdown to editor configuration. Third-party Markdown listed in `.prettierignore`, such as vendored icon attributions and adapted agent skills, is kept as received and is exempt.

Allowed statuses:

- `DRAFT`: Work in progress. Use as context, not as binding source of truth.
- `APPROVED`: Agreed source of truth. Future work MUST follow it. Existing code may be non-compliant and should be treated as legacy until updated.
- `IMPLEMENTED`: Agreed source of truth and current implementation is expected to comply. New exceptions MUST be documented or the document MUST be updated.

## Source of truth

Repository documentation MUST be updated in the same change when architecture, conventions, or project decisions change.

Truth priority is:

1. APPROVED or IMPLEMENTED documentation.
2. DRAFT documentation.
3. Existing code.

When APPROVED or IMPLEMENTED documentation conflicts with code, the documentation describes the intended direction and the code should be treated as legacy unless the document is outdated.

When APPROVED or IMPLEMENTED documents conflict with each other, the conflict MUST be resolved in the same change if practical. If not practical, move the conflicting documents to `DRAFT` and add a short note explaining the conflict.

Prefer updating existing documents over creating overlapping ones. Prefer updating documentation before changing code so intended direction is clear before implementation follows.

## Exceptions

Exceptions to APPROVED or IMPLEMENTED documents MUST be explicit, scoped, and justified.

An exception MUST state:

- What rule is being bypassed.
- Where the exception applies.
- Why the exception is acceptable.
- Whether it is temporary or permanent.

Do not create broad exceptions for one-off cases. Prefer changing the rule when repeated exceptions show the rule is wrong.

Package-specific exceptions MUST be recorded in `docs/specs/packages-exceptions.md`. Other exceptions SHOULD stay near the rule they bypass unless a dedicated register better serves that scope.

## What belongs here

Use root `docs/` for durable repository knowledge:

- Architecture decisions.
- Implementation guidelines.
- Long-term conventions.
- Feature specs.
- Source-of-truth decisions.

Do not use root `docs/` for temporary notes, TODO lists, or information better expressed in code comments. Do not use it for package-specific documentation; each workspace package owns its package-local documentation according to `docs/specs/packages-documentation.md`.

Repository documentation is not consumer documentation by default. Catalogs, generated collections, and other publishing tools MUST include root documents only through an explicit selection rule; they MUST NOT treat all of root `docs/` as a public content source. Repository governance metadata also MUST NOT be interpreted as package stability or consumer support metadata.

Plans and similar temporary documents MAY live in `docs/plans/`. This directory is git-ignored and should stay that way because these files are short-lived planning aids, not durable repository documentation.
