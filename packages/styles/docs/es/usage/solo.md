---
title: Clases solo
description: Cómo pintar una estética sobre un elemento de otra librería, como un toast o un diálogo, y qué lee e ignora una clase solo.
order: 7
source: c44308a8768737292529d4f93b703b3fa200255a
---

# Clases solo

Supón que la pantalla de ajustes muestra "Perfil guardado" en un toast de una librería de notificaciones, no en la alerta de este paquete. Bajo `.neobrutalism`, cada tarjeta y cada botón tienen el contorno grueso y la sombra dura, y el toast no: una clase de estética solo define valores que leen los componentes de este paquete, así que no cambia nada en un elemento al que el paquete no da estilo. Una clase solo pinta la estética directamente sobre el único elemento que la lleva:

```html
<div class="toast neobrutalism-solo success" role="status">Profile saved.</div>
```

## Las seis clases solo

Cada estética incluye su clase solo en el mismo punto de entrada, y una clase solo no necesita que se cargue nada más:

```css
/* La única hoja de estilos de este paquete en la página. */
@import "@codenhub/styles/aesthetics/glass";
```

```html
<div class="toast glass-solo">A pane over whatever is behind it.</div>
```

| Estética        | Clase solo           | Pinta                                                                                                                                                                                                                                                       |
| --------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.glass`        | `.glass-solo`        | Un fondo translúcido, un borde de brillo fino, el desenfoque, una sombra suave de dos capas y la esquina de superficie. Con `.glass-liquid`, el cristal liquid, dibujado en su `::before` y su `::after`.                                                   |
| `.neobrutalism` | `.neobrutalism-solo` | Un borde de tinta de 2px, esquinas rectas y la sombra dura desplazada.                                                                                                                                                                                      |
| `.pixel`        | `.pixel-solo`        | El contorno escalonado, el anillo interior en lugar de un borde y la fuente pixelada.                                                                                                                                                                       |
| `.chunky-tile`  | `.chunky-tile-solo`  | La esquina de baldosa, un borde de 2px, la barra de debajo y la fuente redondeada.                                                                                                                                                                          |
| `.cyber`        | `.cyber-solo`        | La diagonal de superficie (la diagonal de control en un botón o un enlace), un borde de 1px, el resplandor y la fuente.                                                                                                                                     |
| `.sketch`       | `.sketch-solo`       | Esquinas elípticas irregulares (un contorno más marcado en un panel, uno más suelto en un botón o un enlace, y otras pequeñas y redondeadas con `.sketch-rounded`), una línea de tinta continua de 1px, la sombra desplazada de 2px y la fuente manuscrita. |

No pongas una clase solo en los propios componentes de este paquete. Una `.card` ya dibuja su relleno, su borde y su intención, y una clase solo pintaría encima un segundo borde y un segundo relleno. Usa ahí la clase de estética; también funciona en un único elemento: `<button class="btn pixel">`.

## Lo que lee una clase solo

Un elemento solo acepta las mismas clases de presentación, intención y elevación que aceptaría una `.card`:

```html
<div class="toast pixel-solo edgeless">No ring</div>
<div class="toast glass-solo solid success">An opaque green pane</div>
<div class="toast neobrutalism-solo flat">No offset shadow</div>

<section class="soft edged">
  <div class="toast chunky-tile-solo info">Soft and edged from the container, info from itself</div>
</section>
```

| Qué                                     | De dónde se lee                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Relleno y borde (`.solid`, `.edged`, …) | Del elemento o de cualquier contenedor: la presentación se hereda, como en los componentes.                        |
| Intención (`.success`, …)               | Solo del elemento, como en los componentes. Un contenedor `.success` deja neutro un elemento solo que esté dentro. |
| Elevación (`.flat`, `.raised`, …)       | Solo del elemento, como en los componentes. Escala la sombra desplazada, la barra y la sombra de sketch.           |
| La estética que lo rodea (`.pixel`, …)  | Nunca. Consulta [Lo que una clase solo ignora](#lo-que-una-clase-solo-ignora).                                     |

Sin ninguna de esas clases, una clase solo pinta solo el material (borde, esquina, profundidad, contorno, desenfoque, fuente y pulsación) y deja el fondo y el color de texto propios del elemento como estaban.

- **Solo las seis intenciones incluidas.** Una clase solo toma la intención únicamente de `.primary`, `.secondary`, `.success`, `.warning`, `.destructive` e `.info`. Una clase de intención que hayas definido tú, como en [Temas → Tu propia intención](./theming.md#tu-propia-intención), no se lee, y el elemento se dibuja neutro. Para dar un color propio a un elemento solo, cambia el tema de una de las intenciones incluidas en él o en un contenedor, como describe esa sección.
- **El relleno es una capa sobre el fondo propio del elemento.** Cinco de las seis pintan el relleno como una sombra interior y no definen `background`, así que un toast solo `.soft` es un tinte sobre lo que el toast ya fuera, y uno `.solid` con una intención de color es opaco. Glass define su propio fondo, porque el fondo translúcido es su material, y mezcla el relleno encima. Un `.solid` neutro es un tinte del 20%, no el gris opaco que dibuja un componente.
- **El color del texto presupone el tema.** Solo se define donde se pide un relleno o una intención, y es el color que el tema usa sobre la página o sobre el relleno. En un elemento cuyo fondo propio no sigue al tema, como un toast blanco en una página oscura, una intención `.soft` o `.ghost` puede poner texto claro sobre un fondo claro; usa `.solid` o quita la intención.
- **No hay tinte de hover.** No se sabe si un elemento solo es clicable, así que no recibe el color de hover que recibe un `.btn`.
- **Lee los controles de su estética y los tokens del tema, con los valores incluidos como respaldo.** `--glass-radius-surface`, `--neo-offset`, `--pixel-unit`, `--tile-lift`, `--tile-radius`, `--cyber-cut`, `--cyber-shape`, `--cyber-shape-surface`, `--cyber-glow`, `--cyber-ink`, `--sketch-radius`, `--sketch-radius-surface`, `--sketch-radius-rounded`, `--sketch-radius-surface-rounded` y los tokens de fuente como `--font-sketch` funcionan todos, definidos en el elemento o en cualquier ancestro. Con el tema cargado, sigue al tema; sin él, se renderiza con el aspecto incluido.
- **Los valores oscuros necesitan un esquema de color.** Los pares claro/oscuro usan `light-dark()`, que sigue el `color-scheme` del elemento. El tema del paquete lo define; una página sin el tema obtiene los valores claros.
- **Las clases que lee vienen del tema.** `.solid`, `.edgeless`, `.success`, `.flat` y las demás vienen en la hoja de estilos base y en `@codenhub/styles/theme`. Con solo un punto de entrada de estética en la página, esas clases no hacen nada, y la clase solo pinta su aspecto sin clases.

## Lo que una clase solo ignora

- **La estética que lo rodea.** No lee ninguno de los valores que define una clase de estética, ni `--elevation-color`. Un `.glass-solo` dentro de una región `.pixel` conserva sus propias esquinas, y `--ui-radius` o `--ui-border-width` definidos en él o por encima no hacen nada. Ajústalo mediante sus controles.
- **Sus propios hijos.** Un elemento solo no es una región de estética. Un componente dentro de él conserva el aspecto de la página que lo rodea, incluso con `.glass-liquid` o `.sketch-rounded` junto a la clase solo. Solo transmite lo que transmite cualquier contenedor: la fuente de la clase solo, y el relleno o el borde de una clase de presentación que lleve, así que una `.card` dentro de un cristal `.glass-solo.solid` es solid, como dentro de cualquier contenedor `.solid`.
- **La sombra de glass y `.flat`.** `.flat` no quita la sombra de `.glass-solo`, igual que no la quita bajo `.glass`.

## Cómo gana y cuándo se mueve

- **Gana a los estilos de la otra librería.** Las reglas no tienen capa y tienen un solo nivel de clase, así que ganan a las reglas con capa de un componente, y a las de especificidad cero, se carguen donde se carguen. Una regla ajena sin capa que sea más específica, o igual de específica y posterior en la página, sigue ganando. La otra cara es que una utilidad de Tailwind en el mismo elemento, como `rounded-none`, pierde frente a la clase solo: ajústalo mediante sus controles.
- **Solo pulsa una acción.** Neobrutalism, chunky tile y cyber pulsan un `button`, un `a[href]`, un `[role="button"]`, un `summary` o un `input` de tipo botón que no esté deshabilitado. Todo lo demás se queda quieto, así que un toast no se hunde al hacer clic. La etiqueta más gruesa de chunky tile sigue la misma regla.
- **No toca el movimiento de un contenedor.** Solo una acción toma la `transition` de la pulsación, y la pulsación mueve el elemento mediante las propiedades `translate` y `scale`, no `transform`. Un toast conserva sus propias transiciones y su propio `transform`. En una acción, la `transition` de la pulsación reemplaza la que tuviera el elemento.
- **El movimiento reducido conserva la pulsación y quita su movimiento.** Con `prefers-reduced-motion: reduce`, neobrutalism, chunky tile y cyber siguen pulsando, pero al instante: el elemento cae en su sombra o su barra, o se encoge, sin recorrer la distancia.

## Siguiente paso

Las guías terminan aquí. [Composición](./composing.md), [Personalización](./customizing.md) y [Contenido y layout](./content-and-layout.md) son las páginas de consulta, y [Accesibilidad](../accessibility.md) enumera lo que el CSS hace por tus usuarios y lo que tu aplicación todavía les debe.
