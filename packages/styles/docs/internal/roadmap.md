---
status: APPROVED
last_updated: 2026-11-13
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

### A build the package owns, with Tailwind as an adapter

The package is to be compatible with Tailwind without depending on it. Today Tailwind compiles `src/` into every compiled entrypoint, and `/tw` publishes that same source for a consumer's Tailwind to compile, so Tailwind is the foundation of both paths. The direction makes it an adapter to one of them:

- **The source is plain CSS, compiled by a build this package owns.** It is written with nesting, `@layer`, and custom properties, and the palette ramps and the reset it reads from Tailwind become the package's own. The compiled entrypoints and `chs build` then need Tailwind neither when this package is built nor in the consumer's project.
- **`/tw` is generated from that source.** It becomes a thin wrapper that declares the package's classes to Tailwind as utilities, so a project that runs Tailwind keeps what `/tw` gives it today: one build, one theme, the variants on the axis classes, `@apply` of a component, and a stylesheet holding only the classes its files name.
- **The class names and the layer order stay Tailwind's.** The four layers of [Cascade layers](./model.md#cascade-layers) and the rule of [Names that avoid a collision](./model.md#names-that-avoid-a-collision) are plain CSS and need no compiler. They are what lets the compiled stylesheet sit under a consumer's Tailwind utilities, and what keeps the same markup working on both paths.

The reason is that the dependence that costs is on Tailwind's compiler, not on its utilities. Counted in `src/` on 2026-11-13: 111 `@utility` rules, 158 `@apply` lines, 5 `@theme` blocks, and 6 `--spacing()` calls. Most of what is applied is the package's own (`box`, `surface`, `text-control`), and the Tailwind utilities applied are single declarations such as `flex`, `items-center`, and `py-2`. What the package works around is how the compiler behaves: a referenced file that strips the theme's tokens ([Which files import the theme](./model.md#which-files-import-the-theme)), a utility that repeats its body once for each route that reaches it ([One route to each utility](./model.md#one-route-to-each-utility)), and a scan that ships a word of prose as a class, which the `@source not` lines of `src/index.css` hold back. The peer range, `>=4.3.2 <5`, also means the next Tailwind major is a port of the whole source; with an adapter it is a port of the adapter.

It is also what a larger aim needs. The package is meant to give a project most of what an interface needs and to make building one faster, and [Possible](#possible) records the step that would take. A package compiled by another project's compiler cannot decide what its own build does.

Rejected:

- **Removing Tailwind altogether**, with `chs build` as the only route to a trimmed stylesheet. A project that runs Tailwind would lose the single build, the variants, and `@apply`, and would either run two pipelines or choose between this package and Tailwind. Most projects this package is for run Tailwind, and `@codenhub/icons` ships a Tailwind plugin for the same reason.
- **Forking Tailwind.** [Build command](./cli.md#the-command-tree-shakes-it-does-not-compile) rejected a fork for the command, and the reason holds for the package: it would maintain a scanner and a compiler that track another project, and inherit a catalogue of utilities it did not design, to compete with the tool most of its consumers already run.
- **Staying as it is.** Each new feature would be designed around the compiler's behavior, as the three workarounds above were.

What is not known yet: whether a generated adapter can keep the overrides [Cascade layers](./model.md#cascade-layers) records, which are tuned to the order Tailwind emits rules in, such as the `utilities.families` sublayer and the defaults written at zero specificity. Working that out again is expected to be most of the work, and it has not been measured.

This is deferred in the sense of `docs/specs/packages-lifecycle.md`, and carries no release commitment. It waits on the question above: whether a generated adapter keeps the overrides `/tw` documents. `/tw` is a documented surface and the build rewrites what it publishes, so until that is answered, shipping the build in the release being prepared is not a plausible option. That spec rejects deferring a feature because it needs its own design; what this waits on is narrower, whether the build can be done at all without changing what `/tw` documents. When it is answered, the build goes into the release then being prepared, together with any change to `/tw` the answer requires.

### Aesthetics

The aesthetics below carry no release commitment. Each needs its solo class, compiled and `/tw` exports, a registry entry, public documentation, playground coverage, and cross-browser tests when it lands, and clears every token the other aesthetics declare ([Adding an aesthetic](./model.md#adding-an-aesthetic)).

Aesthetics compose the foundation rather than justify new tokens. Exact appearance, knobs, and browser fallbacks are reviewed against real screens before claiming completion, and visual references are agreed before an aesthetic is built.

- **Glitch.** Static color split without built-in motion or slicing; hues come from intent or consumer knobs, not a preset palette ([R1](./model.md#rules-for-aesthetics)). Its treatment needs visual references before implementation. Not started.
- **Synthwave/retro.** Visual references are awaited before defining its appearance, tokens, or implementation. No look has been selected.
- **Retro-OS bevel (`.retro-os`).** A raised two-tone edge with the standard press, not an inverted pressed bevel. A first attempt did not read as a retro OS, so the design starts over from references. A two-tone bevel needs two depth layers with separate base colours, which the foundation does not carry; whether the new design needs them is decided with it.

## Possible

Ideas kept for later, not planned: no release is prepared toward them, so they are not deferred features in the sense of `docs/specs/packages-lifecycle.md`. Each moves to Planned only by a decision that names the need it meets.

- **A build command that generates, not only trims.** `chs build` drops rules from a stylesheet compiled in advance and writes none. A generator would write rules for the project that runs it. Two things need one: layout, spacing, and type utilities for a project that does not run Tailwind, which today has the package's layout and content helpers and nothing finer, and a look named once in a project file. Both are recorded as rejected, in [No Tailwind utilities, ten variants](./cli.md#no-tailwind-utilities-ten-variants) and under "A configuration file for look" in [Not Planned](#not-planned), and both decisions stand until this one is made. What they did not weigh is a command that writes: the first rejected utilities as a fixed subset compiled in advance, wrong for some project whatever it holds, where a generator writes only what the content names; the second counted a build step that writes this package's rules for each project as a cost, because the command had none. The other cost of a configuration file, the same markup rendering differently from one project to the next, stands either way. A decision to build it starts from this boundary: a closed set of utilities driven by the package's tokens, named as Tailwind names them where the two overlap, under the fixed list of variants. Arbitrary values and open stacking of variants stay out, since past them the command is a second Tailwind. It depends on [A build the package owns](#a-build-the-package-owns-with-tailwind-as-an-adapter).

## Known gaps

Each of these is a limit of what ships today, recorded so it is decided rather than rediscovered. None is committed to a version.

None at present.

## Notes

Two measurements shaped the material tokens, so both live in [Model](./model.md) rather than here: a no-op `clip-path` or `backdrop-filter` costs nothing in any baseline engine ([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token resolves its `var()` references once, on the element that declares it, which is why a shape pair needs two token slots rather than one ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

## Versioning

Release authorization and tagging follow `docs/specs/packages-lifecycle.md`. The package stays on `0.x` while the public contract is young, so a necessary breaking correction stays explicit and cheap.

A change is a minor when it adds public surface (a class, a token, an entrypoint, an aesthetic) or changes what a default renders or what beats what for consumers already using the package, including a token or class removed without an alias. It is a patch only when it fixes rendering to match documented behavior without changing a documented default and adds no surface.

Documentation status remains `active`: supported for normal consumer use, not frozen against future semver-major changes.

## Not Planned

- **Removing `.theme-light` and `.theme-dark`**: `@codenhub/theme` writes a `theme-<name>` class by default, and the toaster's standalone fallback reads it, so it is not a second name nothing uses.
- **A configuration file for look**: a project file that would give a plain class such as `.btn` a default look, such as a `.lg` soft button under `.neobrutalism`. Since 0.8.0 the component, intent, presentation, elevation, corner, size, and modifier classes are `/tw` utilities, so a project names a look once in a class of its own, `@utility btn-save { @apply btn primary soft sm; }`, as [Presets](../usage/presets.md) describes. What the file would add is a default for the plain class itself, and that is what it costs: the same markup would render differently from one project to the next, and it needs a build step that writes this package's rules for each project, which `chs build` does not do, since it only trims a stylesheet the package compiled. Moved from Possible on 2026-11-12, before 0.9.0. The second cost rests on the command only trimming, which [Possible](#possible) keeps open; this entry is judged again if a generating command is decided.
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
