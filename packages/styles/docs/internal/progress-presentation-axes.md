---
status: IMPLEMENTED
last_updated: 2026-09-23
scope: Decision to give `.progress`'s track a real presentation (fill and edge), and why the other three indicators do not get the same treatment.
---

# `.progress` gains presentation; the other indicators don't

This is agreed direction, shipped in `0.3.0`. Future work on `.progress` and on the indicator group MUST follow it, and the current code is expected to comply, per the repository root `docs/README.md`'s `IMPLEMENTED` status.

This document intentionally contains no diffs or drop-in code. It states the decision and the reasoning behind it; the implementer derives the actual change from the referenced precedent in source, the same way every other component in the package was written. A prescriptive snippet here would go stale the moment the real implementation diverges from it, and would then be trusted over the real code -- see [Model](./model.md#seams-not-rewrites) on why a composed result, once written down somewhere else, stops being the thing anyone actually reads.

## The problem

`.progress`'s track color is a fixed neutral constant ([`feedback.css`](../../src/components/feedback.css#L135-L142)), unrelated to intent, unrelated to what's behind it beyond the two grounds it was measured against once. A `.progress.success` bar and a `.progress.destructive` bar render in identical tracks, because nothing about the track reads intent. `registry.json` currently records `.progress` as `"axes": []`, `"composition": "none"`, with the reason "An indicator paints its own track and fill and has no box presentation" -- which is true of the value fill, and not true of the track.

## The decision

`.progress` is two parts, not one: a track (an area, sized and positioned like any box) and a value fill (`::after`) painted on top of it. Only the track is a candidate for presentation.

**The value fill stays exactly as it is** -- always `--intent-color`, full strength, no presentation, the same contract `.loader` and `.skeleton` already have. It represents a measured quantity, not a decoration; modulating it would make the reading itself unreliable.

**The track gains real presentation**, composed the same way every other component composes a fill and an edge: capped by `--intent-fill-max` before it reaches the mix, grounded on `transparent` (the same choice `.badge` and `.btn` make, not `.pre`/`.code`/`.kbd`'s opaque `--intent-subtle` ground), and with its edge blended toward its own resolved background by the fill amount (P3, the rule that stops a filled, edged box from drawing a ring of a different color around its own plate).

None of this is a new derivation. `.quote` ([`content.css:378-407`](../../src/utilities/content.css#L378-L407)) already hand-composes exactly this shape -- `--_d-fill`/`--_d-border` defaults, a `--quote-capped` term reading `--ui-fill` and `--intent-fill-max`, an edge blended toward its own background before the edge amount is applied, and a registry entry that is `"composition": "none"` with `"axes": ["fill", "edge"]` and a `compositionReason` explaining why it hand-reimplements `box` instead of applying it. `.progress` should read as the same kind of entry, once written: a component that composes `box`'s formula itself because it cannot literally `@apply box`, and says so. The implementer should read `.quote`'s current source as the reference shape and adapt it to a track instead of a left bar, not invent the formula from `box.css` in the abstract.

One correction to make while doing this: any border-width reference in the new composition must read `var(--ui-border-width, var(--border-width))`, not the raw `--border-width` token alone, so an aesthetic that thickens its edge (`.neobrutalism`) still reaches `.progress` the way it reaches every other edge-drawing component.

### Old constraint, already retired

`feedback.css`'s existing comment explains why `.progress` shipped with no edge at all: at a 10px track height, a thick aesthetic's border could consume most of the visible bar. [Model](./model.md#the-edge-is-never-scaled) later deleted `--ui-border-scale` package-wide for exactly this class of problem -- "remove the scale and the ceilings stop being necessary" -- and `.progress` was never revisited after that change landed. The original objection to giving the track an edge no longer holds; this is not reopening a settled question.

## Supported and unsupported combinations

Presentation is two independent axes, so six combinations exist in the abstract. Two are degenerate on a track specifically, for mechanical reasons:

| Combination                         | Result                                                                            | Supported                             |
| ----------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| `.soft.edged`                       | tinted track, bordered                                                            | yes                                   |
| `.soft.edgeless` (registry default) | tinted track, no border -- closest to today's look                                | yes                                   |
| `.ghost.edged`                      | transparent interior, bordered -- an outline capsule around the moving value fill | yes                                   |
| `.ghost.edgeless`                   | no fill, no border                                                                | discouraged, not registry-unsupported |
| `.solid` (either edge)              | track fully `--intent-color`                                                      | unsupported                           |

**`.solid` is unconditionally broken**, for any edge value: a fully-filled track and a fully-colored value segment become the same color, and the one thing a progress bar exists to show -- how much is filled versus not -- disappears. This is not a shade problem; it is self-canceling by construction. It fits the existing `registry.json` `unsupported` mechanism exactly as-is (a whole axis value, unconditionally not supported on this component), the same shape as `.ghost` being unsupported on `.kbd`/`.code`/`.pre`.

**`.ghost.edgeless` is only broken in that specific combination** -- `.ghost.edged` is fine. This does not fit the `unsupported` mechanism, which records a whole axis value, not a combination. It is also, by [Model](./model.md#the-bounds-that-survive-and-the-test-for-keeping-one)'s own test, not our composition's fault: a consumer who writes both `.ghost` and `.edgeless` chose that pairing explicitly, the same way `.badge.edged` under `.neobrutalism` is a consumer's own combination of two documented features rather than something the package's cascade produced by accident. The package's stated response to that case is "document it, do not clamp it," and this is the same situation in a different pair of classes. **Decision: no registry field, no schema change.** Document `.ghost.edgeless` in prose, near wherever `.progress`'s supported combinations are described for consumers, as renderable but not recommended because it leaves the track with no visible frame. Do not add an `unsupported` entry, a bound, or a schema extension for it.

## What else changes because of this

- **`registry.json`**: `.progress`'s entry needs `axes` populated, a `default` naming the fill/edge pair, a `compositionReason` that no longer says "has no box presentation," and an `unsupported` entry for `.solid` on the fill axis. Mirror `.quote`'s entry shape, not a fresh design.
- **[Model](./model.md)'s Defaults table** currently groups `.progress` with `.loader`/`.skeleton`/`.divider` as `n/a`. That row stops being accurate for `.progress` once it reads axes; `.loader`/`.skeleton`/`.divider` stay `n/a` (see below). The repository root `docs/README.md` requires documentation to update in the same change as the behavior it describes.
- **Versioning**: this changes a shipped default's rendered output for every existing `.progress` consumer, not just new ones. `roadmap.md` already established the precedent for this exact situation -- the prior `--progress-surface` fix shipped as `0.2.0`, a minor bump, specifically because "several change default token values... that affect every consumer already using `.progress`... which is a real behavior change and not patch-level even pre-1.0." This should ship the same way, with a changelog entry, not as a patch.

## Why `.loader`, `.skeleton`, and `.divider` are not part of this decision

The frame/value split above is what makes `.progress` eligible for presentation, and it is also why the other three indicators are not, structurally rather than by omission:

- **`.loader`** ([`loader.css:71-81`](../../src/components/loader.css#L71-L81)) is a single `mask-image` silhouette. There is no track behind it; the glyph is the whole component. No area exists for a fill axis, and no boundary distinct from the glyph's own shape exists for an edge axis.
- **`.divider`** ([`layout.css:85-99`](../../src/utilities/layout.css#L85-L99)) is a `border-top` at full intent strength. It has no fill area -- it is a line, not a box with a line around it -- and its edge is not a decoration on top of something else, it is the entire content.
- **`.skeleton`** ([`feedback.css:108-118`](../../src/components/feedback.css#L108-L118)) is one animated gradient filling the whole element, standing in for unknown content rather than representing a measured value. There is no "how much of me is filled" question, and no frame separate from the placeholder for an edge to bound.

Each is a single part with nothing for a second axis to divide. `.progress` is the only indicator with an actual frame-holding-a-value anatomy, which is the entire reason it is the only one that changes here.

## Non-goals

This does not touch the `intent x presentation x aesthetic` axis model itself, any other component's behavior, or the generated-palette proposal in a separate document. It is scoped to `.progress`'s track and the registry/documentation entries that describe it.

## References

- [Model](./model.md)
- [Roadmap](./roadmap.md)
- `registry.json`
- `../../src/components/feedback.css`, `../../src/utilities/content.css`, `../../src/components/loader.css`, `../../src/utilities/layout.css`
