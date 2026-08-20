---
title: Vue
description: Loading the stylesheet in a Vue / Vite app.
---

# Vue

Import the package once, from the app's entry file, before the app mounts:

```ts
// main.ts
import "@codenhub/styles";
import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
```

Apply `.dark` or `.light` on the root element to force a theme instead of
following the system preference; see
[Setup → Configuration](../setup.md#configuration).

A project running Tailwind CSS v4 imports `@codenhub/styles/tw` from a CSS
entry file instead of `main.ts`, using the `@tailwindcss/vite` plugin; see
[Tailwind CSS v4](./tailwind.md).
