---
title: Contenido y layout
description: Consulta de cada helper de layout con su espaciado, la escala tipográfica con sus tamaños, las tarjetas y los paneles con su relleno interior, las tablas, las citas, el código y las teclas.
order: 10
source: 6a638b6d6e735f1a7343bf9c6b2db131ca91fc30
---

# Contenido y layout

Esta es una página de consulta de las clases que organizan una página y dan forma a su contenido: helpers de layout, la escala tipográfica, tarjetas y paneles, tablas y los pequeños chips de contenido. [Construir una pantalla](../concepts.md#maquetar-la-página) las muestra en uso.

## Layout

La separación de todos los helpers de layout es `--layout-gap`, `1rem` por defecto. Definir `--layout-gap` en un elemento cambia la separación de todos los layouts que contiene. `.tight` y `.loose` cambian solo el layout en el que están; un layout anidado dentro conserva su propia separación.

| Clase              | Layout                                                                                                                                 | Separación                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `.stack`           | Una columna vertical.                                                                                                                  | `--layout-gap`, `.tight` 0.5rem, `.loose` 1.5rem |
| `.cluster`         | Una fila que salta de línea, con los elementos centrados en vertical. `.between` reparte los elementos hacia los dos extremos.         | Igual                                            |
| `.view`            | Un contenedor flex. `.vertical` lo convierte en una columna; `.horizontal` en una fila que salta de línea con los elementos centrados. | Igual                                            |
| `.auto-grid`       | Una cuadrícula de columnas iguales, cada una de al menos `--layout-grid-min` (16rem) de ancho, tantas como quepan.                     | Igual                                            |
| `.section`         | Relleno interior alrededor de una sección de la página: `--layout-gutter` a los lados, `--layout-section-block` arriba y abajo.        | Ninguna                                          |
| `.section-content` | Centra su contenido con un ancho de `--container-max` (80rem). `.narrow` usa 48rem, `.wide` 90rem.                                     | Ninguna                                          |
| `.divider`         | Una línea horizontal, tan ancha como su contenedor. `.vertical` la convierte en una línea vertical tan alta como la fila.              | Ninguna                                          |
| `.visually-hidden` | Oculta contenido en pantalla y lo mantiene para los lectores de pantalla.                                                              | Ninguna                                          |

`.auto-grid` coloca dos columnas de 16rem cuando su contenedor mide 32rem más la separación, tres a partir de 48rem más dos separaciones, y así sucesivamente. Por debajo del ancho de una columna, la columna se encoge para caber. Define `--layout-grid-min` en la cuadrícula para cambiar el ancho de columna.

`--layout-gutter` es `clamp(1rem, 4vw, 2rem)` y `--layout-section-block` es `clamp(4rem, 9vw, 7rem)`: los dos crecen con la ventana entre esos límites. La lista completa de tokens base está en [Temas → Tokens base](./theming.md#tokens-base).

Un `.divider` acepta una intención, que lo colorea, e ignora las clases de presentación, así que un contenedor `.ghost.edgeless` no oculta los divisores que contiene. Su grosor es el grosor de borde de la estética.

`.visually-hidden` no se llama `.sr-only` porque Tailwind incluye su propio `.sr-only`, y dos clases con el mismo nombre entrarían en conflicto.

## Tipografía

| Clase            | Tamaño                                   | Grosor   | Espaciado entre letras |
| ---------------- | ---------------------------------------- | -------- | ---------------------- |
| `.text-display`  | 3.75rem, 6rem a partir de 48rem de ancho | Bold     | Ajustado               |
| `.text-title-lg` | 3rem, 3.75rem a partir de 48rem de ancho | Bold     | Ajustado               |
| `.text-title`    | 1.875rem                                 | Bold     | Ajustado               |
| `.text-title-sm` | 1.25rem                                  | Semibold | Ajustado               |
| `.text-label-lg` | 1.125rem                                 | Medium   | Amplio                 |
| `.text-label`    | 1rem                                     | Medium   | Amplio                 |
| `.text-body`     | 0.875rem                                 | Normal   | Más amplio             |

Los dos tamaños mayores crecen en el breakpoint `md` de Tailwind, 48rem por defecto. Con los puntos de entrada de código fuente de Tailwind, se aplica tu propio breakpoint `md`. El paquete no define ningún tamaño en el texto sin clase: el texto del cuerpo y los encabezados sin clase toman el tamaño del navegador, o el tamaño del texto que los rodea con el reset; consulta [Configuración inicial → HTML sin clases](../setup.md#html-sin-clases) para el mapeo sin clases.

`.text-body` mide 0.875rem, menos que el texto de la página de 1rem; úsalo para texto secundario o denso, no para el texto principal de la página.

`.selection-contrast` en un elemento cambia los colores del texto seleccionado dentro de él a `--color-primary` sobre `--color-primary-contrast`. Úsalo en una zona `.solid.primary`, donde el color de selección por defecto coincidiría con el fondo.

## Superficies

`.card` y `.panel` son los dos contenedores. Los dos aceptan intención, [presentación](./composing.md#presentación) y [tokens de material](./customizing.md#tokens-de-material).

| Clase    | Aspecto por defecto                                                              | Relleno interior por defecto |
| -------- | -------------------------------------------------------------------------------- | ---------------------------- |
| `.card`  | Sin relleno, con borde, la esquina de superficie y una elevación en reposo de 1. | 1.25rem                      |
| `.panel` | El tono de fondo discreto, sin borde, la esquina de superficie y sin elevación.  | 1rem                         |

Una elevación en reposo de 1 no muestra ninguna sombra por sí sola. Una tarjeta solo tiene sombra bajo una [estética](./aesthetics.md) que dibuja profundidad, o con `.raised` o `.floating`; consulta [Composición → Elevación](./composing.md#elevación).

Clases de relleno interior:

| Clase     | En `.card` | En `.panel` |
| --------- | ---------- | ----------- |
| `.p-xs`   | 0.5rem     | 0.25rem     |
| `.p-sm`   | 0.75rem    | 0.5rem      |
| _ninguna_ | 1.25rem    | 1rem        |
| `.p-lg`   | 2rem       | 1.5rem      |
| `.flush`  | 0          | 0           |

`.flush` es para contenido que va de borde a borde, como una imagen o una tabla dentro de una tarjeta.

Una clase de relleno interior solo se aplica a la tarjeta o al panel en el que está. Una tarjeta o un panel anidado dentro conserva su propio relleno interior, así que una `.card.flush` que contiene un `.panel` sigue dando al panel 1rem de relleno interior.

Un panel es para barras laterales, barras de herramientas y zonas hundidas: áreas que forman parte de la página, no objetos sobre ella. Una tarjeta es un objeto independiente, como la tarjeta de perfil o la tarjeta del plan de la pantalla de ajustes.

### Tarjetas y paneles neutros

Una `.card.soft` neutra y un `.panel` neutro no muestran tinte: reposan sobre el tono de fondo discreto un paso por encima de la página, así que se leen como un área aparte sin llamar la atención. Con una intención incluida toman el tinte normal. [Composición → Las superficies neutras reposan sin tinte](./composing.md#las-superficies-neutras-reposan-sin-tinte) tiene los detalles, incluido el hover.

### Tarjetas clicables

| Clase          | Efecto                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `.interactive` | Cursor de puntero, color de hover, pulsación y anillo de foco. Lo mismo que `.hoverable` y `.pressable` juntas. |
| `.hoverable`   | Solo el color de hover, sin cursor de puntero.                                                                  |
| `.pressable`   | Solo la pulsación y el cursor de puntero.                                                                       |

Con el aspecto por defecto, una pulsación reduce ligeramente la tarjeta (`scale(0.97)`); una estética puede reemplazarla con su propia pulsación, y la preferencia de movimiento reducido la desactiva.

Usa una de las dos mitades para una tarjeta que responde solo a un gesto. Una tarjeta que contiene su propio botón lleva `.hoverable`, para que pulsar el botón no pulse toda la tarjeta.

```html
<article class="card">Neutral card</article>
<article class="card success solid">Filled success card</article>
<article class="card primary ghost edged">Intent border, no fill</article>
<a class="card success soft interactive" href="/settings/billing">Billing: tinted at rest, deeper on hover</a>
<article class="card hoverable">Tinted on hover; the action is a nested button</article>
<aside class="panel">A sidebar</aside>
```

Estas clases solo dan estilo. Ponlas en un enlace o un botón reales y dales un nombre accesible; un `<div class="card interactive">` no puede recibir el foco ni usarse con el teclado.

## Tablas

La pantalla de ajustes enumera las claves de API en una tabla:

```html
<div class="table-wrap">
  <table class="data-table">
    <caption class="visually-hidden">
      API keys
    </caption>
    <thead>
      <tr>
        <th scope="col">Name</th>
        <th scope="col">Created</th>
        <th scope="col">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Deploy bot</td>
        <td>3 March 2026</td>
        <td>Active</td>
      </tr>
      <tr class="destructive">
        <td>Old laptop</td>
        <td>12 June 2024</td>
        <td>Revoked</td>
      </tr>
    </tbody>
  </table>
</div>
```

| Clase         | Efecto                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.data-table` | Da estilo a una `<table>`: ancho completo, texto `.text-body`, un fondo de encabezado, la esquina de superficie, relleno interior en las celdas y un color de hover en las filas del cuerpo. |
| `.table-wrap` | Hace que una tabla tenga scroll horizontal cuando es más ancha que su contenedor.                                                                                                            |
| `.ruled`      | En `.data-table`. Dibuja una línea entre las filas del cuerpo.                                                                                                                               |
| `.ruleless`   | En `.data-table`. No dibuja ninguna línea dentro de la tabla.                                                                                                                                |

### Intención de las filas

Las filas de una tabla toman la intención de la tabla, así que `.data-table.success` colorea de verde su encabezado y sus líneas. Una fila con su propia clase de intención usa esa en su lugar, como hace el `<tr class="destructive">` de la clave revocada. `<tr class="neutral">` devuelve una fila a neutra dentro de una tabla de color. En una tabla `.solid`, una fila con su propia intención conserva el color de texto de la tabla para seguir siendo legible sobre el relleno de la tabla, y muestra su intención con su línea divisoria y su hover. Es el único lugar en el que una intención se hereda, porque las filas son partes de la tabla, no componentes separados.

### Líneas divisorias de las tablas

Una tabla dibuja líneas debajo de su encabezado y encima de su pie. `.ruled` y `.ruleless` las cambian junto con las líneas entre las filas del cuerpo:

| Clase       | Debajo del encabezado y encima del pie | Entre las filas del cuerpo |
| ----------- | -------------------------------------- | -------------------------- |
| `.ruleless` | No                                     | No                         |
| _ninguna_   | Sí                                     | No                         |
| `.ruled`    | Sí                                     | Sí                         |

`--ui-rule` es el token detrás de las dos clases, así que un contenedor puede poner líneas en todas las tablas que contiene: `style="--ui-rule: 100%"` actúa como `.ruled`, y `0%` como `.ruleless`.

El marco alrededor de la tabla es aparte: una tabla no tiene borde por defecto, y `.edged` le añade uno. Las tres elecciones no se afectan entre sí, así que `.data-table.ruleless.edged` es una tabla con marco y sin líneas dentro, y `.data-table.ruled` tiene todas las filas separadas y ningún marco.

### Presentación en las tablas

Una tabla lee la [presentación](./composing.md#presentación) en su encabezado, sus líneas y su borde:

```html
<table class="data-table success soft edged">
  …
</table>
<table class="data-table ghost">
  <!-- Sin fondo de encabezado: solo líneas y texto -->
</table>
```

- `.soft`, el valor por defecto, da al encabezado el tono de fondo discreto, `--color-foreground`, con cualquier intención. Una tabla no tiene estado de hover para un tinte, así que una `.data-table.success.soft` no se vuelve verde; sus líneas y su borde sí.
- `.ghost` quita el fondo del encabezado y deja las líneas y el texto.
- `.solid` rellena el encabezado con el color de la intención.

### Esquinas y scroll

Una tabla toma la esquina de superficie, como una tarjeta a su lado. Las celdas de las esquinas llevan las esquinas, así que un `<caption>` encima de la tabla no queda recortado en ningún navegador. Una celda que ocupa varias filas hasta una esquina inferior deja esa esquina recta.

`.table-wrap` tiene scroll, y un elemento con scroll recorta todo lo que se dibuja fuera de él, incluido un tooltip en una celda; consulta [Tooltips → Dónde queda recortado un tooltip](./tooltips.md#dónde-queda-recortado-un-tooltip).

- Bajo una estética que dibuja un resplandor alrededor de los componentes, como `.cyber`, el contenedor deja espacio para el resplandor para que no quede recortado. El contenedor se extiende entonces esa distancia más allá de su padre, lo que solo se nota cuando el padre toca el borde de la ventana.
- El contenedor solo puede dejar espacio para el resplandor de una estética que lo rodea. Pon la clase de estética en `.table-wrap` o en un elemento por encima, no solo en la tabla.
- Las sombras, como la de una tabla `.raised`, no reciben espacio y quedan recortadas.

Mantén el contenedor en cualquier tabla que pueda ser más ancha que su contenedor; sin él, una tabla ancha ensancha toda la página.

## Citas, código y teclas

| Clase           | Uso                                                                                     | Aspecto por defecto                 | La intención colorea |
| --------------- | --------------------------------------------------------------------------------------- | ----------------------------------- | -------------------- |
| `.quote`        | Un `<blockquote>`. Un `<cite>` dentro se muestra en redonda y toma el color de la cita. | Una barra al principio, sin relleno | Barra, fondo, texto  |
| `.quote-inline` | Una cita en línea `<q>`.                                                                | Solo el estilo de cita              | Nada                 |
| `.kbd`          | Una tecla que pulsa el usuario, como <kbd>Ctrl</kbd>.                                   | Un chip teñido con borde            | Fondo, borde, texto  |
| `.code`         | Código en línea.                                                                        | Un chip teñido sin borde            | Fondo, texto         |
| `.pre`          | Un bloque de código. Tiene scroll horizontal cuando una línea es demasiado larga.       | Un bloque teñido sin borde          | Fondo, texto         |

```html
<p>Press <kbd class="kbd">Ctrl</kbd> + <kbd class="kbd">K</kbd> to search members.</p>
<p>Use the <code class="code">Authorization</code> header with your API key.</p>
<kbd class="kbd primary solid">Ctrl</kbd>
<kbd class="kbd primary soft edged">Shift</kbd>
```

Un `.kbd`, un `.code` o un `.pre` reposa sobre el tono subtle de su intención, `--color-surface` para la neutra, y una clase de intención incluida añade encima un 12% de su color. `.ghost` no está soportado en estos tres: el fondo teñido es lo que los convierte en chips, así que lo conservan y `.ghost` no cambia nada. Su fuente es `--font-mono`; consulta [Temas → Fuentes](./theming.md#fuentes).

## Siguiente paso

[Accesibilidad](../accessibility.md) enumera lo que el CSS hace por tus usuarios y lo que tu aplicación todavía les debe.
