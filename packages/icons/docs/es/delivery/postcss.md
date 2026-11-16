---
title: Plugin de PostCSS
description: Escanea la hoja de estilos y los archivos que enumeres, y luego añade las reglas base y las reglas de máscara que necesitan esas clases.
order: 4
source: ccc1cace12ab5568a0c49b3dfcdfc770bddd0136
---

# Plugin de PostCSS

Para builds que ejecutan PostCSS sin Vite ni Tailwind — casi siempre Next.js — el plugin de PostCSS escanea tus hojas de estilos y los globs de `content`, y luego añade las reglas base y solo las reglas de máscara que usa tu marcado.

```ts
import lucide from "@codenhub/icons/data/lucide";
import postcssIcons from "@codenhub/icons/postcss";

postcssIcons({
  content: ["./src/**/*.html"],
  families: [lucide],
  defaultPrefix: "lucide",
  injectBase: true,
  attribution: "auto",
});
```

Comparte las mismas opciones `families`, `defaultPrefix`, `prefix` y `strokeWidth` que el [plugin de Vite](vite.md). Como PostCSS no tiene un pipeline de assets propio, `attribution` acepta solo `auto` y `off`, y no existe `mode: "svg"`.

| Opción          | Propósito                                                                     |
| --------------- | ----------------------------------------------------------------------------- |
| `content`       | Archivos y globs para escanear en busca de clases de icono.                   |
| `families`      | Familias contra las que resolver. No se incluye ninguna por defecto.          |
| `defaultPrefix` | Familia contra la que se resuelve un nombre sin calificar.                    |
| `injectBase`    | Si se añaden las reglas base `.ic`. Por defecto `true`.                       |
| `prefix`        | Prefijo de clase. Por defecto `ic`.                                           |
| `strokeWidth`   | Valor por defecto para familias de trazos cuyas clases no llevan modificador. |
| `attribution`   | `auto` u `off`. Consulta [Licencias](../licensing.md).                        |
| `registry`      | Un `IconRegistry` preparado, en lugar de `families`.                          |

## Escaneo

A diferencia del plugin de Vite, este plugin no tiene visibilidad sobre el grafo de módulos del bundler. Cuando se ejecuta sobre una hoja de estilos, ve únicamente el texto de esa propia hoja de estilos y los archivos que coinciden con `content` — nada más. Enumera globs que cubran todos los sitios donde vivan tus clases de icono (componentes, plantillas, HTML), o solo se resolverán las clases escritas literalmente dentro de tu CSS:

```ts
postcssIcons({
  content: ["./app/**/*.{tsx,jsx,mdx}", "./components/**/*.{tsx,jsx}"],
  families: [lucide],
  defaultPrefix: "lucide",
});
```

El plugin se ejecuta una vez por cada hoja de estilos que procesa, así que conéctalo a una única hoja de estilos global en lugar de ejecutarlo sobre cada módulo CSS.

## Ver también

- [Métodos de entrega](index.md) — cómo se comparan los métodos.
- [Frameworks](../frameworks/index.md) — lo siguiente en el orden de lectura, cubriendo Astro, Next.js y SvelteKit.
- [Frameworks: Next.js](../frameworks/nextjs.md) — el motivo principal para elegir PostCSS antes que Vite.
