---
title: Concepts
description: Families, name resolution, reserved names, stroke width, and the markup forms — the model every delivery method shares.
order: 1
---

# How the icon system fits together

Every delivery method reads the same classes and shares the same model. This page describes that model once, independent of which method you use.

## Families

An icon family is a namespace of icons with its own prefix, geometry, and license, such as `lucide` or `material-symbols-rounded-fill`. Families are data, generated from their upstream projects and shipped as modules:

```ts
import lucide from "@codenhub/icons/data/lucide";
import phosphorFill from "@codenhub/icons/data/phosphor-fill";
```

Available families:

| Prefix                                                           | Icons     | Style                       | License    |
| ---------------------------------------------------------------- | --------- | --------------------------- | ---------- |
| `lucide`                                                         | 2034      | outlined, stroke-based      | ISC        |
| `phosphor`                                                       | 1512      | outlined                    | MIT        |
| `phosphor-thin`, `phosphor-light`, `phosphor-bold`               | 1512 each | outlined, other weights     | MIT        |
| `phosphor-fill`                                                  | 1512      | filled                      | MIT        |
| `phosphor-duotone`                                               | 1512      | duotone                     | MIT        |
| `material-symbols-outlined`, `-rounded`, `-sharp`                | 3899 each | outlined                    | Apache-2.0 |
| `material-symbols-outlined-fill`, `-rounded-fill`, `-sharp-fill` | 3899 each | filled                      | Apache-2.0 |
| `simple-icons` (brand)                                           | 3254      | filled logos, brand-colored | CC0-1.0    |
| `logos` (brand)                                                  | 2016      | full-color logos            | CC0-1.0    |

Variants such as filled or duotone are separate families rather than options on one, so resolution stays a prefix and a name.

`simple-icons` and `logos` are brand families. `simple-icons` draws each logo in one brand color, as in `ic-simple-icons-github` and `ic-simple-icons-npm`. `logos` draws them in full color, as in `ic-logos-google-icon` and `ic-logos-slack-icon`, for brands that one color cannot show, such as Google's four-color G. The two complement each other: most brands are in only one of them.

A full-color logo weighs more than a one-color icon. With the plugins, a project pays only for the logos it uses: about 2 KB of CSS for a typical one, and under 8 KB for 95% of them. A few traced, highly detailed logos are much heavier, from about 60 KB to 150 KB each: `lerna` (149 KB), `effector` (120 KB), `composer` (88 KB), `hugo` (85 KB), `tastejs` (69 KB), `matplotlib` (66 KB), `matplotlib-icon` (65 KB), and `chalk` (60 KB). A gzipped or Brotli-compressed stylesheet transfers several times smaller than these figures. Where weight matters, prefer a lighter mark, such as a brand's `-icon` variant, or the brand's `simple-icons` icon when it has one. Brand families are opt-in everywhere — `@codenhub/icons/tw` never resolves them, and a declared `@plugin` resolves them only when its `families` option names them — and their marks are trademarks of their owners. See [Licensing](licensing.md#brand-families).

## Names

An icon is identified by `prefix:name`. A class writes that with a dash, because a class name cannot contain a colon:

```html
<!-- lucide:heart -->
<i class="ic-lucide-heart"></i>

<!-- material-symbols-rounded:home -->
<i class="ic-material-symbols-rounded-home"></i>
```

The longest matching family prefix wins, so `material-symbols-outlined` is preferred over `material` when both are loaded.

An unqualified name resolves against a default family, and against nothing at all when none is configured. The package names no default of its own and ships no curated map of semantic names: `ic-close` means whatever the family you chose calls `close`, and gets no icon if that family has no such icon. In plain CSS an earlier-imported family that does have the name still answers to it, because a family stylesheet claims only the bare names it defines. Lucide's is named `x`, so under Lucide you write `ic-x`.

Where the default comes from depends on the delivery method:

| Method        | Default family                       |
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

### Finding an icon's name

An icon's name is the one its upstream project gives it, so browse the family's own site and write the name you find there:

| Family                 | Browse at                                                | Example class                                   |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `lucide`               | [lucide.dev/icons](https://lucide.dev/icons)             | `ic-lucide-circle-check`                        |
| `phosphor`, variants   | [phosphoricons.com](https://phosphoricons.com)           | `ic-phosphor-fill-check-circle`                 |
| `material-symbols-*`   | [fonts.google.com/icons](https://fonts.google.com/icons) | `ic-material-symbols-rounded-check_circle`      |
| `simple-icons` (brand) | [simpleicons.org](https://simpleicons.org)               | `ic-simple-icons-github`, `ic-simple-icons-npm` |
| `logos` (brand)        | [svgporn.com](https://svgporn.com)                       | `ic-logos-google`, `ic-logos-google-icon`       |

Material Symbols names keep Google's underscores: `check_circle`, not `check-circle`. A Simple Icons name is the icon's slug, with any `_` written as `-`. A `logos` name is the upstream file name, lowercased, with any `_` or `.` written as `-`: `socket.io` is `ic-logos-socket-io`. Some brands come as a full logo, often a wordmark, and as a symbol with `-icon` appended; some add `-dark` or `-alt` variants. A misspelled name is not an error: the class resolves to nothing, and the element renders as a solid square with the base rules loaded, or as nothing without them, so check the name against the family when an icon does not appear. Each family module also lists its names, as the keys of its `icons` object.

## Reserved names

`ic-xs` through `ic-xl` are the [size axis](#size), so `xs`, `sm`, `md`, `lg`, and `xl` cannot be family prefixes or icon names. Generation refuses a family that claims one. Stroke width is written on the icon class itself, so it claims no prefix.

## Markup

An icon is an element that carries an icon class. Use an `<i>`:

```html
<i class="ic-lucide-search" aria-hidden="true"></i>

<!-- stroke width, for stroke-based families only -->
<i class="ic-lucide-heart/1.5"></i>

<!-- a size from the axis -->
<i class="ic-lucide-search ic-lg"></i>
```

`<i>` is the recommended element and the only one [inline SVG mode](delivery/vite.md#inline-svg-mode) rewrites. In the CSS-based methods the class also works on any element you add `.ic` to, for a framework component that renders its own tag:

```html
<span class="ic ic-lucide-search" aria-hidden="true"></span>
```

There is no `::before`, `::after`, or form-control form: an icon next to a label is a real `<i>` inside the button or link, which composes with a layout gap and works in every delivery method. For an icon painted as a `background-image` — a custom control, an input affix — resolve the `url()` with [`getIconMaskUrl` or `getIconCssProps`](javascript-api.md) and place it yourself.

Size and color follow CSS custom properties:

```css
.toolbar {
  --ic-size: 1.25rem;
  --ic-color: var(--color-accent);
}
```

See [Size](#size) and [Color](#color).

## Color

An icon paints in the first of these that applies:

1. `--ic-color`, set on the icon itself or on any ancestor.
2. The icon's own artwork, for a full-color `logos` icon: `ic-logos-google-icon` keeps all four of Google's colors and its gradients.
3. The icon's own color. Only `simple-icons` icons have one: `ic-simple-icons-github` is GitHub's `#181717`, `ic-simple-icons-npm` is npm's `#cb3837`.
4. `currentColor`, the text color around it.

So every icon follows the text color by default, except brand icons, which arrive in their brand colors. A full-color logo under `--ic-color` becomes a one-color silhouette of its outline: detail drawn in a contrasting color inside the logo, such as the `31` on Google Calendar's page, fills in. Setting `--ic-color` changes that, at whatever scope you set it:

```css
/* every icon on the page, brand icons included, in the text color */
:root {
  --ic-color: currentColor;
}

/* every icon in the toolbar */
.toolbar {
  --ic-color: var(--color-accent);
}

/* brand icons only, back to monochrome */
[class*="ic-simple-icons-"],
[class*="ic-logos-"] {
  --ic-color: currentColor;
}
```

```html
<!-- one icon -->
<i class="ic-simple-icons-npm" style="--ic-color: white" aria-hidden="true"></i>
```

To keep brand colors inside a scope that sets `--ic-color`, reset it on them with `--ic-color: initial`, which lets the brand color through again.

Some brand colors are near-black — GitHub, X, and Vercel among them — and disappear on a dark background. Give those a light color in your dark theme:

```css
@media (prefers-color-scheme: dark) {
  .ic-simple-icons-github,
  .ic-simple-icons-x {
    --ic-color: white;
  }
}
```

With a custom class `prefix`, every property here is renamed to match: `--ux-color` under `prefix: "ux"`. `color` alone does not recolor a brand icon, because its own color comes before `currentColor`; set `--ic-color` instead. All of this works the same in every delivery method and in [inline SVG mode](delivery/vite.md#inline-svg-mode), where the brand colors are carried by the `<svg>` itself and need no stylesheet. One exception there: under a Content Security Policy that blocks `style` attributes, an inlined brand icon keeps its brand colors but `--ic-color` no longer reaches it.

## Accessibility

An icon element has no text content, so assistive technology announces nothing for it, or an unhelpful guess. Say which kind of icon it is:

```html
<!-- decorative, beside a visible label: hide it -->
<button><i class="ic-lucide-trash" aria-hidden="true"></i>Delete</button>

<!-- the only content of a control: label the control, hide the icon -->
<button aria-label="Delete"><i class="ic-lucide-trash" aria-hidden="true"></i></button>

<!-- meaningful on its own, outside a control: give it a role and a name -->
<i class="ic-lucide-triangle-alert" role="img" aria-label="Warning"></i>
```

In [inline SVG mode](delivery/vite.md#inline-svg-mode) the attributes you put on the `<i>` carry over to the `<svg>` that replaces it.

## Stroke width

Stroke width is a modifier on the icon class, and only families drawn with strokes answer to it. Of the bundled families, Lucide is the only one; the rest are drawn as filled paths and ignore it.

```html
<!-- a thinner stroke -->
<i class="ic-lucide-heart/1.5"></i>

<!-- a heavier stroke -->
<i class="ic-lucide-heart/3"></i>
```

The width is baked into the artwork the rule carries, so it cannot be a second class applied on top: `ic-heart` and `ic-heart/1.5` are two icons, not one icon and a switch. One class is one rule, so a project pays for the widths it wrote and no others.

That is also why the modifier needs a build step. It works under Vite, PostCSS, and Tailwind, all of which see your markup; the plugin-free family stylesheets render at the family's authored width, because nothing there can know which widths to prepare.

## Size

The default size is `1em`. Set `--ic-size` on the icon or any ancestor to change it, or add a class from the axis:

| Class   | `--ic-size` |
| ------- | ----------- |
| `ic-xs` | `0.75rem`   |
| `ic-sm` | `0.875rem`  |
| `ic-md` | `1rem`      |
| `ic-lg` | `1.25rem`   |
| `ic-xl` | `1.5rem`    |

```html
<i class="ic-lucide-search ic-lg"></i>
```

Each class does one thing — set `--ic-size` to a rem value — so it composes with a stroke modifier and needs no knowledge of the element it lands on. Unlike stroke width, a size is not baked into the artwork, so the axis is part of the base rules and works in every delivery method: the plugin-free family stylesheets, and [inline SVG mode](delivery/vite.md#inline-svg-mode), where the base rules size the rewritten `<svg>` as long as `@import "@codenhub/icons"` is present. The `.ic` form itself is CSS-based methods only, as above.

The five classes are always emitted, so `xs`, `sm`, `md`, `lg`, and `xl` are [reserved](#reserved-names): a family may not ship an icon or take a prefix by one of those names.
