---
title: Svelte
description: Loading the stylesheet in a Svelte / SvelteKit app.
order: 4
---

# Svelte

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

Apply `.dark` or `.light` on `<html>` (edit `src/app.html` in SvelteKit) to force a theme instead of following the system preference; see [Setup → Configuration](../setup.md#configuration).

## See also

- [Setup → Import paths](../setup.md#import-paths): every entrypoint this package publishes.
- [Usage](../usage/index.md): component classes to compose once the stylesheet is loaded.
