---
title: Svelte
description: Loading the stylesheet in a Svelte / SvelteKit app.
---

# Svelte

In SvelteKit, import the package from the root layout so it loads once for
every route:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import "@codenhub/styles";
  let { children } = $props();
</script>

{@render children()}
```

In a plain Svelte + Vite app, import it from the entry file instead:

```ts
// main.ts
import "@codenhub/styles";
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
```

Apply `.dark` or `.light` on `<html>` (edit `src/app.html` in SvelteKit) to
force a theme instead of following the system preference; see
[Setup → Configuration](../setup.md#configuration).

A project running Tailwind CSS v4 imports `@codenhub/styles/tw` from the
app's CSS entry instead; see [Tailwind CSS v4](./tailwind.md).
