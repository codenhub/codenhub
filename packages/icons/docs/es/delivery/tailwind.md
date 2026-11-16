---
title: Tailwind CSS
description: Un import hace resolubles todas las familias no de marca; Tailwind emite solo los iconos que usó tu marcado.
order: 2
source: 5f1f664bdcd07fdf9ae2782f1d69676fe3c9519c
---

# Tailwind CSS v4

Si tu proyecto ya ejecuta Tailwind CSS v4, añadir iconos lleva un único import — cero configuración de plugin necesaria, y Tailwind emite solo los iconos que tus plantillas realmente escribieron:

```css
@import "tailwindcss";
@import "@codenhub/icons/tw";
```

Todas las familias que incluye el paquete se pueden resolver de entrada salvo las familias de marcas `simple-icons` y `logos`, que requieren declarar `@plugin` por tu cuenta con `families` (abajo). Cargar las familias cuesta unos 150–190 ms y 112 MB una vez por build, con ambas familias de marcas incluidas, frente a unos 35 ms y 53 MB para una sola familia; un proyecto que usa tres iconos termina con unos 10 KB de CSS.

## Configurar el plugin

Cuando quieras restringir familias, fijar un prefijo por defecto, cambiar el prefijo de clase o habilitar iconos de marca, declara `@plugin "@codenhub/icons/tailwind"` directamente en lugar de importar `/tw` (que ya lo declara sin opciones):

```css
@import "tailwindcss";
@import "@codenhub/icons";
@plugin "@codenhub/icons/tailwind" {
  families: lucide, phosphor-fill;
  default: lucide;
  stroke-width: 1.5;
}
```

| Opción         | Propósito                                                                               |
| -------------- | --------------------------------------------------------------------------------------- |
| `families`     | Prefijos de familia contra los que resolver. Por defecto todas salvo las de marcas.     |
| `default`      | Familia contra la que se resuelven los nombres sin calificar. No hay valor por defecto. |
| `prefix`       | Prefijo de clase. Por defecto `ic`.                                                     |
| `stroke-width` | Se aplica a las familias de trazos que no llevan modificador propio.                    |
| `attribution`  | `auto` u `off`. Consulta [Licencias](../licensing.md).                                  |

Un detalle honesto a tener en cuenta: acotar `families` no hace el build más rápido ni más ligero en memoria. Como un manejador de plugin de Tailwind tiene que ejecutarse de forma síncrona — las utilidades registradas después de un `await` se descartan en silencio — todas las familias ya están cargadas antes de que se lean tus opciones. Lo que `families` controla es qué nombres pueden resolverse y qué avisos de licencia lleva tu CSS compilado.

## Movimiento

Las clases de movimiento e `ic-on-hover` funcionan como utilidades de Tailwind, en línea con [Movimiento](../concepts.md#movimiento): `ic-on-hover` reproduce el movimiento mientras el icono, su padre o un ancestro `ic-trigger` tiene hover o foco visible (`:focus-visible`), una vez por hover salvo que `--ic-anim-iterations` indique otra cosa, y controla también el material gráfico animado:

```html
<button>
  <i class="ic-lucide-refresh-cw ic-anim-spin ic-on-hover" aria-hidden="true"></i>
  Reload
</button>
```

Como las clases de movimiento son utilidades reales de Tailwind, las variantes de Tailwind siguen disponibles para otros disparadores. Una variante sustituye a `ic-on-hover` para el movimiento de glifo y se repite hasta que el estado termina:

```html
<button class="group">
  <i class="ic-lucide-loader-circle group-hover:ic-anim-spin" aria-hidden="true"></i>
  Refresh
</button>
<i class="ic-lucide-bell hover:ic-anim-wiggle" aria-hidden="true"></i>
```

Cuando uses variantes, empareja `group-focus-visible:ic-anim-spin` con `group-hover:ic-anim-spin` para que quienes usan teclado reciban la misma señal; `ic-on-hover` gestiona el foco visible automáticamente. Las preferencias de movimiento reducido desactivan las animaciones incluso cuando coincide una variante. El material gráfico animado no tiene forma con variante, así que mantén `ic-on-hover` junto a la clase del icono en esos casos. Consulta [Movimiento](../concepts.md#movimiento) para ver las cinco clases, los valores por defecto, los prefijos personalizados y los límites de animación en máscara CSS.

## Atribución

`@import "@codenhub/icons/tw"` inserta una hoja de estilos estática, así que lleva un encabezado `/*! … */` normal nombrando todas las familias que resuelve — un aviso superconjunto que siempre es seguro. Declarar `@plugin` por tu cuenta acota la resolución, y allí el aviso viaja como una custom property `--ic-attribution-<family>` en `:root` en su lugar, emitida una vez por cada familia que el build realmente usó. Consulta [Licencias](../licensing.md).

## Ver también

- [Métodos de entrega](index.md) — cómo se comparan los métodos.
- [Plugin de Vite](vite.md) — el siguiente método de entrega, para builds con Vite sin Tailwind.
- [Frameworks](../frameworks/index.md) — integración específica por framework una vez que hayas elegido método de entrega.
- [Conceptos](../concepts.md) — resolución de nombres y grosor de trazo.
