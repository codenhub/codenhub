---
title: Solución de problemas
description: Por qué un icono no renderiza nada, sale como un cuadrado sólido, tiene el grosor incorrecto o pierde su aviso de licencia, y cómo resolver cada caso.
order: 6
source: bc9f941797dac6478c3a8c470eef784d29e6f16b
---

# Solución de problemas

La mayoría de los fallos con iconos son silenciosos: el build termina bien y el icono faltante o roto aparece recién en el navegador. Salta al síntoma que coincide con lo que ves.

## El icono no renderiza nada

Ninguna regla base coincidió con el elemento, así que no tiene tamaño — o, en el modo SVG en línea, ningún SVG lo sustituyó o una colisión de IDs lo ocultó.

- **Faltan las reglas base.** CSS simple y un `@plugin` de Tailwind declarado necesitan `@import "@codenhub/icons";` en una hoja de estilos. `@codenhub/icons/tw`, la hoja de estilos del plugin de Vite y el plugin de PostCSS ya incluyen las reglas base (en PostCSS, salvo que `injectBase` sea `false`). El modo SVG en línea renderiza sin reglas base, aunque añadir `@import "@codenhub/icons"` aporta `--ic-size`, las clases de tamaño y `--ic-color` para iconos que no tienen color propio.
- **El elemento no es un `<i>` ni tiene `.ic`.** Las reglas base coinciden con `<i class="ic-…">`, o con cualquier elemento que también lleve `.ic`. Un `<span class="ic-lucide-heart">` sin `.ic` no coincide con ninguna regla.
- **Un logotipo en línea cuya primera copia está oculta.** En el modo SVG en línea, dos copias del mismo icono de `logos` comparten los IDs de gradient, mask y clip-path. Si la primera copia está dentro de un elemento con `display: none`, todas las copias posteriores se renderizan en blanco (observado en Chromium). Coloca una copia visible antes de la oculta, oculta con `visibility: hidden` o usa el modo CSS; consulta [Vite § Modo SVG en línea](delivery/vite.md#modo-svg-en-línea).

## El icono se renderiza como un cuadrado sólido

Las reglas base dieron tamaño y color al elemento, así que aparece como una caja — pero ninguna regla de máscara coincidió con él, dejando toda la caja pintada con el color del icono.

- **El nombre no existe en la familia.** Los nombres son los del proyecto original: Material Symbols escribe `check_circle`, Lucide escribe `circle-check` y Lucide no tiene `close` (es `x`). Comprueba el nombre exacto en la familia; consulta [Cómo encontrar el nombre de un icono](concepts.md#cómo-encontrar-el-nombre-de-un-icono).
- **Un nombre sin calificar y sin familia por defecto.** `ic-heart` solo se resuelve donde hayas definido un valor por defecto: `defaultPrefix` en los plugins de Vite y PostCSS, `default:` en el plugin de Tailwind, o la última hoja de estilos de familia base importada en CSS simple. Escribe el nombre calificado `ic-lucide-heart`, o configura un valor por defecto. Consulta [Nombres](concepts.md#nombres).
- **La familia no está cargada.** Los plugins de Vite y PostCSS resuelven únicamente las familias listadas en `families`, o registradas en el `registry` pasado en su lugar.
- **Un icono de marca a través de `@codenhub/icons/tw`.** `/tw` nunca resuelve `simple-icons` ni `logos`. Declara el plugin con `families` nombrando la familia de marcas; consulta [Tailwind CSS](delivery/tailwind.md#configurar-el-plugin).
- **La clase se arma en tiempo de ejecución.** Los plugins de build encuentran una clase solo cuando está escrita completa: `` `ic-${name}` `` es invisible en tiempo de build. Escribe cada clase literalmente, o carga el icono como un [módulo](delivery/vite.md#un-módulo-por-icono).
- **La clase está en un archivo que el plugin no escanea.** El plugin de Vite escanea los módulos que Vite transforma; un archivo que nunca transforma necesita un glob en `content`, y lo mismo ocurre en los builds de Astro y SvelteKit, donde la hoja de estilos puede generarse antes de que cada módulo se transforme. El plugin de PostCSS escanea únicamente la propia hoja de estilos y `content`. Consulta [Vite § Escaneo](delivery/vite.md#escaneo) y [PostCSS § Escaneo](delivery/postcss.md#escaneo).
- **Astro, solo en el build de producción.** `astro build` en producción omite el hook de HTML de Vite, así que importa `virtual:icons.css` explícitamente desde un layout compartido. Consulta [Astro § Plugin de Vite](frameworks/astro.md#plugin-de-vite).
- **Solo en producción, con una Content Security Policy.** Las versiones hasta la 0.2.1 insertaban la hoja de estilos compilada como una etiqueta `<style>`, que una política sin `'unsafe-inline'` bloquea. Actualiza más allá de la 0.2.1 para que los builds en modo CSS con entradas HTML enlacen un asset de hoja de estilos en su lugar; los builds de librería y el modo SVG en línea no emiten ninguna hoja de estilos; consulta [Vite § Escaneo](delivery/vite.md#escaneo).
- **Modo SVG en línea, sobre un elemento que no reescribe.** `mode: "svg"` sustituye etiquetas `<i class="ic-…">` y no emite reglas de máscara, así que `.ic` en cualquier otro elemento no tiene ninguna regla detrás. El build avisa, nombrando la clase y el archivo. Bajo Astro, `.md` y `.mdx` no se reescriben y nada avisa; envuelve el icono en un componente para `.mdx`, o usa el modo CSS para `.md`. Consulta [Vite § Modo SVG en línea](delivery/vite.md#modo-svg-en-línea) y [Astro § Modo SVG en línea](frameworks/astro.md#modo-svg-en-línea).

## El grosor de trazo no cambia

- **CSS simple.** Las hojas de estilos de familia llevan cada icono con su grosor original; `ic-lucide-heart/1.5` necesita Tailwind, Vite o PostCSS. Consulta [Grosor de trazo](concepts.md#grosor-de-trazo).
- **Una familia dibujada con rellenos.** Solo `lucide` y `line-md` están basadas en trazos. Todas las demás familias incluidas ignoran el modificador.

## El color no cambia

Define `--ic-color` en el icono o en un ancestro, o `--<prefix>-color` bajo un prefijo de clase personalizado. El `color` normal llega solo a los iconos sin color propio: un icono de marca conserva su color de marca hasta que `--ic-color` lo sobrescribe. Definir `background-color` en el propio elemento del icono sustituye su pintura, porque los iconos con máscara CSS se pintan a través de su `background`. En modo SVG en línea bajo una Content Security Policy que bloquee atributos `style`, un icono de marca conserva su color de marca e ignora `--ic-color`. Consulta [Color](concepts.md#color).

## Un icono de marca es invisible en modo oscuro

Su color de marca es casi negro, como ocurre con GitHub, X y Vercel. Define `--ic-color` con un color claro en esas clases dentro de tu tema oscuro. Consulta [Color](concepts.md#color).

## Falta el aviso de licencia en la salida

Un minificador configurado con `legalComments: "none"` elimina los comentarios `/*! … */`. Usa `attribution: "file"` con Vite para emitir `icons-attribution.txt`, o configura tu minificador para conservar los comentarios legales. Consulta [Licencias](licensing.md).

## Siguiente paso

Vuelve a la [Introducción](index.md) para ver el orden de lectura completo, o consulta exportaciones y opciones concretas en la [referencia de la API](../reference/index.md).
