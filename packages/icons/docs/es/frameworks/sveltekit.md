---
title: SvelteKit
description: SvelteKit se apoya en Vite y los archivos .svelte se escanean automáticamente, así que el plugin de Vite casi no necesita configuración.
order: 3
source: 3de12bc69592d9d50c4fa15a6d9c70281001b947
---

# SvelteKit

SvelteKit se apoya en Vite, y el plugin de Vite escanea cada módulo `.svelte` que Vite transforma. El único paso extra es el mismo que necesita Astro: SvelteKit renderiza las páginas por su cuenta en lugar de hacerlo como entradas HTML de Vite, así que hay que importar a mano la hoja de estilos generada.

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

Después importa ambas hojas de estilos desde el layout raíz, para que todas las páginas las carguen:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import "../app.css";
  import "virtual:icons.css";

  let { children } = $props();
</script>

{@render children()}
```

El plugin inyecta su hoja de estilos a través del hook `transformIndexHtml` de Vite, que SvelteKit nunca ejecuta en sus páginas, así que el import de `virtual:icons.css` es lo que pone las reglas de máscara en la página. Sin él, las reglas base siguen aplicando y cada icono se renderiza como un cuadrado sólido de su color.

Conserva la entrada `content`. La hoja de estilos se genera cuando el layout la importa, y un build puede llegar a ese import antes de que Vite haya transformado cada componente, así que `content` es lo que garantiza que cada clase esté en ella. También mantiene bien el primer pintado en desarrollo. `mode: "svg"` también funciona directamente sobre archivos `.svelte`.

## Otros métodos

[Tailwind CSS v4](../delivery/tailwind.md) y [CSS simple](../delivery/plain-css.md) funcionan en SvelteKit de la misma manera que en cualquier otro sitio. Una single-page app de Vite con un `index.html`, como una construida con Vue o Solid, recibe la hoja de estilos inyectada y no necesita import en el layout; un framework que renderiza su propio HTML, como Nuxt o SolidStart, necesita el import igual que SvelteKit.

## Ver también

- [Plugin de Vite](../delivery/vite.md) — referencia completa de opciones y el modelo de escaneo.
- [Métodos de entrega](../delivery/index.md) — cómo se comparan los métodos.
- [API de JavaScript](../javascript-api.md) — lo siguiente en el orden de lectura, para generación programática de CSS o SVG.
