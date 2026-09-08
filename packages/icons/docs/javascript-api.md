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

`generateIconSetCss` returns the families it drew from alongside the CSS, which is what lets a caller emit the right license notice.

## A background-image icon

The base rules render an icon as an element (`<i>` or `.ic`) or an inlined `<svg>`, and nothing else. When you need one as a `background-image` — a custom control, an input affix, a `::before` you own — resolve the `url()` yourself:

```ts
getIconMaskUrl("lucide:search", registry); // 'url("data:image/svg+xml;…")'
getIconCssProps("lucide:search", registry); // { "--ic-uri": …, "--ic-mask": "var(--ic-uri)" }
```

`getIconMaskUrl` also takes a string that begins with `<svg` and encodes it directly, skipping the registry — pass the element itself, with no leading whitespace or XML declaration. `getIconCssProps` gives the two custom properties an inline `style` attribute or a CSS-in-JS object needs; pair them with `background-image: var(--ic-uri)` or `mask-image: var(--ic-mask)` and your own sizing.

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
