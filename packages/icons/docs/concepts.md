---
title: Concepts
description: Families, name resolution, reserved names, stroke width, and the markup forms — the model every delivery method shares.
order: 1
---

# How the icon system fits together

Every delivery method reads the same classes and follows the same rules. This page teaches that shared model once — from family names and color inheritance down to stroke width, size, and motion — so you can switch between plain CSS, Tailwind, Vite, or PostCSS without relearning how icons behave.

## Families

An icon family is a namespace of icons with its own prefix, geometry, and license, such as `lucide` or `material-symbols-rounded-fill`. Families are plain data modules generated from their upstream projects, which keeps artwork decoupled from any rendering framework:

```ts
import lucide from "@codenhub/icons/data/lucide";
import phosphorFill from "@codenhub/icons/data/phosphor-fill";
```

Available families:

| Prefix                                                           | Icons     | Style                       | License    |
| ---------------------------------------------------------------- | --------- | --------------------------- | ---------- |
| `line-md`                                                        | 1222      | animated, stroke-based      | MIT        |
| `svg-spinners`                                                   | 46        | animated loading indicators | MIT        |
| `lucide`                                                         | 2171      | outlined, stroke-based      | ISC        |
| `phosphor`                                                       | 1512      | outlined                    | MIT        |
| `phosphor-thin`, `phosphor-light`, `phosphor-bold`               | 1512 each | outlined, other weights     | MIT        |
| `phosphor-fill`                                                  | 1512      | filled                      | MIT        |
| `phosphor-duotone`                                               | 1512      | duotone                     | MIT        |
| `material-symbols-outlined`, `-rounded`, `-sharp`                | 3932 each | outlined                    | Apache-2.0 |
| `material-symbols-outlined-fill`, `-rounded-fill`, `-sharp-fill` | 3932 each | filled                      | Apache-2.0 |
| `simple-icons` (brand)                                           | 3254      | filled logos, brand-colored | CC0-1.0    |
| `logos` (brand)                                                  | 2016      | full-color logos            | CC0-1.0    |

Variants such as filled or duotone live in separate families rather than acting as toggles on one family. A class name stays a prefix and an icon name, with no extra variant syntax to guess.

`simple-icons` and `logos` are brand families, and they split the job: `simple-icons` draws each logo in one brand color, as in `ic-simple-icons-github` and `ic-simple-icons-npm`, while `logos` draws them in full color, as in `ic-logos-google-icon` and `ic-logos-slack-icon`, for brands that one color cannot show, such as Google's four-color G. Most brands appear in only one of the two, so they complement rather than duplicate each other.

Full-color logos naturally weigh more than single-color icons. With the build plugins, a project pays only for the logos it actually uses: about 2 KB of CSS for a typical logo, and under 8 KB for 95% of them. A handful of traced, highly detailed logos sit at the heavy end of the scale, from about 60 KB to 150 KB each: `lerna` (149 KB), `effector` (120 KB), `composer` (88 KB), `hugo` (85 KB), `tastejs` (69 KB), `matplotlib` (66 KB), `matplotlib-icon` (65 KB), and `chalk` (60 KB). Gzip or Brotli shrinks those figures several times over on the wire, and when weight still matters, prefer a lighter `-icon` variant or the brand's `simple-icons` entry if one exists. Brand families are opt-in everywhere — `@codenhub/icons/tw` never resolves them, and a declared `@plugin` resolves them only when its `families` option names them — and their marks remain trademarks of their owners. See [Licensing](licensing.md#brand-families).

### Animated families

`line-md` provides 1,222 animated icons from Line MD 3.0.5 by Vjacheslav Trushkin, and `svg-spinners` provides 46 loading indicators by Utkarsh Verma, generated from the upstream SMIL artwork at commit `abfa05c49acf005b8b1e0ef8eb25a67a7057eb20`. Both are MIT-licensed core families, available through `@import "@codenhub/icons/tw"` by default, through the `@codenhub/icons/line-md` and `@codenhub/icons/svg-spinners` family stylesheets, or as `@codenhub/icons/data/line-md` and `@codenhub/icons/data/svg-spinners` for a configured plugin or registry.

```html
<i class="ic-line-md-heart/1.5" aria-hidden="true"></i>
<i class="ic-line-md-loading-loop" aria-hidden="true"></i>
<i class="ic-svg-spinners-90-ring" aria-hidden="true"></i>
```

The animations live inside the SVG artwork and run via SMIL. Line MD's `-loop` icons animate continuously, and its other icons draw in once. Without a [motion trigger](#motion), an icon plays the first time the page displays it. Chrome is verified; Firefox and Safari are untested, so do not infer animated-mask support from static-mask support.

Add `ic-on-hover` to show the static artwork at rest and play the animation while the trigger is hovered or focused, as described in [Motion](#motion):

```html
<button>
  <i class="ic-line-md-loading-loop ic-on-hover" aria-hidden="true"></i>
  Refresh
</button>
```

Looping icons play on every hover with CSS alone. A one-shot icon such as `ic-line-md-heart` plays on the first hover only with CSS alone, because browsers do not restart an animated image they have already painted once. To replay a one-shot icon on every hover, call [`bindIconPlayback`](javascript-api.md#playing-icons-from-code) from `@codenhub/icons/play` once. Icons that have no static artwork keep their usual mask at rest.

CSS mode and inline SVG mode handle reduced motion and hover rest differently:

- **CSS-mask mode** (full family stylesheets, Tailwind, Vite CSS mode, and PostCSS, including stroke modifiers such as `/1.5`): under `prefers-reduced-motion: reduce`, Line MD masks always paint the upstream static artwork, even during hover. Each icon carries its optional static artwork in `--ic-static-mask`, and the base rules pick it for reduced motion and hover rest. SVG Spinners have no static fallback, so provide an accessible loading label independently of their motion.
- **Inline SVG mode** (Vite's `mode: "svg"`, virtual modules, and `renderSvg`): keeps the animated `body`. Because CSS cannot stop a SMIL timeline, `ic-on-hover` cannot hold inline SVG artwork at rest, and those paths do not swap artwork for reduced motion. `playIcon` restarts an inline SVG, but skips the restart under reduced motion; it does not stop an already-running timeline. Choose CSS mode for the automatic swap, or read the resolved icon's `staticBody` before calling `renderSvg` when you need static inline artwork; `staticBody` shares the animated body's viewBox. `getIconMaskUrl` returns the animated artwork, while `getIconCssProps` also includes the static-mask property when available.

## Names

An icon is identified by `prefix:name`. Because CSS class names cannot contain colons, a class replaces the colon with a dash:

```html
<!-- lucide:heart -->
<i class="ic-lucide-heart"></i>

<!-- material-symbols-rounded:home -->
<i class="ic-material-symbols-rounded-home"></i>
```

When two loaded family prefixes share a start, the longest matching prefix wins, so `material-symbols-outlined` beats `material` when both are loaded.

An unqualified name such as `ic-heart` resolves against a configured default family, and against nothing at all when no default is set. The package picks no default family of its own and ships no semantic alias map, because nobody agrees on whether `close` should be `x` or `times`. So `ic-close` means whatever your chosen family calls `close`, and renders no icon if that family uses another name. Lucide calls that icon `x`, so under Lucide you write `ic-x`. In plain CSS, where multiple family stylesheets can be imported in sequence, a family stylesheet claims only the bare names it actually defines, so an earlier-imported family still answers for bare names the later family lacks.

Where the default family comes from depends on the delivery method:

| Method        | Default family                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite, PostCSS | The `defaultPrefix` option.                                                                                                                   |
| Tailwind      | The `default:` plugin option.                                                                                                                 |
| Plain CSS     | The last core family stylesheet imported. A brand family stylesheet claims no bare names, so importing one last leaves the default as it was. |

```ts
import { IconRegistry } from "@codenhub/icons";
import lucide from "@codenhub/icons/data/lucide";

const registry = new IconRegistry({ defaultPrefix: "lucide" });
registry.registerFamily(lucide);

registry.resolve("heart"); // lucide:heart
registry.resolve("close"); // undefined -- lucide calls it "x"
```

### Finding an icon's name

Icon names are always the upstream project's own, so browse the family's site and use the exact name shown there:

| Family                 | Browse at                                                                        | Example class                                   |
| ---------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `line-md`              | [github.com/cyberalien/line-md](https://github.com/cyberalien/line-md)           | `ic-line-md-heart`, `ic-line-md-loading-loop`   |
| `svg-spinners`         | [github.com/n3r4zzurr0/svg-spinners](https://github.com/n3r4zzurr0/svg-spinners) | `ic-svg-spinners-90-ring`                       |
| `lucide`               | [lucide.dev/icons](https://lucide.dev/icons)                                     | `ic-lucide-circle-check`                        |
| `phosphor`, variants   | [phosphoricons.com](https://phosphoricons.com)                                   | `ic-phosphor-fill-check-circle`                 |
| `material-symbols-*`   | [fonts.google.com/icons](https://fonts.google.com/icons)                         | `ic-material-symbols-rounded-check_circle`      |
| `simple-icons` (brand) | [simpleicons.org](https://simpleicons.org)                                       | `ic-simple-icons-github`, `ic-simple-icons-npm` |
| `logos` (brand)        | [svgporn.com](https://svgporn.com)                                               | `ic-logos-google`, `ic-logos-google-icon`       |

Upstream naming quirks are kept as-is rather than normalized away:

- **Material Symbols** keeps Google's underscores: `check_circle`, not `check-circle`.
- **Simple Icons** uses the icon's slug, with any `_` written as `-`.
- **`logos`** uses the upstream file name, lowercased, with any `_` or `.` written as `-`: `socket.io` becomes `ic-logos-socket-io`. Some brands include both a full wordmark logo and a symbol with `-icon` appended, and some add `-dark` or `-alt` variants.

A misspelled name does not throw an error: the class resolves to nothing, so the element renders as a solid square when the base rules are loaded, or as nothing at all when they are missing. Check the name against the family when an icon disappears — or read the keys of the family module's `icons` object directly.

## Reserved names

Because utility classes live in the same `ic-*` namespace as icon classes, a few names are off-limits so your icons never collide with helpers:

- **`xs`, `sm`, `md`, `lg`, and `xl`** belong to the [size axis](#size) (`ic-xs` through `ic-xl`). No family may use one as a prefix or ship an icon by that name; generation refuses a family that tries.
- **`anim`, `on-hover`, and `trigger`** belong to the [motion utilities](#motion). A family cannot use `anim` as a prefix or ship an icon named `anim` or starting with `anim-`. The exact icon names `on-hover` and `trigger` are reserved the same way, while names that merely start with them — along with `animation` — stay available.
- **Stroke width** lives after a `/` on the icon class itself, so it claims no prefix at all.

## Markup

An icon is an HTML element carrying an icon class. Write an `<i>` — short, semantic-neutral, and the only element [inline SVG mode](delivery/vite.md#inline-svg-mode) rewrites:

```html
<i class="ic-lucide-search" aria-hidden="true"></i>

<!-- stroke width, for stroke-based families only -->
<i class="ic-lucide-heart/1.5"></i>

<!-- a size from the axis -->
<i class="ic-lucide-search ic-lg"></i>
```

In the CSS-based methods, the same class also works on any element if you add `.ic`, which helps when a framework component insists on rendering its own tag:

```html
<span class="ic ic-lucide-search" aria-hidden="true"></span>
```

There is no `::before`, `::after`, or form-control form. An icon next to a label is a real `<i>` inside the button or link, so it lines up with flex or grid gaps and behaves the same across every delivery method. When you truly need a `background-image` icon — such as a custom control or an input affix — resolve its `url()` with [`getIconMaskUrl` or `getIconCssProps`](javascript-api.md) and place it yourself.

Size and color follow CSS custom properties set on the icon or any ancestor:

```css
.toolbar {
  --ic-size: 1.25rem;
  --ic-color: var(--color-accent);
}
```

See [Size](#size) and [Color](#color).

## Color

An icon paints in the first source that applies, in this order:

1. `--ic-color`, set on the icon itself or inherited from any ancestor.
2. The icon's own artwork, for a full-color `logos` icon: `ic-logos-google-icon` keeps all four of Google's colors and its gradients.
3. The icon's own color, for `simple-icons`: `ic-simple-icons-github` uses GitHub's `#181717`, and `ic-simple-icons-npm` uses npm's `#cb3837`.
4. `currentColor`, matching the surrounding text color.

In short, core icons follow your text color automatically, while brand icons show up in their own brand colors until you tell them otherwise. Setting `--ic-color` overrides brand colors at whatever scope you set it; note that on a full-color logo, `--ic-color` turns the icon into a monochrome silhouette of its outline, so contrasting details inside the mark — such as the `31` on Google Calendar's icon — fill in solid:

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

To restore brand colors inside a subtree that sets `--ic-color`, reset the property on those icons with `--ic-color: initial`.

Some brand colors are near-black — GitHub, X, and Vercel among them — and vanish quietly on a dark background. Override those in your dark theme:

```css
@media (prefers-color-scheme: dark) {
  .ic-simple-icons-github,
  .ic-simple-icons-x {
    --ic-color: white;
  }
}
```

With a custom class `prefix`, every custom property name matches: `--ux-color` under `prefix: "ux"`. Plain CSS `color` alone does not recolor a brand icon, because its own brand color sits ahead of `currentColor`; set `--ic-color` instead. All of this works the same across every CSS delivery method and in [inline SVG mode](delivery/vite.md#inline-svg-mode), where the brand colors travel inside the `<svg>` itself. One exception applies there: under a Content Security Policy that blocks `style` attributes, an inlined brand icon keeps its brand colors, but `--ic-color` can no longer override them.

## Accessibility

An icon element has no text content, so assistive technology announces nothing for it, or an unhelpful guess. Mark each icon according to its role:

```html
<!-- decorative, beside a visible label: hide it -->
<button><i class="ic-lucide-trash" aria-hidden="true"></i>Delete</button>

<!-- the only content of a control: label the control, hide the icon -->
<button aria-label="Delete"><i class="ic-lucide-trash" aria-hidden="true"></i></button>

<!-- meaningful on its own, outside a control: give it a role and a name -->
<i class="ic-lucide-triangle-alert" role="img" aria-label="Warning"></i>
```

In [inline SVG mode](delivery/vite.md#inline-svg-mode), attributes you place on the `<i>` carry over to the `<svg>` that replaces it.

## Stroke width

Stroke width is a modifier written right onto the icon class, and only families drawn with strokes answer to it. Of the bundled families, Lucide and Line MD support it; the other families ignore it:

```html
<!-- a thinner stroke -->
<i class="ic-lucide-heart/1.5"></i>

<!-- a heavier stroke -->
<i class="ic-lucide-heart/3"></i>
```

The width is baked directly into the SVG artwork the rule carries, so it cannot be applied as a separate class on top. `ic-heart` and `ic-heart/1.5` are two distinct icons as far as CSS is concerned, not one icon with a toggle. Because one class produces one rule, your stylesheet only pays for the stroke widths you actually wrote.

That is also why the modifier requires a build step: Vite, PostCSS, and Tailwind all scan your markup and generate the requested widths on demand, whereas the plugin-free family stylesheets render every icon at its authored width.

## Size

The default icon size is `1em`, matching the font size around it. Set `--ic-size` on the icon or any ancestor to resize it, or add a class from the size axis:

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

Each size class does one thing — set `--ic-size` to a rem value — so it composes cleanly with stroke modifiers and works regardless of which element it lands on. Unlike stroke width, size is not baked into the artwork, so the axis ships with the base rules and works in every delivery method, including [inline SVG mode](delivery/vite.md#inline-svg-mode) as long as `@import "@codenhub/icons"` is present. Using `.ic` on a non-`<i>` element remains CSS-based methods only, as noted in [Markup](#markup).

Because these five classes are always emitted, `xs`, `sm`, `md`, `lg`, and `xl` are [reserved](#reserved-names): no family can ship an icon or take a prefix by those names.

## Motion

Icons move in two ways: motion classes animate the entire glyph for any icon in any family, while [animated families](#animated-families) animate their own artwork with no motion class needed. Three controls govern both:

| Question      | Control                                                                           | Default                                    |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| What moves    | an `ic-anim-*` class, or an animated family's icon                                | nothing                                    |
| When it plays | always, `ic-on-hover`, or [`playIcon`](javascript-api.md#playing-icons-from-code) | always                                     |
| How often     | `--ic-anim-iterations`                                                            | forever; once per hover with `ic-on-hover` |

Five whole-glyph motion classes ship with the base styles:

| Class            | Motion                                         | Default duration |
| ---------------- | ---------------------------------------------- | ---------------- |
| `ic-anim-spin`   | A full turn at a constant speed                | `1s`             |
| `ic-anim-pulse`  | Opacity fades between 1 and 0.55               | `2s`             |
| `ic-anim-beat`   | Two small heartbeats, up to 1.1 times its size | `1s`             |
| `ic-anim-bounce` | A vertical bounce, 15% of the icon's height    | `1s`             |
| `ic-anim-wiggle` | Rotation back and forth by 6 degrees           | `1s`             |

`ic-anim-spin` uses linear timing; the other four ease in and out. Set `--ic-anim-duration` on the icon or an ancestor to change the cycle length. Use at most one motion class per element: it replaces the element's CSS `animation`, and the transform-based motions also replace its `transform` while running.

**Always.** With no trigger class, the motion runs for as long as the class is on the element. Toggle `ic-anim-spin` on a reload icon while a request is in flight and drop it when the request finishes:

```html
<i class="ic-lucide-loader-circle ic-anim-spin" aria-hidden="true"></i>
```

**On hover.** `ic-on-hover` plays the motion while its trigger is hovered or has `:focus-visible`, and rests otherwise. The trigger can be the icon itself, its parent element, or any ancestor carrying `ic-trigger` — handy for cards or buttons where the icon sits inside a wrapper. Each hover restarts from the beginning and plays once by default:

```html
<button>
  <i class="ic-lucide-refresh-cw ic-anim-spin ic-on-hover" aria-hidden="true"></i>
  Reload
</button>

<a class="card ic-trigger" href="/inbox">
  <span class="card-icon"><i class="ic-lucide-bell ic-anim-wiggle ic-on-hover" aria-hidden="true"></i></span>
  Notifications
</a>
```

**How often.** `--ic-anim-iterations` sets the repeat count: any number, or `infinite`. Set `--ic-anim-iterations: infinite` when an icon should keep moving for the whole hover, such as a fan. Because it inherits, one rule on a toolbar sets the count for every icon inside it. Animated artwork follows its own authored timeline and ignores `--ic-anim-iterations`: Line MD `-loop` icons repeat, and the rest play once.

**From code.** For feedback tied to an event — a copy icon flashing on success, or a like icon popping on click — call `playIcon(element)` from the opt-in [`@codenhub/icons/play`](javascript-api.md#playing-icons-from-code) entry point. It restarts glyph motion and animated artwork alike.

The base import, `@import "@codenhub/icons"`, includes the keyframes and motion classes, so they work with plain CSS family stylesheets, Vite, PostCSS, and inline SVG mode. Tailwind also registers them as utilities, keeping variants such as `group-hover:ic-anim-spin` available. With a custom class `prefix`, every class, custom property, and keyframe name shifts together: `ux-anim-spin`, `ux-on-hover`, `ux-trigger`, `--ux-anim-duration`, and `--ux-anim-iterations` under `prefix: "ux"`.

When the user's device requests reduced motion, motion classes stop, Line MD shows its static artwork even while hovered, and `playIcon` does nothing. SVG Spinners keep moving, because they have no static artwork. Keep loading or status information available in text; movement should never be the only way to understand a state.

Motion classes move the whole icon element. In CSS-mask mode, the artwork is an image, so CSS cannot reach inside it to target or animate individual paths. `ic-on-hover` relies on complex `:not()` selectors and `:focus-visible`, which work together in Chrome 88+, Firefox 85+, and Safari 15.4+. Motion was verified in Chrome; Firefox and Safari are untested.

## Next

Read [Delivery methods](delivery/index.md) to pick how icon classes become CSS in your build — plain CSS, Tailwind CSS v4, Vite, or PostCSS.
