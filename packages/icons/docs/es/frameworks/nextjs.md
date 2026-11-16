---
title: Next.js
description: Next.js no tiene pipeline de Vite, así que usa Tailwind v4, el plugin de PostCSS o imports de familias en CSS simple.
order: 2
source: f91845ade64b6316bedb5943f428c1bfb8c42893
---

# Next.js

Next.js compila con webpack o Turbopack en lugar de Vite, así que `@codenhub/icons/vite` se toma el día libre aquí. Los otros tres métodos de entrega funcionan tal como cabría esperar — y como los tres producen CSS plano, el App Router, los React Server Components y el streaming no se ven afectados en absoluto.

## Tailwind CSS v4

Si tu aplicación Next.js ya usa Tailwind v4 a través de `@tailwindcss/postcss`, un import en tu hoja de estilos global lo cubre todo:

```css
/* app/globals.css */
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Se emiten únicamente los iconos que usa tu marcado. Consulta [Tailwind CSS](../delivery/tailwind.md).

## Plugin de PostCSS

Sin Tailwind, registra el plugin de PostCSS en `postcss.config.mjs` y pasa globs en `content` que cubran cada directorio donde vivan clases de icono — PostCSS inspecciona solo el texto de la hoja de estilos y `content`, sin visibilidad sobre el grafo de módulos:

```js
import lucide from "@codenhub/icons/data/lucide";
import icons from "@codenhub/icons/postcss";

export default {
  plugins: [
    icons({
      families: [lucide],
      defaultPrefix: "lucide",
      content: ["./app/**/*.{tsx,jsx,mdx}", "./components/**/*.{tsx,jsx}"],
    }),
  ],
};
```

Mantén `@import "@codenhub/icons";` al principio de `app/globals.css` para las reglas base. Consulta [Plugin de PostCSS](../delivery/postcss.md).

## CSS simple

Cero configuración y sin plugin de PostCSS, intercambiando tamaño de hoja de estilos por simplicidad:

```css
/* app/globals.css */
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

Consulta [CSS simple](../delivery/plain-css.md).

## Ver también

- [Métodos de entrega](../delivery/index.md) — cómo se comparan los métodos.
- [Conceptos](../concepts.md) — resolución de nombres y formas del marcado.
- [SvelteKit](sveltekit.md) — la contraparte basada en Vite, si quieres comparar configuraciones.
- [API de JavaScript](../javascript-api.md) — lo siguiente en el orden de lectura, para generación programática de CSS o SVG.
