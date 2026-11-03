---
title: JavaScript API
description: The registry, the renderers, on-demand family loading, and the adapter for third-party icon sets.
order: 4
---

# JavaScript API

The plugins are built on a small set of exported helpers. Reach for them directly when you generate CSS or SVG outside a bundler, or when you need to prepare a registry the plugins can reuse.

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

`generateIconSetCss` returns the families it drew from alongside the CSS, which is what lets a caller emit the right license notice. Every export, with its options, is listed in the [API reference](reference/index.md).

## Generating CSS outside a bundler

The plugins are a scan followed by a generate. Run the two yourself to produce a stylesheet from a script:

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

`scanFiles` takes paths and glob patterns, and ignores a file it cannot read.

`generateFamilyCss` writes out one whole family instead, the way the package builds its own `@codenhub/icons/<family>` stylesheets. Both CSS generators carry a `--ic-static-mask` property for the base stylesheet to select on hover and under reduced motion when an icon provides `staticBody`; the registry preserves this optional inner SVG markup on `ResolvedIcon`. It shares the animated body's geometry and accepts the same stroke width. `renderSvg` keeps the animated `body`. See [Animated families](concepts.md#animated-families).

## A background-image icon

The base rules render an icon as an element (`<i>` or `.ic`) or an inlined `<svg>`, and nothing else. When you need one as a `background-image` — a custom control, an input affix, a `::before` you own — resolve the `url()` yourself:

```ts
getIconMaskUrl("lucide:search", registry); // 'url("data:image/svg+xml;…")'
getIconCssProps("lucide:search", registry); // { "--ic-uri": …, "--ic-mask": "var(--ic-uri)" }
```

`getIconMaskUrl` also takes a string that begins with `<svg` and encodes it directly, skipping the registry — pass the element itself, with no leading whitespace or XML declaration. `getIconCssProps` includes `--ic-static-mask` when the resolved icon supplies static artwork. The base stylesheet uses it for reduced motion and hover rest. It gives the custom properties an inline `style` attribute or a CSS-in-JS object needs; pair them with `background-image: var(--ic-uri)` or `mask-image: var(--ic-mask)` and your own sizing.

## Playing icons from code

`@codenhub/icons/play` is an opt-in entry point for the motion CSS cannot start on its own. It loads no icon data, and importing it does nothing until a function is called.

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

`playIcon(element, { prefix: "ic" })` plays an icon from the start: its `ic-anim-*` motion, whether running or finished, and its animated artwork. For glyph motion it clears the element's `animation-name` for one style recalculation and restores it. For a CSS-mask icon it sets a fresh SVG data URL as the inline `--ic-mask`, because a browser does not restart an image it has already shown. A direct call leaves that override in place; remove it with `element.style.removeProperty("--ic-mask")` before changing the icon class. Inline `<svg>` icons restart through `setCurrentTime(0)`. An element with neither kind of motion is left alone.

`bindIconPlayback(root = document, { prefix: "ic" })` calls `playIcon` for each `ic-on-hover` icon when its trigger starts, following the same rule as the CSS: the icon itself, its parent, or any `ic-trigger` ancestor, hovered or with `:focus-visible`. CSS alone already restarts glyph motion and looping artwork on each hover; the binder is what replays one-shot artwork, such as a Line MD draw-in. It uses delegated listeners, so icons inserted later are covered. Pass a subtree containing both the triggers and their icons to scope it. Moving between children of the same trigger keeps the current playback. When the trigger ends, it removes its inline mask override so a later icon-class change takes effect. The returned function removes the listeners and the active overrides.

A custom prefix changes the classes, the custom property, and the animation names both functions look for. Both do nothing when the device requests reduced motion: CSS-mask icons keep their static fallback, while inline SVG keeps its own animated artwork, so use static artwork yourself when needed. Calling the binder without a root outside a browser returns an empty cleanup function. Chrome playback is verified; Firefox and Safari are untested. See [Motion](concepts.md#motion) for the CSS controls.

## Loading a family on demand

```ts
registry.registerLoader("phosphor", () => import("@codenhub/icons/data/phosphor"));

await registry.resolveAsync("phosphor:heart");
```

`resolve` is synchronous and sees only loaded families; `resolveAsync` loads the family first. Build-time consumers use the synchronous path, because a build knows its families before it starts.

## Third-party icon sets

`adoptIconifySet` converts an IconifyJSON-shaped document into this package's internal family contract:

```ts
import { adoptIconifySet } from "@codenhub/icons";

registry.registerFamily(adoptIconifySet(someIconifySet, { attribution: "notice" }));
```

Pass `attribution: "credit"` instead when the adopted set's license requires visible authorship credit, such as CC-BY.

Adopted sets are `extended` tier: the licensing promise this package makes covers the families it generates, not data a consumer supplies. See [Licensing](licensing.md).
