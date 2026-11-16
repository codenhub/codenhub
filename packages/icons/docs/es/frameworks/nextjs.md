---
title: Next.js
description: Next.js no tiene pipeline de Vite, así que usa Tailwind v4, el plugin de PostCSS o imports de familias en CSS simple.
order: 2
source: 771f62cd7d2eb4b392e187507523c80a3cbbb730
---

# Next.js

Next.js compila con webpack o Turbopack en lugar de Vite, así que `@codenhub/icons/vite` se toma el día libre aquí. Los otros tres métodos de entrega funcionan tal como cabría esperar — y como los tres producen CSS plano, el App Router, los React Server Components y el streaming no se ven afectados en absoluto.

## Tailwind CSS v4

Si tu aplicación Next.js ya usa Tailwind v4 a través de `@tailwindcss/postcss`, un import en tu hoja de estilos global cubre todas las familias salvo las de marcas:

```css
/* app/globals.css */
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Se emiten únicamente los iconos que usa tu marcado. `/tw` nunca resuelve las familias de marcas `simple-icons` y `logos`; para usar una, declara el plugin con `families` nombrándola, como se indica en [Tailwind CSS § Configurar el plugin](../delivery/tailwind.md#configurar-el-plugin).

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

El plugin añade las reglas base por sí mismo, ya que `injectBase` es `true` por defecto, así que `app/globals.css` no necesita ningún `@import "@codenhub/icons";` aquí; importarlo también distribuiría las reglas base dos veces. Para importarlas tú mismo en su lugar, fija `injectBase: false`. Consulta [Plugin de PostCSS](../delivery/postcss.md).

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
