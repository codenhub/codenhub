# Skill provenance

**Status:** APPROVED
**Last updated:** 2026-07-01
**Scope:** `@codenhub/skills` package skill text, prompts, references, and bundled documentation.

## Purpose

Track the origin, license status, and required notices for every skill shipped by `@codenhub/skills`.

This file is a provenance tracker. The package-level legal notices live in [`../NOTICE`](../NOTICE). If a skill contains copied or adapted third-party material, add the required attribution to the package NOTICE and consider adding a per-skill `NOTICE` file under `src/<skill-name>/` so the attribution travels when the installer copies that individual skill.

## Current Review

The current repository review found no per-skill upstream license headers, copyright notices, or attribution files. The package has an Apache-2.0 package license, but each skill's upstream provenance and any third-party license obligations still need confirmation before publication.

Do not treat `TBD` rows as legally cleared for publication.

## Skill Inventory

| Skill                     | Package path                   | Current provenance known from repo                             | Upstream source URL | Upstream license | Notice action                                       |
| ------------------------- | ------------------------------ | -------------------------------------------------------------- | ------------------- | ---------------- | --------------------------------------------------- |
| `agents-md-improver`      | `src/agents-md-improver/`      | Included as a package skill; no upstream notice found in repo. | TBD                 | TBD              | Confirm origin and add notice if copied or adapted. |
| `brainstorming`           | `src/brainstorming/`           | Included as a package skill; no upstream notice found in repo. | TBD                 | TBD              | Confirm origin and add notice if copied or adapted. |
| `caveman`                 | `src/caveman/`                 | Included as a package skill; no upstream notice found in repo. | TBD                 | TBD              | Confirm origin and add notice if copied or adapted. |
| `caveman-commit`          | `src/caveman-commit/`          | Included as a package skill; no upstream notice found in repo. | TBD                 | TBD              | Confirm origin and add notice if copied or adapted. |
| `caveman-review`          | `src/caveman-review/`          | Included as a package skill; no upstream notice found in repo. | TBD                 | TBD              | Confirm origin and add notice if copied or adapted. |
| `frontend-design`         | `src/frontend-design/`         | Included as a package skill; no upstream notice found in repo. | TBD                 | TBD              | Confirm origin and add notice if copied or adapted. |
| `subagent-specialist`     | `src/subagent-specialist/`     | Included as a package skill; no upstream notice found in repo. | TBD                 | TBD              | Confirm origin and add notice if copied or adapted. |
| `test-driven-development` | `src/test-driven-development/` | Included as a package skill; no upstream notice found in repo. | TBD                 | TBD              | Confirm origin and add notice if copied or adapted. |
| `writing-skills`          | `src/writing-skills/`          | Included as a package skill; no upstream notice found in repo. | TBD                 | TBD              | Confirm origin and add notice if copied or adapted. |

## Review Checklist

- Confirm whether each skill is original, copied, adapted, translated, or merged from another source.
- Record the upstream URL or repository commit when a skill is copied or adapted.
- Record the upstream license and verify redistribution is allowed.
- Add required copyright and license text to `../NOTICE`.
- Add `src/<skill-name>/NOTICE` when attribution should travel with the installed skill folder.
- Remove `TBD` values before publishing.
