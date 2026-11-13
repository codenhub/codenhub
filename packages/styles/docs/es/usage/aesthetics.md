---
title: Estéticas
description: Los seis aspectos opcionales, lo que cada uno cambia en un componente, sus controles y sus límites.
order: 6
source: 52678f7a4588460f836ce64909526d77e73aa4c6
---

# Estéticas

La pantalla de ajustes tiene tus colores. Una estética cambia de qué están hechos sus componentes: las esquinas, el grosor de los bordes, la sombra y la forma. Pon `.neobrutalism` en el `<main>` de la pantalla de ajustes y cada tarjeta, botón, campo y badge que contiene obtiene esquinas rectas, un contorno grueso en el color de tinta y una sombra dura desplazada, sin perder sus colores. Esta página muestra cómo añadir una y después describe cada una de las seis: qué cambia, el número que puedes ajustar y dónde se comporta de forma distinta al aspecto por defecto.

## Añadir una estética

Las estéticas vienen en un punto de entrada aparte, así que cárgalo junto a la hoja de estilos:

```css
@import "@codenhub/styles";
@import "@codenhub/styles/aesthetics";
```

El orden de carga no importa: las clases de estética están en la capa de cascada `components`, y cada punto de entrada declara el orden de las capas antes de usar alguna, así que una estética importada antes de la hoja de estilos base gana exactamente igual que una importada después. Consulta [Configuración inicial → Capas de cascada](../setup.md#capas-de-cascada).

Después pon la clase en cualquier elemento. A diferencia de la intención, una estética se hereda: todo lo que hay dentro del elemento la toma.

```html
<main class="neobrutalism stack">
  <section class="card stack" aria-labelledby="profile-title">…</section>
  <section class="card soft destructive stack" aria-labelledby="danger-title">
    …
    <button class="btn destructive" type="button">Delete account</button>
  </section>
</main>
```

La zona de peligro conserva su rojo: con neobrutalism su contorno y su sombra también son rojos, porque esta estética los dibuja en la propia intención del componente. Para cargar una sola estética en lugar de las seis, impórtala por su nombre, como `@codenhub/styles/aesthetics/neobrutalism`; [Configuración inicial → Todos los puntos de entrada](../setup.md#todos-los-puntos-de-entrada) las enumera.

| Clase           | Aspecto                                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.neobrutalism` | Sin radio, un contorno grueso de tinta, una sombra dura desplazada sin desenfoque y una pulsación que mete el elemento en ella.                                  |
| `.glass`        | Superficies translúcidas sobre un fondo desenfocado, con un borde de brillo muy fino.                                                                            |
| `.pixel`        | Esquinas recortadas en una unidad de la cuadrícula, un contorno grueso dibujado como anillo interior y la `--font-pixel` que aportes tú sobre una monoespaciada. |
| `.chunky-tile`  | Baldosas redondeadas asentadas sobre una barra más oscura de su propio color, con una pulsación que hunde el elemento en su propia barra.                        |
| `.cyber`        | Esquinas biseladas, un borde fino y brillante, y un resplandor en el propio color del componente.                                                                |
| `.sketch`       | Esquinas elípticas variables, una línea de tinta continua con detalles discontinuos, una pequeña sombra desplazada y una fuente manuscrita opcional.             |

Las estéticas funcionan con todas las combinaciones de relleno y borde. `.ghost.edgeless` quita el relleno y el borde, así que en un componente cuya estética solo se nota a través de ellos y de su sombra, queda poco de la estética; es lo esperado.

Una clase de presentación en el elemento sigue ganando a los valores por defecto de la estética. La estética define el grosor del borde; la presentación decide si se dibuja.

Una clase de estética en un componente gana a una heredada de un contenedor. Esto incluye las burbujas de tooltip: `.tooltip-bubble.glass` obtiene la burbuja glass completa bajo un ancestro pixel, y `.tooltip-bubble.pixel` obtiene la burbuja escalonada completa bajo un ancestro glass.

Tu propio CSS gana a una estética. Las clases de estética están en la capa de cascada `components`, así que una regla de tu propia hoja de estilos sin capa las supera, igual que una utilidad de Tailwind en el mismo elemento, como `font-mono` en una región `.pixel` o `[--ui-radius:0]` en una `.cyber`. Consulta [Configuración inicial → Capas de cascada](../setup.md#capas-de-cascada).

La mayoría de las estéticas escalan a partir de un número que puedes definir, como el desplazamiento de la sombra de neobrutalism o el tamaño de un píxel. Son los controles de la estética, y cada sección de abajo nombra los suyos. [Personalización → Tokens de estética](./customizing.md#tokens-de-estética) explica dónde se pueden definir.

Para pintar una estética sobre un elemento de otra librería, como un toast o un diálogo, usa su [clase solo](./solo.md).

## Neobrutalism

La sombra se proyecta en la propia intención del componente, así que un botón success proyecta una sombra verde y una tarjeta destructive una roja. Sin intención, el contorno y la sombra son la tinta: casi negra en una página clara y casi blanca en una oscura. Los campos y los toggles son la excepción. Dibujan el borde de control del tema, como sin estética, porque un checkbox en reposo con contorno casi negro parecería tan llamativo como uno marcado. Lo mismo vale para pixel, cyber y sketch.

`--neo-offset` es el control: el desplazamiento de la sombra y la distancia que recorre la pulsación son el mismo número, así que escalar el aspecto escala las dos cosas a la vez.

```html
<section class="neobrutalism" style="--neo-offset: 6px">
  <button class="btn primary">A deeper shadow</button>
</section>
```

**Excepciones:**

- Los chips de contenido también toman la estética. El borde de una tecla `.kbd` pasa del gris discreto de los bordes a la tinta, y de 1px a 2px, como cualquier otro borde. Un `.code` o un `.pre` no tiene borde por defecto, así que no recibe ninguno; añade `.edged` para darle un borde de tinta.
- Solo `.btn` y una `.card` que lo active responden al hover y a la pulsación. Una tarjeta lo activa con `.interactive`, o con una de sus dos mitades: `.hoverable` solo para la respuesta al hover, `.pressable` solo para la pulsación; una tarjeta simple, una alerta o un panel es un contenedor y se queda quieto.
- Una alerta se apoya sobre la sombra desplazada con esta estética, y con ninguna otra. Por lo demás una alerta es plana, pero aquí la sombra es un segundo contorno más que profundidad, y una alerta sin ella parece inacabada junto a todo lo demás. Esto incluye una alerta dentro de una región `.neobrutalism` anidada, y una alerta que lleva la clase ella misma, `.alert.neobrutalism`. `.flat` sigue quitándola y `.floating` sigue duplicándola.
- El disparador del tooltip toma la esquina cero como todo lo demás y se dibuja cuadrado; `.radio` conserva su círculo.
- Con `prefers-reduced-motion: reduce` la pulsación sigue ocurriendo, pero al instante: el elemento cae en su sombra sin recorrer la distancia. La pulsación es la señal de que un clic se registró, así que solo se quita su movimiento.
- No tiene fuente propia y define en la región la del tema, `--font-default`, así que una región neobrutalista anidada dentro de pixel, cyber, sketch o chunky tile no toma su tipografía. Una fuente que defines solo con `font-family`, en `body` o en un contenedor, no llega dentro de la región; defínela también en `--font-default`, como describe [Temas → Fuentes](./theming.md#fuentes).

## Glass

`.glass` necesita algo detrás que desenfocar. Sobre un fondo de página plano se renderiza como un simple panel translúcido.

`--glass-radius` y `--glass-radius-surface` son las esquinas, a `0.75rem` y `1rem`. Glass es más redondeada que la geometría base porque un panel translúcido con una esquina cerrada se percibe como un recorte y no como un cristal.

```html
<section class="glass" style="--glass-radius-surface: 1.5rem">
  <div class="card">Softer</div>
</section>
```

**Excepciones:**

- Toda superficie en una región glass es de vidrio, incluidas una `.card.soft`, un `.panel` y una `.alert` neutros.
- El vidrio es el fondo, no el relleno. Una presentación conserva todo su relleno, así que un botón `.solid`, un toggle marcado y una tarjeta o tabla `.solid` son opacos; los cristales esmerilados son los de por defecto, `.soft` y `.ghost`.
- El desenfoque solo se aplica a `.card`, `.panel`, `.alert`, la burbuja del tooltip y una `.data-table` por defecto o `.soft`. Los controles se quedan sólidos y se apoyan sobre el vidrio: un desenfoque bajo cada control de un grupo denso cuesta una capa compuesta por cada uno y se percibe como ruido. Los controles siguen tomando el radio, el borde y la sombra de la estética.
- Con `prefers-reduced-transparency: reduce`, y con colores forzados, las superficies de vidrio pierden el desenfoque y se vuelven opacas. Los colores forzados reemplazan los colores pero conservan su transparencia, así que sin esto un panel dejaría ver la página a través del fondo del sistema.
- Los botones y una `.card` que lo active se pulsan con el `scale(0.97)` simple; con movimiento reducido la pulsación sigue ocurriendo, al instante.
- No tiene fuente propia y define en la región la del tema, `--font-default`, como hace neobrutalism.
- Los controles de texto y los toggles dibujan su línea con la tinta de la página al 55% en lugar del fino borde blanco, que borraría un checkbox sin marcar en una página clara. Es `--ui-control-ink`; defínelo en la región para elegir otro.
- El marco y las líneas divisorias de una tabla dibujan la tinta de la página al 20%, porque el borde fino desaparece sobre la placa de la tabla. Es `--ui-rule-ink`.
- Una tabla con un `<caption>` desenfoca detrás del caption además de detrás de sus filas en Chromium y Safari, cuya caja de tabla incluye el caption, y con `.glass-liquid` el borde y el reflejo también enmarcan el caption. Firefox deja el caption fuera del cristal. Donde importe, etiqueta la tabla desde un encabezado exterior con `aria-labelledby`.

### Liquid glass

`.glass-liquid` es un modificador de glass, inspirado en el Liquid Glass de Apple: esquinas continuas, un borde brillante donde la luz toca el cristal, un desenfoque más ligero, un fondo más claro y una lente que curva lo que hay detrás de una superficie en sus bordes. Ponlo junto a `.glass` en la región, o en una superficie dentro de una región glass.

```html
<section class="glass glass-liquid">
  <div class="card">A pane that bends the page behind it</div>
</section>
```

La lente la dibuja un filtro SVG en `backdrop-filter`, que Chromium renderiza y Firefox y Safari todavía no. En los demás, el cristal conserva todo menos la lente: el borde brillante, el desenfoque, el fondo y las esquinas, redondeadas en lugar de continuas donde no se dibuja `corner-shape`. No hace falta nada en tu markup: el filtro viene dentro de la hoja de estilos.

**Excepciones:**

- Llega a `.card`, `.panel`, `.alert`, `.surface`, la burbuja del tooltip, un componente propio construido con `@apply surface` y una `.data-table` por defecto o `.soft`. Los controles se quedan sólidos, como con glass, excepto un botón que lo pida: consulta [Botones liquid](#botones-liquid).
- Dibuja su desenfoque y su lente en el `::before` y el `::after` de cada superficie, así que una superficie dentro de una región liquid no puede llevar un `::before` o `::after` propio. Cada superficie se convierte también en un contexto de apilamiento posicionado; una superficie que posiciones tú conserva tu colocación.
- Todo lo demás que se esmerila con glass conserva el desenfoque ligero y el fondo más claro de liquid, sin la lente ni el borde brillante: una `<table>` sin clase con `/native`.
- La lente es una erosión de 8px desenfocada sobre 10px en cada superficie, y de 3px desenfocada sobre 3.5px en un botón; su intensidad es fija. Un filtro no puede leer una custom property, así que ninguno de los dos es un control. Las esquinas sí lo son, mediante `--glass-radius` y `--glass-radius-surface`, con valores por defecto mayores: una esquina continua parece más pequeña que una redondeada del mismo radio.
- Decide la región más cercana. Una región de otra estética anidada dentro de una región liquid, o de `.glass` simple, conserva su propio material y no toma capas, y una región liquid anidada a su vez dentro de esa vuelve a tomarlas.
- Sin `.glass` en el ámbito, solo cambia las esquinas.
- Con `prefers-reduced-transparency: reduce`, y con colores forzados, desaparecen el desenfoque y la lente y la superficie es opaca, como con glass.
- El texto queda sobre un cristal más claro que con glass. Sobre contenido recargado, comprueba que tu texto se sigue leyendo: el fondo es el 30% del color de la página, frente al 45% de glass.

#### Botones liquid

Un botón es un cristal liquid cuando él mismo lleva `.glass-liquid`, dentro de una región glass. El modificador solo en la región deja todos los botones sólidos: un desenfoque y una lente bajo cada control de una barra de herramientas densa cuestan dos capas compuestas por cada uno y se perciben como ruido, así que el único botón que debe ser de vidrio lo indica.

```html
<section class="glass glass-liquid">
  <button class="btn primary">Solid, like every control</button>
  <button class="btn ghost glass-liquid">A clear pane</button>
  <button class="btn soft success glass-liquid">A tinted pane</button>
</section>
```

- El relleno sigue siendo cosa de la [presentación](./composing.md#presentación). `.ghost` es el cristal transparente y `.soft` el tintado; un botón `.solid` conserva su placa opaca y toma encima el borde brillante y el reflejo. La intención, el tamaño, `.pill`, `.icon`, el hover y la pulsación funcionan como en cualquier botón.
- También funciona en una región `.glass` simple, y en un botón dentro de una tarjeta liquid.
- Usa el `::before` y el `::after` del botón, así que un botón liquid no puede llevar uno propio.
- Un botón liquid deshabilitado conserva el fondo y el borde brillante y pierde el desenfoque y la lente: se atenúa con `opacity`, lo que separa sus capas de la página que tiene detrás.
- El texto queda sobre lo que haya detrás del botón. Sobre contenido recargado, comprueba que se sigue leyendo, o usa `.solid`.
- Llega a `.btn`, y a un `<button>` sin clase solo a través de su clase `.btn`: las capas son una lista de clases, a la que no se une el mapeo de elementos de `/native`.

## Pixel

`--pixel-unit` es un píxel de la cuadrícula imaginaria de baja resolución, `4px` por defecto. Se recorta una unidad cuadrada de cada esquina y el contorno tiene una unidad de grosor, así que el recorte y lo que lo cubre tienen el mismo tamaño.

```html
<section class="pixel" style="--pixel-unit: 6px">
  <button class="btn primary">Chunkier</button>
</section>
```

**Excepciones:**

- Las esquinas son una unidad o nada. Los chips pequeños son cuadrados en lugar de escalonados: badges, teclas, código en línea, checkboxes y switches. Una unidad menos en cada esquina de un badge de 24px parecería un mordisco, no una esquina.
- Las superficies también son cuadradas: una `.card`, un `.panel` o una `.alert` conserva el anillo interior, pero no recibe recorte ni recorta nada. Un recorte cortaría todo lo que contiene, así que un tooltip dentro de una tarjeta, una sombra o un anillo de foco quedarían recortados.
- Las tablas, las barras de progreso y los skeletons también son cuadrados. Una tabla no recibe recorte porque en Chromium y WebKit su caja incluye el caption, y el recorte caería en el caption en lugar de en las filas. Las barras de progreso y los skeletons solo toman la esquina cuadrada.
- Un bloque de código `.pre` es escalonado como un botón. No tiene borde por defecto, así que el recorte se ve sin contorno alrededor.
- El contorno es un anillo interior, porque un recorte elimina un borde real; por el mismo motivo, el anillo de foco es una segunda capa interior en lugar de un outline. Los dos son el propio borde del elemento y no una sombra, así que el borde responde a `.edged` y `.edgeless` como lo hace un borde: un badge `.edgeless` y un botón `.solid` no dibujan ninguno, una tarjeta `.edged` dibuja uno, y un campo conserva el suyo pida lo que pida un contenedor.
- El anillo de foco interior lleva dentro una línea de 2px del color de la página. El anillo es del color principal, así que en un botón `.solid.primary` se dibujaría sobre su propio color; la línea es lo que se ve ahí.
- Con colores forzados desaparecen tanto el anillo como el recorte, porque el sistema elimina todas las sombras de caja: los componentes dibujan un borde real de 2px y esquinas rectas, y `.pixel-solo` un outline hacia dentro.
- `.radio` y `.tooltip-icon` nunca son escalonados. El círculo es lo que distingue a simple vista un radio de un checkbox, así que un radio sigue siendo redondo. Un disparador de tooltip escalonado de 20px parecería mordido, así que es un cuadrado simple.
- La `--font-pixel` la aportas tú. El paquete no incluye ningún archivo de fuente, así que la estética no tiene efectos secundarios de red y recurre a la pila monoespaciada.
- Que los dígitos sean fáciles de leer depende de la fuente que elijas. En tamaños pequeños, como números de página, contadores y badges, algunas fuentes pixeladas dibujan el `2` y el `8`, o el `3` y el `9`, tan parecidos que se confunden. El CSS no puede arreglarlo. Donde importen los números pequeños, elige una fuente con dígitos claramente distintos.

## Chunky tile

Baldosas redondeadas asentadas sobre una barra más oscura de su propio color, que se aplanan al hacer clic. Es el aspecto que usan las aplicaciones móviles de aprendizaje y los juegos; su nombre describe de qué está hecho y no un producto concreto.

`--tile-lift` es la profundidad de la barra y la distancia que recorre una pulsación, `4px` por defecto. Un solo número controla las dos cosas, así que el borde superior baja exactamente la profundidad de la barra y el borde inferior no se mueve. `--tile-radius` es la esquina, `0.75rem`, y es un único valor y no un par control/superficie a propósito: la esquina compartida es lo que hace que un botón y la tarjeta en la que está se perciban como el mismo objeto.

```html
<section class="chunky-tile" style="--tile-lift: 6px; --tile-radius: 0.5rem">
  <button class="btn success">Continue</button>
</section>
```

La barra es un tono más oscuro del propio color del elemento y no una sombra debajo, así que sigue a cada intención: un botón success se apoya sobre un canto verde oscuro, uno destructive sobre un canto rojo oscuro, y una tarjeta simple sobre un canto gris que coincide con la línea que ya dibuja. Medido en la paleta clara, `.btn.success` es `#007a55` sobre `#004c34`. En una página oscura, una superficie casi negra no puede oscurecerse más, así que su barra queda más clara y se percibe como un reborde.

**Excepciones:**

- Solo los botones y las tarjetas se apoyan sobre una barra, porque son los componentes que reposan por encima de la elevación cero. Un badge, un chip, un campo o un tooltip es plano hasta que pide profundidad con `.raised`, y `.flat` quita la barra a cualquier cosa:

  ```html
  <div class="card soft edgeless info flat">Promo panel, deliberately flat</div>
  ```

- La `--font-rounded` la aportas tú. Una grotesca redondeada y gruesa es buena parte de este aspecto y el paquete no incluye ningún archivo de fuente, así que, si no aportas nada, se usa la pila propia de la página.
- Las etiquetas se dibujan más gruesas y con algo más de espaciado entre letras, mediante `--ui-label-weight` y `--ui-label-tracking`, así que tu propia utilidad `font-*` o `tracking-*` sigue ganando. Llega a `.btn` y `.badge`, y a un `<button>` sin clase solo donde `/native` le da estilo. Las mayúsculas no se tocan: cómo se redacta una etiqueta es decisión de la aplicación, así que si quieres botones en mayúsculas, escribe esa regla en tu propia hoja de estilos.
- `.card.interactive` se pulsa como un `.btn`, así que una baldosa de respuesta chunky cae sobre su barra al hacer clic; `.card.pressable` obtiene la misma pulsación por sí sola. Una `.card` simple se queda quieta.
- El `.primary` incluido es casi negro en una página clara y casi blanco en una oscura, y la barra siempre se mezcla hacia el negro. En una página clara, la barra de un botón primario es casi invisible frente a su cara casi negra (medido `1.04:1`). En una página oscura, la cara casi blanca frente a la misma barra se distingue bien (`2.48:1`). Dale a `.primary` un matiz propio si es la llamada a la acción y necesita la señal de profundidad en los dos temas.
- Con `prefers-reduced-motion: reduce` la pulsación sigue ocurriendo, pero al instante, como con neobrutalism.
- En esta estética la profundidad es la barra, nunca una sombra desenfocada. Todo lo que reposa plano queda a ras de la página.
- Los controles dibujan un gris más intenso que las baldosas que los rodean, `neutral-600` en claro y `neutral-400` en oscuro, mediante `--ui-control-ink`, para que un campo se lea como campo dentro de una baldosa.

## Cyber

Esquinas biseladas, un borde de 1px y un resplandor en el propio color del componente: un botón success brilla en verde, una tarjeta destructive en rojo. El bisel se dibuja con `corner-shape`, así que el borde, el resplandor y el contorno de foco siguen el corte en lugar de quedar recortados por él.

Los controles y las superficies toman el corte en diagonales opuestas, así que un botón y la tarjeta que lo rodea se perciben como el mismo material y como cosas distintas: los botones y los campos se cortan arriba a la izquierda y abajo a la derecha; las tarjetas, los paneles y las alertas, arriba a la derecha y abajo a la izquierda. Todo lo que es completamente redondo se corta en puntas: un radio, la perilla de un switch y el icono del tooltip se convierten en rombos, y un botón pill o un badge se convierte en un hexágono con puntas. Los chips pasan a ser cuadrados, así que el checkbox se lee como un cuadrado simple junto al radio en rombo.

`--cyber-cut` es el corte en el tamaño por defecto, `0.625rem`. Los controles lo escalan con su escalón de tamaño, así que un botón de icono `.p-xs` toma la mitad y conserva sus esquinas, y el corte sigue siendo de 45 grados exactos. `--cyber-shape` y `--cyber-shape-surface` reemplazan la colocación por defecto con cualquier valor de `border-radius`, usado tal cual. `--cyber-glow` es el desenfoque del resplandor, `8px`. `--cyber-ink` es el color neutro de la línea y del resplandor. Por defecto sigue al tema, casi negro en una página clara y casi blanco en una oscura; defínelo para un neutro neón.

```html
<section class="cyber" style="--cyber-ink: rgb(0 229 255); --cyber-cut: 0.75rem">
  <button class="btn">Open terminal</button>
</section>
```

Otras formas están a un valor de distancia. Defínelas en el elemento `.cyber` o en cualquier ancestro. `--ui-radius` definido en un elemento llega a ese elemento y a cada componente de dentro que no defina el suyo. Una forma que definas se usa tal cual y no escala, así que para una forma escalada en un único control usa en su lugar `.cut-diagonal-reverse`.

| Forma                           | Valor                 |
| ------------------------------- | --------------------- |
| Las cuatro esquinas             | `0.625rem`            |
| La otra diagonal                | `0 0.625rem`          |
| Hexágono (extremos en punta)    | `0.625rem / 50%`      |
| Paralelogramo                   | `0.625rem 0 / 100% 0` |
| Una muesca, arriba a la derecha | `0 0.625rem 0 0`      |

```html
<section class="cyber" style="--cyber-shape: 0.625rem / 50%">
  <button class="btn primary">Hexagonal buttons</button>
</section>
```

Un paralelogramo inclina sus lados hacia el contenido, así que dale relleno horizontal adicional a una superficie que lo use.

**Excepciones:**

- Hoy el bisel solo funciona en Chromium. Firefox y Safari todavía no dibujan `corner-shape`, y ahí la estética deja rectas sus esquinas cortadas en lugar de redondearlas, y lo que es completamente redondo sigue siendo redondo, así que el aspecto se degrada a cuadrado, con línea y con resplandor. Tomará el bisel sin ningún cambio en cuanto un motor lo incluya.
- El resplandor es un halo, no profundidad, así que todos los componentes lo toman, incluidos campos, badges y alertas, y `.flat` no lo quita. `.raised` y `.floating` no añaden sombra con esta estética.
- En el tema claro, el resplandor de un componente neutro o `.primary` es su tinta casi negra, que se percibe como una sombra suave y no como luz. El aspecto luce más en una página oscura, o con un `--cyber-ink` con matiz.
- Un `.btn.icon` simple es un control cuadrado, así que toma la diagonal de control; un `.btn.icon.pill` es redondo, así que se convierte en un rombo.
- La `--font-cyber` la aportas tú. El paquete no incluye ningún archivo de fuente, así que la estética recurre a la pila monoespaciada.
- Las mayúsculas no se tocan, por el motivo que da [Chunky tile](#chunky-tile).

## Sketch

Contornos dibujados a mano: los controles toman esquinas elípticas largas e irregulares, y las tarjetas, los paneles, las alertas y las tablas toman otras más marcadas que no invaden su relleno. Los elementos hermanos van rotando entre cuatro contornos según su posición, y el control de un campo toma la posición de su campo, así que una fila de botones o un formulario apilado no repite una misma forma. La rotación es estable para un orden del DOM dado, no aleatoria en cada renderizado. Cada contorno es un `border-radius` completo, usado tal cual en lugar de escalado por el escalón de tamaño o colocado por `.cut-diagonal`.

La línea de tinta de 1px es continua; los checkboxes, los divisores y las líneas divisorias de las tablas son discontinuos. `--ui-line-style: dashed` hace discontinuo cualquier otro componente, y `--ui-rule-style: solid` devuelve un divisor o una tabla a continuo. La sombra dura de 2px es una pequeña señal neutra de profundidad.

`--sketch-radius`, `--sketch-radius-surface` y `--sketch-radius-pill` reemplazan los contornos de control, de superficie y de botón pill. Define uno en la región o en cualquier elemento dentro de ella, y todas las posiciones por debajo toman ese único contorno, en los componentes que rotan: `.btn`, `.ipt`, `.textarea`, `.select`, `.input-group`, `.pre` y `.tooltip-bubble` para el contorno de control, y `.card`, `.panel`, `.alert` y `.data-table` para el de superficie. Cualquier otro elemento que toma un contorno de control o de superficie, como un `.skeleton` o un control sin clase bajo `/native`, toma el contorno que resolvió la propia región, así que un control definido entre la región y ese elemento no lo alcanza; defínelo en la región. Los chips, como `.badge` y `.checkbox`, toman contornos pequeños propios que ningún control cambia. Para dar forma a un solo componente, define en él `--ui-radius` (`--ui-radius-surface` en una superficie).

```html
<section class="sketch" style='--font-sketch: "Comic Sans MS", cursive'>
  <button class="btn primary">Send note</button>
  <button class="btn ghost edged" style="--ui-line-style: dashed">Draft note</button>
</section>
```

El botón discontinuo es `ghost edged` porque un botón relleno no tiene una línea separada que hacer discontinua.

`.sketch-rounded` cambia las esquinas largas por otras cortas y redondeadas, acotadas para que un elemento ancho conserve rectos sus bordes superior e inferior. Ponlo junto a `.sketch` en la región, o en un componente dentro de ella. `--sketch-radius-rounded` y `--sketch-radius-surface-rounded` son sus controles.

```html
<section class="sketch sketch-rounded">
  <div class="card">
    <button class="btn primary">Rounded action</button>
  </div>
</section>
```

**Excepciones:**

- Sketch nombra los componentes para rotar sus contornos, así que sus contornos solo llegan a los componentes de este paquete; una región de otra estética anidada dentro de una región sketch conserva las esquinas de esa estética. Decide la región más cercana, así que una región sketch anidada a su vez dentro de esa rota.
- Los chips, como checkboxes, teclas, código, badges, switches y barras de progreso, rotan entre pequeños contornos irregulares definidos en `--ui-radius-tight`. Define ese token en un chip para elegir su forma.
- Un `.btn.pill` toma una píldora redondeada acotada a su propia altura, para que uno ancho no se convierta en un óvalo. Los badges, las barras de progreso y los switches toman su contorno de chip. Los radios y el icono del tooltip siguen siendo círculos, ligeramente irregulares, para que un radio nunca se confunda con un checkbox. Un `--ui-radius-pill` explícito en un elemento sigue ganando.
- La `--font-sketch` la aportas tú. El paquete no incluye ninguna fuente manuscrita y recurre a la familia `cursive` de la plataforma.
- Los botones se pulsan con el `scale(0.97)` simple; con movimiento reducido la pulsación sigue ocurriendo, al instante.
- Con [`/native`](../setup.md#html-sin-clases), un `<hr>`, una `<table>` y un checkbox simples toman los detalles discontinuos de `.divider`, `.data-table` y `.checkbox`.
- El modo de colores forzados dibuja continuos los detalles discontinuos, como cualquier otra línea del material.

## Clases solo

Una clase de estética no cambia nada en un elemento al que este paquete no da estilo, como un toast de otra librería. Cada estética incluye también una clase solo, como `.glass-solo`, que pinta su aspecto sobre ese único elemento. [Clases solo](./solo.md) las explica.

## Siguiente paso

[Clases solo](./solo.md) aplica estos aspectos a componentes de otras librerías. Si todos los componentes de tu pantalla vienen de este paquete, las guías terminan aquí: [Composición](./composing.md), [Personalización](./customizing.md) y [Contenido y layout](./content-and-layout.md) son las páginas de consulta, y [Accesibilidad](../accessibility.md) enumera lo que tu aplicación todavía les debe a sus usuarios.
