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

Apply `.dark` or `.light` on the root element to force a theme instead of following the system preference; see [Setup → Configuration](../setup.md#configuration).

## See also

- [Setup → Import paths](../setup.md#import-paths): every entrypoint this package publishes.
- [Usage](../usage/index.md): component classes to compose once the stylesheet is loaded.
