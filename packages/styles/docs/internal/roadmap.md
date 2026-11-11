---
status: APPROVED
last_updated: 2026-11-10
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

- **A configuration file for look.** Density, presentation, and aesthetic become configuration: markup names the plain class (`.btn`, `.card`, `.ipt`), and a project's config file says how that class looks by default, such as a `.lg` soft button under `.neobrutalism`. Intents stay inline in the markup, and an inline modifier still overrides the configured one. The goal is that a page stops spelling its look out on every element, the repetition that leaves agents writing long inline class lists instead of a component class. Not started; the file's format, and how it reaches a build, are decided with its design.
- **Per-component `modifiers` and `intents` in `registry.json`.** The registry lists every modifier and intent once, package-wide, and records which axes each component reads, but not which modifiers or intents each component accepts, so a component that takes `.sm` and `.lg` (`.btn`, the text controls, `.input-group`) looks the same there as one that does not. Each entry gains the two fields, and `tests/browser/axes.spec.ts` gains a probe that a listed modifier or intent changes what the component computes and an unlisted one does not, as it does for axes. Deferred to the configuration file above rather than added now, because that file will define what each component accepts, and the schema should be designed once against it rather than shipped first and reshaped to fit.

The aesthetics below carry no release commitment. Each needs its solo class, compiled and `/tw` exports, a registry entry, public documentation, playground coverage, and cross-browser tests when it lands, and clears every token the other aesthetics declare ([Adding an aesthetic](./model.md#adding-an-aesthetic)).

Aesthetics compose the foundation rather than justify new tokens. Exact appearance, knobs, and browser fallbacks are reviewed against real screens before claiming completion, and visual references are agreed before an aesthetic is built.

- **Glitch.** Static color split without built-in motion or slicing; hues come from intent or consumer knobs, not a preset palette ([R1](./model.md#rules-for-aesthetics)). Its treatment needs visual references before implementation. Not started.
- **Synthwave/retro.** Visual references are awaited before defining its appearance, tokens, or implementation. No look has been selected.
- **Retro-OS bevel (`.retro-os`).** A raised two-tone edge with the standard press, not an inverted pressed bevel. A first attempt did not read as a retro OS, so the design starts over from references. A two-tone bevel needs two depth layers with separate base colours, which the foundation does not carry; whether the new design needs them is decided with it.

## Known gaps

Each of these is a limit of what ships today, recorded so it is decided rather than rediscovered. None is committed to a version.

- **`prefers-contrast: more` is not handled.** No stylesheet reads it: a user who asks for more contrast gets the same resting lines, washes, and translucent glass as everyone else. Forced colours and reduced transparency are handled; this preference is not. What it should change -- the resting field line that rests under 3:1 so hover and focus can move it, glass's ground, the neutral cap -- is decided with the work.
- **`.tooltip-icon` is recorded as a helper, not a component.** It applies `box`, rests on a ground of its own, and reads the fill, edge, and intent a component reads, but `registry.json` lists it under `helpers`, so it carries no default, no `axes`, and no probe in `axes.spec.ts`. Whether it moves to `components` is decided with the per-component schema above, since both change what a registry entry records.
- **The Propshaft setup in [Without a bundler](../integrating/without-a-bundler.md) is unverified.** It has not been run against a Rails application, so the asset path, the link tags, and the collision it warns about are untested.

## Notes

Two measurements shaped the material tokens, so both live in [Model](./model.md) rather than here: a no-op `clip-path` or `backdrop-filter` costs nothing in any baseline engine ([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token resolves its `var()` references once, on the element that declares it, which is why a shape pair needs two token slots rather than one ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

## Versioning

Release authorization and tagging follow `docs/specs/packages-lifecycle.md`. The package stays on `0.x` while the public contract is young, so a necessary breaking correction stays explicit and cheap.

A change is a minor when it adds public surface (a class, a token, an entrypoint, an aesthetic) or changes what a default renders or what beats what for consumers already using the package, including a token or class removed without an alias. It is a patch only when it fixes rendering to match documented behavior without changing a documented default and adds no surface.

Documentation status remains `active`: supported for normal consumer use, not frozen against future semver-major changes.

## Not Planned

- **Removing `.theme-light` and `.theme-dark`**: `@codenhub/theme` writes a `theme-<name>` class by default, and the toaster's standalone fallback reads it, so it is not a second name nothing uses.
- **Neumorphism**: Its defining trait is a borderless control distinguished only by low-contrast shadow, which fails WCAG 1.4.11 non-text contrast. Not shipped unless a variant is found that keeps the look and passes.
- **Bundled fonts**: `.pixel` reads `--font-pixel` and falls back to monospace. The package ships no font binary and stays free of network side effects. The playground supplies Pixelify Sans from a CDN so the aesthetic can be reviewed against a real bitmap face; that is preview scaffolding and never ships. A substitute needs distinct uppercase and lowercase glyphs and real 400-700 weights, since components set `font-weight` 500 to 700 and synthetic bold smears a bitmap glyph. Silkscreen fails the first requirement: it draws the same glyph for both cases, which makes every heading read as shouting and hides real casing mistakes.
- **JS/TS Helpers**: Runtime DOM helpers such as a typed `createElement` wrapper are not planned. The package ships no runtime JavaScript. The one piece of JavaScript it ships is the `codenhub-styles` build command, which runs at build time on the developer's machine, never in the browser: it compiles this package's `/tw` sources against a project's templates for a project with no JavaScript bundler. Its decisions and limits are in [Build command](./cli.md).
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
