---
title: Introduction
description: What @codenhub/styles is for, what it costs, and the order to read these docs in.
---

# @codenhub/styles

`@codenhub/styles` lets you build a consistent, themeable interface by writing class names on plain HTML. You import one stylesheet and get tokens, a reset, layout and type helpers, and classes for buttons, form fields, alerts, cards, tables, and tooltips. There is no JavaScript to load and no component library to wrap: a `<button class="btn primary">` is the whole integration.

These docs build one small screen from start to finish, an account settings page with a profile form, a plan summary, and a danger zone. Each page adds something to it, so by the end you have seen every part of the package working together instead of in isolation.

```html
<main class="section">
  <div class="section-content narrow stack">
    <h1 class="text-title">Account settings</h1>
    <form class="card stack">
      <h2 class="text-title-sm">Profile</h2>
      <div class="field">
        <label class="label" for="display-name">Display name</label>
        <input class="ipt" id="display-name" name="display-name" value="Ada Lovelace" />
      </div>
      <div class="cluster">
        <button class="btn primary" type="submit">Save changes</button>
        <button class="btn ghost" type="reset">Cancel</button>
      </div>
    </form>
  </div>
</main>
```

## Three choices per component

Every component answers three independent questions with classes, so a new look never needs a new component variant:

- **Intent: which color?** `.primary`, `.secondary`, `.success`, `.warning`, `.destructive`, or `.info`. Leave it off for neutral.
- **Presentation: how much of that color?** `.solid`, `.soft`, or `.ghost` sets the fill; `.edged` or `.edgeless` sets the border.
- **Aesthetic: what is it made of?** An optional class such as `.neobrutalism` or `.glass` changes corners, border width, shadows, and type for everything inside it.

`<button class="btn destructive ghost edged">Delete account</button>` is a red outlined button, and wrapping the page in `.pixel` turns it into a pixel-art one without touching the button. [Building a screen](./concepts.md) introduces each axis as the settings page needs it.

## Compiled CSS or Tailwind source

The package ships the same classes two ways:

- **Compiled CSS**, ready to use. Import it from any bundler, or link the file from a CDN. You do not need Tailwind.
- **Tailwind CSS v4 source**, under `@codenhub/styles/tw`. Use it when your project already runs Tailwind v4, so your build compiles the package with your own utilities and theme.

[Setup](./setup.md) helps you choose.

## What it does not do

- **No JavaScript.** There is no runtime, no framework bindings, and no generated code. Anything that needs a script, such as opening a dialog, toggling a theme, or dismissing a tooltip, is your code.
- **No semantics or behavior.** The classes paint elements; they do not add HTML semantics, ARIA, keyboard handling, focus management, validation, or announcements. [Accessibility](./accessibility.md) draws the exact line.
- **No theme switching.** Choosing light or dark is a class or attribute you set. The separate `@codenhub/theme` package can remember and apply the choice for you.
- **No fonts or icons.** No font file is downloaded. Aesthetics that want a special font fall back to a system font until you supply one. Icons, including loading spinners, come from your own icon set, such as `@codenhub/icons`.
- **No compatibility aliases.** A removed class or token is listed in the changelog, not kept under its old name.

## Trade-offs

Know these costs before you adopt it:

- **Class names are short and unprefixed.** `.primary`, `.success`, `.dark`, `.label`, `.field`, `.section`, `.stack`, `.flat`, and `.ghost` are global names. Another stylesheet on the same page that uses them collides with this one. The package sits in [cascade layers](./setup.md#cascade-layers), so your own unlayered CSS wins a collision, but a third-party library's rules for the same name still apply alongside the package's.
- **The complete stylesheets are large before compression.** At the time of writing, minified, the complete stylesheet is about 198 KB, `/native` about 295 KB, and `/components` about 159 KB. Served with gzip they are about 17 KB, 22 KB, and 13 KB. Focused files are much smaller: `/theme` is about 12 KB (3 KB with gzip) and one aesthetic is 4 to 14 KB (1 to 2 KB with gzip). Most of the size is composition that every component repeats, which is why compression removes so much of it. A compiled file ships every class, whether a page uses it or not. To ship only the classes your pages use, compile the package in your own build: through [Tailwind CSS v4](./integrating/tailwind.md) when the project runs it, or with the package's [`build` command](./integrating/without-a-bundler.md#build-only-the-classes-you-use) in any other project. A page with one button gets 26 to 28 KB minified that way, and about 6 KB with gzip. Otherwise import the narrowest entrypoint that covers a page; see [Setup → All entrypoints](./setup.md#all-entrypoints).
- **`--color-foreground` is a background, not a text color.** It is the tone one step off the page that a quiet card or panel sits on. The text color is `--color-text`.
- **Four hover colors are fixed values.** `--color-success-hover`, `--color-warning-hover`, `--color-destructive-hover`, and `--color-info-hover` are precomputed, because mixing them live crashed WebKit. If you override `--color-success` alone, its hover keeps the old hue, so replace the whole family; see [Theming → Color tokens](./usage/theming.md#color-tokens).
- **Modern browsers only.** Chrome 123, Safari 17.5, or Firefox 128 and newer. There is no fallback layer for older browsers.

## What counts as supported

A combination of classes is supported when these docs describe it and the public demo at [demo.codenhub.dev/styles](https://demo.codenhub.dev/styles/) shows it. The demo renders the package's test fixtures, including the full intent, presentation, and aesthetic matrices, against the built CSS. A combination that is neither documented nor shown may still produce CSS, but it is not maintained and can change in any release.

The demo is rebuilt from the main branch, not from each release. It can show work that has not been released yet, so when the demo and these docs disagree about a released version, the docs and the [changelog](./changelog/index.md) for that version win.

## Versioning

The package is below 1.0 and follows the [semantic versioning rule for 0.x releases](https://semver.org/#spec-item-4): the public surface can still change between minor versions.

- A minor release, such as 0.7.0 to 0.8.0, may break. It can rename or remove a class or token, or change a default. Every break is listed under **Changed** or **Removed** on that version's [changelog](./changelog/index.md) page, with what to use instead.
- A patch release, such as 0.7.0 to 0.7.1, never breaks.

npm's default range for a new dependency, `^0.7.0`, already accepts patches only, because below 1.0 a caret range does not cross into the next minor version. Read the changelog before raising it. When you link a file from a CDN, put the exact version in the URL; see [Without a bundler](./integrating/without-a-bundler.md).

Breaks are not softened with aliases because the model is still settling, and keeping each old name beside its replacement would grow the surface every release. A rename or removal usually costs one find-and-replace when you upgrade; a changed default may need your own CSS retuned.

## Reading path

Read these in order the first time. Each page adds to the settings screen and ends by pointing to the next one.

1. [Setup](./setup.md): install the package, choose compiled CSS or Tailwind source, and render the empty page shell.
2. [Integrating](./integrating/index.md): only if you use Next.js, Vue, Svelte, Astro, Tailwind v4, or no bundler at all. Each guide returns you to the main path.
3. [Building a screen](./concepts.md): lay out the page, set its type, and add a card and a Save button, learning intent, fill, and edge on the way.
4. [Usage](./usage/index.md): the rest of the screen, in order:
   - [Buttons](./usage/buttons.md): secondary and destructive actions, sizes, icon buttons, and disabled states.
   - [Forms](./usage/forms.md): labeled fields, hints, errors, icons, selects, checkboxes, radios, and switches.
   - [Feedback](./usage/feedback.md): a saving state, a success alert, a plan badge, a loading placeholder, and a usage bar.
   - [Tooltips](./usage/tooltips.md): field help that works with a mouse, a keyboard, and a screen reader.
   - [Theming](./usage/theming.md): light and dark mode, brand colors, and your own intents.
   - [Aesthetics](./usage/aesthetics.md): restyle the whole screen with one class.
   - [Solo classes](./usage/solo.md): paint an aesthetic onto a component this package does not style.
   - [Composing](./usage/composing.md), [Customizing](./usage/customizing.md), and [Content and layout](./usage/content-and-layout.md): lookup pages with every axis rule, token, default, and helper class.
   - [Presets](./usage/presets.md): set a look once, for a region, a theme, or your own component class, instead of repeating it on every element.
5. [Accessibility](./accessibility.md): what the CSS handles for you and what your application must still do.

The [changelog](./changelog/index.md) lists every release and what changed in it.
