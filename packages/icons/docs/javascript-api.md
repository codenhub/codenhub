---
title: JavaScript API
description: The registry, the renderers, on-demand family loading, and the adapter for third-party icon sets.
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
