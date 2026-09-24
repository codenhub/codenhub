---
status: APPROVED
last_updated: 2026-09-24
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction and release readiness for `@codenhub/styles` without duplicating issue tracking. [Model](./model.md) owns the styling model itself.

Finished work is not tracked here. The current token contract, component coverage, and shipped aesthetics belong in the model and repository history, not in a completed-work checklist.

## Supported surface

[Model](./model.md) defines the styling contract, `registry.json` records the supported machine-readable surface, and the public documentation owns the consumer contract under `docs/specs/packages-documentation.md`. This roadmap adds no support rules.

## Current Focus

**`0.5.0` is a foundation release, and ships no new aesthetic.** `@codenhub/styles@0.4.0` is the current npm version; [`docs/changelog/0.4.0.md`](../changelog/0.4.0.md) records it. `0.5.0` carries every structural change and cleanup under [Planned](#planned): the cascade layers, which have landed per [`cascade-layers.md`](./cascade-layers.md); the parts of the material contract that are fixed today; the boundary contrast the package still loses; and the seams and surface the layers made redundant.

The foundation is built for structure, not for a look. Each structural item is decided in its own document before it is built, under [What enters the material contract](./model.md#what-enters-the-material-contract): a part enters because a component already draws it and more than one thing can use it, and only in a form that keeps accessibility, composition, and the package's other guarantees intact. A part that cannot be exposed without breaking one of those is not exposed, and the reason is recorded. No item is justified by the aesthetic that would use it; [Later / Possible](#later--possible) lists those as compositions of the foundation, not as reasons for it.

The release notes are written when `0.5.0` is cut, and lead with the layers' breaking change.

## Planned

All of this is `0.5.0` scope. [Model](./model.md#what-the-material-contract-does-not-express-yet) states each structural part as it stands today and what any answer must keep; the entries below add what has to be settled.

### Structure

- **Corner scale.** No corner scales with a component's size: `--radius-control` is one value, the size and padding modifiers (`.sm`, `.lg`, `.dense`, `.p-xs`, `.icon`) change height and padding but never the radius, and every aesthetic sets one `--ui-radius` for every size. A round corner hides it; a bevel does not, and `.cyber` caps its default cut at `min(<cut>, 25%)` of the box as a local fix, which runs slightly off 45 degrees on small wide elements because horizontal percentages resolve against the width. The model-level answer is two tokens: a size token each size and padding modifier publishes, and a scalar corner token an aesthetic sets, separate from the corner pattern. `box` would compute the default radius from the two, and an explicit `--ui-radius` would still override. To settle: whether the scale follows height or padding step; whether a cut must stay a true 45 degrees (a length, not a percentage); how it composes with `--ui-radius-pill` and `--ui-radius-tight`; what it changes for a consumer already setting `--ui-radius`; and whether the size token is a corner token or a general one other material (a shadow's lift, for one) can read. Retires `.cyber`'s percentage cap. Not started.
- **Corner pattern.** Which corners take the radius is packed into a multi-value `--ui-radius` today, so an element cannot choose a pattern without restating the size. With a scalar corner (above), a pattern becomes its own choice: per-element modifier classes such as `.cut-diagonal`, `.cut-diagonal-reverse`, `.cut-hex`, and `.cut-skew` placing the scalar. It is a new modifier family, with its registry entries, collision checks, and docs; it works under every aesthetic (a diagonal under the default look is a two-corner leaf); and a parallelogram slants into its content and needs its own padding answer. To settle: whether it is a class family, a token, or both, and whether `.cyber`'s `--cyber-shape` knobs become patterns. Depends on corner scale. Not started.
- **Line style.** Width and ink are material; the style of the line is `solid` wherever one is drawn -- `box`, the progress track, the table's head and foot rules. To settle: which styles keep a control boundary at 1.4.11 where it holds today; whether `.checkbox` and `.radio`, whose line is the control, take it; what forced colours draw; whether a pressed state needs its own value; and whether `outset`/`inset` are in the set, which depends on measuring how each engine derives their two tones. Not started.
- **Depth in layers.** Every component composes one part-based shadow layer; a complete multi-layer value reaches surfaces only, through `--ui-surface-shadow`, and opts out of elevation there ([The one limitation](./model.md#the-one-limitation)). To settle: whether a second part-based layer, or some other shape, expresses multi-layer depth on every component while `.flat`, `.raised`, and `.floating` keep reaching it and the intent still colours it at the component; and whether pressed and hovered states need their own counterparts. Not started.
- **Shadow that is not depth.** Every part-based shadow is multiplied by elevation, so a halo or glow reaches only what rests above zero -- buttons and cards, of 22 components -- and `.flat` removes it. `--ui-shadow-edge` is the precedent for a shadow answering something other than depth. To settle: whether a non-depth shadow is its own layer or role, how it stacks with depth and the focus layer, and whether any component stays out of its reach. Not started.
- **A painted layer.** No component exposes `background-image`, and `.select` already spends it on its chevron. To settle: which components read it; how a consumer's own background image on a component keeps applying, which a slot a component resolves in `utilities` would make cascade-order dependent; contrast of text over the layer across intents and themes; and forced-colours behaviour, which is unmeasured. Not started.
- **Ambient motion.** Motion is the hover and press transforms and the transitions; nothing moves at rest. To settle: whether the package exposes rest motion at all, and if so in a form that satisfies WCAG 2.2.2 (pausable past five seconds) and 2.3.1 (three flashes), stops under `prefers-reduced-motion`, and gives an application a way to pause it. Not exposing it is an acceptable outcome. Not started.
- **Label treatment.** Label material is weight and tracking, on buttons only (`--ui-button-*`); `text-shadow` inherits, but not into `<button>` or `<input>`, so nothing reaches a control's label. To settle: which label material is structural beyond buttons, and how label contrast (1.4.3) is held with it applied. Not started.

### Cleanup

- **Boundary contrast.** Three recorded defects in how a component marks where it ends. Two are the edge blend: a neutral component that draws a line draws a ring over its own plate, 1.53:1 in light and 1.82:1 in dark on `.ipt` and `.btn.solid.edged` ([Model](./model.md#fill-how-much-of-the-intent-color-fills-the-box)), and `.soft.edged` borders on alert, panel, badge, and the content chips miss 3:1 against their fill for some intents. Both live in the blend `box` composes, which is where the model places the ring's fix rather than in a fill class. The third is not a line: `.progress`'s default `.soft.edgeless` track is a 12% tint that misses 1.4.11 at rest, about 1.1-1.3:1 ([Accessibility](../accessibility.md)), so its answer is the track's resting default or ground. Measured across intents and both themes. Not started.
- **Seams the layers made redundant.** With presentation below the components, `--_fill-cap` and `--_fg-on-fill-floor` are no longer the only way a component can bound its own presentation ([Cascade layers](./cascade-layers.md), L7). Simplify them, and rewrite the model's passages and source comments that explain them by the old unlayered cascade. Not started.
- **`/components` without `/theme`.** The entry is compiled in reference mode and emits no theme variables, so loaded alone its colour tokens are undefined. Decide whether it becomes usable alone or the dependency becomes a stated part of its contract, and document the outcome. Not started.
- **Decide what to drop.** `0.5.0` already breaks, so it is the cheapest window in the `0.x` line to remove surface that is not earning its place. Candidates are named here first, with the reason, before they are removed. None named yet.

## Later / Possible

Aesthetics are compositions of the foundation, not reasons for it. The four below are wanted after `0.5.0`. Each records the parts it would compose from and the questions that stay its own; a look the foundation cannot express without breaking a guarantee waits, rather than bending the model.

- **Glitch.** A colour split (offset copies in two hues) and a slice or jitter motion. Would compose from depth in layers or label treatment for the split, and ambient motion for the movement. Its own questions: fixed hues sit close to what [R1](./model.md#rules-for-aesthetics) bars; whether it is a cascading aesthetic or an effect on a single element; and the maintainer has further direction for it. Not started.
- **Sketch.** A hand-drawn look: uneven elliptical corners, an ink line, and a small offset shadow. The corners are a plain `--ui-radius`/`--ui-radius-surface` value (`255px 15px 225px 15px / 15px 225px 15px 255px`, for example); chips take a single length through `--ui-radius-tight`, so the checkbox's `min()` cap no longer turns invalid, and they take a plain corner rather than a wobble. Would compose from line style for a pencil or dashed line; the offset shadow is the existing parts. A handwriting face would be consumer-supplied, the way `.pixel` reads `--font-pixel`. Not started.
- **Synthwave / retro.** A glow, a grid or scanline ground, and glowing labels. Would compose from shadow that is not depth, a painted layer, and label treatment. Its own question: its signature is palette, which [R1](./model.md#rules-for-aesthetics) gives to intent, so the hues come from the application's palette or a published knob in the way `--cyber-ink` works, never from the aesthetic. Not started.
- **Retro-OS bevel.** The raised two-tone edge of a late-90s desktop UI, light top-left and dark bottom-right, with a press that inverts the two. Would compose from depth in layers with a pressed counterpart, or from line style if `outset`/`inset` hold up across engines. Not started.

## Aesthetics assessed and deferred

Costed against the current model and not a fit. Recorded so the question is not reopened from scratch.

- **Liquid glass**: the refraction that defines it needs an SVG filter element in the DOM, which a CSS-only package cannot ship; the specular highlight is a surface-only treatment; `clip-path: path()` rejects percentages, so the silhouette cannot scale with the box; and `corner-shape: squircle` is Chrome-only. What is reachable without those is `.glass` with a heavier blur.

## Notes

Two measurements shaped the material tokens and outlive the change that needed them, so both live in [Model](./model.md) rather than here: a no-op `clip-path` or `backdrop-filter` costs nothing in any baseline engine ([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token resolves its `var()` references once, on the element that declares it, which is why a shape pair needs two token slots rather than one ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

## Versioning

`0.4.0` is the current published release, cut through the same tag workflow as `0.2.0` and `0.3.0` before it, and `0.5.0` is in progress to follow it the same way. `0.1.0` carried the whole model rewrite over the manually published `0.0.4`; `0.1.1` is the first version cut through the tag workflow -- pushing `@codenhub/styles@0.1.1` triggered `.github/workflows/publish.yml`, which publishes through trusted publishing with provenance and refuses a tag whose version disagrees with the manifest. Every release from here follows that path.

The stress-test pass's fixes, across all three screens, land as one minor (`0.2.0`) rather than a run of patches: several change default token values (`--progress-surface`, `--color-border`) that affect every consumer already using `.progress` or `.card.soft.edged`, not just new ones, which is a real behavior change and not patch-level even pre-1.0.

`0.5.0` is one minor for the same reason: the cascade layers change what beats what for every consumer, and the edge-contrast fix and any removal change default rendering, so the foundation lands together rather than as a run of releases each breaking a little.

The package stays on `0.x` while the public contract is still young, so a necessary breaking correction stays explicit and cheap. Documentation status remains `active`: supported for normal consumer use, not frozen against future semver-major changes.

## Not Planned

- **Neumorphism**: Its defining trait is a borderless control distinguished only by low-contrast shadow, which fails WCAG 1.4.11 non-text contrast. Not shipped unless a variant is found that keeps the look and passes.
- **Bundled fonts**: `.pixel` reads `--font-pixel` and falls back to monospace. The package ships no font binary and stays free of network side effects. The playground supplies Pixelify Sans from a CDN so the aesthetic can be reviewed against a real bitmap face; that is preview scaffolding and never ships. A substitute needs distinct uppercase and lowercase glyphs and real 400-700 weights, since components set `font-weight` 500 to 700 and synthetic bold smears a bitmap glyph. Silkscreen fails the first requirement: it draws the same glyph for both cases, which makes every heading read as shouting and hides real casing mistakes.
- **JS/TS Helpers**: Runtime DOM helpers such as a typed `createElement` wrapper are not planned. The package stays CSS-only.
- **Public JavaScript behavior**: Toast dismissal, focus management, and app-level theme state remain outside this package.
- **A primary that reads under a shade, in light theme**: considered, then re-measured and closed rather than left as a maybe. `.chunky-tile`'s bar mixes 72% of `--intent-border` into a fixed black (`--elevation-color: rgb(0 0 0)`, chosen so a hued intent's bar composites darker, not lighter, than its plate); a hued intent separates cleanly from its own plate this way (`.btn.success`: `1.88:1`, 56.6 units), but `.primary` is `light-dark(neutral-950, neutral-50)` -- near-black in light theme, matching the black the bar mixes toward, so the two collapse into each other (`1.04:1`, 10.4 units; confirmed in dark theme this is fine, `2.48:1`, 154 units, since a near-white plate contrasts easily against the same black-anchored bar). Not a bug with a clean fix: moving `--color-primary` off monochrome repaints every `.primary` everywhere for one aesthetic's benefit, and special-casing primary inside `.chunky-tile` alone breaks the one rule that makes every other intent's bar read consistently -- "a shade of itself," stated in the aesthetic's own doc comment. Documented instead, in `docs/usage/aesthetics.md`'s `.chunky-tile` exceptions.

- **Elevation coupled to size**: a bare `.elevation` that infers its level from a sibling `.sm`/`.lg` size class (`.btn.sm.elevation` reading as a small elevated button), with `.elevation-md` etc. as an explicit override, would read naturally, but was considered and rejected. `.sm.elevation` (two classes) has higher CSS specificity than `.elevation-md` (one class), so the explicit override would lose to the implicit pairing without extra plumbing to route around it -- plumbing no other modifier in the package needs, since none of them currently reads a sibling modifier's class to set its own default. That extra mechanism, just for this one pairing, is worse for a consumer to reason about than writing the elevation class explicitly every time.

## References

- [Model](./model.md)
- [Cascade layers](./cascade-layers.md)
- [Accessibility](../accessibility.md)
- [Overview](../index.md)
- [Setup](../setup.md)
- [Concepts](../concepts.md)
- [Usage](../usage/index.md)
- [Integrating](../integrating/index.md)
- [Tests](./tests.md)
