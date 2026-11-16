---
title: Visión general
description: Qué método de entrega elegir según el framework, y las particularidades de cada framework que vienen con él.
group: Frameworks
order: 3
source: 25109196aa74b79a3f0fe5013b94bf5d61e54b5b
---

# Configuración por framework

Todos los frameworks consumen `@codenhub/icons` a través de uno de los [métodos de entrega](../delivery/index.md). La mayoría de los frameworks basados en Vite funcionan de entrada sin necesidad de una guía dedicada, mientras que unos pocos tienen pipelines de build o extensiones de plantillas con sus propias reglas. Esta sección cubre los tres que vale la pena señalar.

| Framework                           | Método recomendado                                   | Notas                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [Astro](astro.md)                   | CSS simple o Tailwind v4; plugin de Vite con cuidado | `.astro` no se escanea automáticamente en el plugin de Vite — pasa `content`.                                                 |
| [Next.js](nextjs.md)                | Tailwind v4 o plugin de PostCSS                      | Sin pipeline de Vite, así que el plugin de Vite no aplica.                                                                    |
| [SvelteKit](sveltekit.md)           | Plugin de Vite                                       | `.svelte` se escanea automáticamente; la integración de plugin más limpia.                                                    |
| Vue, SolidStart, Nuxt, Remix (Vite) | Plugin de Vite                                       | Sigue [SvelteKit](sveltekit.md); `.vue` se escanea automáticamente igual que `.svelte`.                                       |
| Cualquier framework                 | CSS simple                                           | Los imports de familia en [CSS simple](../delivery/plain-css.md) funcionan en cualquier entorno que resuelva CSS de paquetes. |

Si tu framework falta en la tabla y compila con Vite, sigue la guía de [SvelteKit](sveltekit.md). Si compila con webpack u otro entorno con PostCSS, sigue [Next.js](nextjs.md). Y si solo quieres iconos en pantalla sin ningún cableado de build, [CSS simple](../delivery/plain-css.md) funciona en todas partes a costa de hojas de estilos más grandes.

## Siguiente paso

Elige arriba la guía de framework que encaja con tu stack — empezando por [Astro](astro.md) — o sigue hacia la [API de JavaScript](../javascript-api.md) cuando necesites control programático fuera de un build de framework.
