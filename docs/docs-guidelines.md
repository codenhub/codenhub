---
status: IMPLEMENTED
last_updated: 2026-07-15
scope: Durable repository-level documentation under root `docs/`.
---

# Repository documentation guidelines

This document defines how durable documentation for this monorepo is
structured, maintained, and interpreted, including this document itself.
Package documentation follows `docs/specs/packages-documentation.md`, which
selectively adopts the metadata model defined here for internal package docs.

## Required header

Every durable repository document in root `docs/` MUST start with YAML
frontmatter containing these fields, in this order:

- `status`: how reliable and authoritative the document is.
- `last_updated`: date of the last meaningful content change in `YYYY-MM-DD`
  format.

Documents SHOULD include `scope` when the title alone does not make ownership
clear.

```yaml
---
status: APPROVED
last_updated: 2026-07-15
scope: Area governed by this document.
---
```

Templates that would copy repository governance metadata into consumer-facing
output are exempt. For example, `docs/specs/packages-readme-template.md` MUST
remain metadata-free.

Allowed statuses:

- `DRAFT`: Work in progress. Use as context, not as binding source of truth.
- `APPROVED`: Agreed source of truth. Future work MUST follow it. Existing code
  may be non-compliant and should be treated as legacy until updated.
- `IMPLEMENTED`: Agreed source of truth and current implementation is expected
  to comply. New exceptions MUST be documented or the document MUST be updated.

## Source of truth

Repository documentation MUST be updated in the same change when architecture,
conventions, or project decisions change.

Truth priority is:

1. APPROVED or IMPLEMENTED documentation.
2. DRAFT documentation.
3. Existing code.

When APPROVED or IMPLEMENTED documentation conflicts with code, the
documentation describes the intended direction and the code should be treated
as legacy unless the document is outdated.

When APPROVED or IMPLEMENTED documents conflict with each other, the conflict
MUST be resolved in the same change if practical. If not practical, move the
conflicting documents to `DRAFT` and add a short note explaining the conflict.

Prefer updating existing documents over creating overlapping ones. Prefer
updating documentation before changing code so intended direction is clear
before implementation follows.

## Exceptions

Exceptions to APPROVED or IMPLEMENTED documents MUST be explicit, scoped, and
justified.

An exception MUST state:

- What rule is being bypassed.
- Where the exception applies.
- Why the exception is acceptable.
- Whether it is temporary or permanent.

Do not create broad exceptions for one-off cases. Prefer changing the rule when
repeated exceptions show the rule is wrong.

Package-specific exceptions MUST be recorded in
`docs/specs/packages-exceptions.md`. Other exceptions SHOULD stay near the rule
they bypass unless a dedicated register better serves that scope.

## What belongs here

Use root `docs/` for durable repository knowledge:

- Architecture decisions.
- Implementation guidelines.
- Long-term conventions.
- Feature specs.
- Source-of-truth decisions.

Do not use root `docs/` for temporary notes, TODO lists, or information better
expressed in code comments. Do not use it for package-specific documentation;
packages own their documentation under `packages/<package-name>/` according to
`docs/specs/packages-documentation.md`.

Plans and similar temporary documents MAY live in `docs/plans/`. This directory
is git-ignored and should stay that way because these files are short-lived
planning aids, not durable repository documentation.
