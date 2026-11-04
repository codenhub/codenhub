---
title: Composición
description: Consulta de cómo se combinan la intención, la presentación, la estética y la elevación, el aspecto por defecto de cada componente y qué clases lee cada uno.
order: 8
source: 8aa84776103ce27781f924220cc7c621231e5734
---

# Composición

Esta es una página de consulta. [Construir una pantalla](../concepts.md) presenta la intención, la presentación y la estética; esta página tiene las reglas completas para combinarlas, el aspecto por defecto de cada componente, qué clases lee cada componente y la elevación.

## Combinar clases

```html
<div class="soft">
  <button class="btn primary">Soft primary button</button>
  <span class="badge success">Soft success badge</span>
  <button class="btn primary ghost edged">Outlined: the class on the element wins</button>
</div>
```

- **La presentación se hereda.** `.solid`, `.soft`, `.ghost`, `.edged` y `.edgeless` funcionan en el componente o en cualquier contenedor, y una clase en el elemento gana a una heredada de un contenedor. Un contenedor define el aspecto de todo lo que contiene, y cualquier elemento puede elegir el suyo.
- **Las estéticas y los [tokens de material](./customizing.md#tokens-de-material) se heredan** de la misma forma.
- **La intención no se hereda.** `.primary` y las demás clases de intención colorean solo el elemento en el que están. Un contenedor que recoloreara en silencio todo lo que contiene volvería rojo el botón neutro Cancelar de una tarjeta roja de zona de peligro. `.neutral` nombra el valor por defecto; úsalo donde un elemento tomaría si no una intención, como una fila de tabla dentro de una tabla `.success`. Consulta [Temas → Tokens de intención](./theming.md#tokens-de-intención).
- **La elevación no se hereda.** `.raised` eleva solo el elemento en el que está; consulta [Elevación](#elevación).

## Valores por defecto de los componentes

Sin ninguna clase de presentación en él ni a su alrededor, cada componente tiene su propio aspecto. La "elevación en reposo" es cuánta profundidad toma cuando una [estética](./aesthetics.md) dibuja profundidad; sin estética, nada tiene sombra.

| Componente                       | Relleno        | Borde     | Elevación en reposo |
| -------------------------------- | -------------- | --------- | ------------------- |
| `.btn`                           | `.solid`       | sin borde | 1                   |
| `.card`                          | `.ghost`       | con borde | 1                   |
| `.panel`                         | `.soft`        | sin borde | 0                   |
| `.alert`                         | `.soft`        | con borde | 0                   |
| `.badge`                         | `.soft`        | sin borde | 0                   |
| `.ipt`, `.textarea`, `.select`   | `.ghost`       | con borde | 0                   |
| `.input-group`                   | `.ghost`       | con borde | 0                   |
| `.checkbox`, `.radio`, `.switch` | `.soft`        | con borde | 0                   |
| `.kbd`                           | `.soft`        | con borde | 0                   |
| `.code`, `.pre`                  | `.soft`        | sin borde | 0                   |
| `.data-table`                    | `.soft`        | sin borde | 0                   |
| `.progress` (el carril)          | `.soft`        | sin borde | 0                   |
| `.tooltip-bubble`                | `.solid`       | con borde | 0                   |
| `.quote`                         | `.ghost`       | con borde | 0                   |
| `.skeleton`, `.divider`          | Solo intención | Ninguno   | 0                   |

Un `.solid` neutro solo rellena hasta el 20%; consulta [Temas → Tokens de intención](./theming.md#tokens-de-intención). Las excepciones neutras a estos rellenos están en [Presentación](#presentación).

## Presentación

La presentación son dos elecciones separadas. `.solid`, `.soft` y `.ghost` definen cuánto del color de la intención rellena un componente. `.edged` y `.edgeless` definen si dibuja un borde. Definen [tokens de presentación](./customizing.md#tokens-de-presentación) y nada más.

| Clase       | Aspecto                                                                 | `--ui-fill` | `--ui-fg-on-fill` | `--ui-border` |
| ----------- | ----------------------------------------------------------------------- | ----------- | ----------------- | ------------- |
| `.solid`    | Relleno con el color de la intención, con texto de contraste.           | `100%`      | `100%`            |               |
| `.soft`     | Un tinte claro, con texto del color de la intención.                    | `12%`       | `0%`              |               |
| `.ghost`    | Sin relleno en reposo, con texto del color de la intención.             | `0%`        | `0%`              |               |
| `.edged`    | Un borde del color de la intención, tan grueso como define la estética. |             |                   | `100%`        |
| `.edgeless` | Sin borde.                                                              |             |                   | `0%`          |

```html
<button class="btn primary">Solid, the button default</button>
<button class="btn soft edged">Tinted, with a border</button>
<button class="btn primary ghost edged">Outline</button>
<button class="btn ghost">Ghost: picks up a tint on hover</button>
<input class="ipt soft edgeless" aria-label="Search" />
```

Una clase de relleno nunca define el borde, y una clase de borde nunca define el relleno. `.solid.edged` se ve igual que `.solid.edgeless`, porque el borde se desvanece a medida que el relleno se completa.

El borde es el contorno del componente y nada más. Las líneas dentro de un componente, como las líneas divisorias entre las filas de una tabla, son un ajuste aparte; consulta [Contenido y layout → Líneas divisorias de las tablas](./content-and-layout.md#líneas-divisorias-de-las-tablas).

### Las superficies neutras reposan sin tinte

Una `.card.soft`, un `.panel` y una `.alert` neutros no muestran tinte en reposo. Usan en su lugar el tono de fondo discreto un paso por encima de la página (`--color-foreground`), porque un tinte gris en cada caja neutra se ve sucio en lugar de discreto.

- Una `.card.soft` con `.interactive` o `.hoverable` muestra el tinte con hover. Una `.card.soft` simple y un `.panel` no tienen estado de hover.
- Con una de las seis intenciones incluidas, los tres conservan el tinte normal del 12%, y una tarjeta lo intensifica con hover. Una intención que hayas definido tú se trata aquí como neutra; consulta [Temas → Tu propia intención](./theming.md#tu-propia-intención).
- Un `.badge` conserva su tinte del 12% incluso cuando es neutro. No tiene borde, así que sin el tinte se perdería en el texto que lo rodea.

`.kbd`, `.code` y `.pre` funcionan de otra manera. Reposan sobre el tono subtle de su intención, `--intent-subtle`, que es `--color-surface` para la neutra, y una intención incluida añade encima un 12% de su color. Una intención que hayas definido tú muestra su propio tinte `--intent-subtle` sin ese 12% adicional.

### Controles de texto y toggles

- **Los controles de texto** limitan su relleno para que el texto escrito siga siendo legible: como máximo un 6% desde un contenedor, un 12% con su propio `.soft` y un 20% con su propio `.solid`. Ignoran un `.edgeless` de un contenedor y respetan el suyo. Consulta [Formularios → Relleno y borde en los controles de texto](./forms.md#relleno-y-borde-en-los-controles-de-texto).
- **Los toggles** limitan su relleno sin marcar al 40% y rellenan hasta el 100% una vez marcados. `.checkbox` y `.radio` siempre dibujan su borde, y también `.switch.ghost`. Consulta [Formularios → Colores marcado y sin marcar](./forms.md#colores-marcado-y-sin-marcar).

### Burbujas de tooltip

Una burbuja de tooltip siempre está rellena y es opaca, y dibuja un borde fino que solo quita su propio `.edgeless`. Sin intención usa `--color-tooltip`; una intención la rellena con el color de esa intención. [Tooltips → Cómo se ve la burbuja](./tooltips.md#cómo-se-ve-la-burbuja) tiene los colores.

### Carriles de progreso

`.progress` lee las dos elecciones en su carril. La parte rellena es siempre el color de la intención con toda su intensidad. `.solid` no está soportado en el carril, porque el carril y la parte rellena serían del mismo color. `.ghost.edgeless` se renderiza, pero deja el carril sin un marco visible; `.ghost.edged` dibuja un contorno a su alrededor.

### Combinaciones no soportadas

| Componente              | Clase       | Qué pasa                                                                                     |
| ----------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `.kbd`, `.code`, `.pre` | `.ghost`    | El chip sigue dibujando su fondo teñido, porque ese fondo es lo que lo convierte en un chip. |
| `.progress`             | `.solid`    | El carril y la parte rellena son del mismo color, así que el valor no se ve.                 |
| `.checkbox`, `.radio`   | `.edgeless` | Se ignora: el borde siempre se dibuja.                                                       |

## Referencia de ejes por componente

Qué clases cambian cada componente. "Material" es lo que una [estética](./aesthetics.md) puede cambiar en él: "Forma" significa esquina, grosor del borde, sombra, hover y contorno; las entradas más limitadas enumeran lo que se aplica.

| Componentes                                                     | Intención | Relleno | Borde | Material           |
| --------------------------------------------------------------- | --------- | ------- | ----- | ------------------ |
| `.btn`, `.alert`, `.badge`, `.card`, `.panel`                   | Sí        | Sí      | Sí    | Forma              |
| `.kbd`, `.data-table`                                           | Sí        | Sí      | Sí    | Esquina y borde    |
| `.quote`                                                        | Sí        | Sí      | Sí    | Grosor del borde   |
| `.divider`, `.skeleton`                                         | Sí        | No      | No    | No                 |
| `.ipt`, `.textarea`, `.select`, `.text-control`                 | Sí        | Sí      | Sí    | Forma              |
| `.input-group`                                                  | Sí        | Sí      | Sí    | Forma              |
| `.surface`                                                      | Sí        | Sí      | Sí    | Forma              |
| `.checkbox`, `.radio`                                           | Sí        | Sí      | No    | Esquina y borde    |
| `.switch`                                                       | Sí        | Sí      | Sí    | Esquina y borde    |
| `.progress`                                                     | Sí        | Sí      | Sí    | Esquina y borde    |
| `.code`, `.pre`                                                 | Sí        | Sí      | Sí    | Esquina y contorno |
| `.tooltip-bubble`                                               | Sí        | Sí      | Sí    | Forma y desenfoque |
| `.table-wrap`, `.quote-inline`, utilidades de layout y de texto | No        | No      | No    | No                 |

"Sí" significa que la clase cambia el componente, y "No" que no lo cambia; las pruebas del paquete comprueban las dos cosas. Qué hace cada componente con una clase:

| Componente                                      | Lee                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `.btn`, `.alert`, `.badge`, `.card`, `.panel`   | Relleno, color de texto, borde y grosor del borde.                                                           |
| `.kbd`                                          | Relleno, color de texto, borde y grosor del borde.                                                           |
| `.data-table`                                   | Relleno y color de texto del encabezado, borde y grosor del borde.                                           |
| `.ipt`, `.textarea`, `.select`, `.text-control` | Borde, grosor del borde y un relleno limitado.                                                               |
| `.input-group`                                  | Borde, grosor del borde y un relleno limitado.                                                               |
| `.checkbox`, `.radio`                           | Un relleno limitado, marcado y sin marcar.                                                                   |
| `.switch`                                       | Borde, grosor del borde y un relleno limitado.                                                               |
| `.quote`                                        | Relleno, color de texto, borde y grosor del borde.                                                           |
| `.code`, `.pre`, `.tooltip-bubble`              | Relleno, color de texto, borde y material.                                                                   |
| `.progress`                                     | Relleno del carril, borde y grosor del borde. La parte rellena es siempre el color completo de la intención. |
| `.skeleton`, `.divider`                         | Solo intención.                                                                                              |

Las clases de estado y los modificadores como `.interactive`, `.hoverable`, `.pressable`, `.p-sm` y `.vertical` se documentan con su componente. Un control no válido se marca con `aria-invalid="true"`, no con una clase; consulta [Formularios](./forms.md#mostrar-un-error-de-validación).

## Elevación

La elevación es cuánta profundidad toma un componente. Nada tiene sombra hasta que una [estética](./aesthetics.md) dibuja profundidad o una de estas clases la pide.

| Clase       | Profundidad                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| `.flat`     | Ninguna. Las superficies glass conservan su sombra, porque forma parte de aquello de lo que está hecho glass. |
| `.raised`   | Un escalón de la profundidad en el ámbito: tarjetas y baldosas que quedan cerca de la página.                 |
| `.floating` | Dos escalones: menús y popovers.                                                                              |

```html
<article class="card raised">Lifted</article>
<div class="floating panel">A menu</div>
<article class="card flat">Flat, whatever the aesthetic says</article>
```

Cada clase multiplica la sombra de la estética en el ámbito. El mismo `.raised` es un desenfoque suave en una página simple y una sombra dura desplazada bajo `.neobrutalism`: la estética decide cómo se ve la profundidad, y la clase decide cuánta toma este elemento.

La clase no se hereda. Eleva o aplana solo el elemento en el que está, y un elemento dentro de él no toma profundidad de él. Da a cada elemento que necesite profundidad su propia clase. La extensión (spread) de una sombra no se multiplica, porque una estética que dibuja su borde como una sombra interior usa la extensión para ese borde.

Estas clases son independientes de los tokens de sombra `--elevation-*` de [Temas → Tokens base](./theming.md#tokens-base), que son sombras fijas para los elementos a los que das estilo tú.
