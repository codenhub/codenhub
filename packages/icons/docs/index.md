---
title: Overview
description: Icon families, name resolution, bundler plugins, JavaScript helpers, and licensing for @codenhub/icons.
---

# Icons documentation

`@codenhub/icons` turns icon classes in your markup into CSS mask rules at build time. There is no runtime, no component layer, and nothing in the output but the icons the markup actually used.

---

## Concepts

### Families

An icon family is a namespace of icons with its own prefix, geometry, and license, such as `lucide` or `material-symbols-rounded-fill`. Families are data, generated from their upstream projects and shipped as modules:

```ts
import lucide from "@codenhub/icons/data/lucide";
import phosphorFill from "@codenhub/icons/data/phosphor-fill";
```

Available families:

| Prefix                                                           | Icons     | Style                   | License    |
| ---------------------------------------------------------------- | --------- | ----------------------- | ---------- |
| `lucide`                                                         | 2034      | outlined, stroke-based  | ISC        |
| `phosphor`                                                       | 1512      | outlined                | MIT        |
| `phosphor-thin`, `phosphor-light`, `phosphor-bold`               | 1512 each | outlined, other weights | MIT        |
| `phosphor-fill`                                                  | 1512      | filled                  | MIT        |
| `phosphor-duotone`                                               | 1512      | duotone                 | MIT        |
| `material-symbols-outlined`, `-rounded`, `-sharp`                | 3899 each | outlined                | Apache-2.0 |
| `material-symbols-outlined-fill`, `-rounded-fill`, `-sharp-fill` | 3899 each | filled                  | Apache-2.0 |

Variants are separate families rather than options on one, so resolution stays a prefix and a name.

### Names

An icon is identified by `prefix:name`. A class writes that with a dash, because a class name cannot contain a colon:

```html
<i class="ic-lucide-heart"></i>
<i class="ic-material-symbols-rounded-home"></i>
```

An unprefixed name is resolved in order: the curated semantic map first, then the configured `defaultPrefix`. A semantic name whose family is not registered falls through to the default prefix rather than failing.

```html
<!-- close, edit, home, loading, search... are semantic names -->
<i class="ic-close"></i>
```

`SEMANTIC_ALIASES` is exported so a project can read, extend, or replace it:

```ts
import { IconRegistry, SEMANTIC_ALIASES } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({
  defaultPrefix: "lucide",
  semanticAliases: { ...SEMANTIC_ALIASES, brand: "phosphor:sparkle" },
});
registry.registerFamily(lucide);
```

Pass `semanticAliases: false` to disable semantic resolution entirely.

### Reserved names

`ic-stroke-<width>`, `ic-after`, and `ic-bg` are modifiers rather than icons, so `stroke`, `after`, and `bg` cannot be family prefixes. Generation refuses a family that claims one.

---

## Markup

```html
<!-- standalone -->
<i class="ic-search" aria-hidden="true"></i>

<!-- leading icon on any container, through ::before -->
<button class="btn ic-check">Submit</button>

<!-- trailing icon, through ::after -->
<a class="nav-link ic-arrow-right ic-after">Next</a>

<!-- form controls take a background-image instead of a mask -->
<input class="ic-search" />

<!-- stroke width, for stroke-based families only -->
<i class="ic-heart ic-stroke-1.5"></i>
```

Size and color follow CSS custom properties:

```css
.toolbar {
  --ic-size: 1.25rem;
  --ic-color: var(--color-accent);
}
```

---

## Vite plugin

```ts
import lucide from "@codenhub/icons/data/lucide";
import viteIcons from "@codenhub/icons/vite";

viteIcons({
  content: ["./src/**/*.{html,ts,tsx}"],
  families: [lucide],
  defaultPrefix: "lucide",
  prefix: "ic",
  strokeWidth: 1.5,
  mode: "css",
  attribution: "auto",
});
```

| Option          | Purpose                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `families`      | Families to resolve against. Nothing is bundled by default.                                 |
| `defaultPrefix` | Family an unprefixed name falls back to.                                                    |
| `content`       | Extra files to scan, beyond what the build transforms.                                      |
| `prefix`        | Class prefix. Defaults to `ic`.                                                             |
| `strokeWidth`   | Applied to stroke-based families only.                                                      |
| `mode`          | `css` serves mask rules; `svg` replaces `<i class="ic-...">` with inline SVG at build time. |
| `attribution`   | `auto`, `file`, or `off`. See [Licensing](#licensing).                                      |
| `registry`      | A prepared `IconRegistry`, replacing `families`.                                            |

The stylesheet is served as `virtual:icons.css`, and `@import "@codenhub/icons";` in any stylesheet is replaced with it.

### One module per icon

For icons chosen at runtime, import a single icon instead of a family:

```ts
const { svg } = await import("virtual:@codenhub/icons/lucide/heart");
element.innerHTML = svg;
```

The module exports the rendered markup as `svg` and its default export, and the resolved icon as `icon`. Each import is its own module, so the bundler splits and tree-shakes at icon granularity. A name with no prefix — `virtual:@codenhub/icons/close` — resolves like any other unqualified name. An unknown icon fails the build rather than resolving to nothing.

---

## PostCSS plugin

```ts
import lucide from "@codenhub/icons/data/lucide";
import postcssIcons from "@codenhub/icons/postcss";

postcssIcons({
  content: ["./src/**/*.html"],
  families: [lucide],
  defaultPrefix: "lucide",
  injectBase: true,
  attribution: "auto",
});
```

It takes the same family, prefix, and stroke options as the Vite plugin. PostCSS has no asset pipeline, so `attribution` accepts `auto` and `off` only.

---

## JavaScript API

```ts
import { generateIconSetCss, getIconCssProps, IconRegistry, renderSvg } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

const heart = registry.resolve("lucide:heart");
renderSvg(heart!, { strokeWidth: 1.5 });

const { css, families } = generateIconSetCss(["ic-heart", "ic-stroke-1.5"], registry);

getIconCssProps("close", registry);
// { "--ic-uri": 'url("data:image/svg+xml;…")', "--ic-mask": "var(--ic-uri)" }
```

`generateIconSetCss` returns the families it drew from alongside the CSS, which is what lets a caller emit the right license notice.

### Loading a family on demand

```ts
registry.registerLoader("phosphor", () => import("@codenhub/icons/data/phosphor"));

await registry.resolveAsync("phosphor:heart");
```

`resolve` is synchronous and sees only loaded families; `resolveAsync` loads the family first. Build-time consumers use the synchronous path, because a build knows its families before it starts.

### Third-party icon sets

`adoptIconifySet` is the adapter that converts an IconifyJSON-shaped document into this package's internal family contract:

```ts
import { adoptIconifySet } from "@codenhub/icons";

registry.registerFamily(adoptIconifySet(someIconifySet, { attribution: "notice" }));
```

Adopted sets are `extended` tier: the licensing promise this package makes covers the families it generates, not data a consumer supplies.

---

## Licensing

Every bundled, generated family ships the license text and attribution notice its artwork requires; those files travel with the package whatever a build does. A third-party set adopted through `adoptIconifySet` is not covered by that promise — bring your own licensing material for it.

What reaches your own output is the `attribution` option:

| Mode             | Behavior                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `auto` (default) | Prepends a `/*! … */` banner to the generated CSS, naming only the families the build used. |
| `file`           | Emits `icons-attribution.txt` as a build asset instead. Vite only.                          |
| `off`            | Emits nothing, and warns when a family used still requires a notice.                        |

Obligations come in three levels, because permissive is not the same as free of obligation:

- `none` — public-domain dedications. Nothing is owed.
- `notice` — MIT, ISC, Apache-2.0. The notice must travel with distributed output, which `auto` and `file` handle for you.
- `credit` — CC-BY and similar. The author must be credited visibly.

Every bundled family is `core` tier, meaning `none` or `notice`, so a default build satisfies every obligation automatically. A minifier configured with `legalComments: "none"` strips CSS comments, which is what `file` mode exists for.
