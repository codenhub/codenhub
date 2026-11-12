---
title: Tailwind CSS v4
description: Usar los puntos de entrada de código fuente /tw en un proyecto con Tailwind CSS v4.
order: 1
source: 4866b77d4cfb1655499f633fff8bf61dde2aa4bb
---

# Tailwind CSS v4

Un proyecto que ya usa Tailwind CSS v4 puede compilar el código fuente de este paquete en lugar de cargar su salida compilada. Así, las utilidades de tu aplicación y las clases del paquete salen de un solo build, comparten un tema y usan una sola variante `dark:`. Esta página cubre el import, las estéticas, los puntos de entrada específicos, cómo construir tus propios componentes con `@apply`, cómo prescindir de la paleta de Tailwind y los problemas de build con los que probablemente te encuentres.

## Por qué código fuente en lugar de compilado

Los puntos de entrada `/tw` publican código fuente copiado y sin compilar desde la carpeta `tw/` del paquete; tu propio build de Tailwind lo compila junto con tu aplicación, así que sus directivas `@theme`, `@utility` y `@apply` se resuelven junto con las tuyas. Los puntos de entrada compilados (`@codenhub/styles`) siguen funcionando en un proyecto con Tailwind, pero entonces se ejecutan dos pipelines de CSS separados en paralelo en lugar de uno: usa `/tw` salvo que un motivo concreto lo descarte.

## Importar el punto de entrada de código fuente

```css
@import "@codenhub/styles/tw";

@source "./src";
```

`/tw` importa el propio Tailwind, así que sustituye a tu `@import "tailwindcss"` en lugar de sumarse a él: con los dos, el Preflight de Tailwind se emite dos veces. Todos los demás puntos de entrada `/tw/*` esperan que tu import vaya primero; consulta [Usar un punto de entrada específico](#usar-un-punto-de-entrada-específico).

Tailwind CSS v4 escanea tu proyecto automáticamente: la mayoría de los proyectos no necesita nada más que el import anterior. Las rutas de `@source` se resuelven respecto al archivo CSS que las declara, no respecto a la raíz de tu proyecto, así que aquí `./src` significa "el `src/` que está junto a esta hoja de estilos"; ajústalo según dónde esté realmente tu hoja de estilos global. Añade `@source` solo para el markup al que el escaneo automático de Tailwind no llega por sí solo: una ruta excluida por defecto (incluida en `.gitignore`, o dentro de `node_modules`, por ejemplo una librería de componentes externa) o, en un monorepo, una que está fuera del árbol de directorios de este archivo. Apúntalo al markup de tu aplicación, no a este paquete: el código fuente del paquete nombra cada clase que define, así que escanearlo las emite todas, las usen tus páginas o no.

## Añadir estéticas

Añade una estética desde el punto de entrada de código fuente igual que con el compilado, después del import base:

```css
@import "@codenhub/styles/tw";
@import "@codenhub/styles/tw/aesthetics";

@source "./src";
```

## Usar un punto de entrada específico

Importa un punto de entrada `/tw/*` específico en lugar del combinado, como `/tw/button` o `/tw/form`, cuando un build solo necesita una familia de componentes; consulta la [tabla de puntos de entrada](../setup.md#todos-los-puntos-de-entrada) completa para ver qué compone cada uno.

A diferencia de `/tw`, los puntos de entrada específicos y `/tw/native` no importan Tailwind, así que mantén tu propio import primero:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw/button";
```

## Construir tus propios componentes con `@apply`

En `/tw`, cada componente, helper y clase de eje es una utilidad de Tailwind. Eso incluye las intenciones (`neutral`, `primary`, `secondary`, `success`, `warning`, `destructive`, `info`), la presentación (`solid`, `soft`, `ghost`, `edged`, `edgeless`), la elevación (`flat`, `raised`, `floating`), los patrones de esquina (`cut-diagonal`, `cut-diagonal-reverse`) y los tamaños (`sm`, `lg`). Así, una clase tuya puede llevar una receta completa:

```css
@import "@codenhub/styles/tw";

@utility btn-save {
  @apply btn primary soft sm;
}

@utility btn-danger {
  @apply btn destructive md:lg dark:solid;
}
```

```html
<button class="btn-save" type="submit">Guardar</button>
```

- **Un componente aplicado se comporta como la clase.** `btn-save` reacciona al hover, se presiona, recibe el foco y sigue a una estética igual que `class="btn primary soft sm"`.
- **Las variantes funcionan.** `hover:primary`, `md:lg` y `dark:solid` aplican una clase de eje bajo esa condición, en tu marcado o dentro de `@apply`.
- **Escribe tu clase como `@utility`.** Así se queda en la capa `utilities`, y tus demás utilidades en el mismo elemento le siguen ganando. Una regla simple `.btn-save { @apply … }` también funciona, pero queda sin capa, así que lo que aplica gana a todas las utilidades del elemento; [Personalización → Helpers de composición](../usage/customizing.md#helpers-de-composición) tiene los detalles.
- **Los modificadores también se aplican.** Los modificadores de un componente, como `.tight` en `.stack`, `.icon` en `.btn` o `.interactive` en `.card`, también son utilidades, así que `@apply stack tight`, `@apply btn icon pill` y `md:tight` funcionan. El estado deshabilitado es la excepción: sigue siendo un atributo o la clase `.disabled` en el marcado.
- **Tu utilidad gana a los valores internos de un componente.** `p-0 text-center` en una celda de `.data-table`, `text-sm` en un `.label` y `px-8` en un `.btn.sm` se aplican todos.

[Preajustes](../usage/presets.md) compara esto con las demás formas de definir un aspecto una sola vez.

## Prescindir de la paleta de Tailwind

`/tw` se construye sobre el tema por defecto de Tailwind, así que las utilidades de su paleta, como `bg-red-500`, siguen disponibles. Si tu diseño usa solo los tokens del paquete, borra los tonos que no usas:

```css
@import "@codenhub/styles/tw";

@theme {
  --color-red-*: initial;
  --color-orange-*: initial;
  --color-yellow-*: initial;
  --color-lime-*: initial;
  --color-green-*: initial;
  --color-teal-*: initial;
  --color-cyan-*: initial;
  --color-sky-*: initial;
  --color-blue-*: initial;
  --color-violet-*: initial;
  --color-purple-*: initial;
  --color-fuchsia-*: initial;
  --color-pink-*: initial;
  --color-slate-*: initial;
  --color-gray-*: initial;
  --color-zinc-*: initial;
  --color-stone-*: initial;
  --color-black: initial;
}
```

Los colores propios del paquete no cambian, y puedes seguir añadiendo colores tuyos en el mismo bloque.

El bloque deja fuera `neutral`, `emerald`, `amber`, `rose`, `indigo` y `white` a propósito: el tema construye sus colores a partir de ellos.

- **No borres todo el espacio de nombres.** `--color-*: initial` quita también los colores semánticos del paquete, y el build se detiene con un error como `Cannot apply unknown utility class`.
- **No borres una escala que lee el tema.** Borrar `--color-emerald-*` compila sin error, pero los colores de éxito construidos con ella se pierden.
- **No borres los espacios de nombres de tipo, fuente o espaciado.** Los componentes aplican las utilidades `text-*` y `font-*` de Tailwind y su función `--spacing()`, así que `--text-*: initial`, `--font-*: initial`, `--spacing: initial` o `--*: initial` detiene la compilación con `Cannot apply unknown utility class` o `The --spacing(…) function requires that the --spacing theme variable exists`. Sobrescribe valores sueltos, como `--text-sm`. Borrar `--radius-*` es seguro.

## Solución de problemas

**Las clases no producen ningún estilo**

- **Qué ha pasado:** los componentes usan clases documentadas como `.btn.primary`, pero no aparece ningún estilo aunque `@import "@codenhub/styles/tw"` está en la hoja de estilos.
- **Por qué:** rara vez es por el propio `@source`, porque Tailwind ya escanea tu proyecto automáticamente. La causa más habitual es un markup que vive en un lugar que el escaneo automático excluye por defecto: una ruta incluida en `.gitignore`, o un componente que viene de `node_modules`. Puede que Tailwind no vea una clase usada solo ahí y no genere una regla para ella.
- **Solución:** añade un `@source` explícito que apunte a ese directorio, resuelto respecto a esta hoja de estilos, como en el [ejemplo de arriba](#importar-el-punto-de-entrada-de-código-fuente).

**Reglas de tokens y de reset duplicadas**

- **Qué ha pasado:** la hoja de estilos generada es más grande de lo esperado, y las herramientas de desarrollo del navegador muestran las mismas custom properties o reglas de reset definidas dos veces.
- **Por qué:** una de dos cosas. Importar en el mismo build un punto de entrada compilado (`@codenhub/styles`) y un punto de entrada `/tw` (`@codenhub/styles/tw`) compila los mismos tokens y el mismo reset desde dos fuentes independientes; el build de Tailwind no tiene forma de saber que describen el mismo paquete. O bien tu hoja de estilos importa `tailwindcss` junto a `/tw`, que ya lo importa, así que el Preflight se emite dos veces.
- **Solución:** elige un camino por proyecto, los puntos de entrada `/tw` para un proyecto con Tailwind CSS v4 y los compilados en todos los demás casos, y quita tu propio `@import "tailwindcss"` cuando importes `/tw`.

**Una clase construida en tiempo de ejecución no tiene estilo**

- **Qué ha pasado:** `<button class="btn primary">` tiene estilo, pero un botón cuya clase viene de una variable, como `"btn " + variant`, o de contenido de un CMS, no.
- **Por qué:** Tailwind emite solo las clases que encuentra escritas completas en los archivos que escanea. Eso vale también para las clases de componente del paquete: un build con `/tw` emite `.alert` solo si `alert` aparece en algún lugar que escanea, lo que limita la hoja de estilos a lo que usan tus páginas. Las clases de intención, de presentación, de elevación, de esquina y de tamaño, como `.primary`, `.soft` y `.sm`, también son utilidades, así que les pasa lo mismo. Las clases de estética, como `.glass`, son CSS plano y se emiten siempre. Un nombre armado en tiempo de ejecución nunca aparece completo en un archivo, así que el escaneo no lo ve.
- **Solución:** escribe cada nombre de clase completo en algún lugar que Tailwind escanee, por ejemplo en un objeto de consulta (`{ save: "btn primary", remove: "btn destructive" }`), o enumera en tu hoja de estilos los nombres que tu código o tu contenido pueden producir:

```css
@import "@codenhub/styles/tw";

@source inline("btn alert badge primary destructive soft");
```

Todos los puntos de entrada `/tw` requieren Tailwind CSS 4.3.2 o posterior, por debajo de 5 (`>=4.3.2 <5`).

## La variante `dark:`

Los puntos de entrada `/tw` definen su propia variante `dark:`, así que tus utilidades cambian con los mismos selectores claro y oscuro que usan los tokens del paquete. Tiene una diferencia conocida respecto a los tokens cuando los temas están anidados; consulta [Temas → La variante dark:](../usage/theming.md#la-variante-dark).

## Siguiente paso

Vuelve al camino principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes. Todo lo que muestra funciona igual con `/tw`.
