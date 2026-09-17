---
title: Plan for the generated palette
---

# Plan: generated palette

Disposable execution checklist, not durable documentation -- see `docs/docs-guidelines.md` on `docs/plans/`. Not committed; this carries the minimal title frontmatter `pnpm check` expects of any Markdown file outside `docs/internal/`, not the governance frontmatter (`status`/`last_updated`) that applies there. The decision and its reasoning live in `../internal/generated-palette.md` -- read that first, including the naming rule, the ground-collapse table, and the dark-mode and public-surface decisions, before writing any code.

## Steps

1. **Generator script** -- add a new step to `packages/tools`' `pnpm generate` surface that reads `packages/styles/registry.json` (presentation percentages, intent `fillMax`) and `packages/styles/src/theme.css` (the real intent colors) and computes each value the durable doc names, using `box.css`'s actual composition (`--_capped`, `--_bg`, `--_fg`, `--_line`, `--_edge`, and the hover variants) as the source of truth for the math -- not a reimplementation invented independently of it. Emit `--palette-*` custom properties named per the durable doc's naming rule, split into light (unscoped) and dark (`.dark`, `.theme-dark`, `[data-theme="dark"]`) blocks.

2. **Output location** -- write the generated CSS to `packages/styles/dist/palette.css` (or wherever the package's other generated `dist/*.css` outputs land -- check the existing build scripts in `packages/styles/package.json` for the established pattern rather than inventing a new one).

3. **`packages/styles/package.json`** -- add a `./palette` subpath to `exports`, matching the `style`/`import`/`default` conditions shape every other CSS subpath already uses (see `./theme`, `./components`, `./aesthetics/*`). Do not add a JSON export in this pass -- the durable doc defers it.

4. **Public documentation** -- introduce `./palette` wherever the package's other subpaths (`./theme`, `./components`, etc.) are currently documented for consumers, per `docs/specs/packages-documentation.md`. Explain what it is for (a consumer that cannot take `@codenhub/styles` as a build-time dependency) and what it is not (not a replacement for using the components directly when Tailwind is available).

5. **Versioning and changelog** -- this is new public surface, not a default-value change, so it is additive; confirm with `docs/specs/packages-changelog.md` and `packages/styles/docs/internal/roadmap.md` whether it ships as part of an already-planned release or its own minor version.

6. **Verification** -- for at least one hued intent and neutral, in both themes: confirm a `.soft`/`.ghost` value generated for the `page` and `subtle` grounds actually matches what the corresponding real component (`.alert` for `page`, `.pre`/`.tooltip-bubble` for `subtle`) renders when composed live through `box.css`. This is the check that the generator is computing the real formula, not a plausible-looking approximation of it.

7. **`packages/styles/docs/internal/roadmap.md`** -- this work is not currently listed there. Add it under a relevant section before starting, or reconcile the roadmap once done.

## Not in scope for this pass

- A JSON sidecar (deferred per the durable doc).
- An OS-preference (`prefers-color-scheme`) fallback in the generated CSS (decided against per the durable doc).
- Any change to `@codenhub/toaster` or any other consumer -- this produces the artifact; adopting it in a specific consumer is separate, unstarted work.

## When done

Delete this file, or leave it -- `docs/plans/` is git-ignored, so it never reaches a commit either way.
