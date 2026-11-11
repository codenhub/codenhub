---
title: Accesibilidad
description: Lo que hace el CSS con el foco, los estados, el movimiento, el contraste, los colores forzados y el texto de derecha a izquierda, y lo que tu aplicación todavía les debe a sus usuarios.
order: 5
source: 71a52bc017a39f2bf329e33ab73e43ce1b9a4e1b
---

# Accesibilidad

La pantalla de ajustes está construida, y el CSS ha hecho su parte por el camino: cada campo muestra dónde está el foco, un email inválido se vuelve rojo y el spinner se detiene para los usuarios que piden menos movimiento. El resto depende de tu HTML y tu JavaScript. Este paquete da estilo a los estados; no aporta elementos semánticos, atributos ARIA, comportamiento de teclado, gestión del foco, validación ni el momento de los anuncios.

Esta página enumera las dos mitades: lo que aporta el CSS y lo que tu aplicación tiene que añadir.

## Lo que aporta el CSS

### Foco y estado

| Característica                  | Comportamiento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:focus-visible`                | Un contorno de foco en cada elemento, dibujado con `--focus-ring`, `--focus-ring-width` y `--focus-ring-offset`. En un componente con un relleno de más de la mitad de intensidad, como un botón `.solid.primary`, una línea de 2px del color de la página recorre el interior del anillo, así que el anillo sigue visible sobre un relleno de su mismo color.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Foco en controles de formulario | `.ipt`, `.textarea` y `.select` dibujan el contorno de foco y cambian su borde al color de la intención. El texto escrito en un campo con una clase de intención usa el tono legible de esa intención, `--intent-strong`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Controles inválidos             | `aria-invalid="true"` en un control de formulario vuelve destructivos su borde, su color de foco y el texto escrito, este último en el tono legible destructivo. Un checkbox, un radio o un switch se dibuja exactamente igual que su versión `.destructive`, marca de activado incluida.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Controles deshabilitados        | `disabled`, `aria-disabled="true"`, `data-disabled` y `.disabled` muestran el cursor y la opacidad de deshabilitado, y un control deshabilitado no reacciona al hover, tampoco dentro de un `.input-group`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Estado abierto                  | `data-state="open"` en un `.tooltip` muestra su burbuja sin hover ni foco, y `data-state="closed"` la oculta aunque tenga hover o foco. Ningún otro componente lee ninguno de los dos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `<dialog>` nativo               | Un `<dialog>` con `.card`, `.panel`, `.surface` o una clase propia que hace `@apply surface` permanece oculto hasta que se abre, y se abre centrado. Un margen que pongas en el diálogo, como utilidad o en tu propio CSS, sigue sobrescribiendo el centrado, salvo que una utilidad de margen no lo hace cuando tu clase aplica `surface` en CSS plano; consulta [Personalización → Helpers de composición](./usage/customizing.md#helpers-de-composición). Con la [hoja de estilos sin clases](./setup.md#html-sin-clases), un `<dialog>` simple es una `.card.floating` y se comporta igual; con los demás puntos de entrada, un diálogo sin ninguna de estas clases no se toca. Atrapar el foco, cerrar con Escape y dejar inerte la página de detrás es cosa de tu aplicación. |

### Contenido visualmente oculto

`.visually-hidden` oculta contenido en pantalla y lo mantiene para los lectores de pantalla, como hace el `<caption>` de la tabla de claves de API en [Contenido y layout → Tablas](./usage/content-and-layout.md#tablas). Viene con las utilidades de layout: en `.`, `./native`, `./tw`, `./tw/native` y `./tw/utilities`. No está en `./components` ni en los puntos de entrada de componentes `./tw/components` y `./tw/*`.

### Límites de los controles

WCAG 1.4.11 pide que el límite de un control que necesitas ver para usarlo tenga un contraste de al menos 3:1 con lo que lo rodea.

| Característica                  | Comportamiento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controles de texto en reposo    | El borde de un control de texto reposa más claro que el borde completo de su intención, por debajo de 3:1 a propósito, para que el hover y el foco tengan un tono más intenso al que cambiar.                                                                                                                                                                                                                                                                                                           |
| Toggles                         | `.checkbox`, `.radio` y `.switch` dibujan su borde completo, porque el borde es lo único que muestra una casilla sin marcar. Un `.switch` con su propio `.edgeless` es la excepción, más abajo.                                                                                                                                                                                                                                                                                                         |
| `.edgeless` desde un contenedor | Lo ignoran todos los controles de texto y toggles: un contenedor no puede quitar el borde de un campo o toggle que contiene.                                                                                                                                                                                                                                                                                                                                                                            |
| `.edgeless` en el control       | `.ipt`, `.textarea`, `.select` y `.switch` pierden su borde y dejan de cumplir 1.4.11 en reposo. `.switch.ghost` conserva su borde incluso entonces, porque sin relleno y sin borde nada mostraría el carril.                                                                                                                                                                                                                                                                                           |
| `.checkbox`, `.radio`           | Siempre dibujan su borde, venga `.edgeless` de un contenedor o lo lleven ellos mismos. `.edgeless` en ellos no está soportado.                                                                                                                                                                                                                                                                                                                                                                          |
| Carril de progreso              | A propósito, la parte rellena lleva el valor y el carril es un fondo discreto. El carril por defecto, `.soft.edgeless`, mide aproximadamente de 1.1:1 a 1.3:1 frente a la página. La parte rellena mide al menos 3:1 frente a ese carril para todas las intenciones excepto warning en claro (unos 2.7:1) e info en oscuro (unos 2.9:1). Donde el propio carril deba cumplir 1.4.11, usa `.ghost.edged` con una clase de intención; consulta [Contornos de progreso](#contornos-de-progreso) más abajo. |

### Contornos de progreso

En un `.progress.ghost.edged`, el carril es la página, y tanto su contorno como la parte rellena se dibujan en el color de la intención. Medido frente a la página, sin estética:

| Intención      | Página clara | Página oscura | Cumple 3:1                                                                    |
| -------------- | ------------ | ------------- | ----------------------------------------------------------------------------- |
| `.primary`     | 18.96:1      | 18.96:1       | Sí                                                                            |
| `.secondary`   | 7.47:1       | 7.63:1        | Sí                                                                            |
| `.success`     | 5.14:1       | 3.69:1        | Sí                                                                            |
| `.warning`     | 3.06:1       | 6.20:1        | Sí                                                                            |
| `.destructive` | 5.80:1       | 3.27:1        | Sí                                                                            |
| `.info`        | 6.17:1       | 3.07:1        | Sí                                                                            |
| Sin intención  | 2.48:1       | 1.91:1        | No: el contorno no cumple, aunque la parte rellena, en el color del texto, sí |

Sin clase de intención, el contorno es el gris discreto de los bordes, `--color-border`. Para que un carril neutro cumpla 1.4.11, dale a la barra una clase de intención, o define `--progress-edge` con un color más intenso, como `var(--color-accent)`, que mide 7.47:1 en una página clara y 7.63:1 en una oscura. Warning en una página clara e info en una oscura superan 3:1 por poco margen, así que vuelve a medir si cambias esos colores.

### Movimiento y transparencia

| Característica                      | Comportamiento                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movimiento reducido, componentes    | Con `prefers-reduced-motion: reduce`, cada componente detiene sus propias transiciones y animaciones: el brillo del skeleton y del progreso, la barra indeterminada, el tooltip, las marcas de los toggles y el movimiento de la pulsación. La pulsación en sí sigue ocurriendo, al instante, con el aspecto por defecto y con cada estética y clase solo, porque es la señal de que un clic se registró. |
| Movimiento reducido, toda la página | El reset también acorta todas las demás animaciones y transiciones de la página.                                                                                                                                                                                                                                                                                                                          |
| Transparencia reducida              | Con `prefers-reduced-transparency: reduce`, y con colores forzados, `.glass`, `.glass-liquid` y `.glass-solo` pierden su desenfoque y su lente y se vuelven opacos.                                                                                                                                                                                                                                       |

La regla de movimiento reducido de cada componente viene con el componente, así que cada punto de entrada que lo incluye respeta el movimiento reducido sin el reset, incluidos `@codenhub/styles/components`, `@codenhub/styles/tw/components` y cada punto de entrada de componente `/tw/*`. Los puntos de entrada completo y native añaden la regla del reset para toda la página.

La regla del reset es `!important` dentro de la capa `base`, y un `!important` con capa gana a uno sin capa, así que tu propio `!important` no puede volver a activar una animación. Para mantener una en marcha para los usuarios que piden movimiento reducido, como un spinner de subida que consideres esencial, declárala `!important` en una capa ordenada antes de `base`. La primera sentencia `@layer` que lee el navegador fija el orden, así que la tuya va antes del paquete:

```css
@layer essential-motion, theme, base, components, utilities;
@import "@codenhub/styles";

@layer essential-motion {
  @media (prefers-reduced-motion: reduce) {
    .upload-spinner {
      animation-duration: 1s !important;
      animation-iteration-count: infinite !important;
    }
  }
}
```

Respetar el movimiento reducido no es todo lo que se pide. El movimiento que sigue en marcha junto al contenido, como un brillo que queda en una tarjeta después de que ha cargado, necesita una forma de detenerlo para todos los usuarios; consulta [Feedback → Animación que no se detiene](./usage/feedback.md#animación-que-no-se-detiene).

### Color y contraste

Las mediciones de abajo corresponden a los colores incluidos. En cuanto cambies un token de color, vuelve a medir tus propios pares; [Temas → Cambiar el color de marca](./usage/theming.md#cambiar-el-color-de-marca) muestra qué pares comprobar.

| Característica                   | Comportamiento                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Etiquetas rellenas               | La etiqueta `.solid` de cada intención cumple 4.5:1 (WCAG 1.4.3) como texto normal, en ambos temas. La más baja es success, con 5.14:1.                                                                                                                                                                 |
| Texto de warning                 | `--color-warning-contrast` es casi negro, no el color de la página, porque un ámbar lo bastante oscuro para llevar texto blanco ya no parece ámbar.                                                                                                                                                     |
| Rellenos parciales               | El color de texto de contraste solo aparece en rellenos por encima de la mitad de intensidad, así que el relleno limitado de un control de texto conserva el color de texto propio de la intención.                                                                                                     |
| Color de intención en oscuro     | En modo oscuro, una etiqueta `.soft` o `.ghost` usa el tono `-300` de su intención, así que conserva su matiz en lugar de volverse blanca.                                                                                                                                                              |
| Texto sobre un padre con relleno | Un componente neutro que no es `.solid`, como un badge en un `.btn.primary` o un botón ghost en una `.card.solid.primary`, imprime en el color de texto de su padre en lugar del de la página, así que conserva el contraste del padre.                                                                 |
| Impresión                        | Una página se imprime con el tema claro, y los componentes con relleno imprimen su fondo (`print-color-adjust: exact`), así que el texto de contraste nunca cae sobre papel en blanco. Una utilidad `dark:` se sigue aplicando al imprimir; consulta [Temas → Impresión](./usage/theming.md#impresión). |
| Marcas de los toggles            | Una marca activada mide al menos 3:1 frente a cada relleno que su presentación pueda darle, en ambos temas.                                                                                                                                                                                             |
| Rellenos soft con borde          | `.edged` en un `.alert`, `.panel`, `.badge`, `.kbd`, `.code` o `.pre` `.soft` dibuja un borde que mide menos de 3:1 frente al relleno del 12% en algunas intenciones, cuáles depende del tema. Mide el par antes de confiar en ese borde como límite de un control.                                     |

### Colores forzados y dirección

| Característica      | Comportamiento                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colores forzados    | Con `forced-colors: active`, los bordes, los estados activados, el chevron de un `.select` y el valor de una barra de progreso siguen visibles, dibujados con colores del sistema, bajo cualquier estética. Una estética que dibuja su borde como una sombra interior, como `.pixel`, dibuja en su lugar un borde real. El cristal se vuelve opaco, porque los colores forzados conservan la transparencia de un fondo. |
| Dirección del texto | Con `dir="rtl"`, la barra de las citas, el icono de la alerta, el relleno del progreso, el divisor vertical, la perilla del switch, la alineación de las tablas y el chevron de un select cambian de lado. No hace falta ninguna clase.                                                                                                                                                                                 |

Con colores forzados, `.text-control`, `.ipt`, `.textarea`, `.select`, los toggles y tu propia clase que hace `@apply text-control` muestran un contorno de foco `Highlight` de 2px. Dentro de un `.input-group`, el grupo dibuja el anillo del campo y el control interior no dibuja ninguno, así que un campo con foco muestra un solo anillo. El punto de entrada native da el mismo contorno a los inputs de texto, selects, textareas, checkboxes y radios sin clase.

Los checkboxes, radios y switches usan los colores del sistema `Canvas`, `CanvasText`, `Highlight` y `HighlightText`, así que activado y desactivado siguen siendo distinguibles: un toggle activado se rellena con `Highlight` y su marca es `HighlightText`, tanto en las clases como en el punto de entrada native. La forma, el tamaño y el espaciado no cambian.

Una barra `.progress` hace lo mismo: su parte rellena es `CanvasText` sobre un carril `Canvas` con un contorno `CanvasText`, sea cual sea su intención o su presentación, así que una barra a medio llenar no se confunde con una vacía. El brillo de `.active` no se dibuja.

## Lo que hace falta fuera del CSS

Usa el elemento HTML que corresponde a lo que hace el componente, y añade el comportamiento que el CSS no puede dar.

| Interfaz            | Lo que añade tu aplicación                                                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botones             | `<button>` para acciones y `<a href>` para navegación. Un nombre accesible, como `aria-label`, en cada `.btn.icon`.                                                                                                                                              |
| Formularios         | Un `<label>` para cada control, el `type` correcto, validación y `aria-describedby` enlazando pistas y errores. Mantén las pistas y los errores fuera del `<label>`, y dale a un `.switch` `role="switch"`.                                                      |
| Alertas             | `role="status"` para una confirmación como "Perfil guardado", o `role="alert"` para un error que necesita atención inmediata.                                                                                                                                    |
| Toasts              | Una región live, una forma de cerrarlo, reglas de foco y una pausa en cualquier temporizador.                                                                                                                                                                    |
| Tooltips            | Un `id` real y `role="tooltip"` en la burbuja, referenciado desde el `aria-describedby` del disparador. El cierre con Escape escribiendo `data-state="closed"`; consulta [Tooltips](./usage/tooltips.md#hover-permanencia-y-escape). La burbuja ya admite hover. |
| Progreso            | Un elemento `<progress>`, o `role="progressbar"` o `role="meter"` con valores ARIA, cuando el valor debe anunciarse.                                                                                                                                             |
| Skeletons           | `aria-hidden="true"` en los elementos visuales de carga, incluido un spinner que aportes tú, y el estado de carga anunciado de otra forma cuando haga falta.                                                                                                     |
| Movimiento continuo | Una forma de pausar, detener u ocultar el movimiento que no es esencial; consulta [Feedback → Animación que no se detiene](./usage/feedback.md#animación-que-no-se-detiene).                                                                                     |
| Popovers, modales   | Atrapar el foco, cerrar con Escape, un fondo inerte, etiquetas y roles.                                                                                                                                                                                          |

## Atributos de estado

Prefiere los atributos nativos:

```html
<button class="btn primary" disabled>Saving…</button> <input class="ipt" type="email" aria-invalid="true" aria-describedby="email-error" />
```

Usa atributos ARIA o data donde el elemento o tu librería de componentes no tenga uno nativo:

```html
<a class="btn secondary" aria-disabled="true">Export data</a>
<span class="tooltip" data-state="open">
  <button type="button" class="tooltip-icon" aria-label="About public profiles" aria-describedby="public-profile-help">?</button>
  <span class="tooltip-bubble" role="tooltip" id="public-profile-help">Anyone with the link can see your name and photo.</span>
</span>
```

`aria-disabled="true"` indica a las tecnologías de asistencia que el control está deshabilitado, pero no impide un clic ni una pulsación de tecla. Usa el atributo `disabled`, o detén la acción en JavaScript.

## Siguiente paso

Con esto termina el orden de lectura. La [Introducción](./index.md) enlaza todas las páginas, y [Composición](./usage/composing.md), [Personalización](./usage/customizing.md) y [Contenido y layout](./usage/content-and-layout.md) son las páginas de consulta para más adelante.
