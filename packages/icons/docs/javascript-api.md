---
title: JavaScript API
description: The registry, the renderers, on-demand family loading, and the adapter for third-party icon sets.
order: 4
---

# JavaScript API

The Tailwind, Vite, and PostCSS plugins are thin wrappers around a small set of exported helpers. Reach for these functions directly when you generate CSS or SVG outside a bundler, load icon families lazily at runtime, animate icons from application events, or wire up a pre-configured `IconRegistry` for a plugin to reuse.

```ts
import { generateIconSetCss, getIconCssProps, IconRegistry, renderSvg } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

const heart = registry.resolve("lucide:heart");
renderSvg(heart!, { strokeWidth: 1.5 });

const { css, families } = generateIconSetCss(["ic-lucide-heart", "ic-lucide-heart/1.5"], registry);

getIconCssProps("lucide:x", registry);
// { "--ic-uri": 'url("data:image/svg+xml;…")', "--ic-mask": "var(--ic-uri)" }
```

`generateIconSetCss` returns both the generated CSS and the list of `families` it drew from, so a caller knows which license notices belong in the banner. Every export and option is documented in the [API reference](reference/index.md).

## Generating CSS outside a bundler

At bottom, every plugin just runs a scan followed by a CSS emit. You can run the exact same two-step pipeline yourself in a build script or static generator:

```ts
import { generateIconSetCss, IconRegistry, renderAttributionBanner, scanFiles } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

const classes = scanFiles(["./src/**/*.html"]);
const { css, families } = generateIconSetCss(classes, registry);
const banner = renderAttributionBanner(families); // undefined when no family used owes a notice
const stylesheet = banner ? `${banner}\n${css}` : css;
```

`scanFiles` accepts literal file paths and glob patterns, and quietly skips any file it cannot read rather than blowing up your script over a stray permission error.

If you want one full family stylesheet — the same format `@codenhub/icons/<family>` ships — call `generateFamilyCss`. Both CSS generators emit a `--ic-static-mask` property for the base stylesheet to swap in on hover rest and under reduced motion whenever an icon provides `staticBody`; the registry preserves that optional inner SVG markup on `ResolvedIcon`. It shares the animated body's geometry and accepts the same stroke width. `renderSvg`, by contrast, keeps the animated `body`. See [Animated families](concepts.md#animated-families).

## A background-image icon

The base stylesheet styles icons on an element (`<i>` or `.ic`) or an inlined `<svg>`. When CSS puts the icon in a place with no inner element — a custom form control, an input affix, or a `::before` pseudo-element you own — resolve the `url()` in JavaScript and feed it to your CSS yourself:

```ts
getIconMaskUrl("lucide:search", registry); // 'url("data:image/svg+xml;…")'
getIconCssProps("lucide:search", registry); // { "--ic-uri": …, "--ic-mask": "var(--ic-uri)" }
```

`getIconMaskUrl` also accepts a raw string starting with `<svg` and encodes it directly without consulting a registry — pass the element markup itself, with no leading whitespace or XML declaration. `getIconCssProps` includes `--ic-static-mask` when the resolved icon supplies static artwork, which the base stylesheet uses for reduced motion and hover rest. It returns the exact custom-property object an inline `style` attribute or CSS-in-JS object expects; pair those properties with `background-image: var(--ic-uri)` or `mask-image: var(--ic-mask)` and your own sizing.

## Playing icons from code

`@codenhub/icons/play` is an opt-in entry point for playback behavior CSS cannot handle on its own. It loads no icon data, and simply importing it does nothing until you call one of its two functions:

```ts
import { bindIconPlayback, playIcon } from "@codenhub/icons/play";

// Replay one-shot artwork on every hover, not only the first:
const unbind = bindIconPlayback();

// Play an icon on an event, such as a successful copy:
copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(value);
  playIcon(copyButton.querySelector(".ic-anim-beat")!);
});

// When the page or component is disposed:
unbind();
```

`playIcon(element, { prefix: "ic" })` restarts an icon from frame zero, whether it uses an `ic-anim-*` class (running or finished) or animated SVG artwork. For glyph motion, it briefly clears `animation-name` for one style recalculation and restores it. For a CSS-mask icon, it writes a fresh SVG data URL to the inline `--ic-mask` property, because browsers refuse to restart an animated mask image they have already painted once. A direct call leaves that inline override on the element, so clear it with `element.style.removeProperty("--ic-mask")` before swapping the icon class later. Inline `<svg>` icons restart via `setCurrentTime(0)`. An element with neither kind of motion is left untouched.

`bindIconPlayback(root = document, { prefix: "ic" })` calls `playIcon` for every `ic-on-hover` icon when its trigger activates, following the exact same trigger rule as the CSS: the icon itself, its parent, or any `ic-trigger` ancestor on hover or `:focus-visible`. CSS alone already restarts glyph motion and looping artwork on every hover; this binder is what lets one-shot artwork, such as a Line MD draw-in, replay on every hover instead of only the first. It attaches delegated listeners, so icons mounted later work automatically. Pass a subtree containing both the triggers and their icons to scope it. Moving the pointer between children inside the same trigger preserves the active playback, and when the trigger ends, the binder cleans up its inline `--ic-mask` override so future icon-class changes work normally. Calling the returned cleanup function removes the listeners and clears active overrides.

Passing a custom `prefix` shifts the classes, custom property, and animation names both functions target. Both functions do nothing when the device requests reduced motion: CSS-mask icons keep their static fallback, while inline SVG keeps its own animated artwork, so substitute static artwork yourself when needed. Calling `bindIconPlayback` with no `root` outside a browser returns a no-op cleanup function. Chrome playback is verified; Firefox and Safari are untested. See [Motion](concepts.md#motion) for the CSS controls.

## Loading a family on demand

In a browser UI such as an icon picker, bundling every family up front would weigh megabytes. Register async loaders instead so families load only when someone asks for them:

```ts
registry.registerLoader("phosphor", () => import("@codenhub/icons/data/phosphor"));

await registry.resolveAsync("phosphor:heart");
```

`resolve` stays synchronous and checks only families already in memory, whereas `resolveAsync` loads the requested family first. Build-time plugins stay on the synchronous path because a build knows its configured families before it starts scanning.

## Third-party icon sets

`adoptIconifySet` converts any IconifyJSON-shaped document into the family format this package expects:

```ts
import { adoptIconifySet } from "@codenhub/icons";

registry.registerFamily(adoptIconifySet(someIconifySet, { attribution: "notice" }));
```

Pass `attribution: "credit"` instead when the adopted set's license requires visible authorship credit, such as CC-BY.

Adopted sets belong to the `extended` tier: the licensing promise this package makes covers the families it generates, not data a consumer supplies. See [Licensing](licensing.md).

## Next

Read [Licensing](licensing.md) to see what attribution your build emits for each delivery method and what obligations apply to core, brand, and adopted icon sets.
