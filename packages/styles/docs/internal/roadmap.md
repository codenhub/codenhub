---
status: APPROVED
last_updated: 2026-11-25
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction for `@codenhub/styles` without duplicating issue tracking. [Model](./model.md) owns the styling model itself.

Finished work is not tracked here. The current token contract, component coverage, and shipped aesthetics belong in the model, the changelog, and repository history, not in a completed-work checklist.

## Supported surface

[Model](./model.md) defines the styling contract, `registry.json` records the supported machine-readable surface, and the public documentation owns the consumer contract under `docs/specs/packages-documentation.md`. This roadmap adds no support rules.

## Current Focus

0.11.0 adds the `data-contrast` and `data-motion` app settings, which let an app decide in place of the system's contrast and reduced-motion settings ([#582](https://github.com/codenhub/codenhub/issues/582)), as [App settings](../accessibility.md#app-settings) describes. Nothing else is committed to a version. The foundation was built for structure, not for a look: a new material part must pass [What enters the material contract](./model.md#what-enters-the-material-contract), independently of the aesthetic that would use it. An aesthetic the foundation cannot express without breaking that rule needs a separate decision before implementation.

## Planned

### Generator

A build step that writes the rules a project's files use: layout, spacing, sizing, display, and type utilities with Tailwind's names and values for a project that does not run Tailwind, then the package's own classes in place of trimming `dist/purge/`. Delivered through the Vite plugin and `chs build`, with no new option. [Generator](./generator.md) records its decisions, all taken by the maintainer by 2026-11-26.

It ships in 0.12.0, with the package's own checkbox marks and the Vite plugin. An exception taken on 2026-11-25 deferred it to the release after, because its design still had open questions; it was reversed on 2026-11-26, since "Versioning" in `docs/specs/packages-lifecycle.md` rejects deferring a feature because it needs its own design, and the questions were decisions within the package, not a runtime, dependency, or outside decision it waits on.

### Aesthetics

The aesthetics below carry no release commitment. Each needs its solo class, compiled and `/tw` exports, a registry entry, public documentation, playground coverage, and cross-browser tests when it lands, and clears every token the other aesthetics declare ([Adding an aesthetic](./model.md#adding-an-aesthetic)).

Aesthetics compose the foundation rather than justify new tokens. Exact appearance, knobs, and browser fallbacks are reviewed against real screens before claiming completion, and visual references are agreed before an aesthetic is built.

- **Glitch.** Static color split without built-in motion or slicing; hues come from intent or consumer knobs, not a preset palette ([R1](./model.md#rules-for-aesthetics)). Its treatment needs visual references before implementation. Not started.
- **Synthwave/retro.** Visual references are awaited before defining its appearance, tokens, or implementation. No look has been selected.
- **Retro-OS bevel (`.retro-os`).** A raised two-tone edge with the standard press, not an inverted pressed bevel. A first attempt did not read as a retro OS, so the design starts over from references. A two-tone bevel needs two depth layers with separate base colours, which the foundation does not carry; whether the new design needs them is decided with it.

## Possible

Ideas kept for later, not planned: no release is prepared toward them, so they are not deferred features in the sense of `docs/specs/packages-lifecycle.md`. Each moves to Planned only by a decision that names the need it meets.

- **A compiled entrypoint that states a shared body once.** A step after [A build the package owns](#a-build-the-package-owns-with-tailwind-as-an-adapter), measured and found not to pay for itself. Today a body several classes apply is written out under each of them: in `dist/index.css`, 53 bodies repeat. Estimated on the 0.9.0 output without regard to rule order, so as a ceiling, emitting each once under the list of selectors that share it takes `dist/index.css` from 194.1 KB to 125.3 and from 561 rules to 306, and `dist/native.css` from 289.8 KB to 188.4. Measured on the build the package owns, with a prototype of the step:
  - **Merging whole rules** without changing any cascade result: `dist/index.css` 196.6 → 183.9 KB, 545 → 410 rules, gzip 17.6 → 17.4, Brotli 13.0 → 12.9; `dist/native.css` 292.3 → 275.9 KB, Brotli 13.7 → 13.8.
  - **Also moving every declaration nothing contests:** `dist/index.css` 196.6 → 154.6 KB, Brotli 13.0 → 13.2; `dist/native.css` 292.3 → 232.6 KB, Brotli 13.7 → 14.3.
  - **Time, in Playwright 1.63:** parsing (`CSSStyleSheet.replaceSync`) drops 13 to 25%, about 0.4 ms in Chromium on a desktop and 1.8 ms with the CPU slowed four times. Inserting the sheet and computing styles for a page that uses every class shows no difference beyond noise in Chromium, Firefox, or WebKit: that work is selector matching, and merging leaves the selectors as they are.

  The ceiling cannot be reached without changing a result. `surface`'s body, about 4.5 KB under 10 classes and 40 KB of what cannot move, would cross rules at the same layer and specificity that set the same properties, so on `class="alert surface"` it would change which declaration wins. Today that winner follows from the order Tailwind sorts utilities in, not from a decision.

  Worth deciding again when either holds:
  - the order-safe saving on `dist/index.css` passes about 100 KB minified, roughly 4 to 5 ms of parsing with the CPU slowed four times; measure it again whenever a component that composes a body over 1 KB is added;
  - the package decides, on both paths, which declarations win when a component and a helper it composes sit on one element. That is a contract decision of its own, and it would let `surface`'s body be written once.

  The design weighed then: a pass after minification that joins the selectors of rules with the same body, in the same layer and chain of at-rules, as a plain list, never `:is()`, so each selector keeps its specificity, and only selectors every target browser parses, since one it rejects drops the whole list. A rule moves only when no rule between the two positions, at the same layer, specificity, pseudo-element, and importance, sets a property of the same shorthand family to a different value. `adapter.test.ts` would compare `/tw` with a compile run without the pass, and a new test would hold the order of every pair of competing declarations. `chs build` already purges a selector list selector by selector, and `scripts/build-purge.mjs` would apply the same pass to `dist/purge/index.css`.

## Known gaps

Each of these is a limit of what ships today, recorded so it is decided rather than rediscovered. None is committed to a version.

None at present.

## Notes

Two measurements shaped the material tokens, so both live in [Model](./model.md) rather than here: a no-op `clip-path` or `backdrop-filter` costs nothing in any baseline engine ([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token resolves its `var()` references once, on the element that declares it, which is why a shape pair needs two token slots rather than one ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

### A build the package owns, with Tailwind as an adapter

Shipped in 0.10.0, and kept here for the reasons and measurements later work builds on. The package is compatible with Tailwind without depending on it. Until 0.10.0, Tailwind compiled `src/` into every compiled entrypoint and `/tw` published that same source for a consumer's Tailwind to compile, so Tailwind was the foundation of both paths. 0.10.0 made it an adapter to one of them:

- **The source is compiled by a build this package owns.** It is CSS with nesting, `@layer`, and custom properties, plus one directive of the package's own that gives a rule the body of a class and is resolved when the package is built. The palette ramps and the reset it reads from Tailwind become the package's own. The compiled entrypoints then need Tailwind neither when this package is built nor in the consumer's project. `chs build` needs none in the consumer's project, but the `dist/purge/` files it reads are still compiled with Tailwind when this package is built, since they carry Tailwind's variants.
- **`/tw` is generated from that source.** It becomes a thin wrapper that declares the package's classes to Tailwind as utilities, so a project that runs Tailwind keeps what `/tw` gives it today: one build, one theme, the variants on the axis classes, `@apply` of a component, and a stylesheet holding only the classes its files name.
- **The class names and the layer order stay Tailwind's.** The four layers of [Cascade layers](./model.md#cascade-layers) and the rule of [Names that avoid a collision](./model.md#names-that-avoid-a-collision) are plain CSS and need no compiler. They are what lets the compiled stylesheet sit under a consumer's Tailwind utilities, and what keeps the same markup working on both paths.

Rejected: a source of plain CSS, with a shared body written once under a list of selectors. It does not weigh `/native`, where a bare `button` takes the body of `btn` in another layer and at the specificity of an element. One rule cannot sit in two layers, and a body nested under a list that mixes the two becomes `:is(.btn, button)`, which gives the element the specificity of a class. A step that copies a body is needed however the source is written, and the directive is that step, owned by this package and not by Tailwind.

The reason is that the dependence that costs is on Tailwind's compiler, not on its utilities. Most of what the source applies is the package's own (`box`, `surface`, `text-control`), and the Tailwind utilities applied are single declarations such as `flex`, `items-center`, and `py-2`. What the package works around is how the compiler behaves: a referenced file that strips the theme's tokens ([Which files import the theme](./model.md#which-files-import-the-theme)), a utility that repeats its body once for each route that reaches it ([One route to each utility](./model.md#one-route-to-each-utility)), and a scan that ships a word of prose as a class, which a source Tailwind compiles has to hold back with `@source not` lines. The peer range, `>=4.3.2 <5`, also means the next Tailwind major is a port of the whole source; with an adapter it is a port of the adapter.

It is also what a larger aim needs. The package is meant to give a project most of what an interface needs and to make building one faster, and the [Generator](#generator) under Planned is the step that takes it. A package compiled by another project's compiler cannot decide what its own build does.

Rejected:

- **Removing Tailwind altogether**, with `chs build` as the only route to a trimmed stylesheet. A project that runs Tailwind would lose the single build, the variants, and `@apply`, and would either run two pipelines or choose between this package and Tailwind. Most projects this package is for run Tailwind, and `@codenhub/icons` ships a Tailwind plugin for the same reason.
- **Forking Tailwind.** [Build command](./cli.md#the-command-tree-shakes-it-does-not-compile) rejected a fork for the command, and the reason holds for the package: it would maintain a scanner and a compiler that track another project, and inherit a catalogue of utilities it did not design, to compete with the tool most of its consumers already run.
- **Staying as it is.** Each new feature would be designed around the compiler's behavior, as the three workarounds above were.

It rests on one question: whether a generated adapter can keep the overrides [Cascade layers](./model.md#cascade-layers) records, which are tuned to the order Tailwind emits rules in, such as the `utilities.families` sublayer and the defaults written at zero specificity. It can, as measured on the 0.9.0 source with Tailwind 4.3.4:

- **The compiled path.** Tailwind's output for `src/index.css`, taken before minification, holds no Tailwind syntax: no `@apply`, `@theme`, `@utility`, or `--spacing()`. Minified by the minifier the build already uses, it is `dist/index.css` byte for byte. What Tailwind adds to a compiled entrypoint is therefore one expansion step, and a source written as that expansion needs only the minifier.
- **The adapter.** The test built a copy of `tw/` in which each of the 46 utilities that use `@apply` carries Tailwind's own expansion of its body instead. A consumer compiled it naming all 89 utilities, 22 axis classes under 16 variants, and 54 Tailwind utilities, with six rules of its own that `@apply` the package's classes. The output matched the `/tw` compiled from the unchanged source byte for byte through every layer, 312,137 bytes, and a page holding one button matched whole. Tailwind orders utilities by the properties their expanded bodies declare, so a body written out sorts where the applied one did, and the overrides hold without being worked out again.
- **What the adapter has to add.** Tailwind registers a `--tw-*` property only when one of its own utilities that uses it is compiled. The package's bodies write nine through `@apply`: `--tw-font-weight`, `--tw-leading`, `--tw-duration`, `--tw-ease`, `--tw-border-style`, `--tw-tracking`, and `--tw-scale-x`, `-y`, and `-z`. In the test `--tw-ease` went unregistered, so it would have inherited. The adapter ships those nine registrations itself.

Not measured: the floor of the supported Tailwind range, 4.3.2; the compiled entrypoints other than the complete stylesheet; and the 25 `@apply` lines the test left for Tailwind, which are those in rules outside a `@utility` and in `hoverable`, whose body Tailwind lifts out of its rule. The browser suite was not run against the adapter.

Stating a shared body once is a separate step, kept in [Possible](#possible), as [A compiled entrypoint that states a shared body once](#possible) records.

**The source and the build moved, and no rule either path emits changed.** The comparison above was the gate, taken while both builds existed. Built with Tailwind 4.3.4 and the source written with `@compose`. Every compiled entrypoint in `dist/` and both files in `dist/purge/` are the previous build's byte for byte, except that `dist/aesthetics/index.css` lost Tailwind's banner, as it carries none of Tailwind's CSS. A consumer's Tailwind compiling the new `/tw` emits the previous `/tw`'s rules in the same order, on 4.3.4 and on 4.3.2, for the complete stylesheet with rules of its own that `@apply` the package's classes, `hoverable` among them, for a page with one button, for an empty page, and for every `/tw` export. What it emits besides is the nine `--tw-*` registrations, on every page of a `/tw` entry that carries the theme, which costs such a page 694 bytes; a focused aesthetic, such as `/aesthetics/glass/tw`, carries no theme and emits none. `tests/integration/adapter.test.ts` keeps the comparison: it compiles each compiled entry that has a `/tw` counterpart, every one but `dist/palette.css`, again from it and holds the two to the same rules. The browser suite passes against the adapter in Chromium, Firefox, and WebKit, `tw-consumer.spec.ts` included, as do the suites of `@codenhub/theme` and `@codenhub/toaster`, whose demo and debug apps compile `/tw`.

## Versioning

Release authorization and tagging follow `docs/specs/packages-lifecycle.md`. The package stays on `0.x` while the public contract is young, so a necessary breaking correction stays explicit and cheap.

A change is a minor when it adds public surface (a class, a token, an entrypoint, an aesthetic) or changes what a default renders or what beats what for consumers already using the package, including a token or class removed without an alias. It is a patch only when it fixes rendering to match documented behavior without changing a documented default and adds no surface.

Documentation status remains `active`: supported for normal consumer use, not frozen against future semver-major changes.

## Not Planned

- **Removing `.theme-light` and `.theme-dark`**: `@codenhub/theme` writes a `theme-<name>` class by default, and the toaster's standalone fallback reads it, so it is not a second name nothing uses.
- **A configuration file for look**: a project file that would give a plain class such as `.btn` a default look, such as a `.lg` soft button under `.neobrutalism`. The component, intent, presentation, elevation, corner, size, and modifier classes are `/tw` utilities, so a project names a look once in a class of its own, `@utility btn-save { @apply btn primary soft sm; }`, as [Presets](../usage/presets.md) describes. What the file would add is a default for the plain class itself, and that is what it costs: the same markup would render differently from one project to the next, and it needs a build step that writes this package's rules for each project, which `chs build` does not do, since it only trims a stylesheet the package compiled. A [generator](./generator.md) is now planned, so the second cost no longer holds on its own; the entry stands on the first, since the generator writes only what the content names and never a default for a plain class.
- **Neumorphism**: Its defining trait is a borderless control distinguished only by low-contrast shadow, which fails WCAG 1.4.11 non-text contrast. Not shipped unless a variant is found that keeps the look and passes.
- **Bundled fonts**: `.pixel` reads `--font-pixel` and falls back to monospace. The package ships no font binary and stays free of network side effects. The playground supplies Pixelify Sans from a CDN so the aesthetic can be reviewed against a real bitmap face; that is preview scaffolding and never ships. A substitute needs distinct uppercase and lowercase glyphs and real 400-700 weights, since components set `font-weight` 500 to 700 and synthetic bold smears a bitmap glyph. Silkscreen fails the first requirement: it draws the same glyph for both cases, which makes every heading read as shouting and hides real casing mistakes.
- **JS/TS Helpers**: Runtime DOM helpers such as a typed `createElement` wrapper are not planned. The package ships no runtime JavaScript. The JavaScript it ships runs at build time on the developer's machine, never in the browser: the `chs` build command and the Vite plugin, which both trim this package's compiled stylesheet to a project's templates for a project that does not run Tailwind. Their decisions and limits are in [Build command](./cli.md) and [Vite plugin](./vite.md).
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
- [Vite plugin](./vite.md)
