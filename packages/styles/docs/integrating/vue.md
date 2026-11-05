---
title: Vue
description: Loading the stylesheet in a Vue / Vite app.
order: 3
---

# Vue

Vue places no restriction on where CSS is imported from, but importing it once, from the app's entry file, keeps the reset and tokens from loading more than once and guarantees they're in place before any component renders.

## Import the stylesheet

```ts
// main.ts
import "@codenhub/styles";
import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
```

Running Tailwind CSS v4? Import `@codenhub/styles/tw` from a CSS entry file instead of `main.ts`, using the `@tailwindcss/vite` plugin — see [Tailwind CSS v4](./tailwind.md).

## Force a theme

Apply `.dark` or `.light` on the root element to force a theme instead of following the system preference; see [Theming → Light and dark](../usage/theming.md#light-and-dark).

## Next

Return to the main path: [Building a screen](../concepts.md) adds the first card and form to the settings page. [Setup → All entrypoints](../setup.md#all-entrypoints) lists every other stylesheet you can import.
