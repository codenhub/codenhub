---
title: Temas
description: Modo claro y oscuro, reemplazar la paleta con los colores de marca, definir una intención propia, y cada token de color, intención, base y fuente con su valor por defecto.
order: 5
source: e7597c70666e5c4f8a1c407f47ae1405537093b9
---

# Temas

La pantalla de ajustes funciona y tiene el aspecto por defecto del paquete: acciones casi negras sobre una página casi blanca. Esta página la hace tuya. Cubre el modo claro y oscuro, después reemplaza el color principal por un color de marca en los dos modos, y después define una intención que el paquete no incluye. La segunda mitad es la referencia de consulta: cada token de color, intención, base y fuente, con su valor por defecto.

## Claro y oscuro

De entrada, la página sigue al sistema operativo: clara cuando el sistema del usuario es claro, oscura cuando es oscuro. No tienes que hacer nada para eso.

Para que el usuario elija, pon un selector de tema en el elemento raíz:

```html
<html data-theme="dark">
  …
</html>
```

| Tema   | Selectores equivalentes                          |
| ------ | ------------------------------------------------ |
| Claro  | `.light`, `.theme-light`, `[data-theme="light"]` |
| Oscuro | `.dark`, `.theme-dark`, `[data-theme="dark"]`    |

Una pantalla de ajustes con la opción "Sistema / Claro / Oscuro" quita el atributo para Sistema y lo pone para las otras dos.

Cómo se resuelve:

- Un selector de tema define la propiedad CSS `color-scheme`, y el color del texto del elemento en `--color-text`. Cada token de color contiene a la vez su valor claro y su valor oscuro, mediante `light-dark()`, y el `color-scheme` del elemento elige uno.
- `color-scheme` se hereda, así que un selector aplica el tema a todo lo que contiene. Un selector en cualquier elemento aplica el tema a esa parte de la página: una barra lateral oscura en una página clara es `<aside class="dark">`, y el texto que contiene toma el color de texto del tema oscuro.
- Un selector no define ningún fondo. Dale tú el fondo a la zona, por ejemplo con `background: var(--color-background)`. Cualquier utilidad o clase de componente en el mismo elemento sobrescribe el color de texto del selector.
- Gana el selector más cercano, a cualquier profundidad. Una tarjeta `.light` dentro de una página `.dark` es clara.
- Sin selector, la raíz tiene `color-scheme: light dark`, que sigue al sistema.
- Pon un solo tema en cada elemento. Si un elemento lleva a la vez un selector claro y uno oscuro, gana el oscuro, pero no confíes en ello.
- Definir tú mismo `color-scheme` en un elemento aplica el tema a los tokens de la misma forma, porque es lo único que lee la paleta. También aplica el tema a partes nativas como las barras de desplazamiento y el interior de los controles de formulario. El texto simple de dentro conserva el color que heredó hasta que también defines `color: var(--color-text)`.

Cada color de componente viene de un token o de `currentColor`, así que los componentes siguen el tema sin reglas propias de modo oscuro. Las marcas que dibuja el paquete, como el tick del checkbox y la flecha del select, también usan `currentColor`. Los iconos y las imágenes que añadas son tuyos para adaptarlos al tema.

`light-dark()` funciona desde Chrome 123, Safari 17.5 y Firefox 120. El paquete en su conjunto necesita Firefox 128; consulta [Configuración inicial → Requisitos](../setup.md#requisitos).

### La variante `dark:`

Con los puntos de entrada de código fuente de Tailwind (`/tw`), el paquete reemplaza la variante `dark:` de Tailwind para que tus propias utilidades sigan el mismo tema que los tokens. Una utilidad `dark:` se aplica bajo un selector oscuro explícito en el elemento o en un ancestro, o bajo una preferencia oscura del sistema cuando ningún ancestro define un tema:

```html
<html>
  <body>
    <p class="dark:text-white">Follows the system preference</p>
    <div class="light">
      <p class="dark:text-white">Stays light: this part of the page chose a theme</p>
    </div>
  </body>
</html>
```

Se diferencia de los tokens en un caso: un tema explícito anidado dentro del opuesto. Un elemento `.light` dentro de uno `.dark` tiene tokens claros, porque gana el `color-scheme` más cercano. Pero `dark:` coincide por selector, y `.dark *` coincide con cada elemento dentro de `.dark`, así que una utilidad `dark:` dentro de ese elemento `.light` se sigue aplicando. Si una página usa a la vez tokens y utilidades `dark:`, no anides temas opuestos.

Los puntos de entrada compilados no definen una variante `dark:`; no tienen un build de Tailwind en el que definirla.

## Cambiar el color de marca

El color principal es casi negro en una página clara y casi blanco en una oscura. Para convertirlo en un color de marca, reemplaza la familia principal completa: el color base y sus cuatro acompañantes. Cada uno contiene un valor claro y uno oscuro:

```css
:root {
  --color-primary: light-dark(#0f766e, #2dd4bf);
  --color-primary-contrast: light-dark(#ffffff, #042f2e);
  --color-primary-hover: light-dark(#115e59, #5eead4);
  --color-primary-subtle: light-dark(#ccfbf1, #134e4a);
  --color-primary-strong: light-dark(#115e59, #5eead4);
}
```

Para qué sirve cada uno:

| Token                      | Rol                                                                                       | Comprobación                                             |
| -------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `--color-primary`          | El relleno de un botón primario sólido, de un toggle marcado, del relleno de un progreso. | El texto en `-contrast` sobre él llega a 4.5:1.          |
| `--color-primary-contrast` | Texto e iconos sobre un relleno primario completo.                                        | Ver arriba.                                              |
| `--color-primary-hover`    | El relleno bajo el puntero.                                                               | El texto en `-contrast` sobre él sigue llegando a 4.5:1. |
| `--color-primary-subtle`   | El tinte claro detrás de los componentes soft.                                            | El texto en `-strong` sobre él llega a 4.5:1.            |
| `--color-primary-strong`   | Texto, iconos y bordes donde el relleno no es completo: soft y ghost.                     | Llega a 4.5:1 sobre la página y sobre `-subtle`.         |

Los valores turquesa de arriba miden, en modo claro y oscuro: 5.47:1 y 7.77:1 para el relleno y su texto, 7.27:1 y 13.38:1 para el tono strong sobre la página, y 6.73:1 y 6.41:1 para el tono strong sobre el tinte subtle.

Reemplaza la familia completa. Cambiar solo `--color-primary` deja a sus acompañantes en el antiguo casi negro, así que un badge primario soft mantiene un texto gris y un botón con hover parpadea en negro. El anillo de foco se dibuja a partir de `--color-primary` con un 64% de opacidad, así que sigue al color de marca sin necesidad de cambiarlo.

El mismo patrón funciona con cada familia de [Tokens de color](#tokens-de-color): `--color-accent` es lo que lee `.secondary`, y las cuatro familias de estado son `success`, `warning`, `destructive` e `info`. Defínelas en `:root` para toda la página, o en cualquier elemento para cambiar el tema solo de lo que contiene.

Los valores tienen que ser colores completos: hex, `rgb()`, `oklch()` o una variable que hayas declarado tú. Las variables de la paleta de Tailwind, como `--color-teal-700`, existen en un build `/tw`, a partir de tu tema de Tailwind, pero el CSS compilado solo declara los colores de la paleta que usa el propio paquete. Con CSS compilado, una referencia a cualquier otra variable de la paleta está vacía, y el color que alimenta se pierde.

## Tu propia intención

El paquete incluye seis intenciones: `.primary`, `.secondary`, `.success`, `.warning`, `.destructive` e `.info`, y la de por defecto, `.neutral`. Para añadir una, como un color "Beta" para funciones en vista previa, escribe una clase que defina los siete huecos de intención. Usa colores completos, con `light-dark()` para todo lo que cambia entre temas:

```css
.beta {
  --intent-color: #7c3aed;
  --intent-contrast: #ffffff;
  --intent-hover: #6d28d9;
  --intent-strong: light-dark(#5b21b6, #c4b5fd);
  --intent-subtle: light-dark(#ede9fe, #4c1d95);
  --intent-border: light-dark(#7c3aed, #a78bfa);
  --intent-fill-max: 100%;
}
```

```html
<span class="badge beta">Beta</span> <button class="btn beta" type="button">Try the new editor</button>
```

Estos valores miden 5.7:1 para el blanco sobre el relleno, 7.1:1 para el blanco sobre el color de hover, 8.61:1 (claro) y 10.72:1 (oscuro) para el tono strong sobre la página, y 7.57:1 y 5.93:1 para el tono strong sobre el tinte subtle.

**Define todos los huecos**, incluido `--intent-fill-max`. Cada componente restablece los siete huecos a los valores neutros en su propia raíz, así que un hueco que omitas conserva el valor neutro, y sin `--intent-fill-max: 100%` tu intención solo se rellena hasta el 20%, como la neutra. Lo que hace cada hueco está en [Tokens de intención](#tokens-de-intención).

La clase funciona en todo lo que acepta una intención: botones, badges, campos y toggles, tarjetas sólidas y ghost, barras de progreso, skeletons, burbujas de tooltip y el resto. Algunos comportamientos están escritos para los seis nombres incorporados, y una intención personalizada no los obtiene:

- **Un reposo discreto, sin tinte.** Una `.card.soft`, un `.panel` y una `.alert` neutros reposan sobre el tono de fondo discreto, y solo reconocen una intención por las seis clases incorporadas. `.card.soft.beta`, `.panel.beta` y `.alert.beta` se dibujan como el neutro: el tono de fondo discreto en lugar de un tinte violeta. Tu intención sigue coloreando su texto y su borde.
- **El tinte de los chips.** Una tecla o un bloque de código `.beta` muestra tu tinte `--intent-subtle`, pero no el 12% adicional de `--intent-color` que una intención incorporada añade encima.
- **Clases solo.** Una [clase solo](./solo.md) como `.neobrutalism-solo` solo toma una intención de las seis clases incorporadas, así que `.neobrutalism-solo.beta` se dibuja neutro.

Si los necesitas, hay dos caminos:

- **Cambia en su lugar el tema de una intención incorporada.** Define la familia `--color-info` (u otra) con tus colores, como en [Cambiar el color de marca](#cambiar-el-color-de-marca), y escribe `.info`. Todo, incluidos los casos anteriores, funciona entonces. El coste es que el cambio llega a cada `.info` dentro del elemento en el que lo defines, así que defínelo en el elemento más reducido que funcione, y no lo hagas con una intención que la página ya usa con su propio significado.
- **Píntalo tú.** Escribe tu propio CSS para ese componente concreto, como un `background-color` en `.panel.beta`.

> **La intención no se hereda.** Cada componente restablece los huecos de intención en su propia raíz, así que un contenedor `.success` no cambia el color de un botón destructivo que contenga. Pon la clase de intención en el elemento que muestra el color.

## Tokens de color

Cada token de color contiene un valor claro y uno oscuro mediante `light-dark()`; un solo valor significa que los dos temas lo usan. Los nombres de paleta como `neutral-950` son la paleta por defecto de Tailwind, que el CSS compilado del paquete declara para los colores que usa.

Cada fila es un punto de sobrescritura: defínelo en `:root` para cambiar el tema de la página, o en cualquier elemento para cambiar el de lo que contiene. Las filas `-hover`, `-subtle`, `-strong` y `-contrast` son acompañantes del color base de su familia y no lo siguen, así que cambia la familia completa. La familia `text` no tiene fila `-subtle`: la intención neutra toma su tono subtle de `--color-surface`.

| Token                          | Claro, oscuro                | Propósito                                                                                                        |
| ------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--color-primary`              | `neutral-950`, `neutral-50`  | Relleno de `.primary`.                                                                                           |
| `--color-primary-contrast`     | `neutral-50`, `neutral-950`  | Texto e iconos sobre un relleno primario completo.                                                               |
| `--color-primary-hover`        | `neutral-700`, `neutral-200` | Relleno primario bajo el puntero.                                                                                |
| `--color-primary-subtle`       | `neutral-200`, `neutral-900` | Tinte primario detrás de los componentes soft.                                                                   |
| `--color-primary-strong`       | `neutral-900`, `neutral-100` | Texto, iconos y bordes primarios donde el relleno no es completo.                                                |
| `--color-accent`               | `neutral-600`, `neutral-400` | Relleno de `.secondary`.                                                                                         |
| `--color-accent-contrast`      | `neutral-50`, `neutral-950`  | Texto e iconos sobre un relleno secundario completo.                                                             |
| `--color-accent-hover`         | `neutral-700`, `neutral-300` | Relleno secundario bajo el puntero.                                                                              |
| `--color-accent-subtle`        | `neutral-100`, `neutral-800` | Tinte secundario detrás de los componentes soft.                                                                 |
| `--color-accent-strong`        | `neutral-800`, `neutral-200` | Texto, iconos y bordes secundarios donde el relleno no es completo.                                              |
| `--color-border`               | `neutral-400`, `neutral-700` | Borde de las superficies neutras, tablas, divisores y teclas.                                                    |
| `--color-border-hover`         | `neutral-600`, `neutral-500` | Borde bajo el puntero.                                                                                           |
| `--color-control-border`       | `neutral-500`                | Borde en reposo de los controles de texto y toggles neutros, dibujado a una fracción en los controles de texto.  |
| `--color-background`           | `neutral-50`, `neutral-950`  | La página.                                                                                                       |
| `--color-foreground`           | `neutral-100`, `neutral-900` | El tono de fondo discreto un paso por encima de la página: tarjetas soft, paneles y alertas neutros.             |
| `--color-surface`              | `neutral-200`, `neutral-800` | Un paso más: superficies anidadas y atenuadas, y el tinte de la intención neutra.                                |
| `--color-text`                 | `neutral-950`, `neutral-50`  | Texto del cuerpo, y el color de la intención neutra.                                                             |
| `--color-text-secondary`       | `neutral-700`, `neutral-400` | Texto secundario, como `.hint`.                                                                                  |
| `--color-text-contrast`        | `neutral-50`, `neutral-950`  | Texto sobre un relleno completo de `--color-text`, como la marca de un toggle neutro marcado.                    |
| `--color-text-hover`           | `neutral-700`, `neutral-200` | Color neutro bajo el puntero.                                                                                    |
| `--color-text-strong`          | `neutral-900`, `neutral-100` | Texto, iconos y bordes neutros donde el relleno no es completo.                                                  |
| `--color-tooltip`              | `white`, `neutral-700`       | Fondo de una burbuja de tooltip sin intención. Elegido para cada tema de modo que se perciba elevado en los dos. |
| `--color-tooltip-contrast`     | `neutral-900`, `neutral-100` | Texto sobre `--color-tooltip`.                                                                                   |
| `--color-success`              | `emerald-700`                | Relleno de `.success`.                                                                                           |
| `--color-success-contrast`     | `neutral-50`                 | Texto sobre un relleno success completo: 5.14:1.                                                                 |
| `--color-success-hover`        | `#007552`, `#008e66`         | Relleno success bajo el puntero.                                                                                 |
| `--color-success-subtle`       | `emerald-100`, `emerald-900` | Tinte success detrás de los componentes soft.                                                                    |
| `--color-success-strong`       | `emerald-800`, `emerald-300` | Texto, iconos y bordes success donde el relleno no es completo.                                                  |
| `--color-warning`              | `amber-600`                  | Relleno de `.warning`.                                                                                           |
| `--color-warning-contrast`     | `neutral-950`                | Texto sobre un relleno warning completo: casi negro, no el color de la página. 6.19:1.                           |
| `--color-warning-hover`        | `#d46700`, `#e78300`         | Relleno warning bajo el puntero.                                                                                 |
| `--color-warning-subtle`       | `amber-100`, `amber-900`     | Tinte warning detrás de los componentes soft.                                                                    |
| `--color-warning-strong`       | `amber-800`, `amber-300`     | Texto, iconos y bordes warning donde el relleno no es completo.                                                  |
| `--color-destructive`          | `rose-700`                   | Relleno de `.destructive`.                                                                                       |
| `--color-destructive-contrast` | `neutral-50`                 | Texto sobre un relleno destructive completo: 5.78:1.                                                             |
| `--color-destructive-hover`    | `#c00036`, `#d1054b`         | Relleno destructive bajo el puntero.                                                                             |
| `--color-destructive-subtle`   | `rose-100`, `rose-900`       | Tinte destructive detrás de los componentes soft.                                                                |
| `--color-destructive-strong`   | `rose-800`, `rose-300`       | Texto, iconos y bordes destructive donde el relleno no es completo.                                              |
| `--color-info`                 | `indigo-600`                 | Relleno de `.info`.                                                                                              |
| `--color-info-contrast`        | `neutral-50`                 | Texto sobre un relleno info completo: 6.19:1.                                                                    |
| `--color-info-hover`           | `#4b36e9`, `#5e4ff9`         | Relleno info bajo el puntero.                                                                                    |
| `--color-info-subtle`          | `indigo-100`, `indigo-900`   | Tinte info detrás de los componentes soft.                                                                       |
| `--color-info-strong`          | `indigo-800`, `indigo-300`   | Texto, iconos y bordes info donde el relleno no es completo.                                                     |

Los cambios de tema van en estos valores, no en reglas de componente que comprueban el tema.

## Tokens de intención

Una clase de intención define estos siete huecos, y los componentes los leen. Como todos los componentes leen los mismos siete nombres, una clase que define los siete funciona como intención, como muestra [Tu propia intención](#tu-propia-intención).

| Token               | Propósito                                                                                                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--intent-color`    | El color base de la intención, del que está hecho un relleno.                                                                                                                                                                                             |
| `--intent-contrast` | Texto sobre un relleno completo de `--intent-color`.                                                                                                                                                                                                      |
| `--intent-hover`    | El color base bajo el puntero.                                                                                                                                                                                                                            |
| `--intent-strong`   | La intención como texto, icono o borde dondequiera que el relleno no sea completo.                                                                                                                                                                        |
| `--intent-subtle`   | El tinte claro detrás de los componentes soft y de los carriles de progreso. La neutra usa `--color-surface`.                                                                                                                                             |
| `--intent-border`   | Color de línea. Sin intención es el `--ui-ink` de la estética y, si no, `--color-border`; los controles de texto y los toggles leen `--ui-control-ink`, después `--ui-ink` y después `--color-control-border`, y las tablas leen primero `--ui-rule-ink`. |
| `--intent-fill-max` | Hasta dónde puede llegar un relleno de esta intención. `100%` para todas las intenciones excepto la neutra.                                                                                                                                               |

`--intent-color` e `--intent-strong` no son intercambiables. El color base se elige para rellenar con él; el tono strong se elige para leerse sobre la página. Un componente soft o ghost imprime el tono strong, y por eso un warning soft se lee en amber-800 mientras que uno sólido se rellena con amber-600.

El tono strong también tiene que seguir siendo reconociblemente de su propio matiz. En una página oscura, el tono `-100` de cada familia es un tinte pálido casi sin color en tamaños pequeños: un badge success soft y uno destructive soft se leerían los dos como blancos. Por eso los tonos strong oscuros son `-300`, y los tintes bajo ellos son `-900`, que mide 5.0:1 o más dondequiera que un relleno parcial contenga texto, y más de 9:1 sobre la página.

`--intent-border` existe para que un borde neutro siga siendo el gris discreto de los bordes y no el color del texto. Todo lo que dibuja una línea lo lee: bordes de los controles, líneas divisorias de las tablas, divisores, teclas y barras de las citas.

`--intent-fill-max` existe para la intención neutra, cuyo color es el propio color de texto de la página. Todas las demás intenciones son un matiz, legible como tinte pálido al 12% y saturado al 100%; un gris rellenado al 100% es un bloque negro o blanco, lo más llamativo de la página para la intención que no significa nada en particular. La neutra se queda en `20%`, así que `.solid` le da un gris discreto que sigue estando un paso más allá de `.soft`. El hover suma su paso por encima del tope, así que un relleno limitado sigue intensificándose bajo el puntero.

El color del texto sigue al relleno. `--intent-contrast` es el color de texto para un relleno completo; impreso sobre una quinta parte de uno, sería blanco sobre gris claro. Así que el texto de contraste solo aparece cuando el relleno pasa de la mitad, y llega a toda su intensidad con un relleno completo; por debajo, un componente imprime `--intent-strong`. Por tanto, un neutro limitado imprime el tono strong. Un estado que levanta el tope a propósito, como un checkbox marcado, llega a un relleno completo e imprime el color de contraste.

## Tokens base

Los tokens base definen el layout, la forma, el movimiento, el foco, la profundidad y el apilamiento. Sobrescríbelos en `:root`, o en un elemento para lo que contiene.

Las cuatro sombras `--elevation-*` son para elementos a los que das estilo tú. Son independientes de las clases `.flat`, `.raised` y `.floating`, que escalan la sombra propia de un componente y no dibujan nada hasta que una estética o una de esas clases pide profundidad; consulta [Composición → Elevación](./composing.md#elevación). Las dos usan los pesos ninguno, pequeño, mediano y grande, pero una es un valor fijo y la otra escala partes de la sombra, así que no siempre se ven igual.

| Token                      | Valor por defecto                                              | Propósito                                                                                                                  |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--font-default`           | `"Segoe UI", system-ui, sans-serif`                            | Fuente de la página. Consulta [Fuentes](#fuentes).                                                                         |
| `--container-narrow`       | `48rem`                                                        | Ancho de `.section-content.narrow`.                                                                                        |
| `--container-max`          | `80rem`                                                        | Ancho de `.section-content`.                                                                                               |
| `--container-wide`         | `90rem`                                                        | Ancho de `.section-content.wide`.                                                                                          |
| `--layout-gutter`          | `clamp(1rem, 4vw, 2rem)`                                       | Relleno lateral de `.section`, que crece con la ventana.                                                                   |
| `--layout-section-block`   | `clamp(4rem, 9vw, 7rem)`                                       | Relleno superior e inferior de `.section`, que crece con la ventana.                                                       |
| `--layout-gap`             | `1rem`                                                         | Separación de `.view`, `.stack`, `.cluster` y `.auto-grid`.                                                                |
| `--layout-grid-min`        | `16rem`                                                        | Columna más estrecha de `.auto-grid`.                                                                                      |
| `--radius-small`           | `0.25rem`                                                      | Esquina de los chips pequeños: `.kbd` y `.code`.                                                                           |
| `--radius-control`         | `0.5rem`                                                       | Esquina de botones, campos y burbujas de tooltip.                                                                          |
| `--radius-surface`         | `0.875rem`                                                     | Esquina de tarjetas, paneles y alertas.                                                                                    |
| `--control-height`         | `2.5rem`                                                       | Altura mínima de un botón por defecto y de un control de texto.                                                            |
| `--border-width`           | `1px`                                                          | Grosor del borde.                                                                                                          |
| `--elevation-color`        | `rgb(15 23 42 / 0.08)` en claro, `rgb(0 0 0 / 0.55)` en oscuro | El color de sombra que usan las cuatro elevaciones. Más intenso en una página oscura, donde una sombra ligera no se vería. |
| `--elevation-none`         | `none`                                                         | Sin sombra.                                                                                                                |
| `--elevation-sm`           | `0 1px 2px`, `0 1px 3px`                                       | Una sombra ligera para tus propias superficies, como una tarjeta.                                                          |
| `--elevation-md`           | `0 4px 6px -1px`, `0 2px 4px -2px`                             | Una sombra para tus propios elementos elevados, como un menú desplegable.                                                  |
| `--elevation-lg`           | `0 20px 25px -5px`, `0 8px 10px -6px`                          | Una sombra para tus propias capas superpuestas, como un diálogo modal.                                                     |
| `--focus-ring`             | Sin definir                                                    | Color del anillo de foco del teclado. Sin definir, `--color-primary` con un 64% de opacidad, en el elemento con foco.      |
| `--focus-ring-offset`      | Sin definir                                                    | Distancia del anillo al elemento. Sin definir, el anillo queda sobre el borde del elemento con cualquier estética.         |
| `--focus-ring-width`       | `3px`                                                          | Grosor del anillo de foco del teclado.                                                                                     |
| `--motion-duration-fast`   | `120ms`                                                        | El hover de una fila de tabla.                                                                                             |
| `--motion-duration-normal` | `200ms`                                                        | Transiciones de color, borde, sombra y pulsación, marcas de los toggles y la burbuja del tooltip.                          |
| `--motion-duration-slow`   | `400ms`                                                        | Cambios de valor del progreso, y la base del ciclo de brillo del skeleton y del progreso.                                  |
| `--motion-ease`            | `cubic-bezier(0.2, 0, 0, 1)`                                   | Curva de aceleración de todas las transiciones.                                                                            |
| `--z-popover`              | `40`                                                           | Orden de apilamiento de las burbujas de tooltip. Úsalo para tus propios popovers, para que se apilen igual.                |
| `--breakpoint-xs`          | `30rem`                                                        | El breakpoint adaptable `xs:`. Solo en un build `/tw`; los puntos de entrada compilados no lo declaran.                    |

Cada sombra `--elevation-*` está formada por las partes indicadas, cada una en `--elevation-color`. Las cuatro sombras se componen una sola vez, en la raíz, así que un `--elevation-color` que definas en un contenedor no les llega: defínelo en `:root`, o define el propio token `--elevation-*` en el contenedor. Las clases de elevación, como `.card.raised`, leen `--elevation-color` en el elemento y siguen el valor de un contenedor. El paso de hover que intensifica un relleno bajo el puntero es un token de presentación, `--hover-step`; consulta [Personalización](./customizing.md#tokens-de-presentación).

## Fuentes

El paquete no incluye archivos de fuente ni hace peticiones de red. Cada token de fuente nombra fuentes ya instaladas en el dispositivo del lector hasta que aportes las tuyas.

| Token            | Lo lee                                                                                      | Sin tu valor                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--font-default` | El reset, en `html` y `body`. Los botones y los controles de formulario lo heredan.         | `"Segoe UI", system-ui, sans-serif`                                                                                                               |
| `--font-mono`    | Los helpers de contenido `kbd`, `code` y `pre`, y `<kbd>`, `<code>` y `<pre>` con `/native` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`. Con `/tw`, el valor de tu tema de Tailwind. |
| `--font-pixel`   | [`.pixel`](./aesthetics.md#pixel) y `.pixel-solo`                                           | No declarado. Recurre a una pila monoespaciada.                                                                                                   |
| `--font-rounded` | [`.chunky-tile`](./aesthetics.md#chunky-tile) y `.chunky-tile-solo`                         | No declarado. Recurre a `--font-default` y después a una pila sans-serif.                                                                         |
| `--font-cyber`   | [`.cyber`](./aesthetics.md#cyber) y `.cyber-solo`                                           | No declarado. Recurre a una pila monoespaciada.                                                                                                   |
| `--font-sketch`  | [`.sketch`](./aesthetics.md#sketch) y `.sketch-solo`                                        | No declarado. Recurre a la familia `cursive` de la plataforma.                                                                                    |

`--font-default` solo llega a la página a través del reset, que incluyen `@codenhub/styles`, `/native`, `/tw`, `/tw/native` y `/tw/reset`. Con `/theme` o `/components` solos, define tú mismo `font-family` en `body`. Los tokens de las estéticas los lee la propia clase de la estética, así que funcionan con cualquier punto de entrada.

Para usar una fuente web, cárgala como cargas cualquier fuente y después nómbrala en el token. Define el token en `:root` para toda la página, o en cualquier elemento para esa parte:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap" />
```

```css
:root {
  --font-default: "Inter", system-ui, sans-serif;
}
```

Una fuente alojada por ti se declara con `@font-face` y se nombra de la misma forma:

```css
@font-face {
  font-family: "Pixelify Sans";
  src: url("/fonts/pixelify-sans.woff2") format("woff2");
  font-weight: 400 700;
  font-display: swap;
}

:root {
  --font-pixel: "Pixelify Sans", monospace;
}
```

Carga los pesos de 400 a 700, y 800 para `--font-rounded`: los componentes definen `font-weight` de 400 a 700, y `.chunky-tile` pone sus etiquetas en 800. Un navegador al que le falta un peso lo simula engrosando el regular, lo que emborrona una fuente pixelada o manuscrita. Termina siempre la pila con una familia genérica, como `sans-serif` o `monospace`, para que el texto se siga renderizando mientras carga la fuente o si falla.

## Siguiente paso

La pantalla tiene tus colores en los dos temas. [Estéticas](./aesthetics.md) cambia de qué está hecha: contornos negros gruesos, vidrio esmerilado, píxeles y más.
