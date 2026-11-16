---
title: SvelteKit
description: SvelteKit se apoya en Vite y los archivos .svelte se escanean automáticamente, así que el plugin de Vite casi no necesita configuración.
order: 3
source: 3421f6a4370a257e3ecb9cceabf28f2e1b7b2126
---

# SvelteKit

SvelteKit se apoya en Vite, y `.svelte` ya está en la lista de escaneo automático en tiempo de transformación del plugin de Vite. Después de las acrobacias de bundler en Next.js y las pistas extra de plantillas en Astro, SvelteKit es la configuración donde casi no queda nada por explicar.

## Plugin de Vite

Añade el plugin en `vite.config.ts` junto a `sveltekit()`:

```ts
import { sveltekit } from "@sveltejs/kit/vite";
import lucide from "@codenhub/icons/data/lucide";
import icons from "@codenhub/icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit(),
    icons({
      families: [lucide],
      defaultPrefix: "lucide",
      content: ["./src/**/*.{svelte,html}"],
    }),
  ],
});
```

```css
/* src/app.css */
@import "@codenhub/icons";
```

Las clases en componentes `.svelte` se recogen en el escaneo en tiempo de transformación incluso sin una entrada `content`. Enumerar `src/**/*.{svelte,html}` de todos modos mantiene bien el primer pintado en desarrollo antes de que Vite transforme esos módulos de componentes. `mode: "svg"` también funciona directamente sobre archivos `.svelte`.

## Otros métodos

[Tailwind CSS v4](../delivery/tailwind.md) y [CSS simple](../delivery/plain-css.md) funcionan en SvelteKit de la misma manera que en cualquier otro sitio. Vue, SolidStart y otros frameworks basados en Vite siguen exactamente esta misma configuración — `.vue` se escanea automáticamente igual que `.svelte`.

## Ver también

- [Plugin de Vite](../delivery/vite.md) — referencia completa de opciones y el modelo de escaneo.
- [Métodos de entrega](../delivery/index.md) — cómo se comparan los métodos.
- [API de JavaScript](../javascript-api.md) — lo siguiente en el orden de lectura, para generación programática de CSS o SVG.
