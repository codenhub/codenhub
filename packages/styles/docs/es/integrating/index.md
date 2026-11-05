---
title: Visión general
description: Cómo se carga la hoja de estilos en el build de un framework, y qué guía seguir.
group: Integración
order: 2
source: f2ccb27bbdbe15278726278864c01a586505eb16
---

# Integración

Esta sección es un desvío del orden de lectura principal, para proyectos cuyo framework decide dónde puede ir el CSS global. El paquete no tiene JavaScript ni bindings para frameworks (consulta [Introducción](../index.md#lo-que-no-hace)), así que integrarlo se reduce a dos cosas: dónde te deja tu framework cargar una hoja de estilos global, y si el proyecto usa Tailwind CSS v4. Sigue la guía que corresponde a tu stack y después vuelve a [Construir una pantalla](../concepts.md).

## El modelo común

Todos los stacks hacen los mismos dos imports, desde el mismo tipo de lugar: un layout raíz, un archivo de entrada de la aplicación o un archivo CSS global, nunca una página o un componente más abajo en el árbol:

1. Un [punto de entrada](../setup.md#todos-los-puntos-de-entrada): el compilado `@codenhub/styles` para cualquier build, o `@codenhub/styles/tw` cuando el proyecto ya usa Tailwind CSS v4.
2. `@codenhub/styles/aesthetics` (o `/tw/aesthetics`) después, solo si el proyecto usa una [estética](../usage/aesthetics.md).

Importar desde un solo lugar importa por dos motivos. Algunos frameworks solo _permiten_ CSS global desde un archivo raíz designado y, si no, el build falla; el Pages Router de Next.js es uno de ellos, consulta [Next.js → Solución de problemas](./nextjs.md#solución-de-problemas). Donde un framework lo permite de forma más amplia, como hace el App Router de Next.js, importar desde la raíz sigue siendo la opción recomendada para que el orden del CSS sea predecible; además, importar en cada componente cargaría las mismas reglas de reset y de tokens una vez por componente en lugar de una vez por aplicación.

## Qué guía seguir

| Stack                                                                      | Guía                                  |
| -------------------------------------------------------------------------- | ------------------------------------- |
| Un proyecto con Tailwind CSS v4 en cualquier bundler                       | [Tailwind CSS v4](./tailwind.md)      |
| Next.js / React                                                            | [Next.js](./nextjs.md)                |
| Vue                                                                        | [Vue](./vue.md)                       |
| Svelte / SvelteKit                                                         | [Svelte](./svelte.md)                 |
| Astro                                                                      | [Astro](./astro.md)                   |
| HTML simple, Rails, Django o cualquier aplicación sin paso de build de CSS | [Sin bundler](./without-a-bundler.md) |

Un proyecto sin framework, un build simple con Vite, webpack o Parcel, no necesita nada más allá de [Configuración inicial → Importar la hoja de estilos](../setup.md#importar-la-hoja-de-estilos): importa la hoja de estilos compilada desde la entrada CSS global que el proyecto ya tiene.

## Comprobar que funciona

Después del import, renderiza un elemento con estilo y confirma que ha tomado los tokens del paquete y no los valores por defecto del navegador:

```html
<button class="btn primary">Save changes</button>
```

Un botón redondeado relleno con el color principal (casi negro en una página clara, casi blanco en una oscura) significa que la hoja de estilos se ha cargado. Un texto sin estilo, con los valores por defecto del navegador, casi siempre significa que el especificador del import no se ha resuelto: consulta en la [tabla de puntos de entrada](../setup.md#todos-los-puntos-de-entrada) el especificador exacto que debes importar, y confirma que tus herramientas de build resuelven imports de CSS de paquetes; consulta [Configuración inicial → Requisitos](../setup.md#requisitos). Sin herramienta de build, enlaza el archivo por su ruta; consulta [Sin bundler](./without-a-bundler.md). [Configuración inicial → Cuando nada tiene estilo](../setup.md#cuando-nada-tiene-estilo) enumera las otras causas habituales.

## Siguiente paso

Cuando el botón se renderice, vuelve al camino principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes.
