---
title: CSS simple
description: Importa las reglas base y una hoja de estilos por familia — sin paso de build, sin escaneo de marcado.
order: 1
source: b0111dd4833c8706823684268e86feb7ad99a949
---

# CSS simple, sin paso de build

CSS simple es la ruta sin configuración: importa las reglas base y luego importa una hoja de estilos precompilada por cada familia que quieras. Cada hoja de estilos de familia ya contiene su catálogo completo, así que nada necesita escanear tu marcado.

```css
@import "@codenhub/icons";
@import "@codenhub/icons/phosphor-fill";
@import "@codenhub/icons/lucide";
```

Cada regla lleva dos selectores que comparten una única copia del gráfico: el calificado `ic-lucide-heart` y el corto `ic-heart`. Así es como CSS simple obtiene una familia por defecto sin configuración de plugin donde guardarla: por el orden estándar de cascada CSS, la última familia que importas gana cada nombre sin prefijo que defina. Arriba, `ic-heart` es el de Lucide.

Las familias de marcas son la excepción educada. `@codenhub/icons/simple-icons` y `@codenhub/icons/logos` emiten únicamente nombres calificados como `ic-logos-google`, así que importar una al final nunca secuestra `ic-x` ni `ic-play`.

## Coste

Como nada escanea tu marcado para podar los iconos sin usar, las hojas de estilos de familia envían todos los glifos de entrada: Lucide pesa unos 1.3 MB, Material Symbols Rounded unos 3.9 MB, `logos` a todo color unos 6.5 MB, Line MD unos 3.0 MB incluyendo su gráfico estático para movimiento reducido, y las 17 familias juntas alcanzan unos 39 MB. Controlas el presupuesto importando solo las familias que realmente usas. Si eso te sigue pareciendo pesado para tres botones y una barra lateral, cambia a Tailwind, Vite o PostCSS para que solo aterricen en la salida los iconos que escribiste.

Line MD lleva gráfico estático para movimiento reducido y para `ic-on-hover` en reposo. Añade `ic-on-hover` para reproducir el gráfico en hover usando solo CSS; volver a reproducir el gráfico de una sola reproducción en cada hover, en lugar de solo el primero, necesita el helper opcional `@codenhub/icons/play`. Los SVG Spinners conservan la animación de carga. Consulta [Familias animadas](../concepts.md#familias-animadas) para ver los tiempos de reproducción única y los límites en navegadores.

## Limitaciones

El grosor de trazo no funciona en CSS simple. El grosor va horneado en el material gráfico de cada regla, y una hoja de estilos estática sin paso de build detrás no tiene forma de saber qué grosores pidieron tus plantillas, así que las familias basadas en trazos se renderizan con su grosor original.

## Ver también

- [Métodos de entrega](index.md) — cómo se comparan los métodos.
- [Tailwind CSS](tailwind.md) — el siguiente método de entrega, si buscas emisión bajo demanda con un solo import.
- [Frameworks](../frameworks/index.md) — integración específica por framework una vez que hayas elegido método de entrega.
- [Conceptos](../concepts.md) — resolución de nombres y formas del marcado.
