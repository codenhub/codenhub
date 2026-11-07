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
- Add Rust and Python references to `coding`, following [Adding a language reference](coding-skill-research.md#adding-a-language-reference).
- Move coding checks a tool can enforce out of the skill. Prefer compiler flags and oxlint, then CodeQL in CI: `exactOptionalPropertyTypes` repo-wide, `erasableSyntaxOnly` in `packages/tools`, oxlint rules for `prefer-object-has-own`, `innerHTML` with template literals, and `waitForTimeout`, and `expectTypeOf` tests for exported generics. Evidence: [coding-skill-research.md](coding-skill-research.md).
- Track which skills the installer wrote, so it can remove skills a release drops without `--cleanup` deleting unmanaged ones. Waits on a decision about the new CLI surface it needs.

## Not Planned

- **A `writing-functions` skill.** `coding` replaced it. A broad `coding` skill was first set aside because it would overlap `ponytail`, `test-driven-development`, and `naming` and load on every coding task. That did not weigh the baseline runs in [coding-skill-research.md](coding-skill-research.md), which showed the gaps lie in inputs, failures, state, and tests, not in function design alone. The overlap with `ponytail` and `test-driven-development` was resolved by giving them one shared rule for tests, reports, and scope; `naming` overlaps only the one-line naming default. The load was cut by moving detail into references. The narrower `writing-functions` skill was rejected because it would miss those gaps.
