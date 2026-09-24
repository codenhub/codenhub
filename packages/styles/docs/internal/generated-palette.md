---
status: IMPLEMENTED
last_updated: 2026-09-23
scope: Decision to generate a flat, published output of `@codenhub/styles`' composed colors, for consumers that cannot depend on the Tailwind pipeline that produces them.
---

# A generated palette for consumers outside the Tailwind pipeline

This is agreed direction, shipped in `0.3.0` as `./palette`. Future work touching this surface MUST follow it, and the current generator and output are expected to comply, per the repository root `docs/README.md`'s `IMPLEMENTED` status.

This document intentionally contains no example file contents or drop-in code, only the real, independently verifiable numbers that motivate it and the naming/structure rules an implementer derives the actual output from -- see [`.progress` gains presentation](./progress-presentation-axes.md) for why a prescriptive snippet here would go stale and get trusted over the real generator output.

## The problem

`box.css`'s composition only exists as a Tailwind `@utility`, built by `intent.css` / `presentation.css` / `box.css` cascading together inside `@codenhub/styles`' own build. There is no artifact stating "here is what `.alert.success` actually renders as" independent of that pipeline. A package that takes `@codenhub/styles` as an _optional_ peer -- `@codenhub/toaster` is the concrete case, `packages/toaster/package.json`'s `peerDependenciesMeta.@codenhub/styles.optional: true` -- cannot depend on the Tailwind build existing, so its only option, if it wants to look consistent with `@codenhub/styles`-composed components, is to read `box.css`'s source and hand-retype the formula under its own variable names.

## Evidence

Two independently verifiable divergences exist today in `@codenhub/toaster`'s hand-forked copy, found by comparing it against `box.css`. `@codenhub/toaster` is cited here only as an example of the failure mode this gap produces; this document does not propose changing that package.

**Fallback palette drift.** Every toaster severity resolves through a three-link chain: consumer override, then `@codenhub/styles`' theme token, then a hardcoded hex meant to render identically to what that theme token resolves to. Converting `@codenhub/styles`' actual OKLCH theme values (Tailwind v4's palette) to sRGB and comparing against toaster's hardcoded fallbacks:

| Severity             | toaster's hardcoded fallback | `@codenhub/styles`' real value | Divergence                                        |
| -------------------- | ---------------------------- | ------------------------------ | ------------------------------------------------- |
| success color        | `#047857`                    | emerald-700 &rarr; `#007a55`   | Tailwind v3 vs v4 palette rounding, same hue      |
| destructive color    | `#be123c`                    | rose-700 &rarr; `#c70036`      | same as above                                     |
| info color           | `#4338ca`                    | indigo-600 &rarr; `#4f39f6`    | a full step darker; matches indigo-700, not -600  |
| warning color        | `#a16207`                    | amber-600 &rarr; `#e17100`     | different hue family entirely (yellow, not amber) |
| warning contrast ink | `#ffffff`                    | neutral-950 &rarr; `#0a0a0a`   | inverted direction                                |

The last row matters most. [`theme.css`](../../src/theme.css#L122-L127) records why warning is the one intent whose contrast ink is not the page color: white on amber-600 measures 3.07:1, so the package moved the ink dark instead of the hue. That reasoning lives only as a comment in `@codenhub/styles`; nothing pins it to toaster's independently hardcoded pair. Today the fallback (`#a16207` + white) happens to clear WCAG AA by a narrow margin (roughly 4.9:1) only because the wrong hue and the wrong ink direction partly cancel out. Correcting only the hue to the real amber-600 without also correcting the ink would drop that pairing to roughly 3.2:1 -- a real failure, in exactly the situation `theme.css` already found and fixed once.

**A missing composition rule.** `box.css` blends a component's border color toward its own resolved background, scaled by the fill amount (P3, [`box.css#L78`](../../src/box.css#L78)), specifically so a filled, edged box does not draw a ring of a different color around its own plate -- a measured bug (1.53:1 / 1.82:1 rings) `presentation.css` and [Model](./model.md#fill-how-much-of-the-intent-color-fills-the-box) both record. Toaster's equivalent rule ([`packages/toaster/src/styles/index.css#L120`](../../../toaster/src/styles/index.css#L120)) blends toward `transparent` instead -- the pre-fix approach `@codenhub/styles` tried and rejected. `.coden-toast.solid.edged` most likely reproduces the bug P3 exists to prevent. (History since: the rejected approach applied the edge amount before the blend, which landed `.edgeless` on the fill colour. The blend toward `--_bg` that replaced it painted a translucent plate twice, and `0.5.0` moved `box` to a blend toward `transparent` in the fixed order -- see [Boundary contrast](./boundary-contrast.md).)

Both divergences were introduced by someone who clearly understood `box.css` well -- toaster's own comments accurately narrate `box.css`'s reasoning back at it -- and were still lost in translation. The formula's shape survived being copied; the reasoning behind each of its terms did not.

## The decision

Add a build step to `@codenhub/styles` that reads `registry.json` (presentation percentages, intent `fillMax`) and `theme.css` (the real intent colors), runs `box.css`'s actual composition once per relevant combination, and emits the result as a flat, generated artifact -- joining the repository's existing `pnpm generate` command surface rather than introducing a new mechanism. A consumer outside the Tailwind pipeline references a flat value instead of reimplementing `color-mix()` math, so there is no formula left to drop a term from, and the value is provably identical to what `@codenhub/styles` itself renders because it was computed by the real formula rather than retyped by a person.

### What gets baked

Every `intent x presentation` cell (7 intents, `solid`/`soft`/`ghost`) gets its `bg`, `fg`, and `edge` at rest, plus `bg` and `edge` again at hover -- `fg` never changes on hover, since `box-hover`'s own composition ([`box.css#L197-L212`](../../src/box.css#L197)) only redefines background, edge, shadow, and transform. This is the full cross across slots and states.

Ground does not need its own free-standing dimension the way the earlier draft of this document assumed, because re-deriving `box`'s formula shows most of the cross collapses on its own:

- **`.solid` is ground-independent entirely.** At 100% fill, `--_bg`'s `color-mix()` contributes 0% of whatever ground it is mixed with, so `bg`, `edge`, and their hover values are the same regardless of ground. One set of `.solid` values covers every ground.
- **`fg` is always ground-independent**, for every presentation -- `--_fg`'s composition ([`box.css#L70`](../../src/box.css#L70)) never references `--_d-ground` at all.
- **Only `.soft` and `.ghost`'s `bg`/`edge` actually vary by ground.** These are the only cells that need the three-ground split below. (Since `0.5.0` only `bg` does: the edge fades toward `transparent` rather than toward the ground-mixed plate, so its three ground values are equal. The split is kept, since the tokens are published.)

The closed, already-established ground set from `registry.json`'s own component defaults decides what each `.soft`/`.ghost` cell composites against at generation time -- not an open set, and not a new one invented for this proposal: `transparent` (`.badge`/`.btn`'s ground, the default, no suffix), `--color-background` (`.alert`'s ground via `--ui-surface-ground`, suffix `page`), and `--intent-subtle` (`.pre`/`.code`/`.kbd`/`.tooltip-bubble`'s ground, suffix `subtle`). These ground token names are generator inputs, resolved to that token's actual light/dark value once, at generation time -- the published output is always the composited color, never a `var(--color-background)`/`var(--intent-subtle)` reference. `./palette` stays self-contained this way; it never needs `./theme` loaded alongside it to resolve anything, which is the whole point of baking rather than composing live. A `.ghost` cell's `bg` on the `transparent` ground is `transparent` itself, and on `page`/`subtle` is that ground's resolved color -- trivial values, but generated for naming consistency with `.soft`'s non-trivial ones rather than special-cased away.

Counted out: `.solid` contributes 5 values per intent (`bg`, `fg`, `edge`, `bg-hover`, `edge-hover`, ground-independent). `.soft` and `.ghost` each contribute 13 (`fg` once, plus `bg`/`edge`/`bg-hover`/`edge-hover` three times each for the three grounds). That is 31 values per intent, 217 total per theme -- a generated file with a few hundred declarations, not a combinatorial explosion, and every one traceable to a real formula rather than invented.

### Verifying the output

"Provably identical" is a claim a test has to check, not something the generator gets to assert about itself. The package already has the right instrument for this: `tests/browser/test-utils.ts`'s `readSrgb`/`getColorDistance`/`expectSameColor` normalize a computed color -- whichever of `rgb()`, `color(srgb ...)`, `oklab()`, or `oklch()` the engine happens to serialize it as -- to 8-bit sRGB and compare by the largest per-channel distance, already tolerating the one-step rounding `color-mix()` introduces at a two-step ceiling. Every generated `bg`/`fg`/`edge` value, rest and hover, light and dark, gets checked against the live, `box`-composed value for the same cell through that exact contract before publication. Reusing it rather than inventing a second comparison rule is the point -- a second rule is one more place for the two to quietly disagree.

### Naming

`--palette-<intent>-<presentation>-<slot>`, with two extensions layered on only where the collapse above says they are needed:

- A ground qualifier (`page` or `subtle`) inserted before the slot, present only on `.soft`/`.ghost`'s `bg` and `edge` -- never on `.solid`, and never on `fg`.
- A `-hover` suffix on `bg` and `edge` -- never on `fg`.

Examples: `--palette-success-soft-bg` (transparent ground), `--palette-success-soft-subtle-bg`, `--palette-success-soft-subtle-bg-hover`, `--palette-success-solid-fg`, `--palette-success-ghost-page-edge`. `palette` was checked against the package's existing token namespaces (`--color-*`, `--intent-*`, `--ui-*`) and does not collide with any of them.

### Dark mode

Class/attribute-scoped, matching the exact selector set `theme.css` itself uses for its explicit-override arm and that toaster's own dialog container already reads: `.dark`, `.theme-dark`, `[data-theme="dark"]`. Light values are the unscoped default; dark values are re-declared under those three selectors. No bare `@media (prefers-color-scheme: dark)` fallback is generated -- a consumer reaching for a standalone fallback palette is already handling its own theme switching (toaster's dialog container does exactly this today), so the OS-only case is left to `@codenhub/styles`' own `light-dark()`-based tokens when that package is actually in use, rather than duplicated here.

### Public surface

This ships as a real, documented, published export, not a `dist/`-only convenience other packages read by unsupported relative-path convention -- an optional-peer consumer needs a stable path to depend on at build time for this to solve the problem it exists to solve. Following the package's existing subpath pattern (`./theme`, `./components`, `./aesthetics/*`, each mapped through `style`/`import`/`default` conditions to a `dist/*.css` file), the CSS output is the primary, committed artifact -- `./palette` is the shape to match. It is versioned under the same semver as the rest of `@codenhub/styles`, since it is derived from the same `registry.json`/`theme.css` source that already gates the package's version decisions (the `0.2.0` precedent in `roadmap.md` for a default-value change applies here too). It needs `exports` coverage, public docs coverage per `docs/specs/packages-documentation.md`, a mention wherever the package's other subpaths are currently introduced to consumers, and a `compiledExportContracts` entry in `tests/integration/exports.test.ts` -- every other CSS export already has one there (a build target plus a handful of regex patterns spot-checking the compiled output), and that test iterates only the explicit map, so a `./palette` export left out of it would ship with no compiled-output assertion at all.

A JSON sidecar for non-CSS consumers was considered and deferred rather than committed to alongside the CSS. `roadmap.md`'s "Not Planned" section keeps the package CSS-only by design; a static JSON data file is not the JS/TS runtime helper that note rules out, but committing to it now, with no concrete non-CSS consumer asking for it, would be scope beyond what this proposal's evidence supports. Add it later if a real need appears -- the generator producing it is a small addition once the CSS side exists, not a reason to hold up the CSS side now.

## Non-goals

This does not touch the `intent x presentation x aesthetic` axis model, `box.css`'s composition itself, or any currently shipped component's behavior. It does not propose that `@codenhub/toaster`, or any other optional-peer consumer, take a hard dependency on `@codenhub/styles`, adopt Tailwind, or change how it currently degrades without the package installed.

## References

- [Model](./model.md)
- [Roadmap](./roadmap.md)
- [`.progress` gains presentation](./progress-presentation-axes.md)
- `registry.json`, `package.json`
- `../../src/box.css`, `../../src/presentation.css`, `../../src/theme.css`
- `../../../toaster/src/styles/index.css` -- external example only, not a target of this proposal
