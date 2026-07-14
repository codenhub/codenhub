# Skill provenance

**Status:** APPROVED
**Last updated:** 2026-07-14
**Scope:** `@codenhub/skills` package skill text, prompts, references, and bundled documentation.

## Purpose

Track the origin, license status, and required notices for every skill shipped by `@codenhub/skills`.

This file is a provenance tracker. The package-level legal notices live in [`../NOTICE`](../NOTICE). If a skill contains copied or adapted third-party material, add the required attribution to the package NOTICE and consider adding a per-skill `NOTICE` file under `skills/<skill-name>/` so the attribution travels when the installer copies that individual skill.

## Current Review

All skills have been reviewed and confirmed as adapted from one of three upstream sources. Per-skill `NOTICE` files have been added to each skill directory, and the package-level `NOTICE` has been updated with full attribution blocks.

## Skill Inventory

| Skill                     | Package path                      | Upstream source                                         | Upstream source URL                                                                     | Upstream license | Notice action                                       |
| ------------------------- | --------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------- |
| `agents-md-improver`      | `skills/agents-md-improver/`      | Original Coden Agency work; no upstream source.         | N/A                                                                                     | Apache-2.0       | None — original work covered by package LICENSE.    |
| `brainstorming`           | `skills/brainstorming/`           | Adapted from obra/superpowers by Jesse Vincent.         | https://github.com/obra/superpowers                                                     | MIT              | Attribution in package NOTICE and per-skill NOTICE. |
| `caveman`                 | `skills/caveman/`                 | Adapted from caveman by Julius Brussee.                 | https://github.com/JuliusBrussee/caveman                                                | MIT              | Attribution in package NOTICE and per-skill NOTICE. |
| `caveman-commit`          | `skills/caveman-commit/`          | Adapted from caveman by Julius Brussee.                 | https://github.com/JuliusBrussee/caveman                                                | MIT              | Attribution in package NOTICE and per-skill NOTICE. |
| `caveman-review`          | `skills/caveman-review/`          | Adapted from caveman by Julius Brussee.                 | https://github.com/JuliusBrussee/caveman                                                | MIT              | Attribution in package NOTICE and per-skill NOTICE. |
| `frontend-design`         | `skills/frontend-design/`         | Adapted from claude-plugins-official by Anthropic, Inc. | https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design | Apache-2.0       | Attribution in package NOTICE and per-skill NOTICE. |
| `subagent-specialist`     | `skills/subagent-specialist/`     | Adapted from obra/superpowers by Jesse Vincent.         | https://github.com/obra/superpowers                                                     | MIT              | Attribution in package NOTICE and per-skill NOTICE. |
| `test-driven-development` | `skills/test-driven-development/` | Adapted from obra/superpowers by Jesse Vincent.         | https://github.com/obra/superpowers                                                     | MIT              | Attribution in package NOTICE and per-skill NOTICE. |
| `writing-skills`          | `skills/writing-skills/`          | Adapted from obra/superpowers by Jesse Vincent.         | https://github.com/obra/superpowers                                                     | MIT              | Attribution in package NOTICE and per-skill NOTICE. |

## Review Checklist

- [x] Confirm whether each skill is original, copied, adapted, translated, or merged from another source.
- [x] Record the upstream URL or repository commit when a skill is copied or adapted.
- [x] Record the upstream license and verify redistribution is allowed.
- [x] Add required copyright and license text to `../NOTICE`.
- [x] Add `skills/<skill-name>/NOTICE` when attribution should travel with the installed skill folder.
- [x] Verify per-skill installer copies `NOTICE` files alongside `SKILL.md` when installing a skill.
