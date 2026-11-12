---
status: APPROVED
last_updated: 2026-11-11
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction for `@codenhub/styles` without duplicating issue tracking. [Model](./model.md) owns the styling model itself.

Finished work is not tracked here. The current token contract, component coverage, and shipped aesthetics belong in the model, the changelog, and repository history, not in a completed-work checklist.

## Supported surface

[Model](./model.md) defines the styling contract, `registry.json` records the supported machine-readable surface, and the public documentation owns the consumer contract under `docs/specs/packages-documentation.md`. This roadmap adds no support rules.

## Current Focus

Nothing further is committed to a version. The foundation was built for structure, not for a look: a new material part must pass [What enters the material contract](./model.md#what-enters-the-material-contract), independently of the aesthetic that would use it. An aesthetic the foundation cannot express without breaking that rule needs a separate decision before implementation.

## Planned

The aesthetics below carry no release commitment. Each needs its solo class, compiled and `/tw` exports, a registry entry, public documentation, playground coverage, and cross-browser tests when it lands, and clears every token the other aesthetics declare ([Adding an aesthetic](./model.md#adding-an-aesthetic)).

Aesthetics compose the foundation rather than justify new tokens. Exact appearance, knobs, and browser fallbacks are reviewed against real screens before claiming completion, and visual references are agreed before an aesthetic is built.

- **Glitch.** Static color split without built-in motion or slicing; hues come from intent or consumer knobs, not a preset palette ([R1](./model.md#rules-for-aesthetics)). Its treatment needs visual references before implementation. Not started.
- **Synthwave/retro.** Visual references are awaited before defining its appearance, tokens, or implementation. No look has been selected.
- **Retro-OS bevel (`.retro-os`).** A raised two-tone edge with the standard press, not an inverted pressed bevel. A first attempt did not read as a retro OS, so the design starts over from references. A two-tone bevel needs two depth layers with separate base colours, which the foundation does not carry; whether the new design needs them is decided with it.

## Possible

Ideas kept for later, not planned: no release is prepared toward them, so they are not deferred features in the sense of `docs/specs/packages-lifecycle.md`. Each moves to Planned only by a decision that names the need it meets.

- **Per-component `modifiers` and `intents` in `registry.json`.** The registry lists every modifier and intent once, package-wide, and records which axes each component reads, but not which modifiers or intents each component accepts, so a component that takes `.sm` and `.lg` (`.btn`, the text controls, `.input-group`) looks the same there as one that does not. Each entry would gain the two fields, and `tests/browser/axes.spec.ts` a probe that a listed modifier or intent changes what the component computes and an unlisted one does not, as it does for axes. It waited on the configuration file, which would have defined what each component accepts; that file is Not Planned, so the fields record what the stylesheet does. `registry.json` is not published, so consumers do not depend on its shape.

## Known gaps

Each of these is a limit of what ships today, recorded so it is decided rather than rediscovered. None is committed to a version.

- **`.tooltip-icon` is recorded as a helper, not a component.** It applies `box`, rests on a ground of its own, and reads the fill, edge, and intent a component reads, but `registry.json` lists it under `helpers`, so it carries no default, no `axes`, and no probe in `axes.spec.ts`. Whether it moves to `components` is decided with the per-component fields under Possible, since both change what a registry entry records. Consumers do not see the difference: `registry.json` is not published.

## Notes

Two measurements shaped the material tokens, so both live in [Model](./model.md) rather than here: a no-op `clip-path` or `backdrop-filter` costs nothing in any baseline engine ([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token resolves its `var()` references once, on the element that declares it, which is why a shape pair needs two token slots rather than one ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

## Versioning

Release authorization and tagging follow `docs/specs/packages-lifecycle.md`. The package stays on `0.x` while the public contract is young, so a necessary breaking correction stays explicit and cheap.

A change is a minor when it adds public surface (a class, a token, an entrypoint, an aesthetic) or changes what a default renders or what beats what for consumers already using the package, including a token or class removed without an alias. It is a patch only when it fixes rendering to match documented behavior without changing a documented default and adds no surface.

Documentation status remains `active`: supported for normal consumer use, not frozen against future semver-major changes.

## Not Planned

- **Removing `.theme-light` and `.theme-dark`**: `@codenhub/theme` writes a `theme-<name>` class by default, and the toaster's standalone fallback reads it, so it is not a second name nothing uses.
- **A configuration file for look**: a project file that would give a plain class such as `.btn` a default look, such as a `.lg` soft button under `.neobrutalism`. Since 0.8.0 the component, intent, presentation, elevation, corner, size, and modifier classes are `/tw` utilities, so a project names a look once in a class of its own, `@utility btn-save { @apply btn primary soft sm; }`, as [Presets](../usage/presets.md) describes. What the file would add is a default for the plain class itself, and that is what it costs: the same markup would render differently from one project to the next, and it needs a build step that writes this package's rules for each project, which `chs build` does not do, since it only trims a stylesheet the package compiled. Moved from Possible on 2026-11-12, before 0.9.0.
- **Neumorphism**: Its defining trait is a borderless control distinguished only by low-contrast shadow, which fails WCAG 1.4.11 non-text contrast. Not shipped unless a variant is found that keeps the look and passes.
- **Bundled fonts**: `.pixel` reads `--font-pixel` and falls back to monospace. The package ships no font binary and stays free of network side effects. The playground supplies Pixelify Sans from a CDN so the aesthetic can be reviewed against a real bitmap face; that is preview scaffolding and never ships. A substitute needs distinct uppercase and lowercase glyphs and real 400-700 weights, since components set `font-weight` 500 to 700 and synthetic bold smears a bitmap glyph. Silkscreen fails the first requirement: it draws the same glyph for both cases, which makes every heading read as shouting and hides real casing mistakes.
- **JS/TS Helpers**: Runtime DOM helpers such as a typed `createElement` wrapper are not planned. The package ships no runtime JavaScript. The one piece of JavaScript it ships is the `chs` build command, which runs at build time on the developer's machine, never in the browser: it trims this package's compiled stylesheet to a project's templates for a project that does not run Tailwind. Its decisions and limits are in [Build command](./cli.md).
- **Public JavaScript behavior**: Toast dismissal, focus management, and app-level theme state remain outside this package.
- **A primary that reads under a shade, in light theme**: `.chunky-tile`'s bar mixes 72% of `--intent-border` into a fixed black (`--elevation-color: rgb(0 0 0)`, chosen so a hued intent's bar composites darker, not lighter, than its plate); a hued intent separates cleanly from its own plate this way (`.btn.success`: `1.88:1`, 56.6 units), but `.primary` is `light-dark(neutral-950, neutral-50)` -- near-black in light theme, matching the black the bar mixes toward, so the two collapse into each other (`1.04:1`, 10.4 units; in dark theme it is fine, `2.48:1`, 154 units). There is no clean fix: moving `--color-primary` off monochrome repaints every `.primary` everywhere for one aesthetic's benefit, and special-casing primary inside `.chunky-tile` breaks the one rule that makes every other intent's bar read consistently -- "a shade of itself". Documented in `docs/usage/aesthetics.md`'s `.chunky-tile` exceptions.
- **Elevation coupled to size**: a bare `.elevation` that infers its level from a sibling `.sm`/`.lg` size class would read naturally, but `.sm.raised` (two classes) has higher specificity than an explicit override, so the override would lose to the implicit pairing without extra plumbing no other modifier needs, since none of them reads a sibling modifier's class to set its own default. That mechanism, for one pairing, is worse for a consumer to reason about than writing the elevation class explicitly.

## References

- [Model](./model.md)
- [Cascade layers](./model.md#cascade-layers)
- [Accessibility](../accessibility.md)
- [Overview](../index.md)
- [Setup](../setup.md)
- [Concepts](../concepts.md)
- [Usage](../usage/index.md)
- [Integrating](../integrating/index.md)
- [Tests](./tests.md)
- [Build command](./cli.md)
