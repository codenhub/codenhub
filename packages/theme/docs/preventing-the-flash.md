---
title: Preventing the Flash
order: 5
---

# Preventing the Flash

Reload the page from [Getting started](getting-started.md) with the dark theme chosen, and look closely: for a moment, it is light. The browser draws the page as soon as it has the HTML and CSS, and your script, which calls `init()`, runs after that. Until then, `<html>` carries no `data-theme`, so the page shows its default colors.

The fix is a tiny script that runs **before** the first paint. It must be written directly into the page's `<head>`, not loaded from a file, so the browser runs it before drawing anything. `getPrePaintScript()` returns that script as a string. It repeats exactly what `init()` decides, the saved choice, else the operating system's setting, and applies the attribute, classes, `color-scheme`, and theme tokens. When `init()` runs later, the right theme is already there and nothing visibly changes.

## Share the options

The pre-paint script and the manager in your app must agree on every option: if one uses another `storageKey`, they disagree about the saved choice and the flash comes back. Keep the options in one module that both import:

```ts
// src/theme-options.ts
import type { ThemeOptions } from "@codenhub/theme";

export const themeOptions = {
  themes: {
    light: { colorScheme: "light" },
    dark: { colorScheme: "dark" },
  },
  storageKey: "my-app-theme",
} satisfies ThemeOptions;
```

```ts
// src/main.ts
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "./theme-options";

export const theme = createTheme(themeOptions).init();
```

`satisfies ThemeOptions` checks the object against the option types while keeping its exact theme names, so `theme.set()` still accepts only `"light"` and `"dark"`.

Where the script is generated depends on how your HTML is produced.

## In a static site

A single-page app built with Vite has one `index.html`, written at build time. `createTheme()` is safe to call outside a browser, so a small plugin in `vite.config.ts` can generate the script during the build and put it at the top of `<head>`:

```ts
// vite.config.ts
import { createTheme } from "@codenhub/theme";
import { defineConfig } from "vite";

import { themeOptions } from "./src/theme-options";

export default defineConfig({
  plugins: [
    {
      name: "theme-pre-paint",
      transformIndexHtml() {
        return [
          {
            tag: "script",
            children: createTheme(themeOptions).getPrePaintScript(),
            injectTo: "head-prepend",
          },
        ];
      },
    },
  ],
});
```

Run the dev server, view the page source, and the script is the first thing in `<head>`. Other build tools have an equivalent step for editing the HTML; what matters is that the string ends up inside a `<script>` element in `<head>`, before your stylesheets.

## In a server-rendered app

When a server builds each page, generate the script there and write it into the HTML it sends. With any Node.js server that writes HTML as a string:

```ts
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "./theme-options";

// The script depends only on the options, so build it once.
const prePaintScript = createTheme(themeOptions).getPrePaintScript();

function renderPage(body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <script>${prePaintScript}</script>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>${body}</body>
</html>`;
}
```

The script is safe to place inside `<script>` as is: theme names and token values cannot close the element or break out of it.

In a React framework that renders `<html>` itself, such as Next.js, put it in the root layout:

```tsx
// src/app/layout.tsx
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "../theme-options";

const prePaintScript = createTheme(themeOptions).getPrePaintScript();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prePaintScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

`suppressHydrationWarning` is needed because the script changes `<html>` before React loads: React finds a `data-theme`, class, and `style` the server did not render, and would warn that they do not match. The difference is intended. The flag silences that warning on `<html>` only, not on its children.

## What the server knows

On a server there is no `localStorage` and no operating-system setting, so the manager does nothing there that needs a browser: it applies nothing, saves nothing, listens to nothing, and `theme.system` reports `defaultTheme`. Every method is still safe to call; none throws for a missing `window` or `document`.

That means the server cannot know which theme the user chose, and the HTML it sends carries none. The pre-paint script fills it in before the first paint, which is enough for most apps. If your server must render the right theme itself, for example because it renders theme-specific markup, it has to learn the choice from the request, typically from a cookie your app sets when the theme changes. That logic is yours to write; keep its theme names, attribute, and classes aligned with the same options.

## Content Security Policy

If your site sends a Content Security Policy whose `script-src` does not include `'unsafe-inline'`, the browser blocks the inline script, the flash returns, and the only sign is an error in the console. Allow the script in one of two ways:

- **Nonce:** render the element as `<script nonce="…">`, using the per-request nonce your policy already names.
- **Hash:** add `'sha256-…'` of the script text to `script-src`. The script is the same for the same options, so compute the hash once at build time, for example with `createHash("sha256").update(script).digest("base64")` from `node:crypto`. Insert the string exactly as returned: any change, even whitespace around it inside the element, changes the hash.

## What the script does not include

Token overrides from `setTokens()` exist only in the running page, so the script cannot know them; it applies the themes' own `tokens`. Overrides your app saves itself appear once your code calls `setTokens()` again.

Next, [Frameworks](frameworks.md) shows how to use the manager inside React components and with Tailwind CSS.
