---
status: DRAFT
last_updated: 2026-11-05
scope: `@codenhub/skills` direction.
---

# Roadmap

## Purpose

Durable direction for `@codenhub/skills`. The repo-wide roadmap is `docs/roadmap.md`.

## Current Focus

- The installer CLI is the product's entry point; the package exports no library API since 0.3.0.
- Keep the bundled skills to the `writing-skills` rules, and evaluate behavioral changes before they ship.
- Maintain licensing, copyright, and attribution notices for shipped assets.

## Planned

- Validate `npx @codenhub/skills@latest` and `pnpm dlx @codenhub/skills@latest` on a clean machine.
- Add a `writing-functions` skill for general-purpose function design in any language. Waits on baseline runs: realistic function-writing tasks run without the skill, with the failures they show recorded, since `writing-skills` requires an observed gap before a rule. A broader `coding` umbrella skill was considered and set aside: it would overlap `ponytail`, `test-driven-development`, and `naming`, and would load on every coding task.
- Track which skills the installer wrote, so it can remove skills a release drops without `--cleanup` deleting unmanaged ones. Waits on a decision about the new CLI surface it needs.
