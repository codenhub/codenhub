---
title: Comparación
description: Las cuatro formas en que las clases de icono se convierten en reglas de máscara CSS, los puntos de entrada del paquete detrás de ellas y cómo elegir.
group: Métodos de entrega
order: 2
source: 69a59c4a23d6377d5c1011d208033585d1cb9427
---

# Cómo llegan los iconos a tu CSS

Todos los métodos de entrega producen las mismas reglas de máscara CSS y entienden exactamente las mismas clases de icono. Lo que cambia entre ellos es de dónde salen esas reglas por icono: bien de una hoja de estilos precompilada que contiene todos los iconos de una familia, o bien de un plugin que escanea tu marcado y genera solo los iconos que escribiste. Esta página compara las cuatro opciones para que elijas la que encaja con tu build.

## Puntos de entrada

| Punto de entrada           | Para                          | Qué entrega                                                                                  |
| -------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `@codenhub/icons`          | Todos los métodos             | Las reglas base `.ic`, alrededor de 2 KB. Nunca las reescribe un plugin.                     |
| `@codenhub/icons/tw`       | Tailwind CSS v4               | Reglas base más el plugin. Todas las familias no de marca resolubles; solo emite los usados. |
| `@codenhub/icons/tailwind` | Tailwind CSS v4, configurado  | El plugin por sí solo, para que `@plugin` pueda llevar opciones.                             |
| `@codenhub/icons/<family>` | CSS simple, sin paso de build | Una familia completa, con cada icono ya escrito.                                             |
| `@codenhub/icons/vite`     | Vite                          | Escanea tu marcado y genera únicamente las reglas que necesita.                              |
| `@codenhub/icons/postcss`  | PostCSS                       | Lo mismo, para un pipeline de PostCSS.                                                       |

`@import "@codenhub/icons"` significa una sola cosa en todas partes: las reglas base sobre las que se apoyan las clases de icono. Ningún plugin lo reescribe y ningún plugin lo elimina. La única pieza móvil es qué mecanismo genera a su lado las reglas de máscara por icono.

## Cómo elegir uno

| Si tu proyecto…                                               | Usa                             |
| ------------------------------------------------------------- | ------------------------------- |
| Ya usa Tailwind CSS v4                                        | [Tailwind](tailwind.md)         |
| Compila con Vite (o un framework basado en Vite)              | [Plugin de Vite](vite.md)       |
| Ejecuta un pipeline de PostCSS pero no Vite (Next.js, otros)  | [Plugin de PostCSS](postcss.md) |
| No tiene paso de build, o quieres la configuración más simple | [CSS simple](plain-css.md)      |

Los métodos con plugin mantienen pequeña la salida CSS sin podar manualmente: un proyecto que usa tres iconos distribuye unos 10 KB de CSS. Las hojas de estilos de familia en CSS simple hacen el intercambio opuesto — cero configuración de build a cambio de distribuir todos los iconos de la familia, donde Lucide por sí sola pesa unos 1.3 MB y las 17 familias juntas alcanzan unos 39 MB.

Una capacidad también depende de un paso de build: el modificador de grosor de trazo `ic-lucide-heart/1.5` necesita Tailwind, Vite o PostCSS, porque las hojas de estilos de CSS simple renderizan las familias de trazos con su grosor original. Consulta [Conceptos](../concepts.md) para el modelo compartido.

## Siguiente paso

Lee la guía del método que elegiste — empezando por [CSS simple](plain-css.md) si buscas cero configuración — o salta directo a [Frameworks](../frameworks/index.md) para la integración con Astro, Next.js y SvelteKit.
