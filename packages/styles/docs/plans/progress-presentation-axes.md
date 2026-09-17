---
title: Plan for .progress presentation axes
---

# Plan: `.progress` presentation axes

Disposable execution checklist, not durable documentation -- see `docs/docs-guidelines.md` on `docs/plans/`. Not committed; this carries the minimal title frontmatter `pnpm check` expects of any Markdown file outside `docs/internal/`, not the governance frontmatter (`status`/`last_updated`) that applies there. The decision and its reasoning live in `../internal/progress-presentation-axes.md` -- read that first.

Deterministic checklist, no diffs or drop-in code by design -- derive the actual change from the referenced precedent in each step, the way `../internal/progress-presentation-axes.md` argues for. If a step turns out to need a decision that document doesn't already make, stop and ask rather than deciding it here.

## Steps

1. **`packages/styles/src/components/feedback.css`** -- rewrite `.progress`'s track and edge composition to read `--ui-fill` / `--ui-border`, capped by `--intent-fill-max`, grounded on `transparent`. Mirror `.quote`'s existing composition in `packages/styles/src/utilities/content.css` (its `--quote-capped` / `--quote-bg` / `--quote-line` / `--quote-edge` chain) as the reference shape, adapted from a left bar to a track. Keep `--progress-color` (the value fill) exactly as it is today -- always `--intent-color`, no presentation. Use `var(--ui-border-width, var(--border-width))` for any border width, not the raw token alone.

2. **`packages/styles/registry.json`** -- update the `progress` entry:
   - `axes`: from `[]` to `["fill", "edge"]`.
   - `default`: add the `fill`/`edge` pair alongside the existing `elevation: 0`, matching whatever the registry default is decided to be (the durable doc names `soft`/`edgeless` as closest to today's look).
   - `compositionReason`: rewrite so it no longer says "has no box presentation" -- mirror `.quote`'s entry, which explains it hand-reimplements `box` and must stay in agreement with it.
   - `unsupported`: add one entry for `.solid` on the `fill` axis, with a reason (the value fill and a fully-filled track become the same color).
   - Do **not** add an `unsupported` entry for `.ghost` + `.edgeless` -- see the durable doc's resolution. That combination is documented in prose (next step), not registry-tracked.

3. **Document `.ghost.edgeless`'s discouraged status in prose**, near wherever `.progress`'s supported combinations are already described for consumers. Check `packages/styles/docs/` (public usage docs) for where other components' combinations are documented, and follow that location and the `.badge.edged`-under-`.neobrutalism` prose precedent in `model.md`'s "bounds that survive" section for tone and placement.

4. **`packages/styles/docs/internal/model.md`** -- update the Defaults table row that currently groups `.progress` with `.loader` / `.skeleton` / `.divider` as `n/a`. `.progress` gets its own row with its real default; the other three stay as they are, since this change does not touch them (see the durable doc's "why the other three are not part of this decision" section).

5. **Tests** -- `.progress` is newly registered with real axes, so `tests/integration/registry.test.ts` and `tests/browser/axes.spec.ts` (per `docs/internal/tests.md`) will probe it for the first time. Run both, and resolve whatever they surface -- do not assume they will pass unchanged.

6. **Public documentation** -- `@codenhub/styles` is `private: false`. Check `docs/specs/packages-documentation.md`'s coverage requirements against `.progress`'s public docs (wherever component usage is documented under the package's public `docs/`) and update if its presentation support is described there.

7. **Changelog and version** -- this changes a shipped default's rendered output for every existing `.progress` consumer. Cut it as a minor bump, following the same reasoning already recorded in `packages/styles/docs/internal/roadmap.md` for why the prior `--progress-surface` fix shipped as `0.2.0` rather than a patch. Add a changelog entry per `docs/specs/packages-changelog.md`.

8. **`packages/styles/docs/internal/roadmap.md`** -- this work is not currently listed there. Add it under a relevant section before starting, or reconcile the roadmap once done, so it stays an accurate record of current focus.

## Verification

Run `pnpm verify styles` from the repository root when the above is done. Confirm `.progress.soft.edged`, `.progress.soft.edgeless`, and `.progress.ghost.edged` render as distinct, legible tracks for at least one hued intent and neutral, in both themes, before calling this finished -- the durable doc's reasoning is only as good as what actually renders.

## When done

Delete this file, or leave it -- `docs/plans/` is git-ignored, so it never reaches a commit either way.
