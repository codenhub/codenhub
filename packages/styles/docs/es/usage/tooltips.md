---
title: Tooltips
description: Ayuda de campo que se abre con hover y con foco, cómo conectarla para los lectores de pantalla y la tecla Escape, y dónde queda recortado un tooltip.
order: 4
source: ac236b423d466ebd014b7738dd076ace2cfc50a3
---

# Tooltips

El switch "Perfil público" de la pantalla de ajustes merece una breve explicación: qué se vuelve visible cuando está activado. Esta página añade junto a él un botón de ayuda que muestra un tooltip con hover y con el foco del teclado. El CSS muestra, oculta y dibuja el mensaje; tú lo conectas con su disparador para los lectores de pantalla, añades la tecla Escape y compruebas que nada a su alrededor lo recorte.

## Un tooltip de ayuda

```html
<div class="cluster tight">
  <label class="cluster tight">
    <input class="switch primary" type="checkbox" role="switch" name="public-profile" />
    Public profile
  </label>
  <span class="tooltip">
    <button class="tooltip-icon" type="button" aria-label="About public profiles" aria-describedby="public-profile-help">?</button>
    <span class="tooltip-bubble" role="tooltip" id="public-profile-help">Anyone with the link can see your name, photo, and public projects.</span>
  </span>
</div>
```

Las tres partes:

- `.tooltip` envuelve el disparador y el mensaje. Posiciona el mensaje y no pinta nada por sí mismo.
- `.tooltip-bubble` es el mensaje. Es un elemento real, así que puede tener un `id` al que apunte el disparador.
- `.tooltip-icon` es un pequeño disparador redondo, para un mensaje que no tiene otra cosa a la que asociarse. Cualquier elemento que pueda recibir el foco puede ser el disparador: envuelve un `.btn` existente en `.tooltip` y conserva su propio aspecto.

Conéctalos tú: un `id` en la burbuja, `aria-describedby` en el disparador apuntando a ese `id` y `role="tooltip"` en la burbuja. Así un lector de pantalla lee el mensaje como la descripción del disparador. El CSS no puede crear esta conexión, y sin ella el mensaje es solo visual.

El disparador tiene que poder recibir el foco, como un `<button>`, para que quienes usan el teclado lleguen al mensaje. La burbuja se abre cuando cualquier elemento dentro de `.tooltip` tiene el foco, así que también se abre después de un clic con el ratón en el disparador.

## Posición

La burbuja se abre encima de su disparador, centrada en horizontal, con una separación de 0.5rem. Pon `data-tooltip-position` en `.tooltip` para elegir otro lado:

```html
<span class="tooltip" data-tooltip-position="bottom">
  <button class="btn ghost sm" type="button" aria-describedby="renewal-help">Renews 12 March 2027</button>
  <span class="tooltip-bubble" role="tooltip" id="renewal-help">Your card is charged on this date.</span>
</span>
```

| `data-tooltip-position` | Burbuja                                              |
| ----------------------- | ---------------------------------------------------- |
| _ninguno_ o `"top"`     | Encima del disparador, centrada.                     |
| `"bottom"`              | Debajo del disparador, centrada.                     |
| `"left"`                | A la izquierda del disparador, centrada en vertical. |
| `"right"`               | A la derecha del disparador, centrada en vertical.   |

Una burbuja es tan ancha como su texto, hasta 18rem, y a partir de ahí el texto salta de línea.

### Dónde queda recortado un tooltip

La burbuja se posiciona solo con CSS, en el lado que elegiste. Nada mide la página: no se desplaza para quedarse dentro de la ventana, no cambia al otro lado cuando no hay espacio y no pasa a la capa superior de la página. Eso tiene tres consecuencias:

- **Un contenedor con scroll o con recorte la corta.** Un ancestro con `overflow: hidden`, `auto` o `scroll` recorta la burbuja en su borde. La tabla de claves de API de la pantalla de ajustes está dentro de un `.table-wrap`, que tiene scroll, así que un tooltip superior en la primera fila queda recortado en la parte de arriba del contenedor. Subir el `z-index` no ayuda: cambia sobre qué se pinta la burbuja, no si el contenedor la recorta.
- **El borde de la ventana la corta.** Un tooltip superior en la primera línea de una página, o uno a la derecha cerca del borde derecho, se sale de la pantalla.
- **Izquierda y derecha son lados físicos.** En una página de derecha a izquierda, `"left"` sigue significando el lado izquierdo de la pantalla.

Qué hacer:

- Elige un lado con espacio: en la primera fila de una tabla, usa `data-tooltip-position="bottom"`.
- Saca el disparador del tooltip del contenedor que recorta, o quita el `overflow` de un contenedor que no lo necesita.
- Si la posición del disparador no se puede saber de antemano, como en una lista con scroll o en un panel redimensionable, usa una librería de posicionamiento o el componente de popover de tu framework, que pueden medir y cambiar de lado. Puedes seguir dando a su elemento de mensaje las clases `.tooltip-bubble` para el aspecto, pero entonces mostrar, ocultar y posicionar, como se describe en esta página, lo hace esa librería, no `.tooltip`.

## Hover, permanencia y Escape

WCAG 1.4.13 pide tres cosas al contenido que aparece con hover o con foco. El paquete resuelve dos:

- **Se puede pasar el puntero por encima.** Cuando el puntero sale del disparador, la burbuja se queda durante `--tooltip-linger` (300ms) y después se desvanece, para que el puntero pueda cruzar la separación hasta ella. Sigue abierta mientras el puntero está encima. Una burbuja cerrada tiene `visibility: hidden`, así que nunca captura el puntero.
- **Persistente.** Sigue abierta hasta que el puntero y el foco se van.
- **Descartable.** El usuario tiene que poder cerrarla sin mover el puntero ni el foco, normalmente con Escape. El CSS no puede escuchar una tecla, así que esta parte es tuya.

Para cambiar el tiempo de permanencia, define `--tooltip-linger` en el elemento `.tooltip` o en cualquier elemento que lo rodee, por ejemplo `style="--tooltip-linger: 500ms"`. Mantenlo lo bastante largo para que el puntero llegue a la burbuja. `--tooltip-gap` define de la misma forma el espacio entre el disparador y la burbuja. Ambas son [variables públicas de componente](./customizing.md#variables-de-componente).

Para Escape, escribe `data-state="closed"` en `.tooltip`: oculta la burbuja aunque tenga hover o foco. Quita el atributo solo cuando tanto el puntero como el foco hayan salido del tooltip, para que el siguiente hover o foco lo vuelva a abrir. Si lo quitas antes, mientras el disparador todavía tiene el foco, el mensaje vuelve a aparecer sin que el usuario haga nada.

```js
for (const tooltip of document.querySelectorAll(".tooltip")) {
  let pointerInside = tooltip.matches(":hover");

  tooltip.addEventListener("pointerenter", () => {
    pointerInside = true;
  });

  tooltip.addEventListener("pointerleave", () => {
    pointerInside = false;
    if (!tooltip.contains(document.activeElement)) tooltip.removeAttribute("data-state");
  });

  tooltip.addEventListener("focusout", (event) => {
    const focusStaysInside = tooltip.contains(event.relatedTarget);
    if (!focusStaysInside && !pointerInside) tooltip.removeAttribute("data-state");
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const tooltip of document.querySelectorAll(".tooltip:hover, .tooltip:focus-within")) {
    tooltip.dataset.state = "closed";
  }
});
```

`data-state="open"` hace lo contrario: muestra la burbuja sin hover ni foco, para un mensaje que debe quedarse visible, o para una prueba o una captura de pantalla.

## Cómo se ve la burbuja

Sin clase de intención, la burbuja usa `--color-tooltip`, un fondo elegido para cada tema: casi blanco en una página clara y gris medio en una oscura, con `--color-tooltip-contrast` como color de texto. El casi blanco mide solo 1.04:1 frente a una página clara, así que la burbuja también dibuja un borde fino, y el `.edgeless` de un contenedor no puede quitarlo. Un `.edgeless` en la propia burbuja sí puede. El fondo sigue siendo opaco con cualquier presentación, así que la burbuja sigue siendo legible sobre lo que tape.

Una clase de intención rellena la burbuja con el color de esa intención y cambia el texto al color de contraste correspondiente:

- `.tooltip-bubble.primary` tiene un fondo casi negro con texto casi blanco en una página clara, y un fondo casi blanco con texto casi negro en una oscura.
- `.tooltip-bubble.destructive` tiene un fondo rojo con texto claro en ambos temas.

Pon las clases de intención, presentación, estética y elevación en `.tooltip-bubble`, el elemento que se pinta, no en `.tooltip`. La burbuja es plana por defecto, incluso bajo una estética que dibuja profundidad; añade `.raised` o `.floating` a la burbuja para elevarla. Una estética en el ámbito da forma a la burbuja como a cualquier otro componente; bajo `.glass` es esmerilada como una tarjeta. `.tooltip-icon` toma la esquina de la estética: cuadrada bajo `.neobrutalism` y `.pixel`, un rombo bajo `.cyber`.

La burbuja aparece sin el efecto de escala cuando el usuario pide movimiento reducido.

## Siguiente paso

La pantalla de ajustes está completa con su aspecto por defecto. [Temas](./theming.md) le da un modo oscuro y los colores de tu marca.
