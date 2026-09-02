---
title: Overview
description: Icon families, name resolution, bundler plugins, JavaScript helpers, and licensing for @codenhub/icons.
---

# Icons documentation

`@codenhub/icons` turns icon classes in your markup into CSS mask rules. There is no runtime and no component layer. Icons arrive through CSS, by one of three entry points, and every one of them understands the same classes.

---

## Entry points

| Entry                      | For                         | What it delivers                                                              |
| -------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `@codenhub/icons`          | Every path                  | The base `.ic` rules, about 2 KB. Never rewritten by a plugin.                |
| `@codenhub/icons/tw`       | Tailwind CSS v4             | Base rules plus the plugin. Every family resolvable, only used icons emitted. |
| `@codenhub/icons/tailwind` | Tailwind CSS v4, configured | The plugin on its own, so `@plugin` can carry options.                        |
| `@codenhub/icons/<family>` | Plain CSS, no build step    | One complete family, every icon written out.                                  |
| `@codenhub/icons/vite`     | Vite                        | Scans your markup and generates only the rules it needs.                      |
| `@codenhub/icons/postcss`  | PostCSS                     | The same, for a PostCSS pipeline.                                             |

`@import "@codenhub/icons"` means exactly one thing everywhere: the base rules the icon classes build on. No plugin rewrites it, no plugin deletes it. What differs between the paths is only where the per-icon mask rules come from.

### Tailwind CSS v4

```css
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Every family the package ships is resolvable, and Tailwind emits only the icons your markup used. Loading all 13 families costs about 130 ms and 100 MB once per build; a project using three icons ends up with about 10 KB of CSS.

To configure the plugin, declare it yourself instead of importing `/tw`, which already declares it with no options:

```css
@import "tailwindcss";
@import "@codenhub/icons";
@plugin "@codenhub/icons/tailwind" {
  families: lucide, phosphor-fill;
  default: lucide;
  stroke-width: 1.5;
}
```

| Option         | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `families`     | Family prefixes to resolve against. Defaults to all of them.          |
| `default`      | Family that unqualified names resolve against. There is no default.   |
| `prefix`       | Class prefix. Defaults to `ic`.                                       |
| `stroke-width` | Applied to stroke-based families that carry no modifier of their own. |
| `attribution`  | `auto` or `off`. See [Licensing](#licensing).                         |

`families` does not make the build cheaper. A Tailwind plugin handler has to be synchronous — utilities registered after an `await` are dropped — so every family is already loaded by the time the options are read. It decides which names resolve, and which notices the output can carry.

### Plain CSS, no build step

```css
@import "@codenhub/icons";
@import "@codenhub/icons/phosphor-fill";
@import "@codenhub/icons/lucide";
```

Each family stylesheet is complete: every icon, because nothing is scanning your markup to narrow it. They are large by construction — Lucide is about 1 MB, Material Symbols Rounded about 3.4 MB, all 13 about 22 MB — so a project chooses its cost by choosing which families it imports.

Every rule carries two selectors, the qualified `ic-lucide-heart` and the bare `ic-heart`, sharing one copy of the artwork. That is how this path gets a default family without any configuration to hold one: the last family you import wins every bare name it defines. Above, `ic-heart` is Lucide's.

Stroke width does not work here. It is baked into the artwork each rule carries, and a stylesheet with no build step behind it cannot know which widths you want.

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

An unqualified name resolves against a default family, and against nothing at all when none is configured. The package names no default of its own and ships no curated map of semantic names: `ic-close` means whatever the family you chose calls `close`, and renders nothing if that family has no such icon. Lucide's is named `x`, so under Lucide you write `ic-x`.

Where the default comes from depends on the path:

| Path          | Default family                       |
| ------------- | ------------------------------------ |
| Vite, PostCSS | The `defaultPrefix` option.          |
| Tailwind      | The `default:` plugin option.        |
| Plain CSS     | The last family stylesheet imported. |

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

That is also why the modifier needs a build step. It works under Vite, PostCSS, and Tailwind, all of which see your markup; the plugin-free family stylesheets render at the family's authored width, because nothing there can know which widths to prepare.

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
| `content`       | Files and globs to scan, beyond what the build transforms.                                  |
| `prefix`        | Class prefix. Defaults to `ic`.                                                             |
| `strokeWidth`   | Default for stroke-based families whose classes carry no modifier.                          |
| `mode`          | `css` serves mask rules; `svg` replaces `<i class="ic-...">` with inline SVG at build time. |
| `attribution`   | `auto`, `file`, or `off`. See [Licensing](#licensing).                                      |
| `registry`      | A prepared `IconRegistry`, replacing `families`.                                            |

The generated stylesheet is served as `virtual:icons.css` and injected into every HTML entry point.

`@import "@codenhub/icons";` is left alone. It resolves through the package's `style` export condition to `dist/style.css`, the base `.ic` rules, and means the same thing whether or not a plugin is in the pipeline. Keep it in your stylesheet; the plugin adds the per-icon rules around it rather than in place of it.

### Scanning

`content` takes literal paths and glob patterns, `src/**/*.{html,tsx}` among them, expanded when the scan runs. It is additive: the plugin also scans every source file the build transforms, so `content` is for what the bundler never reaches, and for making the first paint correct in dev.

That last part is worth knowing. In dev, Vite serves the HTML before it transforms a single module, so a class the plugin has only ever seen inside a module is not yet known when the page is first served. The stylesheet is therefore served as a module rather than inlined, and the plugin invalidates it whenever a transform turns up something new, so the icon arrives without a reload. Listing your sources in `content` avoids the round trip entirely, because those files are read from disk up front.

### Inline SVG mode

`mode: "svg"` replaces `<i class="ic-...">` tags with inline SVG at build time and emits no stylesheet at all. It rewrites those tags and nothing else, so the `::before`, `::after`, and form-control forms above do not work in this mode: they need mask rules, and there are none. The plugin warns at build time when it finds an icon class on an element it will not rewrite, naming the class and the file.

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

The vehicle differs by path, because not every path can carry a comment:

| Path      | How the notice travels                                                             |
| --------- | ---------------------------------------------------------------------------------- |
| Vite      | A `/*! … */` banner on the generated CSS, or `icons-attribution.txt` under `file`. |
| PostCSS   | A `/*! … */` banner on the generated CSS.                                          |
| Tailwind  | A `--ic-attribution-<family>` custom property on `:root`, one per family used.     |
| Plain CSS | A `/*! … */` banner opening each family stylesheet you imported.                   |

Tailwind's plugin API builds declarations, not comments, so its notice is a custom property rather than a banner. It is emitted the first time a family produces a utility, so a build carries notices for the artwork it actually shipped and no other.

Obligations come in three levels, because permissive is not the same as free of obligation:

- `none` — public-domain dedications. Nothing is owed.
- `notice` — MIT, ISC, Apache-2.0. The notice must travel with distributed output, which `auto` and `file` handle for you.
- `credit` — CC-BY and similar. The author must be credited visibly.

Every bundled family is `core` tier, meaning `none` or `notice`, so a default build satisfies every obligation automatically. A minifier configured with `legalComments: "none"` strips CSS comments, which is what `file` mode exists for.
