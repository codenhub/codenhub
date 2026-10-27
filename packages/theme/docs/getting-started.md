---
title: Getting Started
order: 1
---

# Getting Started

This page builds the smallest useful thing: a page with a light and a dark theme, and a button that switches between them. It assumes a project with a bundler, such as [Vite](https://vite.dev/), that resolves `import` statements from `node_modules`.

## 1. Install the package

Install it with your project's package manager:

```sh
npm install @codenhub/theme
```

```sh
pnpm add @codenhub/theme
```

```sh
yarn add @codenhub/theme
```

```sh
bun add @codenhub/theme
```

## 2. Write the CSS for each theme

The package writes the theme's name onto `<html>`, as `data-theme="light"` or `data-theme="dark"`, along with the `color-scheme` property and, by default, a matching `theme-<name>` class. Your stylesheet gives each name its look. CSS custom properties keep that short: define the colors once per theme, and use them everywhere else.

```css
/* styles.css */
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

`:root` gives the page the light colors before any theme is applied, so it never renders with no colors at all.

## 3. Add a button

Any element works. This one has an `id` so the script can find it:

```html
<button id="theme-toggle" type="button">Toggle theme</button>
```

## 4. Create the theme manager

```ts
// main.ts
import { createTheme } from "@codenhub/theme";

import "./styles.css";

const theme = createTheme().init();

document.querySelector("#theme-toggle")?.addEventListener("click", theme.toggle);
```

Three things happen here:

- `createTheme()` creates a **theme manager**, the object that owns the active theme. With no options, it knows two themes, `light` and `dark`. Creating it changes nothing on the page yet.
- `.init()` starts it. It picks the theme to show, the user's saved choice or else the operating system's setting, applies it to `<html>`, and starts listening for system changes. It returns the same manager, so the two calls chain.
- `theme.toggle` switches to the other theme and saves the choice. Every method of the manager can be passed as a callback on its own, as it is here, without wrapping it in an arrow function.

## 5. Try it

Open the page and click the button: the colors switch. Now reload the page. The theme you picked is still there, because `toggle()` saved it to `localStorage`.

To see the operating-system part, clear the saved choice by running this in the browser console:

```js
localStorage.removeItem("app-theme-preference");
```

Reload, then switch your system between light and dark mode. With no saved choice, the page follows along.

## What you have, and what is next

You now have a working theme switch. Two things are still missing for a production app:

- **A flash on load.** Your script runs after the browser has already painted the page once, so a user who chose dark sees a light page for a moment first. [Preventing the flash](preventing-the-flash.md) fixes that with a small inline script.
- **Cleanup**, if the manager lives inside a component that can unmount. Call `theme.destroy()` in its cleanup to stop the manager's listeners. A manager created once for the whole page, as above, never needs it. [Frameworks](frameworks.md) shows where it goes in React.

Next, [Defining themes](themes.md) replaces the two built-in themes with your own.
