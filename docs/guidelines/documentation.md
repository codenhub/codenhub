---
status: IMPLEMENTED
last_updated: 2026-10-02
scope: Durable repository-level documentation under root `docs/`.
---

# Repository documentation guidelines

This document defines how durable documentation for this monorepo is structured, maintained, and interpreted, including this document itself. Package documentation follows `docs/specs/packages-documentation.md`, which selectively adopts the metadata model defined here for internal package docs.

## Required header

Every durable repository document in root `docs/` MUST start with YAML frontmatter containing these fields, in this order:

- `status`: how reliable and authoritative the document is.
- `last_updated`: date of the last meaningful content change in `YYYY-MM-DD` format.

Documents SHOULD include `scope` when the title alone does not make ownership clear.

Allowed statuses:

- `DRAFT`: Work in progress. Use as context, not as binding source of truth.
- `APPROVED`: Agreed source of truth. Future work MUST follow it. Existing code may be non-compliant and should be treated as legacy until updated.
- `IMPLEMENTED`: Agreed source of truth and current implementation is expected to comply. New exceptions MUST be documented or the document MUST be updated.
- `SUPERSEDED`: Temporary. Being replaced by a refactor that lands across more than one change, while the code it describes is still live. The document MUST name its replacement in its first paragraph and MUST be deleted in the change that completes the replacement. It is never a way to keep a retired document around.

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

`pnpm format:check` enforces this: it runs Prettier over every Markdown file with `proseWrap` set to `never`, and `pnpm verify` and the `pre-commit` hook run the same check. The rule is the formatter's to keep — do not hand-wrap prose to a column, and do not add a `max_line_length` for Markdown to editor configuration. Third-party Markdown listed in `.prettierignore`, the vendored icon attributions, is kept as received and is exempt. Agent skills, adapted ones included, are formatted like the rest, but with their fenced examples left as written: an agent reads a skill as raw text, where an example's line breaks are part of what it shows.

## Source of truth

Repository documentation MUST be updated in the same change when architecture, conventions, or project decisions change.

APPROVED and IMPLEMENTED documents record decisions. A decision binds work while it stands, and changing it is legitimate work: the document is the current answer, not a final one. Judge work against a document on two separate questions, and keep the answers apart:

- **Conformance:** does the work match the recorded decision? Where it does not, the work is brought in line, or the departure is recorded under "Exceptions".
- **Merit:** is the recorded decision right? Where it is not, the decision and its document change, together with the code that follows them.

Matching a document does not make work correct, and a merit finding is not a code defect: it is a proposal to change a decision, made as one and under "Recording decisions".

Truth priority settles conformance, which is what work follows while a decision stands:

1. APPROVED or IMPLEMENTED documentation.
2. DRAFT documentation.
3. Existing code.

When APPROVED or IMPLEMENTED documentation conflicts with code, the documentation describes the intended direction and the code should be treated as legacy unless the document is outdated.

When APPROVED or IMPLEMENTED documents conflict with each other, the conflict MUST be resolved in the same change if practical. If not practical, move the conflicting documents to `DRAFT` and add a short note explaining the conflict.

Prefer updating existing documents over creating overlapping ones. Prefer updating documentation before changing code so intended direction is clear before implementation follows.

Delete a document once it no longer describes current or intended direction, in the same change that makes it stale. Git keeps its history; an outdated document kept in the tree only competes with the current one in search and review.

## Recording decisions

A document that settles a choice MUST say why. Where real alternatives existed, it SHOULD name the ones it rejected and, briefly, why each lost. A decision recorded without its reason can only be obeyed or overruled, not judged, and the next reader reopens it.

A change that reverses a recorded decision MUST name what the decision did not weigh: a concrete case it gets wrong, a measurement, or a constraint that has changed since. Preferring another option is not enough; without new evidence, the recorded decision stands. The reversing change records the old choice among the rejected alternatives, with the evidence that reversed it, so the decision is not reopened on arguments already heard.

This applies to every document that uses this status model, including package internal documentation.

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

## Layout

Root `docs/` is organized by what a document is for:

- `docs/specs/`: contracts for a deliverable — what a package, its README, its tests, its errors, or a roadmap MUST contain. A spec is written so compliance can be checked, and `hub check` enforces part of them.
- `docs/guidelines/`: conventions contributors apply by judgment while working — how to write code, how to name and brand a package. A guideline MAY contain enforced rules, but its main job is to shape decisions no checklist fully captures.
- Root `docs/`: the documentation index and references for one repository area or process, such as `tooling.md`, `ci.md`, `assets.md`, and `roadmap.md`.

When a new document could fit more than one place, file it by its main job: rules a deliverable must satisfy go in `specs/`, how to work goes in `guidelines/`, and what exists and how to use it stays at the root. Do not add another folder until a group of documents fits none of these.
