# @codenhub/theme

Light and dark mode for browser apps, without the boilerplate. `@codenhub/theme` decides which theme is active, remembers the user's choice in `localStorage`, follows the operating system's light or dark setting until the user picks one, keeps open tabs in agreement, and writes the result onto `<html>` for your CSS to style. It has no dependencies, works with any framework or none, and ships no CSS: your stylesheets decide what each theme looks like.

## Installation

```sh
npm install @codenhub/theme
pnpm add @codenhub/theme
yarn add @codenhub/theme
bun add @codenhub/theme
```

## Usage

Style each theme by its name, which the package writes to `<html>` as `data-theme`:

```css
:root,
[data-theme="light"] {
  --background: #ffffff;
  --text: #171717;
}

[data-theme="dark"] {
  --background: #171717;
  --text: #f5f5f5;
}

body {
  background: var(--background);
  color: var(--text);
}
```

Then create the manager once, start it, and wire up a button:

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme().init();

document.querySelector("#theme-toggle")?.addEventListener("click", theme.toggle);
```

With no options, there are two themes, `light` and `dark`. `init()` applies the user's saved choice, or else the operating system's setting, and `toggle()` switches themes and saves the choice.

Because this script runs after the browser first paints, a user who chose dark briefly sees the light theme on load. Production apps also inline the script from `getPrePaintScript()` in `<head>` to apply the theme before the first paint; [Preventing the flash](docs/preventing-the-flash.md) shows how.

## Documentation

- [Documentation overview](docs/index.md): How the package works, and a walkthrough from first theme to production setup.
- [Getting started](docs/getting-started.md): A working light and dark toggle, step by step.
- [Preventing the flash](docs/preventing-the-flash.md): Applying the theme before the first paint, in static and server-rendered apps.
- [Frameworks](docs/frameworks.md): React and Tailwind CSS.
- [API reference](docs/reference/index.md): Every export with its full signature.
- [Changelog](docs/changelog/index.md): Changes in each release.

## Requirements

- A browser to apply the theme. On a server, the manager safely does nothing that needs one and reports the default theme.
- Your own CSS for each theme. The package writes the theme's name, an optional class, `color-scheme`, and optional CSS custom properties to `<html>`; it ships no styles.
- TypeScript 5.4 or newer, if you use TypeScript, for the `NoInfer` the types rely on.

## Notes

- `createTheme()` validates its options immediately and throws an `Error` naming the problem, such as a `defaultTheme` that is not one of your themes.
- When the browser blocks `localStorage`, the package logs the failure once with `console.error` and keeps working; the user's choice lasts until the page closes.

## License

Licensed under the [Apache-2.0](LICENSE) license.
