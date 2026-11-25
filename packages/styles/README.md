# @codenhub/styles

Build a consistent, themeable interface by writing class names on plain HTML: one stylesheet with tokens, a reset, layout and type helpers, and classes for buttons, form fields, alerts, cards, tables, and tooltips. There is no JavaScript to load and no component library to wrap.

## Installation

```sh
pnpm add @codenhub/styles
```

## Usage

Import the compiled stylesheet, which holds everything the package ships:

```css
@import "@codenhub/styles";
```

```html
<form class="card stack">
  <h2 class="text-title-sm">Profile</h2>
  <div class="field">
    <label class="label" for="display-name">Display name</label>
    <input class="ipt" id="display-name" name="display-name" />
  </div>
  <button class="btn primary" type="submit">Save changes</button>
</form>
```

To use the Tailwind CSS v4 source entrypoints instead, or to load only part of the package, see [Setup](./docs/setup.md). The [demo](https://demo.codenhub.dev/styles/) shows every component in every intent, presentation, and aesthetic.

## Documentation

The docs build one account settings screen from start to finish, in this order:

- [Introduction](./docs/index.md): What the package is for, what it costs, and the reading order.
- [Setup](./docs/setup.md): Install the package, choose compiled CSS or Tailwind source, and render the page shell.
- [Integrating](./docs/integrating/index.md): Load the stylesheet in Next.js, Vue, Svelte, Astro, Tailwind CSS v4, or a page with no bundler.
- [Building a screen](./docs/concepts.md): Lay out the page and learn intent, fill, edge, and aesthetic.
- [Usage](./docs/usage/index.md): Guides for buttons, forms, feedback, tooltips, theming, aesthetics, and solo classes, then the lookup pages for every class, token, and default.
- [Accessibility](./docs/accessibility.md): What the CSS does for your users and what your application still owes them.
- [Changelog](./docs/changelog/index.md): Release history, including breaking changes.

## Requirements

| Requirement   | Details                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSS imports   | Consumer tooling must resolve package CSS imports.                                                                                                                                                                           |
| Browsers      | Chrome 123, Safari 17.5, or Firefox 128 and newer (`light-dark()` theming; `:has()` for `.input-group` state; `@property` for non-inheriting elevation).                                                                     |
| Tailwind CSS  | 4.3.2 or newer, below 5, only for the `/tw` source entrypoints. Install it yourself; the package does not.                                                                                                                   |
| Node.js       | 24 or newer on the machine that runs the `chs build` command. The stylesheets need none, but the package declares it as its engine, so Yarn 1, and npm or pnpm with `engine-strict`, refuse the install on an older Node.js. |
| Accessibility | Consumers provide semantic HTML, ARIA, keyboard behavior, and focus management.                                                                                                                                              |

## Notes

This package has no JavaScript behavior. It ships no compatibility aliases: a removed class or token is documented in the [changelog](./docs/changelog/index.md), not kept under a second name. Below 1.0 a minor release may break and a patch release never does; see [Versioning](./docs/index.md#versioning).

## License

This project is licensed under the [Apache-2.0](LICENSE) license. Tailwind's theme values, Preflight, and property registrations, carried in the compiled stylesheets in `dist/`, and the property registrations in `tw/theme.css` come from [Tailwind CSS](https://tailwindcss.com) (MIT). See [NOTICE](NOTICE) for the required notices. `LICENSE` ends with the same notices, so Vite's `build.license`, which lists each package's `LICENSE`, carries them when JavaScript imports the package; it leaves out a package reached only through a CSS `@import` ([vitejs/vite#24111](https://github.com/vitejs/vite/issues/24111)). For that route, and for other bundlers, serve `NOTICE` with your app or add its text to your app's licences page.
