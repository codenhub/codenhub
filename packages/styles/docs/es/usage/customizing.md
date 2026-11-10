---
title: Personalización
description: Consulta de los tokens de presentación y de material, los controles de las estéticas, las seis variables públicas de componente, la paleta generada y los helpers para construir tus propios componentes.
order: 9
source: 37e5fd58940cc8af4ab8e51d70d2845dc3e52d2e
---

# Personalización

Esta es una página de consulta para cambiar el paquete más allá de sus clases. [Temas](./theming.md) cubre los colores y los tokens base; esta página cubre el resto:

- [Tokens de presentación](#tokens-de-presentación): cuánto de una intención muestra un componente.
- [Tokens de material](#tokens-de-material): de qué está hecho un componente.
- [Tokens de estética](#tokens-de-estética): los controles que expone cada estética.
- [Variables de componente](#variables-de-componente): las seis variables que lee un único componente.
- [Paleta generada](#paleta-generada): valores de color fijos para el código que no puede cargar el paquete.
- [Helpers de composición](#helpers-de-composición): las clases con las que construir un componente propio.

## Tokens de presentación

Los tokens de presentación describen _cuánto_ de una intención muestra un componente, nunca _qué_ intención muestra. Son números y porcentajes sin unidad, así que no llevan color y se heredan sin riesgo: un contenedor los define una vez y cada componente de debajo los resuelve con su propia intención.

| Token             | Propósito                                                                                                       | Valor por defecto                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `--ui-fill`       | Porcentaje del color de la intención mezclado en el fondo.                                                      | El valor por defecto del componente; consulta más abajo. |
| `--ui-fg-on-fill` | Porcentaje de mezcla desde el tono strong de la intención hacia su color de contraste.                          | El valor por defecto del componente.                     |
| `--ui-border`     | Porcentaje del color de borde de la intención en el borde.                                                      | El valor por defecto del componente.                     |
| `--hover-step`    | Se suma al relleno en reposo bajo el puntero, en `--intent-hover`. Defínelo en `:root` o en cualquier elemento. | `14%`                                                    |

Sin definir, cada componente usa su propio valor por defecto, que aparece en [Composición → Valores por defecto de los componentes](./composing.md#valores-por-defecto-de-los-componentes). Las clases de presentación definen los tres primeros con los valores de [Composición → Presentación](./composing.md#presentación). No hay tokens de hover por presentación: el hover es siempre el relleno en reposo más `--hover-step`, hasta el 100%.

Ninguna clase de relleno escribe `--ui-border` y ninguna clase de borde escribe `--ui-fill`. Una caja rellena sin línea es `.solid.edgeless`, y `.solid.edged` renderiza la misma caja: la línea se desvanece a medida que el relleno se completa, así que incluso un relleno neutro, limitado y translúcido, se ve a través de su propio borde como una sola capa.

```css
background: color-mix(in oklab, var(--color-primary) var(--ui-fill, 100%), transparent);
```

Ahí hay dos decisiones deliberadas. Mezclar hacia `transparent` en lugar de hacia un token de fondo permite que una superficie teñida se adapte a lo que tenga debajo. Mezclar en `oklab` conserva intacta la paleta de tokens de gama amplia y mezcla de forma perceptual, mientras que `srgb` la recortaría.

Por eso un color calculado llega a la página como un resultado de `color-mix` resuelto y no con la sintaxis `oklch` del propio token. Es el mismo color; el código que compara cadenas de colores calculados debería comparar colores.

> **Contrato de los tokens de presentación**: solo las clases de presentación y las sobrescrituras del consumidor definen estos tokens; los componentes solo los leen. Definir un valor que ninguna clase de presentación produce está soportado, pero no validado. Consulta [Composición](./composing.md) para ver las clases que incluyen estos valores.

## Tokens de material

Los tokens de material describen de qué está _hecho_ un componente, no qué intención muestra ni con cuánta intensidad. Controlan la forma, los bordes, las sombras, la translucidez, los filtros y las transformaciones.

Los componentes leen cada uno con un valor de respaldo, así que dejarlos sin definir da el aspecto por defecto. Definidos en un contenedor, cambian el estilo de todo lo que contiene. La única excepción es `--ui-elevation`, que no se hereda, así que solo llega al elemento en el que se define; consulta [Composición → Elevación](./composing.md#elevación).

La geometría de la sombra se divide en partes sin color, así que se heredan sin riesgo. Los tokens que reciben un color, como `--ui-ink` y `--ui-surface-shadow`, pueden incluir el suyo.

| Token                     | Propósito                                                                                                                                                                           | Respaldo                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `--ui-corner`             | Esquina de control en el tamaño por defecto; se escala con el escalón de tamaño.                                                                                                    | `--radius-control`                                      |
| `--ui-corner-surface`     | Esquina de superficie con el relleno interior por defecto; se escala con el escalón de tamaño.                                                                                      | `--radius-surface`                                      |
| `--ui-corner-tl`          | `0` o `1`: si la esquina superior izquierda toma la esquina. `-tr`, `-br` y `-bl` para las demás.                                                                                   | `1`                                                     |
| `--ui-radius`             | Un radio de control completo, usado tal cual: sobrescribe la esquina, el escalón y el patrón.                                                                                       | Calculado a partir de la esquina                        |
| `--ui-radius-surface`     | Un radio de superficie completo, usado tal cual.                                                                                                                                    | Calculado a partir de la esquina                        |
| `--ui-scale`              | Sobrescribe el escalón de tamaño que definen las clases de tamaño y de relleno interior.                                                                                            | El escalón                                              |
| `--ui-corner-shape`       | Lo que dibuja cada esquina: `round`, `bevel` para un corte recto o `squircle` para una curva continua. Hoy solo en Chromium.                                                        | `round`                                                 |
| `--ui-radius-pill`        | Esquina de lo que es completamente redondo por defecto: badges, switches, progreso, el icono del tooltip; `.btn.pill` y `.radio` lo leen sin otro respaldo que el redondo completo. | `--ui-radius`, `--ui-corner` y después redondo completo |
| `--ui-radius-tight`       | Radio completo para los chips, como un checkbox, `.kbd` o `.code`, cuando está definido. Sin definir, un pequeño valor por defecto calculado.                                       | `min(--ui-radius o --ui-corner, pequeño)`               |
| `--ui-line-style`         | Estilo de cada línea que dibuja un componente: `solid`, `dashed`, `dotted` o `double` (de 3px de ancho o más).                                                                      | `solid`                                                 |
| `--ui-border-width`       | Grosor del borde.                                                                                                                                                                   | `--border-width`                                        |
| `--ui-border-max`         | Tope del grosor de borde calculado.                                                                                                                                                 | `100px`                                                 |
| `--ui-ink`                | Color de línea neutro cuando no hay intención.                                                                                                                                      | `--color-border`                                        |
| `--ui-control-ink`        | Color de línea neutro de campos, selects, checkboxes, radios y switches cuando no hay intención.                                                                                    | `--ui-ink` y después `--color-control-border`           |
| `--ui-rule-ink`           | Color de línea neutro del marco y las líneas divisorias de una tabla cuando no hay intención.                                                                                       | `--ui-ink` y después `--color-border`                   |
| `--ui-rule`               | Líneas dentro de una tabla. Sin definir dibuja solo los límites del encabezado y del pie; `0%` no dibuja ninguna; `100%` separa cada fila.                                          | sin definir                                             |
| `--ui-shadow-x`           | Desplazamiento horizontal de la sombra.                                                                                                                                             | `0px`                                                   |
| `--ui-shadow-y`           | Desplazamiento vertical de la sombra.                                                                                                                                               | `0px`                                                   |
| `--ui-shadow-blur`        | Radio de desenfoque de la sombra.                                                                                                                                                   | `0px`                                                   |
| `--ui-shadow-spread`      | Radio de extensión de la sombra.                                                                                                                                                    | `0px`                                                   |
| `--ui-shadow-inset`       | La palabra clave `inset` para un anillo interior.                                                                                                                                   | Vacío                                                   |
| `--ui-hover-shadow-x`     | Desplazamiento horizontal de la sombra con hover.                                                                                                                                   | `--ui-shadow-x`                                         |
| `--ui-hover-shadow-y`     | Desplazamiento vertical de la sombra con hover.                                                                                                                                     | `--ui-shadow-y`                                         |
| `--ui-active-shadow-x`    | Desplazamiento horizontal de la sombra al pulsar.                                                                                                                                   | `--ui-shadow-x`                                         |
| `--ui-active-shadow-y`    | Desplazamiento vertical de la sombra al pulsar.                                                                                                                                     | `--ui-shadow-y`                                         |
| `--ui-active-transform`   | Transformación al pulsar. Se conserva con `prefers-reduced-motion`, que solo quita su transición.                                                                                   | `scale(0.97)`                                           |
| `--ui-active-translate-x` | Distancia que recorre una pulsación hacia la profundidad del elemento; `-y` a su lado. Se escala como la sombra.                                                                    | `0px`                                                   |
| `--ui-shadow-ink`         | Porcentaje del color de la sombra tomado de la tinta de la intención.                                                                                                               | `0%`                                                    |
| `--ui-halo-blur`          | Desenfoque de un halo alrededor del elemento; `--ui-halo-spread` a su lado. La elevación no lo escala.                                                                              | `0px`                                                   |
| `--ui-halo-ink`           | La proporción del color de la intención en el halo, sobre nada. Sin definir, no hay halo.                                                                                           | Sin definir                                             |
| `--ui-shadow-edge`        | Se declara, aunque esté vacío, cuando la sombra es el borde del elemento y no su profundidad. Se lee por su presencia.                                                              | Sin definir                                             |
| `--ui-elevation`          | Multiplicador sin unidad sobre la geometría de la sombra. No se hereda.                                                                                                             | `1`                                                     |
| `--ui-surface-shadow`     | Sombra completa de varias capas, aceptada solo por las superficies.                                                                                                                 | Sin definir                                             |
| `--ui-surface-ground`     | Fondo sobre el que se apoya una superficie, o una tabla por defecto o `.soft`.                                                                                                      | `--color-background`                                    |
| `--ui-bg-alpha`           | Multiplicador sobre cada relleno, incluido `.solid`. Ninguna estética incluida lo define.                                                                                           | `1`                                                     |
| `--ui-backdrop`           | Filtro de fondo aceptado solo por las superficies y por una tabla por defecto o `.soft`.                                                                                            | `none`                                                  |
| `--ui-surface-image`      | Una capa pintada sobre la placa de una superficie: cualquier valor de `background-image`. Solo superficies.                                                                         | `none`                                                  |
| `--ui-hover-transform`    | Transformación mientras un elemento interactivo tiene hover.                                                                                                                        | `none`                                                  |
| `--ui-clip`               | Silueta estructural del componente.                                                                                                                                                 | `none`                                                  |
| `--ui-clip-tight`         | Silueta compacta del componente.                                                                                                                                                    | `--ui-clip`                                             |
| `--ui-focus-inset`        | Grosor de la capa de foco interior.                                                                                                                                                 | Sin definir                                             |
| `--ui-label-weight`       | Grosor de la etiqueta de `.btn` (y, con `/native`, de un `<button>` sin clase) y de `.badge`.                                                                                       | Semibold en un botón, bold en un badge                  |
| `--ui-label-tracking`     | Espaciado entre letras de la etiqueta. Sin definir, es `normal`, así que ni el espaciado de la página ni el de un contenedor llega a la etiqueta.                                   | `normal`                                                |
| `--ui-label-case`         | `text-transform` de la etiqueta.                                                                                                                                                    | `none` en un botón; heredado en un badge                |
| `--ui-label-shadow`       | `text-shadow` de la etiqueta, escrito sin color para que tome el de la propia etiqueta.                                                                                             | `none` en un botón; heredado en un badge                |

```html
<section style="--ui-corner: 0; --ui-border-width: 3px">
  <button class="btn primary">Square and heavy</button>
  <input class="ipt" placeholder="Matches" />
</section>
```

> **Contrato de los tokens de material**: los componentes los leen; las clases de estética y las sobrescrituras del consumidor los definen.

### Tamaño y patrón de las esquinas

La esquina escala con el elemento. `.p-xs` define un escalón de tamaño de `0.5`, `.sm` y `.p-sm` de `0.75`, y `.lg` y `.p-lg` de `1.25`. Cuando una clase de tamaño y una de relleno interior están en un mismo elemento, gana el escalón menor, así que `.lg.p-xs` es pequeño. `box` multiplica `--ui-corner` por el escalón, así que un botón pequeño toma una esquina pequeña y un bisel sigue siendo de 45 grados exactos. La profundidad sigue al escalón hacia abajo pero no hacia arriba: un botón `.p-xs` se apoya sobre la mitad de la sombra de su estética, y uno `.lg` sobre la sombra entera. Una pulsación que se mete en esa profundidad, indicada con `--ui-active-translate-x` y `-y`, recorre la misma distancia escalada, así que siempre termina a ras.

Qué esquinas toman la esquina es una elección aparte. `.cut-diagonal` conserva la superior izquierda y la inferior derecha y deja rectas las otras dos; `.cut-diagonal-reverse` conserva el otro par. Las dos definen `--ui-corner-tl`, `-tr`, `-br` y `-bl`, que también puedes definir tú: una hoja de dos esquinas con el aspecto por defecto, dos cortes en un control bajo `.cyber`. Una superficie bajo `.cyber` conserva la forma de superficie propia de la estética, a la que el patrón no llega, y un `--ui-radius` o `--ui-radius-surface` explícito ignora el escalón y el patrón.

### Líneas, capas y etiquetas

`--ui-line-style` llega a cada línea que dibuja un componente: el borde de la caja, el carril de progreso y los divisores y las líneas divisorias de las tablas. `--ui-rule-style` sobrescribe opcionalmente solo los divisores y las líneas divisorias de las tablas, sin cambiar el borde de la caja; sketch lo usa para sus detalles discontinuos. Una línea discontinua o punteada conserva su color, así que conserva su contraste. Una línea `double` necesita un grosor de 3px o más para dibujar dos líneas.

`--ui-halo-*` es luz y no profundidad: un resplandor en el propio color de intención del elemento. La elevación no lo escala, y `.flat` no lo quita. Solo aparece cuando su tinta está definida.

`--ui-surface-image` pone cualquier `background-image` sobre la placa de una superficie: tarjetas, paneles, alertas y tooltips, no controles. Quien lo define es responsable del contraste del texto que queda encima, y tu propio `background-image` en una superficie sigue ganando.

`--ui-label-*` trata la etiqueta de un botón o de un badge: grosor, espaciado entre letras, mayúsculas y una sombra de texto. Escribe la sombra sin color, como `0 0 6px`, para que tome el color de la propia etiqueta y no pueda reducir su contraste. Tus propias utilidades `font-*`, `tracking-*` y de mayúsculas siguen ganando. Una etiqueta no hereda el espaciado entre letras, así que una utilidad `tracking-*` en un contenedor deja sus botones y badges en `normal`; para espaciar todas las etiquetas de una región, define `--ui-label-tracking` en ella, que la heredan.

Con colores forzados, cada uno de estos dibuja su versión simple: una línea continua, sin halo, sin capa pintada y sin sombra de etiqueta. La silueta y el anillo de abajo también desaparecen. Los colores forzados eliminan todas las sombras de caja, así que `--ui-clip`, `--ui-clip-tight`, `--ui-border-max` y `--ui-shadow-edge` se anulan y un componente dibuja su borde real con `--ui-border-width`.

### Composición de forma y anillo

El recorte elimina los bordes, los outlines y las sombras exteriores. Una estética que usa un recorte puede reemplazar el borde con una sombra interior definiendo `--ui-shadow-inset` y las cuatro partes de la geometría de la sombra. Define `--ui-border-max: 0px` cuando ese anillo reemplaza el borde del componente. Los componentes que pueden recibir el foco recuperan el outline de foco recortado mediante `--ui-focus-inset`: una capa interior de ese grosor en `--focus-ring`, con una línea de 2px de `--color-background` dentro, para que el foco se siga viendo en un componente relleno con el propio color del anillo.

Un recorte no es la única forma de cortar una esquina. `--ui-corner-shape: bevel` dibuja la esquina que define el radio como un corte recto en lugar de un arco, y el borde, la sombra exterior, el outline de foco y el fondo desenfocado la siguen. Por eso un elemento biselado conserva su resplandor y su línea, mientras que uno recortado pierde los dos. `.cyber` lo usa. Los motores sin `corner-shape` lo ignoran y dibujan el radio redondo, así que una estética que bisela debería dejar recto su radio bajo `@supports not (corner-shape: bevel)`. Un bisel sobre un radio completo corta en puntas: un radio, un `.btn.pill` y todo lo que lea `--ui-radius-pill` se convierten en rombos o hexágonos con puntas.

`--ui-radius` acepta cualquier valor de `border-radius` y se usa tal cual, así que puede colocar la esquina por lado: `10px 0` corta solo la superior izquierda y la inferior derecha. Las esquinas pill y de chip son tokens aparte. Una esquina de chip sin definir calcula un pequeño valor por defecto a partir de `--ui-radius`, y después de `--ui-corner`, con `--radius-small` como tope; un `--ui-radius-tight` explícito se usa tal cual, incluso para un valor por esquina o elíptico. Por eso las sobrescrituras de las estéticas y del consumidor pueden dar a un chip una forma mayor o más irregular. `.btn.pill` toma `--ui-radius-pill` antes que los demás radios; bajo sketch toma un contorno de píldora irregular dibujado a mano cuyos extremos mantienen el mismo tamaño. Un `--ui-radius-pill` explícito en ese botón sigue ganando.

Declara `--ui-shadow-edge` cuando ese anillo _es_ el borde. Entonces el anillo toma el color del borde del elemento, que lleva el eje de borde como su alfa, así que `.edged` lo dibuja y `.edgeless` no: la misma respuesta que da un borde real. Sin él, el anillo se pinta en cada componente al que llega la estética y las clases de borde no tienen efecto. Usa en su lugar `--ui-shadow-ink` cuando la sombra es profundidad proyectada en la propia tinta de la intención, como una losa dura desplazada, que un elemento `.edgeless` sigue recibiendo.

El token se lee por su presencia, no por su valor: decláralo vacío para activar el anillo, e `initial` para volver a desactivarlo en una estética anidada dentro de otra que lo declara.

```css
.stepped {
  --ui-clip: polygon(/* silueta estructural */);
  --ui-clip-tight: none;
  --ui-border-max: 0px;
  --ui-shadow-inset: inset;
  --ui-shadow-edge: ;
  --ui-shadow-x: 0px;
  --ui-shadow-y: 0px;
  --ui-shadow-blur: 0px;
  --ui-shadow-spread: 4px;
  --ui-focus-inset: var(--focus-ring-width);
}
```

Las variables con el prefijo `--_` son salidas internas de la composición: `--_bg`, `--_fg`, `--_edge`, `--_fill`, `--_shadow` y los huecos de reposo `--_d-*` que un componente declara para que los lea `box`. No las definas ni las leas; solo las entradas `--ui-*` de arriba son públicas.

## Tokens de estética

Las [clases de estética](./aesthetics.md) incluidas definen los tokens de material por ti. Solo las estéticas con un token en la lista de abajo exponen un token propio. Ajusta el resto del comportamiento mediante los tokens de material compartidos de arriba. Los tokens de la lista solo están disponibles donde se importa la hoja de estilos de esa estética.

| Token                             | Estética                     | Propósito                                                                                                                     | Valor por defecto                                                        |
| --------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `--neo-offset`                    | `.neobrutalism`              | Desplazamiento de la sombra dura y distancia que recorre la pulsación.                                                        | `4px`                                                                    |
| `--glass-radius`                  | `.glass`, `.glass-liquid`    | Radio de la esquina de control. `1rem` con `.glass-liquid`.                                                                   | `0.75rem`                                                                |
| `--glass-radius-surface`          | `.glass`, `.glass-liquid`    | Radio de la esquina de superficie. `1.5rem` con `.glass-liquid`.                                                              | `1rem`                                                                   |
| `--pixel-unit`                    | `.pixel`                     | Un píxel de la cuadrícula. El corte de la esquina y el anillo miden uno.                                                      | `4px`                                                                    |
| `--font-pixel`                    | `.pixel`                     | Pila de fuentes pixeladas que aporta el consumidor.                                                                           | Recurre a la pila monoespaciada                                          |
| `--tile-radius`                   | `.chunky-tile`               | Radio de la esquina, igual en controles y superficies.                                                                        | `0.75rem`                                                                |
| `--tile-lift`                     | `.chunky-tile`               | Profundidad de la barra de apoyo y distancia que recorre una pulsación.                                                       | `4px`                                                                    |
| `--font-rounded`                  | `.chunky-tile`               | Pila de fuentes redondeadas que aporta el consumidor.                                                                         | Recurre a la pila de la página                                           |
| `--cyber-cut`                     | `.cyber`                     | El corte en el tamaño por defecto, igual en controles y superficies; los controles lo escalan con el escalón.                 | `0.625rem`                                                               |
| `--cyber-shape`                   | `.cyber`                     | Dónde toman el corte los controles: cualquier valor de `border-radius`.                                                       | `<cut> 0` (superior izquierda, inferior derecha)                         |
| `--cyber-shape-surface`           | `.cyber`                     | Dónde toman el corte las superficies: cualquier valor de `border-radius`.                                                     | `0 <cut>` (superior derecha, inferior izquierda)                         |
| `--cyber-glow`                    | `.cyber`                     | Desenfoque del resplandor.                                                                                                    | `8px`                                                                    |
| `--cyber-ink`                     | `.cyber`                     | Color neutro de la línea y del resplandor, donde ninguna intención define uno.                                                | Tinta del tema (casi negro, casi blanco)                                 |
| `--font-cyber`                    | `.cyber`                     | Pila de fuentes técnicas que aporta el consumidor.                                                                            | Recurre a la pila monoespaciada                                          |
| `--sketch-radius`                 | `.sketch`                    | Radio del contorno de los controles: cualquier valor de `border-radius`.                                                      | Contorno de caja irregular con variación entre hermanos                  |
| `--sketch-radius-surface`         | `.sketch`                    | Radio del contorno de los contenedores de superficie: cualquier valor de `border-radius`.                                     | Contorno cuadrado, irregular y marcado, con variación entre hermanos     |
| `--sketch-radius-rounded`         | `.sketch`, `.sketch-rounded` | Radio del contorno redondeado de los controles: un contorno elíptico expresivo con variación entre hermanos.                  | `26px 10px 24px 11px / 12px 23px 11px 20px` con variación entre hermanos |
| `--sketch-radius-surface-rounded` | `.sketch`, `.sketch-rounded` | Radio del contorno redondeado de los contenedores de superficie: un contorno elíptico expresivo con variación entre hermanos. | `38px 16px 36px 17px / 16px 34px 17px 32px` con variación entre hermanos |
| `--sketch-radius-pill`            | `.sketch`                    | Radio del contorno de un botón pill: una píldora irregular dibujada a mano cuyos extremos mantienen el mismo tamaño.          | `24px 16px 23px 17px / 17px 21px 16px 20px` con variación entre hermanos |
| `--font-sketch`                   | `.sketch`                    | Pila de fuentes manuscritas que aporta el consumidor.                                                                         | Recurre a `cursive`                                                      |

Los controles de todas las estéticas llegan de la misma forma: cada control se _lee_ con su valor por defecto como respaldo de `var()` en lugar de declararse, así que se resuelve una sola vez en una variable privada en la propia clase de la estética (`--_pixel-unit`, `--_neo-offset`, `--_tile-radius`, `--_tile-lift`, etc.). Define un control en el elemento que lleva la clase de estética, o en cualquier ancestro, incluido `:root`:

```html
<section class="pixel" style="--pixel-unit: 6px">
  <button class="btn primary">Chunkier</button>
</section>
```

```html
<html class="pixel" style="--pixel-unit: 6px">
  <body>
    <button class="btn primary">Also chunkier, set from the root</button>
  </body>
</html>
```

Los controles y los tokens de material llegan en direcciones opuestas. Un control se lee una vez, en el elemento con la clase de estética, y el resultado se hereda. Así que define un control en ese elemento o en uno por encima; definido en un elemento dentro de la estética, no cambia nada, porque el valor ya se ha leído.

Cada componente lee `--ui-radius` y los demás tokens de material al dibujarse. Funcionan en el elemento en el que se definen y en todo lo que contiene, que es como redondeas una tarjeta de forma distinta a sus vecinas sin tocar el control.

Las estéticas incluidas definen los tokens de material compartidos de arriba. Todas las estéticas incluidas definen `--ui-ink` para su línea neutra. Todas definen también `--ui-control-ink`: `.glass` y `.chunky-tile` con una línea propia, más intensa que la de sus superficies, y las demás con `--color-control-border`, ya que su tinta es casi negra o casi blanca y un checkbox en reposo con ese contorno parecería marcado. `.glass` define además `--ui-rule-ink`, para que las líneas de una tabla se lean sobre su placa; las demás lo anulan. Las clases de intención siguen sobrescribiendo los huecos de intención de cada componente.

Los mismos controles ajustan la [clase solo](./solo.md) de cada estética, que los lee en su propio elemento.

## Paleta generada

`@codenhub/styles/palette` es una hoja de estilos generada de colores fijos: para cada intención y presentación, el color de fondo, de texto y de borde que dibujaría un componente, como custom properties `--palette-*` planas. Es para el código que no puede cargar la hoja de estilos de este paquete pero quiere coincidir con ella, como una librería que tiene `@codenhub/styles` como peer opcional. Donde puedas cargar la hoja de estilos, usa los componentes.

**Los valores son una instantánea de los colores incluidos.** Se calcularon a partir del tema por defecto del paquete al hacer el build, y no cambian cuando sobrescribes un token. Si defines `--color-primary` con el color de tu marca, `--palette-primary-solid-bg` sigue siendo el casi negro incluido. El código que deba seguir a tu tema tiene que leer los tokens `--color-*`, lo que implica cargar `@codenhub/styles/theme`.

```css
@import "@codenhub/styles/palette";
```

```css
.my-badge {
  background: var(--palette-success-soft-page-bg);
  color: var(--palette-success-soft-fg);
  border-color: var(--palette-success-soft-page-edge);
}
```

Cada valor es un color final, nunca una referencia a otra variable, así que el archivo no necesita que se cargue nada más.

Nombres: `--palette-<intent>-<presentation>-<slot>`, donde `<intent>` es una de las siete intenciones publicadas (`neutral`, `primary`, `secondary`, `success`, `warning`, `destructive`, `info`) y `<presentation>` es `solid`, `soft` o `ghost`. `<slot>` es `bg`, `fg` o `edge`. Dos calificadores se añaden solo donde aplican:

- Un calificador de fondo, `page` o `subtle`, antes del hueco. Solo aparece en el `bg` y el `edge` de `.soft` y `.ghost`, porque un relleno `.solid` cubre su fondo y el color del texto nunca depende de él.
  - Sin calificador es lo que dibujan `.badge` y `.btn`, sobre un fondo transparente: `--palette-success-soft-bg`.
  - `page` es lo que dibuja `.alert`, sobre la página: `--palette-success-soft-page-bg`.
  - `subtle` es lo que dibujan `.kbd`, `.code` y `.pre`, sobre el propio tono sutil de la intención: `--palette-success-soft-subtle-bg`.

  Cada valor se lee del propio componente, así que incluye lo que el componente hace por su cuenta. Un `.alert`, `.kbd`, `.code` o `.pre` neutral conserva un relleno más discreto que un `.badge` neutral, y sus valores `neutral-soft-page` y `neutral-soft-subtle` lo reflejan. `.tooltip-bubble` no coincide con ninguno de los tres: sin intención se rellena con su propio tono de tooltip, y su borde es sólido en vez de atenuado.

- Un sufijo `-hover`, solo en `bg` y `edge`, porque el color del texto no cambia con hover: `--palette-success-soft-page-bg-hover`. `.alert`, `.kbd`, `.code` y `.pre` no tienen hover propio, así que sus valores de hover son lo que dibuja el componente cuando le añades `box-hover`.

Los valores claros se definen en `:root`. Los oscuros se aplican bajo `.dark`, `.theme-dark` o `[data-theme="dark"]` en el elemento o en uno por encima, los mismos selectores que usa el tema del paquete. Los valores claros también se aplican bajo `.light`, `.theme-light` y `[data-theme="light"]`, así que gana el tema explícito más cercano: una zona clara dentro de una oscura lee los valores claros.

El archivo no sigue `prefers-color-scheme`. El código que usa la paleta por sí sola ya cambia de tema por su cuenta, así que define una de esas clases o atributos.

Otros tres tokens no tienen intención, presentación, fondo ni hover: `--palette-border`, `--palette-surface` y `--palette-text`, valores fijos de `--color-border`, `--color-surface` y `--color-text`. Son para lo que no tiene color de intención, como el borde de un contenedor, el fondo de un diálogo y su texto.

## Variables de componente

Seis variables las lee un único componente y son entradas soportadas. Cualquier otra variable que declare un componente, como `--surface-padding`, `--field-gap`, `--switch-*`, `--table-*` o `--quote-*`, es interna y puede cambiar en cualquier versión.

| Variable             | Elemento       | Valor                           | Valor por defecto                                                                      | Efecto                                                                                           | Dónde definirla                                                                                              |
| -------------------- | -------------- | ------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `--progress-value`   | `.progress`    | Un porcentaje, de `0%` a `100%` | `0%`                                                                                   | Ancho de la parte rellena. No se limita; un valor sin `%` no es válido y se muestra vacío.       | En la barra o en cualquier elemento que la rodee.                                                            |
| `--progress-color`   | `.progress`    | Un color                        | El color de la intención                                                               | Color de la parte rellena y del brillo de `.active`.                                             | En la barra o en cualquier elemento que la rodee.                                                            |
| `--progress-surface` | `.progress`    | Un color                        | El color de la intención con el relleno de la presentación: 12% por defecto            | Color del carril.                                                                                | En la barra o en cualquier elemento que la rodee.                                                            |
| `--progress-edge`    | `.progress`    | Un color                        | El color de borde de la intención con el borde de la presentación: ninguno por defecto | Color del borde del carril. Solo se ve donde el carril tiene grosor de borde, como con `.edged`. | En la barra o en cualquier elemento que la rodee.                                                            |
| `--input-group-gap`  | `.input-group` | Una longitud                    | `0.5rem`                                                                               | Espacio entre el control y su icono o texto.                                                     | En el propio `.input-group`. El grupo declara el valor por defecto, así que un valor en un padre se ignora.  |
| `--tooltip-linger`   | `.tooltip`     | Un tiempo                       | `300ms`                                                                                | Cuánto tiempo se queda la burbuja después de que el puntero sale del disparador.                 | En el propio `.tooltip`. El contenedor declara el valor por defecto, así que un valor en un padre se ignora. |

```html
<div class="progress" role="meter" aria-label="Storage used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="92" style="--progress-value: 92%; --progress-color: var(--color-warning)"></div>

<div class="input-group" style="--input-group-gap: 0">
  <span>app.example.com/u/</span>
  <input class="ipt" id="profile-url" aria-label="Profile address" />
</div>
```

Los ejemplos en contexto están en [Feedback → Mostrar el progreso](./feedback.md#mostrar-el-progreso), [Formularios → Añadir un icono o un prefijo fijo](./forms.md#añadir-un-icono-o-un-prefijo-fijo) y [Tooltips → Hover, permanencia y Escape](./tooltips.md#hover-permanencia-y-escape).

## Helpers de composición

Para construir un componente que el paquete no incluye, como un control segmentado o un chip de filtro, compónlo con las mismas clases con las que están construidos los componentes del paquete. Con CSS compilado, escríbelas como clases; con el código fuente de Tailwind, también puedes usarlas con `@apply`.

| Clase          | Lo que le da a un elemento                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `box`          | La caja pintada: fondo, color de texto, borde, esquina, sombra, el material de la estética, el anillo de foco y el aspecto deshabilitado. Lee la intención, la presentación, la estética y la elevación.               |
| `box-hover`    | El color de hover, para algo que se pulsa y no algo en lo que se escribe. Añádelo con `box`.                                                                                                                           |
| `box-active`   | La pulsación: una ligera reducción, o la pulsación propia de la estética. Añádelo con `box`.                                                                                                                           |
| `surface`      | `box` con los valores por defecto de una superficie: sin relleno y con borde, la esquina de superficie y el fondo, el desenfoque y la sombra de superficie de la estética, como en una tarjeta.                        |
| `text-control` | `box` con los valores por defecto de un campo de texto: sin relleno y con borde, las reglas de relleno limitado y de borde, el color del placeholder, un borde que cambia con hover y con foco, y el estado no válido. |

Chips de filtro para la lista de miembros, uno pulsado y otro no:

```html
<button class="box box-hover box-active neutral soft edgeless" type="button" aria-pressed="true" style="padding: 0.25rem 0.75rem; border-radius: 999px">Admins</button>

<button class="box box-hover box-active neutral ghost edgeless" type="button" aria-pressed="false" style="padding: 0.25rem 0.75rem; border-radius: 999px">Owners</button>
```

`box` no lee `aria-pressed`, así que el chip pulsado parece pulsado solo porque tiene `.soft`. Cuando tu código cambie `aria-pressed`, cambia con él la clase de presentación: `.soft` cuando está pulsado, `.ghost` cuando no.

Qué darle a cada uno:

- **`box` necesita una clase de relleno y una de borde.** No tiene valores por defecto propios, así que sin `.solid`, `.soft` o `.ghost` y sin `.edged` o `.edgeless`, en el elemento o en un contenedor, no dibuja nada. `surface` y `text-control` tienen valores por defecto y funcionan solos.
- **Nombra la intención en `box`.** Un elemento `box` toma la intención del elemento más cercano a su alrededor que tenga una, a diferencia de los componentes del paquete. Ponle `.neutral` o una clase de intención. `surface` y `text-control` son neutrales salvo que el elemento tenga una clase de intención, como los componentes.
- **`@apply` lleva el helper completo.** `.my-field { @apply text-control; }` obtiene lo mismo que `class="text-control"`: la intención neutral y el borde del campo, `.soft`, `.solid` y `.edgeless` en el elemento, y el aspecto inválido con `aria-invalid="true"`. `@apply surface` es neutral de la misma forma. Una clase de intención que definas tú debe ser CSS plano o una utilidad para colorear un elemento así, no una regla en `@layer components`.
- **Un diálogo funciona con `@apply surface`.** Un `<dialog>` cerrado con tu propia clase que hace `@apply surface` permanece oculto, y uno abierto se centra, como con `.card`. Ocultar uno cerrado gana sobre una utilidad de display como `flex`; un margen que pongas sigue colocando uno abierto.
- **El tamaño y el espaciado son cosa tuya.** Ninguno de los helpers define el relleno interior, el ancho ni el alto; `text-control` no define la altura de 2.5rem que añade `.ipt`.
- **También el comportamiento y la semántica.** Usa un `<button>`, un `<input>` o un `<a href>` reales, o añade tú el rol y el manejo del teclado, y define estados como `aria-pressed` o `aria-invalid`. `box` dibuja el aspecto deshabilitado para `disabled`, `.disabled`, `aria-disabled="true"` y `data-disabled`, pero solo el atributo `disabled` impide la interacción.

No definas ni leas las variables con el prefijo `--_` que estos helpers usan internamente; cambian entre versiones.

## Siguiente paso

[Contenido y layout](./content-and-layout.md) enumera los helpers de layout, la escala tipográfica, las superficies, las tablas y los chips de contenido.
