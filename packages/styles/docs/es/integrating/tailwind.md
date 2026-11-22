---
title: Tailwind CSS v4
description: Usar los puntos de entrada de código fuente /tw en un proyecto con Tailwind CSS v4.
order: 1
source: 751c07d0ead1796ffb06aa5b463f6da775741485
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

`/tw` importa el propio Tailwind, así que sustituye a tu `@import "tailwindcss"` en lugar de sumarse a él. Con los dos, el build sigue emitiendo una sola vez el Preflight y el tema de Tailwind, y solo repite un pequeño bloque de `::placeholder`, pero tu import no añade nada que `/tw` no traiga. Todos los demás puntos de entrada `/*/tw` esperan que tu import vaya primero; consulta [Usar un punto de entrada específico](#usar-un-punto-de-entrada-específico).

Tailwind CSS v4 escanea tu proyecto automáticamente: la mayoría de los proyectos no necesita nada más que el import anterior. Las rutas de `@source` se resuelven respecto al archivo CSS que las declara, no respecto a la raíz de tu proyecto, así que aquí `./src` significa "el `src/` que está junto a esta hoja de estilos"; ajústalo según dónde esté realmente tu hoja de estilos global. Añade `@source` solo para el markup al que el escaneo automático de Tailwind no llega por sí solo: una ruta excluida por defecto (incluida en `.gitignore`, o dentro de `node_modules`, por ejemplo una librería de componentes externa) o, en un monorepo, una que está fuera del árbol de directorios de este archivo. Apúntalo al markup de tu aplicación, no a este paquete: el código fuente del paquete nombra cada clase que define, así que escanearlo las emite todas, las usen tus páginas o no.

## Añadir estéticas

Añade una estética desde el punto de entrada de código fuente igual que con el compilado, después del import base:

```css
@import "@codenhub/styles/tw";
@import "@codenhub/styles/aesthetics/tw";

@source "./src";
```

## Usar un punto de entrada específico

Importa un punto de entrada `/*/tw` específico en lugar del combinado, como `/button/tw` o `/form/tw`, cuando un build solo necesita una familia de componentes; consulta la [tabla de puntos de entrada](../setup.md#todos-los-puntos-de-entrada) completa para ver qué compone cada uno.

A diferencia de `/tw`, los puntos de entrada específicos y `/native/tw` no importan Tailwind, así que mantén tu propio import primero:

```css
@import "tailwindcss";
@import "@codenhub/styles/button/tw";
```

Un punto de entrada específico es para una sola familia. Cada uno trae el tema y las reglas compartidas sobre las que se construyen sus clases, así que dos de ellos los traen dos veces, y Tailwind conserva las dos copias. Con Tailwind 4.3.2, `/button/tw`, `/form/tw`, `/surface/tw` y `/feedback/tw` juntos compilaron una página pequeña a 85.192 bytes minificados, mientras que `/components/tw`, que contiene los cuatro y además los tooltips, la compiló a 82.915. Para dos familias o más, importa `/components/tw`, o `/tw`.

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

- **No borres todo el espacio de nombres.** `--color-*: initial` quita también los colores semánticos del paquete, como `--color-primary`, porque también son variables del tema. El build termina igual, sin ningún aviso, y todo componente que los lee se dibuja sin color.
- **No borres una escala que lee el tema.** Borrar `--color-emerald-*` compila sin error, pero los colores de éxito construidos con ella se pierden.
- **No borres los espacios de nombres de tipo, fuente o espaciado.** Los componentes aplican las utilidades `text-*` y `font-*` de Tailwind y su función `--spacing()`, así que `--text-*: initial`, `--font-*: initial`, `--spacing: initial` o `--*: initial` quita los valores que leen. El build termina igual, sin ningún aviso: los componentes conservan sus referencias a `--text-sm`, `--font-default` o `--spacing`, que ya no nombran nada, así que su texto toma el tamaño y la fuente heredados, y su relleno y sus espacios quedan en cero. Sobrescribe valores sueltos, como `--text-sm`. Borrar `--radius-*` es seguro: las esquinas de los componentes salen de `--radius-control`, `--radius-small` y `--radius-surface`, que son del paquete.

## Solución de problemas

**Las clases no producen ningún estilo**

- **Qué ha pasado:** los componentes usan clases documentadas como `.btn.primary`, pero no aparece ningún estilo aunque `@import "@codenhub/styles/tw"` está en la hoja de estilos.
- **Por qué:** rara vez es por el propio `@source`, porque Tailwind ya escanea tu proyecto automáticamente. La causa más habitual es un markup que vive en un lugar que el escaneo automático excluye por defecto: una ruta incluida en `.gitignore`, o un componente que viene de `node_modules`. Puede que Tailwind no vea una clase usada solo ahí y no genere una regla para ella.
- **Solución:** añade un `@source` explícito que apunte a ese directorio, resuelto respecto a esta hoja de estilos, como en el [ejemplo de arriba](#importar-el-punto-de-entrada-de-código-fuente).

**Reglas de tokens y de reset duplicadas**

- **Qué ha pasado:** la hoja de estilos generada es más grande de lo esperado, y las herramientas de desarrollo del navegador muestran las mismas custom properties o reglas de reset definidas dos veces.
- **Por qué:** importar en el mismo build un punto de entrada compilado (`@codenhub/styles`) y un punto de entrada `/tw` (`@codenhub/styles/tw`) compila los mismos tokens y el mismo reset desde dos fuentes independientes; el build de Tailwind no tiene forma de saber que describen el mismo paquete.
- **Solución:** elige un camino por proyecto, los puntos de entrada `/tw` para un proyecto con Tailwind CSS v4 y los compilados en todos los demás casos.

**Una variante detrás de `before:` o `placeholder:` ignora el ajuste de la aplicación**

- **Qué ha pasado:** `before:motion-reduce:hidden` o `placeholder:dark:text-white` no sigue `data-motion` ni `data-theme` en `<html>`, o no se aplica nunca, mientras que `motion-reduce:hidden` en el propio elemento funciona.
- **Por qué:** la variante del paquete va detrás de una variante de pseudoelemento, y Tailwind escribe entonces su condición donde los navegadores la rechazan.
- **Solución:** escribe primero la variante del paquete: `motion-reduce:before:hidden`, `dark:placeholder:text-white`. [Variantes de contraste y movimiento](#variantes-de-contraste-y-movimiento) tiene los detalles.

**Un cambio de token se detiene en un shadow root**

- **Qué ha pasado:** `--color-primary` definido en `:root` en tu hoja de estilos colorea los botones de la página, pero un botón dentro de un shadow root que carga la misma hoja conserva el color del paquete.
- **Por qué:** Tailwind escribe el tema en `:root, :host`, así que la copia de la hoja en el shadow root vuelve a declarar cada token en su host, y el valor de la página no se hereda más allá. Los puntos de entrada compilados declaran los tokens solo en `:root`, así que ahí el valor de la página sí cruza.
- **Solución:** define el cambio en `@theme`, como `@theme { --color-primary: oklch(49% 0.24 293); }`, que Tailwind también escribe en `:root, :host`, o escribe tu propia regla en `:root, :host`.

**Una clase construida en tiempo de ejecución no tiene estilo**

- **Qué ha pasado:** `<button class="btn primary">` tiene estilo, pero un botón cuya clase viene de una variable, como `"btn " + variant`, o de contenido de un CMS, no.
- **Por qué:** Tailwind emite solo las clases que encuentra escritas completas en los archivos que escanea. Eso vale también para las clases de componente del paquete: un build con `/tw` emite `.alert` solo si `alert` aparece en algún lugar que escanea, lo que limita la hoja de estilos a lo que usan tus páginas. Las clases de intención, de presentación, de elevación, de esquina y de tamaño, como `.primary`, `.soft` y `.sm`, también son utilidades, así que les pasa lo mismo. Las clases de estética, como `.glass`, son CSS plano y se emiten siempre. Un nombre armado en tiempo de ejecución nunca aparece completo en un archivo, así que el escaneo no lo ve.
- **Solución:** escribe cada nombre de clase completo en algún lugar que Tailwind escanee, por ejemplo en un objeto de consulta (`{ save: "btn primary", remove: "btn destructive" }`), o enumera en tu hoja de estilos los nombres que tu código o tu contenido pueden producir:

```css
@import "@codenhub/styles/tw";

@source inline("btn alert badge primary destructive soft");
```

Todos los puntos de entrada `/tw` requieren Tailwind CSS 4.3.2 o posterior, por debajo de 5 (`>=4.3.2 <5`), el rango con el que CI los compila. El paquete no declara Tailwind como peer dependency, así que tu gestor de paquetes no comprueba la versión por ti; `npm ls tailwindcss` te muestra la tuya. Una peer opcional la habría comprobado, pero entonces npm se negaba a instalar el paquete en cualquier proyecto con un Tailwind anterior, incluso en uno que solo enlaza el CSS compilado.

## La variante `dark:`

Los puntos de entrada `/tw` definen su propia variante `dark:`, así que tus utilidades cambian con los mismos selectores claro y oscuro que usan los tokens del paquete. Tiene una diferencia conocida respecto a los tokens cuando los temas están anidados; consulta [Temas → La variante dark:](../usage/theming.md#la-variante-dark).

## Variantes de contraste y movimiento

Los puntos de entrada `/tw` también reemplazan `contrast-more:`, `contrast-less:`, `motion-safe:` y `motion-reduce:` de Tailwind, así que tus utilidades siguen los ajustes de la app que siguen los componentes del paquete: `data-contrast` y `data-motion` en `<html>` deciden cuando están puestos, y el ajuste del sistema decide cuando no, como describe [Accesibilidad → Ajustes de la app](../accessibility.md#ajustes-de-la-app).

| Variante         | Se aplica                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `contrast-more:` | Con `data-contrast="more"`, o con `prefers-contrast: more` salvo que esté puesto `data-contrast="standard"`.            |
| `contrast-less:` | Con `prefers-contrast: less`, salvo que `data-contrast` sea `more` o `standard`.                                        |
| `motion-safe:`   | Con `data-motion="full"`, o sin preferencia de movimiento reducido salvo que `data-motion` sea `reduce` o `none`.       |
| `motion-reduce:` | Con `data-motion` `reduce` o `none`, o con `prefers-reduced-motion: reduce` salvo que esté puesto `data-motion="full"`. |

`data-motion="none"` cuenta como movimiento reducido, así que `motion-reduce:` se aplica con él. Como con las reglas del propio paquete, los atributos se leen solo en `<html>` y no desde dentro de un shadow root.

Tailwind no puede negar una variante que es a la vez un selector y una media query, así que con un punto de entrada `/tw` `not-motion-safe:`, `not-motion-reduce:`, `not-contrast-more:` y `not-dark:` no compilan a nada, y Tailwind no dice nada. Escribe la variante opuesta: `motion-reduce:` en lugar de `not-motion-safe:` y `motion-safe:` en lugar de `not-motion-reduce:`, que son opuestas exactas. Para las demás, pon la utilidad sin prefijo y deshazla con la variante positiva: `border-4 contrast-more:border-2` en lugar de `not-contrast-more:border-4`, y `bg-white dark:bg-black` en lugar de `not-dark:bg-white`. `not-contrast-less:` compila como siempre.

Escribe estas variantes, `dark:` incluida, antes de una variante de pseudoelemento como `before:`, `after:`, `placeholder:` o `file:`: `motion-reduce:before:hidden` y `dark:placeholder:text-white`, no `before:motion-reduce:hidden` ni `placeholder:dark:text-white`. Tailwind coloca una variante de selector que sigue a una variante de pseudoelemento detrás del pseudoelemento, donde los navegadores la rechazan, y no dice nada. La utilidad ignora entonces `data-theme`, `data-contrast` y `data-motion` y, según el navegador y el pseudoelemento, sigue el ajuste del sistema o no se aplica nunca. Las variantes de selector del propio Tailwind, como `rtl:` y `aria-checked:`, necesitan el mismo orden.

## Siguiente paso

Vuelve al camino principal: [Construir una pantalla](../concepts.md) añade la primera tarjeta y el primer formulario a la página de ajustes. Todo lo que muestra funciona igual con `/tw`.
