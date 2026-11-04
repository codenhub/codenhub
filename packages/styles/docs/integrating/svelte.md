---
title: Svelte
description: Loading the stylesheet in a Svelte / SvelteKit app.
order: 4
---

# Svelte

Svelte and SvelteKit let you import CSS from any component, but the package's reset and tokens should load once, before any component renders. This page shows where that one import goes in SvelteKit and in a plain Svelte app.

## Import the stylesheet

**SvelteKit** — import from the root layout so it loads once for every route:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import "@codenhub/styles";
  let { children } = $props();
</script>

{@render children()}
```

**Plain Svelte + Vite** — import from the entry file instead:

```ts
// main.ts
import "@codenhub/styles";
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
```

Running Tailwind CSS v4? Import `@codenhub/styles/tw` from the app's CSS entry instead — see [Tailwind CSS v4](./tailwind.md).

## Force a theme

Apply `.dark` or `.light` on `<html>` (edit `src/app.html` in SvelteKit) to force a theme instead of following the system preference; see [Theming → Light and dark](../usage/theming.md#light-and-dark).

## Next

Return to the main path: [Building a screen](../concepts.md) adds the first card and form to the settings page. [Setup → All entrypoints](../setup.md#all-entrypoints) lists every other stylesheet you can import.
