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

`/tw` imports Tailwind itself, so it replaces your own `@import "tailwindcss"` rather than joining it: with both, Tailwind's Preflight is emitted twice. Every other `/tw/*` entrypoint expects your import to come first; see [Using a focused entrypoint](#using-a-focused-entrypoint).

Tailwind CSS v4 scans your project automatically — most projects need nothing beyond the import above. `@source` paths resolve relative to the CSS file that declares them, not your project root, so `./src` here means "the `src/` next to this stylesheet"; adjust it to match where your own global stylesheet actually lives. Add `@source` only for markup Tailwind's automatic scan won't reach on its own: a path excluded by default (`.gitignore`d, or inside `node_modules` — an external component library, for instance) or, in a monorepo, one outside this file's own directory tree. Point it at your app's markup, not at this package: the package's source names every class it defines, so scanning it emits all of them whether your pages use them or not.

## Add aesthetics

Add an aesthetic from the source entrypoint the same way as the compiled one, after the base import:

```css
@import "@codenhub/styles/tw";
@import "@codenhub/styles/tw/aesthetics";

@source "./src";
```

## Using a focused entrypoint

Import a focused `/tw/*` entrypoint instead of the combined one — such as `/tw/button` or `/tw/form` — when a build only needs one component family; see the full [entrypoint table](../setup.md#all-entrypoints) for what each one composes.

Unlike `/tw`, the focused entrypoints and `/tw/native` do not import Tailwind, so keep your own import first:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw/button";
```

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

- **Do not clear the whole namespace.** `--color-*: initial` also removes the package's semantic colors, and the build stops with an error such as `Cannot apply unknown utility class`.
- **Do not clear a ramp the theme reads.** Clearing `--color-emerald-*` builds without an error, but the success colors made from it are lost.

## Troubleshooting

**Classes resolve to no styling**

- **What happened:** components use documented classes like `.btn.primary`, but no styling appears even though `@import "@codenhub/styles/tw"` is in the stylesheet.
- **Why:** this is rarely `@source` itself — Tailwind already scans your project automatically. The more common cause is markup living somewhere that automatic scan excludes by default: a `.gitignore`d path, or a component pulled from `node_modules`. Tailwind may not see a class used only there and skips generating a rule for it.
- **Fix:** add an explicit `@source` pointing at that directory, resolved relative to this stylesheet — matching the [example above](#import-the-source-entrypoint).

**Duplicate token and reset rules**

- **What happened:** the built stylesheet is larger than expected, and browser devtools show the same custom properties or reset rules defined twice.
- **Why:** one of two things. Importing both a compiled entrypoint (`@codenhub/styles`) and a `/tw` entrypoint (`@codenhub/styles/tw`) in the same build compiles the same tokens and reset from two independent sources; Tailwind's build has no way to know they describe the same package. Or your stylesheet imports `tailwindcss` beside `/tw`, which already imports it, so Preflight is emitted twice.
- **Fix:** pick one path per project — `/tw` entrypoints for a project running Tailwind CSS v4, compiled entrypoints everywhere else — and drop your own `@import "tailwindcss"` when you import `/tw`.

**A class built at runtime has no styling**

- **What happened:** `<button class="btn primary">` is styled, but a button whose class comes from a variable, such as `"btn " + variant`, or from CMS content, is not.
- **Why:** Tailwind emits only the classes it finds written out in the files it scans. That holds for the package's component classes too: a `/tw` build emits `.alert` only if `alert` appears somewhere it scans, which keeps the stylesheet to what your pages use. The intent, presentation, elevation, corner, and size classes, such as `.primary`, `.soft`, and `.sm`, are utilities too, so the same holds for them. The aesthetic classes, such as `.glass`, are plain CSS and always emitted. A name assembled at runtime never appears whole in a file, so the scan misses it.
- **Fix:** write each complete class name somewhere Tailwind scans, for example in a lookup object (`{ save: "btn primary", remove: "btn destructive" }`), or list the names your code or content can produce in your stylesheet:

```css
@import "@codenhub/styles/tw";

@source inline("btn alert badge primary destructive soft");
```

Every `/tw` entrypoint requires Tailwind CSS 4.3.2 or newer, below 5 (`>=4.3.2 <5`).

## The `dark:` variant

The `/tw` entrypoints define their own `dark:` variant, so your utilities switch with the same light and dark selectors the package's tokens use. It has one known difference from the tokens when themes are nested; see [Theming → The dark: variant](../usage/theming.md#the-dark-variant).

## Next

Return to the main path: [Building a screen](../concepts.md) adds the first card and form to the settings page. Everything it shows works the same on `/tw`.
