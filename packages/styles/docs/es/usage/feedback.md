---
title: Feedback
description: Un botón que indica que está guardando, alertas, badges, placeholders de carga y barras de progreso, y lo que tu código debe mantener sincronizado con ellos.
order: 3
source: e2a4c2af517dd286e22e762e4ba1997ebdb3c8c6
---

# Feedback

El formulario de perfil se puede enviar, pero nada le dice al usuario qué ha pasado. Esta página añade el feedback de la pantalla: un botón Guardar que muestra que está trabajando, una alerta cuando el guardado sale bien, un badge en la tarjeta del plan, un placeholder mientras carga el perfil y barras para el uso de almacenamiento y para una exportación de datos. El paquete dibuja cada uno de ellos; tu código decide cuándo aparecen, actualiza sus valores y se asegura de que los lectores de pantalla se enteren.

## Mostrar que el formulario se está guardando

No hay una clase de carga. Un botón que está guardando es un botón deshabilitado con un icono que gira:

```html
<button class="btn primary" type="submit" disabled>
  <i class="ic-lucide-loader-circle ic-anim-spin" aria-hidden="true"></i>
  Saving…
</button>
```

El spinner viene de `@codenhub/icons`, que este paquete no carga. Cárgalo una vez, como muestra [Botones → Cargar los iconos](./buttons.md#cargar-los-iconos); con CSS compilado es así:

```css
@import "@codenhub/icons";
@import "@codenhub/icons/lucide";
```

`ic-anim-spin` hace girar el icono y se detiene cuando el usuario pide al sistema movimiento reducido. La familia animada `svg-spinners` de `@codenhub/icons` es distinta: su dibujo sigue moviéndose con esa preferencia. Cualquiera de los dos iconos toma el color de texto del botón.

Deshabilitar el botón evita que un segundo clic envíe el formulario dos veces. Mantener o reemplazar el texto depende de ti; el paquete no tiene forma de ocultarlo. Un cambio en el texto de un botón no se anuncia de forma fiable, así que comunica el resultado a quienes usan lector de pantalla con un mensaje de estado, como hace la siguiente sección.

## Confirmar el resultado con una alerta

Cuando el guardado sale bien, muestra una alerta encima del formulario:

```html
<div class="alert success" role="status">Profile saved.</div>
```

`role="status"` hace que los lectores de pantalla anuncien el texto de forma educada, después de lo que estén leyendo. Para un error sobre el que el usuario debe actuar, usa `role="alert"`, que interrumpe:

```html
<div class="alert destructive" role="alert">Your changes were not saved. Check your connection and try again.</div>
```

Los lectores de pantalla anuncian una región live cuando cambia su contenido, así que renderiza la región vacía al cargar la página y pon el mensaje dentro, en lugar de insertar un nuevo elemento de alerta que ya contenga el texto. El paquete no añade rol, temporización ni botón de cierre; eso es cosa tuya.

Una alerta es una fila con una separación de 0.75rem, así que un icono colocado antes del mensaje queda espaciado automáticamente. `.alert-icon` da a un icono un tamaño de 1.25rem y lo alinea con la primera línea de texto:

```html
<div class="alert warning" role="status">
  <i class="alert-icon ic-lucide-triangle-alert" aria-hidden="true"></i>
  Your card expires next month. Update it to keep your plan.
</div>
```

Funciona cualquier elemento de icono: una clase de un conjunto de iconos, un `<svg>` en línea o un `<img>`. `@codenhub/icons` define el tamaño de sus glifos en una regla que ninguna clase puede superar, así que `.alert-icon` también define el `--ic-size` de ese conjunto. Para cambiar el tamaño del icono de una alerta, escribe tu propia regla que defina `width`, `height` y, para `@codenhub/icons`, `--ic-size`.

### Cómo se ven las alertas

Sin clase de presentación, una alerta es soft y con borde: un tinte claro de su intención, texto del color de la intención y un borde. Las clases de presentación lo cambian como en cualquier componente, por ejemplo `.alert.primary.solid` para un banner relleno.

Una alerta sin intención es una excepción. No tiene tinte en reposo; usa `--color-foreground`, el tono de fondo discreto un paso por encima de la página, igual que una `.card.soft` o un `.panel` neutros. Una alerta con `.primary`, `.secondary`, `.success`, `.warning`, `.destructive` o `.info` conserva su tinte. Aquí solo cuentan esas seis clases: una alerta con una clase de intención que hayas definido tú se trata como si no tuviera intención; consulta [Temas → Tu propia intención](./theming.md#tu-propia-intención).

## Etiquetar el plan con un badge

Un badge es una pequeña píldora para un estado o un recuento:

```html
<section class="card soft primary stack tight" aria-labelledby="plan-title">
  <div class="cluster between">
    <h2 class="text-label" id="plan-title">Current plan</h2>
    <span class="badge success">Active</span>
  </div>
  <p class="text-title-sm">Team, billed yearly</p>
</section>
```

Un badge es soft y sin borde por defecto, y acepta las mismas clases de intención y presentación que un botón: `.badge.warning` para "Pago pendiente", `.badge.info.solid` para un "Nuevo" relleno. A diferencia de una alerta, un badge sin intención conserva su tinte claro, porque no tiene borde, y sin el tinte se perdería en el texto que lo rodea.

## Mostrar un placeholder mientras carga

Mientras la tarjeta de perfil espera los datos, muestra bloques grises donde irá el texto:

```html
<section class="card stack" aria-busy="true" aria-labelledby="profile-title">
  <h2 class="text-title-sm" id="profile-title">Profile</h2>
  <p class="visually-hidden">Loading your profile…</p>
  <div class="stack tight" aria-hidden="true">
    <div class="skeleton" style="height: 2.5rem"></div>
    <div class="skeleton" style="width: 60%"></div>
  </div>
</section>
```

Un `.skeleton` ocupa el ancho de su contenedor y mide al menos 1rem de alto. No tiene tamaño ni forma propios: usa un elemento de bloque como un `<div>`, y ajusta su ancho y su alto al contenido al que sustituye. Un elemento en línea vacío como `<span class="skeleton">` no tiene tamaño y no aparece.

Un skeleton acepta una intención pero ignora la presentación. Sin intención, es un gris claro teñido por el color del texto que lo rodea. Muestra un brillo en movimiento que se detiene cuando el usuario pide movimiento reducido.

Marca los bloques con `aria-hidden="true"`, porque no significan nada para un lector de pantalla. Indica en su lugar con texto que el contenido está cargando, como hace el párrafo visualmente oculto, y quita `aria-busy` cuando el contenido esté en su sitio.

## Mostrar el progreso

La tarjeta de almacenamiento muestra cuánto espacio se usa, y el botón "Exportar datos antes" de la zona de peligro inicia una exportación que tarda un rato. Las dos son barras `.progress`:

```html
<div class="progress" role="meter" aria-label="Storage used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="48" aria-valuetext="48 GB of 100 GB" style="--progress-value: 48%"></div>

<div class="progress primary" role="progressbar" aria-label="Export progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="20" style="--progress-value: 20%"></div>
```

`--progress-value` es el ancho de la parte rellena, como porcentaje del carril. Vale 0% si no se define.

- **Escríbelo con `%`.** `--progress-value: 48` sin unidad no es un ancho válido, y la barra se muestra vacía.
- **No se limita ni se comprueba nada.** Por encima del 100%, el relleno se corta al final del carril y parece lleno; un valor negativo tampoco es un ancho válido. Mantén el valor entre 0% y 100% en tu código.
- **El valor visual y el valor anunciado son independientes.** El ancho de la barra viene de `--progress-value`; lo que anuncia un lector de pantalla viene de `aria-valuenow`. El paquete no los conecta, así que actualiza los dos a la vez.

```js
function setExportProgress(bar, percent) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  bar.classList.remove("indeterminate");
  bar.style.setProperty("--progress-value", `${value}%`);
  bar.setAttribute("aria-valuenow", String(value));
}
```

Cuando no sabes cuánto ha avanzado el trabajo, como mientras se prepara la exportación, usa `.indeterminate`. Una barra de aproximadamente un tercio del ancho del carril lo recorre de principio a fin una y otra vez, y `--progress-value` se ignora. Quita `aria-valuenow`, porque no hay un valor conocido que anunciar:

```html
<div class="progress primary indeterminate" role="progressbar" aria-label="Preparing export"></div>
```

`.active` añade un brillo sobre el carril de una barra determinada, para mostrar que el trabajo sigue en marcha entre actualizaciones. Las dos animaciones se detienen cuando el usuario pide movimiento reducido; una barra indeterminada queda entonces en reposo con su relleno al principio.

### Cómo se ven las barras de progreso

El relleno es el color de la intención con toda su intensidad, o `currentColor` sin intención. El carril es soft y sin borde por defecto: un tinte claro sin borde.

El carril por defecto es tenue. Frente a la página mide aproximadamente de 1.1:1 a 1.3:1, por debajo del 3:1 que WCAG 1.4.11 pide a las partes de un gráfico necesarias para entenderlo. Cuando importa la extensión del carril, usa `.ghost.edged` con una clase de intención, que dibuja un contorno alrededor en el color de la intención. Sin intención, el contorno es un gris claro que mide menos de 3:1; [Accesibilidad → Contornos de progreso](../accessibility.md#contornos-de-progreso) tiene las mediciones y lo que puedes hacer con una barra neutra. `.solid` no está soportado en el carril, porque el relleno y el carril serían del mismo color. `.ghost.edgeless` se renderiza, pero deja el carril sin un marco visible.

Para cambiar los colores del relleno, del carril o de su borde sin cambiar la intención, define `--progress-color`, `--progress-surface` o `--progress-edge` en la barra o en cualquier elemento que la rodee. Estas variables y `--progress-value` aparecen en [Personalización → Variables de componente](./customizing.md#variables-de-componente).

## Animación que no se detiene

Los skeletons, los brillos de `.active`, las barras indeterminadas y los spinners se animan mientras estén en la página. El paquete detiene sus propias animaciones cuando el usuario pide al sistema movimiento reducido, pero ese no es el único requisito. WCAG 2.2.2 pide que el movimiento que empieza automáticamente, dura más de cinco segundos y se muestra junto a otro contenido pueda ser pausado, detenido u ocultado por el usuario, salvo que el movimiento sea esencial.

Un indicador de carga que se muestra mientras el usuario no puede hacer otra cosa, y cuya ausencia lo confundiría, cuenta como esencial. Un brillo o un spinner que sigue moviéndose junto al contenido con el que el usuario está trabajando, como un brillo decorativo de "en vivo" en una tarjeta, no. Quítalos en cuanto terminen su trabajo, o dale al usuario un control que los detenga.

## Siguiente paso

La pantalla ya informa de lo que está haciendo. [Tooltips](./tooltips.md) añade un breve texto de ayuda junto a un campo de formulario.
