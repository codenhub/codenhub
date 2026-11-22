---
title: Tailwind CSS v4
description: Using the /tw source entrypoints in a Tailwind CSS v4 project.
order: 1
---

# Tailwind CSS v4

A project that already runs Tailwind CSS v4 can compile this package's source instead of loading its compiled output. Your app's utilities and the package's classes then come out of one build, share one theme, and use one `dark:` variant. This page covers the import, aesthetics, the focused entrypoints, building your own components with `@apply`, dropping Tailwind's palette, and the build problems you are likely to meet.

## Why source instead of compiled

`/tw` entrypoints publish copied, uncompiled source from the package's `tw/` folder; your own Tailwind build compiles it alongside your app, so its `@theme`, `@utility`, and `@apply` directives resolve together with yours. The compiled entrypoints (`@codenhub/styles`) still work in a Tailwind project, but then two separate CSS pipelines run side by side instead of one — use `/tw` unless a specific reason rules it out.

## Import the source entrypoint

```css
@import "@codenhub/styles/tw";

@source "./src";
```

`/tw` imports Tailwind itself, so it replaces your own `@import "tailwindcss"` rather than joining it. With both, the build still emits Preflight and Tailwind's theme once, and repeats only a small `::placeholder` block, but your import adds nothing `/tw` does not bring. Every other `/*/tw` entrypoint expects your import to come first; see [Using a focused entrypoint](#using-a-focused-entrypoint).

Tailwind CSS v4 scans your project automatically — most projects need nothing beyond the import above. `@source` paths resolve relative to the CSS file that declares them, not your project root, so `./src` here means "the `src/` next to this stylesheet"; adjust it to match where your own global stylesheet actually lives. Add `@source` only for markup Tailwind's automatic scan won't reach on its own: a path excluded by default (`.gitignore`d, or inside `node_modules` — an external component library, for instance) or, in a monorepo, one outside this file's own directory tree. Point it at your app's markup, not at this package: the package's source names every class it defines, so scanning it emits all of them whether your pages use them or not.

## Add aesthetics

Add an aesthetic from the source entrypoint the same way as the compiled one, after the base import:

```css
@import "@codenhub/styles/tw";
@import "@codenhub/styles/aesthetics/tw";

@source "./src";
```

## Using a focused entrypoint

Import a focused `/*/tw` entrypoint instead of the combined one — such as `/button/tw` or `/form/tw` — when a build only needs one component family; see the full [entrypoint table](../setup.md#all-entrypoints) for what each one composes.

Unlike `/tw`, the focused entrypoints and `/native/tw` do not import Tailwind, so keep your own import first:

```css
@import "tailwindcss";
@import "@codenhub/styles/button/tw";
```

A focused entrypoint is for one family. Each one brings the theme and the shared rules its classes are built on, so two of them bring those twice, and Tailwind keeps both copies. With Tailwind 4.3.2, `/button/tw`, `/form/tw`, `/surface/tw`, and `/feedback/tw` together compiled a small page to 85,192 bytes minified, where `/components/tw`, which holds all four and the tooltips too, compiled it to 82,915. For two families or more, import `/components/tw`, or `/tw`.

## Build your own components with `@apply`

On `/tw`, every component, helper, and axis class is a Tailwind utility. That includes the intents (`neutral`, `primary`, `secondary`, `success`, `warning`, `destructive`, `info`), the presentation (`solid`, `soft`, `ghost`, `edged`, `edgeless`), the elevation (`flat`, `raised`, `floating`), the corner patterns (`cut-diagonal`, `cut-diagonal-reverse`), and the sizes (`sm`, `lg`). So one class of yours can carry a whole recipe:

```css
@import "@codenhub/styles/tw";

@utility btn-save {
  @apply btn primary soft sm;
}

@utility btn-danger {
  @apply btn destructive md:lg dark:solid;
}
```

```html
<button class="btn-save" type="submit">Save</button>
```

- **An applied component behaves like the class.** `btn-save` hovers, presses, takes focus, and follows an aesthetic the way `class="btn primary soft sm"` does.
- **Variants work.** `hover:primary`, `md:lg`, and `dark:solid` apply an axis class under that condition, in your markup or inside `@apply`.
- **Write your class as `@utility`.** It then stays in the `utilities` layer, so your other utilities on the same element still beat it. A plain `.btn-save { @apply … }` rule works too, but it is unlayered, so what it applies beats every utility on the element; [Customizing → Composition helpers](../usage/customizing.md#composition-helpers) has the details.
- **Modifiers apply too.** A component's modifiers, such as `.tight` on `.stack`, `.icon` on `.btn`, or `.interactive` on `.card`, are utilities as well, so `@apply stack tight`, `@apply btn icon pill`, and `md:tight` work. The disabled state is the exception: it stays an attribute or the `.disabled` class in markup.
- **Your utility beats a component's inner defaults.** `p-0 text-center` on a `.data-table` cell, `text-sm` on a `.label`, and `px-8` on a `.btn.sm` all apply.

[Presets](../usage/presets.md) compares this with the other ways to set a look once.

## Drop Tailwind's palette

`/tw` builds on Tailwind's default theme, so Tailwind's palette utilities, such as `bg-red-500`, stay available. If your design uses only the package's tokens, clear the hues you do not use:

```css
@import "@codenhub/styles/tw";

@theme {
  --color-red-*: initial;
  --color-orange-*: initial;
  --color-yellow-*: initial;
  --color-lime-*: initial;
  --color-green-*: initial;
  --color-teal-*: initial;
  --color-cyan-*: initial;
  --color-sky-*: initial;
  --color-blue-*: initial;
  --color-violet-*: initial;
  --color-purple-*: initial;
  --color-fuchsia-*: initial;
  --color-pink-*: initial;
  --color-slate-*: initial;
  --color-gray-*: initial;
  --color-zinc-*: initial;
  --color-stone-*: initial;
  --color-black: initial;
}
```

The package's own colors do not change, and you can still add colors of your own in the same block.

The block leaves out `neutral`, `emerald`, `amber`, `rose`, `indigo`, and `white` on purpose: the theme builds its colors from them.

- **Do not clear the whole namespace.** `--color-*: initial` also removes the package's semantic colors, such as `--color-primary`, because they are theme variables too. The build still succeeds, with no warning, and every component that reads them draws with no color.
- **Do not clear a ramp the theme reads.** Clearing `--color-emerald-*` builds without an error, but the success colors made from it are lost.
- **Do not clear the type, font, or spacing namespaces.** The components apply Tailwind's `text-*` and `font-*` utilities and its `--spacing()` function, so `--text-*: initial`, `--font-*: initial`, `--spacing: initial`, or `--*: initial` removes the values they read. The build still succeeds, with no warning: the components keep their references to `--text-sm`, `--font-default`, or `--spacing`, which now name nothing, so their text takes the inherited size and font and their padding and gaps collapse to zero. Override single values instead, such as `--text-sm`. Clearing `--radius-*` is safe: the components' corners come from the package's own `--radius-control`, `--radius-small`, and `--radius-surface`.

## Troubleshooting

**Classes resolve to no styling**

- **What happened:** components use documented classes like `.btn.primary`, but no styling appears even though `@import "@codenhub/styles/tw"` is in the stylesheet.
- **Why:** this is rarely `@source` itself — Tailwind already scans your project automatically. The more common cause is markup living somewhere that automatic scan excludes by default: a `.gitignore`d path, or a component pulled from `node_modules`. Tailwind may not see a class used only there and skips generating a rule for it.
- **Fix:** add an explicit `@source` pointing at that directory, resolved relative to this stylesheet — matching the [example above](#import-the-source-entrypoint).

**Duplicate token and reset rules**

- **What happened:** the built stylesheet is larger than expected, and browser devtools show the same custom properties or reset rules defined twice.
- **Why:** importing both a compiled entrypoint (`@codenhub/styles`) and a `/tw` entrypoint (`@codenhub/styles/tw`) in the same build compiles the same tokens and reset from two independent sources; Tailwind's build has no way to know they describe the same package.
- **Fix:** pick one path per project — `/tw` entrypoints for a project running Tailwind CSS v4, compiled entrypoints everywhere else.

**A variant after `before:` or `placeholder:` ignores the app's setting**

- **What happened:** `before:motion-reduce:hidden` or `placeholder:dark:text-white` does not follow `data-motion` or `data-theme` on `<html>`, or never applies, while `motion-reduce:hidden` on the element itself works.
- **Why:** the package's variant comes after a pseudo-element variant, and Tailwind then writes its condition where browsers reject it.
- **Fix:** write the package's variant first: `motion-reduce:before:hidden`, `dark:placeholder:text-white`. [Contrast and motion variants](#contrast-and-motion-variants) has the details.

**A token override stops at a shadow root**

- **What happened:** `--color-primary` set on `:root` in your stylesheet colors the page's buttons, but a button inside a shadow root that loads the same stylesheet keeps the package's color.
- **Why:** Tailwind writes the theme on `:root, :host`, so the shadow root's copy of the stylesheet declares every token again on its host, and the page's value is not inherited past it. The compiled entrypoints declare the tokens on `:root` alone, so there the page's value crosses.
- **Fix:** set the override in `@theme`, such as `@theme { --color-primary: oklch(49% 0.24 293); }`, which Tailwind writes on `:root, :host` too, or write your own rule on `:root, :host`.

**A class built at runtime has no styling**

- **What happened:** `<button class="btn primary">` is styled, but a button whose class comes from a variable, such as `"btn " + variant`, or from CMS content, is not.
- **Why:** Tailwind emits only the classes it finds written out in the files it scans. That holds for the package's component classes too: a `/tw` build emits `.alert` only if `alert` appears somewhere it scans, which keeps the stylesheet to what your pages use. The intent, presentation, elevation, corner, and size classes, such as `.primary`, `.soft`, and `.sm`, are utilities too, so the same holds for them. The aesthetic classes, such as `.glass`, are plain CSS and always emitted. A name assembled at runtime never appears whole in a file, so the scan misses it.
- **Fix:** write each complete class name somewhere Tailwind scans, for example in a lookup object (`{ save: "btn primary", remove: "btn destructive" }`), or list the names your code or content can produce in your stylesheet:

```css
@import "@codenhub/styles/tw";

@source inline("btn alert badge primary destructive soft");
```

Every `/tw` entrypoint requires Tailwind CSS 4.3.2 or newer, below 5 (`>=4.3.2 <5`), the range CI compiles it with. The package does not declare Tailwind as a peer dependency, so your package manager does not check the version for you; `npm ls tailwindcss` shows yours. An optional peer would have checked it, but npm then refused to install the package in any project on an older Tailwind, even one that only links the compiled CSS.

## The `dark:` variant

The `/tw` entrypoints define their own `dark:` variant, so your utilities switch with the same light and dark selectors the package's tokens use. It has one known difference from the tokens when themes are nested; see [Theming → The dark: variant](../usage/theming.md#the-dark-variant).

## Contrast and motion variants

The `/tw` entrypoints also replace Tailwind's `contrast-more:`, `contrast-less:`, `motion-safe:`, and `motion-reduce:`, so your utilities follow the app settings the package's components follow: `data-contrast` and `data-motion` on `<html>` decide when they are set, and the system's setting decides when they are not, as [Accessibility → App settings](../accessibility.md#app-settings) describes.

| Variant          | Applies                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `contrast-more:` | Under `data-contrast="more"`, or under `prefers-contrast: more` unless `data-contrast="standard"` is set.             |
| `contrast-less:` | Under `prefers-contrast: less`, unless `data-contrast` is `more` or `standard`.                                       |
| `motion-safe:`   | Under `data-motion="full"`, or with no reduced-motion preference unless `data-motion` is `reduce` or `none`.          |
| `motion-reduce:` | Under `data-motion` `reduce` or `none`, or under `prefers-reduced-motion: reduce` unless `data-motion="full"` is set. |

`data-motion="none"` counts as reduced motion, so `motion-reduce:` applies under it. As with the package's own rules, the attributes are read only on `<html>` and not from inside a shadow root.

Tailwind cannot negate a variant that is both a selector and a media query, so under a `/tw` entrypoint `not-motion-safe:`, `not-motion-reduce:`, `not-contrast-more:`, and `not-dark:` compile to nothing, and Tailwind says nothing about it. Write the opposite variant instead: `motion-reduce:` for `not-motion-safe:`, and `motion-safe:` for `not-motion-reduce:`, which are exact opposites. For the others, give the utility unprefixed and undo it under the positive variant: `border-4 contrast-more:border-2` in place of `not-contrast-more:border-4`, and `bg-white dark:bg-black` in place of `not-dark:bg-white`. `not-contrast-less:` compiles as usual.

Write these variants, `dark:` included, before a pseudo-element variant such as `before:`, `after:`, `placeholder:`, or `file:`: `motion-reduce:before:hidden` and `dark:placeholder:text-white`, not `before:motion-reduce:hidden` or `placeholder:dark:text-white`. Tailwind places a selector variant that follows a pseudo-element variant after the pseudo-element, where browsers reject it, and says nothing. The utility then ignores `data-theme`, `data-contrast`, and `data-motion`, and, depending on the browser and the pseudo-element, follows the system setting or never applies. Tailwind's own selector variants, such as `rtl:` and `aria-checked:`, need the same order.

## Next

Return to the main path: [Building a screen](../concepts.md) adds the first card and form to the settings page. Everything it shows works the same on `/tw`.
