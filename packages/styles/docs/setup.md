---
title: Setup
description: Install the package, choose compiled CSS or Tailwind source, and render the settings page shell.
order: 1
---

# Setup

This page gets the stylesheet into your project and puts the empty shell of the settings screen on the page. It takes one install, one import, and one choice: compiled CSS or Tailwind source. The rest of the page is reference you can come back to: every entrypoint, the classless option, the cascade layers, and what goes wrong when an import is missing.

## Install

```sh
pnpm add @codenhub/styles
```

`npm install @codenhub/styles` and `yarn add @codenhub/styles` work the same way.

## Import the stylesheet

Import the complete compiled stylesheet once, in the CSS file your app already loads globally:

```css
@import "@codenhub/styles";
```

Then write the shell of the settings screen. It is a page section with a centered, narrow column:

```html
<main class="section">
  <div class="section-content narrow stack">
    <h1 class="text-title">Account settings</h1>
    <p>Manage your profile, plan, and security.</p>
  </div>
</main>
```

If the heading renders in a bold, tight title face with the paragraph spaced below it, and the column sits in the middle of a wide window, the stylesheet is working. If it looks like unstyled browser defaults, see [When nothing is styled](#when-nothing-is-styled).

The complete stylesheet includes the reset, the tokens, the layout and type helpers, and every component class. It applies global rules to your page: the reset, the root theme, and focus rings. It does not include the aesthetics or the classless element mappings; both are separate imports, described below.

## Choose your route

Pick one:

- **Compiled CSS** (`@codenhub/styles`, shown above). Use it unless you have a reason not to. Any bundler that resolves CSS imports from packages works, such as Vite, webpack, or the Tailwind CLI. It ships every class, whether your pages use it or not.
- **Tailwind CSS v4 source** (`@codenhub/styles/tw`). Use it when your project already runs Tailwind v4. Your build compiles the package with your own utilities, so you get one stylesheet and Tailwind's `dark:` variant matches the package's theme. It needs Tailwind 4.3.2 or newer, below 5.
- **No bundler.** Link the compiled file from `node_modules` or a CDN with a `<link>` tag; see [Without a bundler](./integrating/without-a-bundler.md).

To ship only the classes your pages use in a project that does not run Tailwind, with a bundler or without one, the package's `chs build` command reads your files and writes a stylesheet with only those classes, which you import or link in place of the compiled one; see [Build only the classes you use](./integrating/without-a-bundler.md#build-only-the-classes-you-use).

Your framework may need its own wiring, such as where the global stylesheet goes in Next.js or Astro. Each of these guides covers one setup and then sends you back here:

- [Tailwind CSS v4](./integrating/tailwind.md)
- [Next.js](./integrating/nextjs.md)
- [Vue](./integrating/vue.md)
- [Svelte](./integrating/svelte.md)
- [Astro](./integrating/astro.md)
- [Without a bundler](./integrating/without-a-bundler.md)

## Add an aesthetic (optional)

Aesthetics are separate stylesheets because most pages use one or none. Import all six at once, or only the one you use:

```css
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics/neobrutalism";
```

The order of the two imports does not matter, because every entrypoint declares the [cascade layers](#cascade-layers) before using one. [Aesthetics](./usage/aesthetics.md) shows what each one does; you can skip them until then.

## Requirements

- **Browsers:** Chrome 123, Safari 17.5, or Firefox 128 and newer. Colors use `light-dark()` and `color-scheme` (Firefox 120). `.input-group` reads a nested control's invalid and disabled state with `:has()` (Firefox 121). The elevation classes register a non-inheriting property with `@property` (Firefox 128); without it, an elevation class would also reach the unclassed elements inside it.
- **Tooling:** an `@import` of a package name needs a tool that resolves CSS imports from packages through their `exports` map. Without one, link the compiled file by its path or from a CDN; see [Without a bundler](./integrating/without-a-bundler.md). Two common tools need a nudge, described in [Integrating → Bundlers that need a nudge](./integrating/index.md#bundlers-that-need-a-nudge): Parcel, and PostCSS with `postcss-import`.
- **Tailwind:** 4.3.2 or newer, below 5, only for the `/tw` source entrypoints. It is an optional peer dependency, so the compiled entrypoints and the `chs build` command do not install it.
- **Node.js:** 24 or newer, only on the machine that runs the `chs build` command. The stylesheets need none.
- **Your application:** the package has no JavaScript. Semantic HTML, ARIA, keyboard behavior, focus management, validation, and announcements are yours; see [Accessibility](./accessibility.md).

## When nothing is styled

- **The import is missing or not loaded globally.** The classes do nothing until the stylesheet is on the page. Import it once in a stylesheet every page loads, not in a component that may not render.
- **The package name does not resolve.** A plain `<link>` or a tool without CSS package resolution cannot read `@import "@codenhub/styles"`. Link `node_modules/@codenhub/styles/dist/index.css`, or follow [Without a bundler](./integrating/without-a-bundler.md). Parcel and `postcss-import` resolve it with a small change; see [Integrating → Bundlers that need a nudge](./integrating/index.md#bundlers-that-need-a-nudge).
- **A `/tw` path is loaded without Tailwind.** The `/tw` files are Tailwind source: they contain `@theme`, `@utility`, and `@apply`, which browsers do not understand. Your Tailwind build has to compile them; see [Tailwind CSS v4](./integrating/tailwind.md).
- **A focused `/tw` entrypoint is imported without Tailwind before it.** `@codenhub/styles/tw/button` and the other focused component files do not import Tailwind themselves. Imported alone, they compile without an error but produce no component rules. Put `@import "tailwindcss";` before them; see [Tailwind CSS v4 → Using a focused entrypoint](./integrating/tailwind.md#using-a-focused-entrypoint).
- **A class built at runtime is missing (Tailwind source only).** Tailwind generates a utility class, the package's components such as `.btn` included, only when it finds the name in your source files. A name assembled from strings, such as `` `btn ${tone}` ``, is invisible to that scan. Write full class names, or list them as described in [Tailwind CSS v4](./integrating/tailwind.md).

### Inlining critical CSS

You can paste a **compiled** stylesheet, from `dist/` or from your own build output, into an HTML `<style>` element, for example to inline critical CSS in a server-rendered head. None of the compiled files contains the `</style` sequence that would end the element early.

That does not apply to the `/tw` files. They are Tailwind source, not finished CSS, so pasting one into `<style>` gives the browser directives it ignores and the classes are never generated. Compile them with Tailwind first, then inline the output.

## All entrypoints

Compiled entrypoints are finished CSS. `/tw` entrypoints publish the uncompiled source from `tw/`, beside `dist/`, which a Tailwind v4 build must process. A focused `/tw` component entrypoint includes the theme tokens, so its classes need nothing else from the package, but it needs `@import "tailwindcss";` before it; see [Tailwind CSS v4 → Using a focused entrypoint](./integrating/tailwind.md#using-a-focused-entrypoint).

Each import path resolves the same file under the `style`, `import`, and `default` export conditions. A `types` condition comes first and names an empty declaration, so TypeScript accepts a side-effect import such as `import "@codenhub/styles";` with `noUncheckedSideEffectImports`, which TypeScript 6 turns on by default. A CSS import is a side effect, so make sure your bundler does not drop it as unused.

| Import path                      | What it contains and what it changes                                                                                                                                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@codenhub/styles`               | Compiled complete stylesheet: Tailwind's base and theme output, tokens, typography, layout and content helpers, components, and the reset. Applies the global reset, root theme, and focus rules.                                                                                                                    |
| `@codenhub/styles/theme`         | Compiled tokens and the intent, presentation, elevation, and corner-pattern classes. Sets root theme properties and the light and dark selectors. No reset and no components.                                                                                                                                        |
| `@codenhub/styles/palette`       | Generated `--palette-*` custom properties: every intent and presentation combination's fill, text, and border color as a flat value, plus flat `border`, `surface`, and `text` colors. For code that cannot use the package itself; see [Customizing → Generated palette](./usage/customizing.md#generated-palette). |
| `@codenhub/styles/components`    | Compiled tokens, typography helpers, and every component class. Each component carries its own reduced-motion rule, and the closed-`<dialog>` fix comes with `.card`. No reset, no layout or content helpers, no classless mappings.                                                                                 |
| `@codenhub/styles/native`        | Compiled tokens, typography, layout and content helpers, components, and the package reset, plus [classless mappings](#classless-html) for plain HTML elements. Not Tailwind's Preflight. Applies the reset and broad element selectors.                                                                             |
| `@codenhub/styles/aesthetics`    | All six compiled aesthetics, `.neobrutalism`, `.glass`, `.pixel`, `.chunky-tile`, `.cyber`, and `.sketch`, each with its `-solo` class. No tokens or components of its own; import it in any order.                                                                                                                  |
| `@codenhub/styles/aesthetics/*`  | One compiled aesthetic and its solo class: `/neobrutalism`, `/glass`, `/pixel`, `/chunky-tile`, `/cyber`, or `/sketch`.                                                                                                                                                                                              |
| `@codenhub/styles/tw`            | Source version of the complete stylesheet. Imports Tailwind itself, then the theme, typography, helpers, components, and reset. Same global rules.                                                                                                                                                                   |
| `@codenhub/styles/tw/theme`      | Source theme, tokens, and axis classes. Imports Tailwind's theme layer, emits the theme selectors, and defines the package's `dark:` variant.                                                                                                                                                                        |
| `@codenhub/styles/tw/components` | Source theme, typography, buttons, feedback, forms, surfaces, and tooltips. No reset, no layout or content helpers, no classless mappings.                                                                                                                                                                           |
| `@codenhub/styles/tw/surface`    | Source theme plus `.surface`, `.card`, and `.panel`.                                                                                                                                                                                                                                                                 |
| `@codenhub/styles/tw/button`     | Source theme plus `.btn`.                                                                                                                                                                                                                                                                                            |
| `@codenhub/styles/tw/form`       | Source theme plus `.field`, `.text-control`, `.ipt`, `.textarea`, `.select`, `.input-group`, `.checkbox`, `.radio`, and `.switch`.                                                                                                                                                                                   |
| `@codenhub/styles/tw/feedback`   | Source theme plus `.alert`, `.badge`, `.skeleton`, and `.progress`, with their animations.                                                                                                                                                                                                                           |
| `@codenhub/styles/tw/tooltip`    | Source theme plus the tooltip classes.                                                                                                                                                                                                                                                                               |
| `@codenhub/styles/tw/reset`      | Source theme, typography helpers, and the global reset. Changes the root, body, and elements, and sets selection, motion, focus, scrollbar, and forced-colors rules.                                                                                                                                                 |
| `@codenhub/styles/tw/native`     | Source version of `/native`: everything but Tailwind's Preflight, plus the package reset and the classless mappings. The broadest global effect.                                                                                                                                                                     |
| `@codenhub/styles/tw/typography` | Source theme plus the typography helpers. Sets the theme selectors; no reset, no classless mappings.                                                                                                                                                                                                                 |
| `@codenhub/styles/tw/utilities`  | Source theme and typography plus the layout and content helpers.                                                                                                                                                                                                                                                     |
| `@codenhub/styles/tw/aesthetics` | All six aesthetics as source. `/tw/aesthetics/neobrutalism`, `/glass`, `/pixel`, `/chunky-tile`, `/cyber`, and `/sketch` publish one each. Plain CSS with no theme or reset side effects.                                                                                                                            |
| `@codenhub/styles/package.json`  | The package manifest, as JSON. For tools that read the installed version or export map; it is not a stylesheet.                                                                                                                                                                                                      |

Do not import two entrypoints that overlap, such as `@codenhub/styles` and `@codenhub/styles/components`, in one build unless duplicated CSS is acceptable. Pick the narrowest entrypoint that covers what a page needs.

## Classless HTML

`@codenhub/styles/native` styles plain HTML elements without any classes, for content you cannot add classes to, such as Markdown output or a CMS body. It holds everything the complete stylesheet does except Tailwind's Preflight, the browser-default reset that `@codenhub/styles` brings with Tailwind. The package's own reset is in it: box sizing, the root background, text color and font, the margin reset on headings, paragraphs, and lists, selection colors, focus rings, and the reduced-motion rule. Then it adds these mappings:

| Element                                                                                                                                        | Styled as                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `h1`, `h2`, `h3`, `h4`, `h5` and `h6`                                                                                                          | `.text-title-lg`, `.text-title`, `.text-title-sm`, `.text-label-lg`, `.text-label` |
| `body`                                                                                                                                         | `.text-body`, inherited by paragraphs, list items, and other text                  |
| `table`                                                                                                                                        | `.data-table`                                                                      |
| `kbd`, `blockquote`, `q`, `code`, `pre`                                                                                                        | `.kbd`, `.quote`, `.quote-inline`, `.code`, `.pre`                                 |
| `hr`                                                                                                                                           | `.divider`                                                                         |
| `input` with no type, or type `text`, `number`, `email`, `password`, `url`, `tel`, `search`, `month`, `week`, `time`, `date`, `datetime-local` | `.ipt`                                                                             |
| `textarea`, `select`                                                                                                                           | `.textarea`, `.select`                                                             |
| `input type="checkbox"`, `input type="radio"`                                                                                                  | `.checkbox`, `.radio`                                                              |
| `button`, `input type="button"`, `type="submit"`, `type="reset"`                                                                               | `.btn`                                                                             |
| `dialog`                                                                                                                                       | `.card.floating`: hidden until opened, then a centered floating card               |
| `progress`                                                                                                                                     | `.progress`, filled to its `value`; with no `value` it is the indeterminate sweep  |

```html
<article>
  <h2>Two-factor authentication</h2>
  <p>Press <kbd>Ctrl</kbd> + <kbd>K</kbd> to open the command menu.</p>
  <label for="code">Verification code</label>
  <input id="code" type="text" inputmode="numeric" />
  <label><input type="checkbox" /> Remember this device</label>
  <button type="submit">Verify</button>
</article>
```

What it does not do:

- **Some input types are left alone:** `file`, `range`, `color`, and `hidden` keep the browser's own look.
- **No switch.** A checkbox with `role="switch"` is still painted as a checkbox; the mapping does not read roles. A page that needs switches is better served by the class-based stylesheet.
- **Links keep the text around them.** A link inside a heading stays heading-sized; a link is never styled as a button.
- **Body text is set once.** `p` and `li` take their type from the element they sit in, so a container that sets its own size, weight, or tracking applies it to the Markdown inside it. Controls keep their own tracking: a button, a badge, and a text field print `normal`, whatever the page or the container sets.
- **Native behavior stays native.** A `<dialog>` opens with `show()` or `showModal()` as usual; the mapping only paints it. A `<progress>` sweep stops under a reduced-motion preference, and in forced colors the bar uses the system colors.
- **`pre code` is not double-styled.** Code inside a `pre` drops the chip it would draw on its own: background, padding, border, shadow, glow, and clip.

The mappings are global: every matching element on the page is styled, including elements inside third-party widgets. They sit in the `base` [cascade layer](#cascade-layers), so any class beats them. Add an intent or presentation class to a mapped element, such as `<button class="destructive">`, and it applies as it would on `.btn`.

## Cascade layers

Every entrypoint puts its CSS into Tailwind's four cascade layers and declares their order before using one, so the result does not depend on which file loads first:

| Layer        | Holds                                                                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme`      | Tailwind's theme, the foundation tokens, the theme selectors, and `/palette`.                                                                                                                                                                         |
| `base`       | The reset and the classless element styles.                                                                                                                                                                                                           |
| `components` | The aesthetic classes and the neutral intent values every component starts from.                                                                                                                                                                      |
| `utilities`  | Every component (`.btn`, `.card`, `.ipt`, and so on), next to your own Tailwind utilities. The intent, presentation, edge, elevation, corner, and size classes sit in `utilities.families`, a sublayer that loses to every other rule in `utilities`. |
| _unlayered_  | The forced-colors and reduced-motion overrides, the closed-`<dialog>` fix, and the `-solo` classes.                                                                                                                                                   |

What that means when you write your own CSS:

- **Your utility or unlayered CSS beats an intent, presentation, elevation, or aesthetic class** on the same element. `[--ui-fill:50%]` on a `.solid` button, `font-serif` on a `.pixel` region, or `.my-card { --ui-radius-surface: 0 }` in your own stylesheet all apply.
- **A component and your utility share the `utilities` layer.** Specificity decides between them, then source order, as between any two utilities. Your unlayered CSS always beats a component.
- **Your utility beats a component's inner defaults.** `p-0 text-center` on a table cell, `text-sm` on a `.label`, or `px-8` on a `.btn.sm` applies, because the component writes those defaults so that a class on the element wins.
- **State beats your intent.** A field with `aria-invalid="true"` stays destructive even with an intent utility on it.
- **The `-solo` classes are unlayered on purpose**, so they beat a third-party component's layered or zero-specificity styles. A more specific unlayered rule, or an equally specific one that loads later, still beats them; see [Solo classes](./usage/solo.md).

## Next

With the shell on the page, continue to [Building a screen](./concepts.md) to add a card, a form heading, and a Save button. If you use one of the frameworks above and have not wired it yet, do that first.
