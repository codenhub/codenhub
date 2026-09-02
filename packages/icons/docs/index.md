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
<i class="ic-lucide-heart"></i> <i class="ic-material-symbols-rounded-home"></i>
```

The longest matching family prefix wins, so `material-symbols-outlined` is preferred over `material` when both are loaded.

An unqualified name resolves against the configured `defaultPrefix`, and against nothing at all when none is set. The package names no default family and ships no curated map of semantic names: `ic-close` means whatever the family you chose calls `close`, and renders nothing if that family has no such icon. Lucide's is named `x`, so under Lucide you write `ic-x`.

```ts
import { IconRegistry } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

registry.resolve("heart"); // lucide:heart
registry.resolve("close"); // undefined -- lucide calls it "x"
```

### Reserved names

`ic-after` and `ic-bg` are modifiers rather than icons, so `after` and `bg` cannot be family prefixes. Generation refuses a family that claims one. Stroke width is written on the icon class itself, so it claims no prefix.

---

## Markup

```html
<!-- standalone -->
<i class="ic-lucide-search" aria-hidden="true"></i>

<!-- leading icon on any container, through ::before -->
<button class="btn ic-lucide-check">Submit</button>

<!-- trailing icon, through ::after -->
<a class="nav-link ic-lucide-arrow-right ic-after">Next</a>

<!-- form controls take a background-image instead of a mask -->
<input class="ic-lucide-search" />

<!-- stroke width, for stroke-based families only -->
<i class="ic-lucide-heart/1.5"></i>
```

Size and color follow CSS custom properties:

```css
.toolbar {
  --ic-size: 1.25rem;
  --ic-color: var(--color-accent);
}
```

### Stroke width

Stroke width is a modifier on the icon class, and only families drawn with strokes answer to it. Of the bundled families, Lucide is the only one; the rest are drawn as filled paths and ignore it.

```html
<i class="ic-lucide-heart/1.5"></i> <i class="ic-lucide-heart/3"></i>
```

The width is baked into the artwork the rule carries, so it cannot be a second class applied on top: `ic-heart` and `ic-heart/1.5` are two icons, not one icon and a switch. One class is one rule, so a project pays for the widths it wrote and no others.

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
| `defaultPrefix` | Family an unqualified name resolves against. There is no default.                           |
| `content`       | Extra files to scan, beyond what the build transforms.                                      |
| `prefix`        | Class prefix. Defaults to `ic`.                                                             |
| `strokeWidth`   | Default for stroke-based families whose classes carry no modifier.                          |
| `mode`          | `css` serves mask rules; `svg` replaces `<i class="ic-...">` with inline SVG at build time. |
| `attribution`   | `auto`, `file`, or `off`. See [Licensing](#licensing).                                      |
| `registry`      | A prepared `IconRegistry`, replacing `families`.                                            |

The stylesheet is served as `virtual:icons.css`, and `@import "@codenhub/icons";` in any stylesheet the plugin transforms is replaced with it.

When the CSS pipeline resolves that import itself rather than leaving it to the plugin — `@tailwindcss/vite`, or a plain `<link rel="stylesheet" href="@codenhub/icons">` — it reaches the package's `style` export condition, a static `dist/style.css` carrying only the base `.ic` rules. Add the Vite or PostCSS plugin to turn the icon classes in your markup into mask rules on top of it.

### One module per icon

For icons chosen at runtime, import a single icon instead of a family:

```ts
const { svg } = await import("virtual:@codenhub/icons/lucide/heart");
element.innerHTML = svg;
```

The module exports the rendered markup as `svg` and its default export, and the resolved icon as `icon`. Each import is its own module, so the bundler splits and tree-shakes at icon granularity. A name with no prefix — `virtual:@codenhub/icons/close` — resolves like any other unqualified name. An unknown icon fails the build rather than resolving to nothing.

### Inline SVG mode

`mode: "svg"` replaces `<i class="ic-...">` tags with inline SVG at build time and emits no stylesheet at all. It rewrites those tags and nothing else, so the `::before`, `::after`, and form-control forms above do not work in this mode: they need mask rules, and there are none. The plugin warns at build time when it finds an icon class on an element it will not rewrite, naming the class and the file.

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

const { css, families } = generateIconSetCss(["ic-lucide-heart", "ic-lucide-heart/1.5"], registry);

getIconCssProps("lucide:x", registry);
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

Pass `attribution: "credit"` instead when the adopted set's license requires visible authorship credit, such as CC-BY.

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
