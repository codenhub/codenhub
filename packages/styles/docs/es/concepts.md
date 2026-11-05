---
title: Construir una pantalla
description: Maqueta la página de ajustes, define su tipografía y añade tarjetas y botones mientras aprendes qué son la intención, el relleno, el borde y la estética.
order: 3
source: 8fa5ed2f6fb9a2786f61301f94bbe806649d7e1d
---

# Construir una pantalla

Esta página convierte la estructura vacía de [Configuración inicial](./setup.md) en la primera parte real de la pantalla de ajustes: un encabezado de página, una tarjeta de perfil con los botones Guardar y Cancelar, y un resumen del plan junto a una tarjeta de uso. Por el camino presenta las tres decisiones que toma cada componente, intención, presentación y estética, justo cuando la pantalla necesita cada una. Todo lo demás en esta documentación se apoya en este modelo.

## La pantalla más pequeña

Un encabezado de página y una tarjeta con un botón:

```html
<main class="section">
  <div class="section-content narrow stack">
    <h1 class="text-title">Account settings</h1>
    <section class="card stack">
      <h2 class="text-title-sm">Profile</h2>
      <p>Your name appears on invoices and shared projects.</p>
      <button class="btn primary" type="button">Save changes</button>
    </section>
  </div>
</main>
```

Cada clase hace una sola cosa:

- `.section` da espacio a la página: un margen lateral adaptable (de 1 a 2rem) y un espacio generoso arriba y abajo (de 4 a 7rem).
- `.section-content` centra una columna con un ancho máximo; `.narrow` lo deja en 48rem en lugar de 80rem, un ancho cómodo para un formulario.
- `.stack` coloca sus hijos en vertical con una separación de 1rem.
- `.text-title` y `.text-title-sm` definen el tamaño de los encabezados: 1.875rem en negrita y 1.25rem en seminegrita.
- `.card` es un contenedor con borde, esquinas redondeadas y 1.25rem de relleno interior.
- `.btn` crea un botón, y `.primary` le da el color principal.

Los encabezados no toman su tamaño de la etiqueta: el reset le da a un `<h1>` sin clase de tipografía el mismo tamaño y peso que el texto que lo rodea. Así la estructura del documento, qué nivel de encabezado es un elemento, queda separada del tamaño con el que quieres que se vea. Si quieres que los encabezados reciban estilo automáticamente, consulta [Configuración inicial → HTML sin clases](./setup.md#html-sin-clases).

## Maquetar la página

Tres helpers de layout cubren la mayoría de las pantallas, y los tres usan la misma separación, `--layout-gap` (1rem):

- `.stack` para listas verticales de bloques.
- `.cluster` para una fila que salta de línea cuando se queda sin espacio, como un grupo de botones. Añade `.between` para llevar el primer y el último elemento a extremos opuestos.
- `.auto-grid` para una cuadrícula de tarjetas iguales que añade o quita columnas según cambia el espacio. Una columna nunca es más estrecha que `--layout-grid-min` (16rem), salvo que lo sea el propio contenedor.

`.tight` (0.5rem) y `.loose` (1.5rem) cambian la separación del layout en el que están. Un layout anidado dentro conserva su propia separación.

Añade un encabezado y pon los botones en una fila:

```html
<main class="section">
  <div class="section-content narrow stack loose">
    <header class="stack tight">
      <h1 class="text-title">Account settings</h1>
      <p>Manage your profile, plan, and security.</p>
    </header>

    <section class="card stack" aria-labelledby="profile-title">
      <h2 class="text-title-sm" id="profile-title">Profile</h2>
      <p>Your name appears on invoices and shared projects.</p>
      <div class="cluster">
        <button class="btn primary" type="button">Save changes</button>
        <button class="btn ghost" type="button">Cancel</button>
      </div>
    </section>
  </div>
</main>
```

[Contenido y layout](./usage/content-and-layout.md) enumera todos los helpers de layout, incluidos `.view`, `.divider` y `.visually-hidden`, y la escala tipográfica completa.

## Intención: qué color

El botón Guardar es `.primary` y el botón Cancelar no tiene intención, lo que lo hace neutro. Una clase de intención elige un rol de color:

| Clase          | Úsala para                               | Color por defecto                           |
| -------------- | ---------------------------------------- | ------------------------------------------- |
| _ninguna_      | Cualquier cosa sin un significado propio | Los grises de texto y de borde de la página |
| `.primary`     | La acción principal de una pantalla      | Casi negro en claro, casi blanco en oscuro  |
| `.secondary`   | Una segunda acción, más discreta         | Gris medio                                  |
| `.success`     | Confirmaciones y estados completados     | Verde esmeralda                             |
| `.warning`     | Algo que pronto necesita atención        | Ámbar, con texto oscuro                     |
| `.destructive` | Eliminar, revocar y errores              | Rojo rosado                                 |
| `.info`        | Avisos neutros y ayuda                   | Índigo                                      |

La intención se queda en el elemento que la lleva. Poner `.destructive` en una `<section>` no vuelve rojos todos los botones de dentro; la escribes en cada botón. Es deliberado: un contenedor que cambiara en silencio el color de todo lo que contiene también volvería rojo el botón Cancelar de una zona de peligro roja.

`.neutral` nombra explícitamente el valor por defecto. Rara vez lo necesitas, porque no poner ninguna clase de intención ya significa neutro; importa donde el color vendría de otra parte, como en una fila de tabla, que hereda la intención de su tabla.

## Presentación: cuánto color

El botón Cancelar es `.ghost`: sin relleno, solo texto de color, así que se percibe como menos importante que Guardar. Ese es el eje de presentación, dos decisiones independientes:

- **Relleno:** `.solid` rellena el componente con el color de su intención y cambia el texto al color de contraste. `.soft` mezcla un tinte claro del 12% y mantiene el texto en el color de la intención. `.ghost` no tiene relleno en reposo.
- **Borde:** `.edged` dibuja un borde en el color de la intención; `.edgeless` no dibuja ninguno.

```html
<button class="btn primary">Save changes</button>
<button class="btn primary soft">Preview</button>
<button class="btn primary ghost edged">Export data</button>
<button class="btn ghost">Cancel</button>
```

Cada componente tiene su propio valor por defecto cuando no se aplica ninguna clase de presentación. Un botón es sólido y sin borde. Una tarjeta no tiene relleno y tiene borde. Un campo de formulario no tiene relleno y tiene borde. [Composición](./usage/composing.md#valores-por-defecto-de-los-componentes) enumera el valor por defecto de cada componente.

A diferencia de la intención, la presentación se hereda. Un `.soft` en un contenedor vuelve soft todo lo que hay dentro salvo que un elemento diga otra cosa, y una clase en el propio elemento siempre gana a una heredada de un contenedor:

```html
<div class="cluster soft">
  <button class="btn primary">Soft primary</button>
  <button class="btn success">Soft success</button>
  <button class="btn primary solid">Solid: its own class wins</button>
</div>
```

Algunos componentes limitan lo que puede hacer la presentación, para proteger algo que necesitan. Un campo de formulario que hereda un contenedor `.solid` se rellena solo hasta el 6%, para que el texto escrito siga siendo legible. Un checkbox siempre conserva su borde, porque el borde es lo único que muestra una casilla sin marcar. Estos límites aparecen con cada componente y están reunidos en [Composición](./usage/composing.md).

## Terminar la primera pantalla

Añade un resumen del plan junto a una tarjeta de uso en una cuadrícula, y dale al resumen un tinte primario soft para que destaque como el estado actual de la cuenta:

```html
<main class="section">
  <div class="section-content narrow stack loose">
    <header class="stack tight">
      <h1 class="text-title">Account settings</h1>
      <p>Manage your profile, plan, and security.</p>
    </header>

    <section class="card stack" aria-labelledby="profile-title">
      <h2 class="text-title-sm" id="profile-title">Profile</h2>
      <p>Your name appears on invoices and shared projects.</p>
      <div class="cluster">
        <button class="btn primary" type="button">Save changes</button>
        <button class="btn ghost" type="button">Cancel</button>
      </div>
    </section>

    <div class="auto-grid">
      <section class="card soft primary stack tight" aria-labelledby="plan-title">
        <h2 class="text-label" id="plan-title">Current plan</h2>
        <p class="text-title-sm">Team, billed yearly</p>
        <p class="text-body">Renews on 12 March 2027.</p>
      </section>
      <section class="card stack tight" aria-labelledby="usage-title">
        <h2 class="text-label" id="usage-title">Storage</h2>
        <p class="text-title-sm">48 GB of 100 GB</p>
        <p class="text-body">Shared by 6 members.</p>
      </section>
    </div>
  </div>
</main>
```

En una ventana ancha las dos tarjetas quedan una al lado de la otra; cuando la columna es demasiado estrecha para dos columnas de 16rem más la separación entre ellas, se apilan. La página de [Feedback](./usage/feedback.md) convierte el número de la tarjeta de almacenamiento en una barra de uso.

Una `.card` reposa a una unidad de profundidad, pero en el aspecto base esa profundidad no tiene sombra visible; aparece cuando una estética la dibuja o cuando añades `.raised` o `.floating`. [Composición → Elevación](./usage/composing.md#elevación) explica la profundidad.

## Estética: de qué está hecho

El tercer eje cambia el material de todo lo que contiene: esquinas, grosor del borde, sombras y a veces la fuente. Necesita su propio import (consulta [Configuración inicial → Añadir una estética](./setup.md#añadir-una-estética-opcional)):

```html
<main class="section neobrutalism">
  <!-- La misma pantalla de ajustes: esquinas rectas, líneas gruesas y oscuras, sombras duras desplazadas -->
</main>
```

Como la presentación, una estética se hereda, y un componente dentro de ella puede llevar otra distinta. No la necesitas para construir la pantalla; [Estéticas](./usage/aesthetics.md) compara las seis.

## Vocabulario de esta documentación

Algunas páginas describen cómo se pinta un componente. Estas palabras tienen un único significado cada una:

| Palabra   | Significado                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relleno   | Cuánto del color de la intención cubre el componente, del 0% (`.ghost`) al 100% (`.solid`).                                                                                                 |
| Tope      | El relleno máximo que permite un componente. Por ejemplo, un campo de formulario limita un relleno heredado al 6%.                                                                          |
| Placa     | La superficie pintada del componente: el relleno, mezclado sobre el fondo.                                                                                                                  |
| Fondo     | El color sobre el que se mezcla el relleno. Normalmente se ve la propia página a través; unos pocos componentes definen la suya, como el tinte claro de la intención bajo `.kbd` y `.code`. |
| Borde     | El contorno del componente. Es distinto de las líneas divisorias, las líneas dentro de una tabla.                                                                                           |
| Tinta     | Un color que se usa para dibujar líneas: el borde, las líneas divisorias de una tabla, la marca de un checkbox. "Tinta de texto" es el color del texto impreso sobre una placa.             |
| Material  | Lo que cambia una estética: radio y forma de las esquinas, grosor y estilo del borde, sombra y transparencia.                                                                               |
| Losa      | Una sombra dura, sin desenfoque, desplazada hacia abajo y hacia un lado, como la que dibujan `.neobrutalism` y `.chunky-tile`.                                                              |
| Elevación | Cuánta de la sombra disponible toma un elemento: ninguna (`.flat`), una unidad (`.raised`) o dos (`.floating`).                                                                             |

## Los tokens detrás de las clases

Cada clase lee custom properties de CSS, llamadas tokens, así que puedes cambiar el resultado sin reescribir una clase:

| Tipo         | Controla                                                                                        | Dónde se enumeran                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Color        | La paleta: colores de intención, texto, bordes y fondos, para claro y oscuro.                   | [Temas → Tokens de color](./usage/theming.md#tokens-de-color)                             |
| Base         | Anchos y separaciones del layout, radios de esquina, altura de los controles, foco, movimiento. | [Temas → Tokens base](./usage/theming.md#tokens-base)                                     |
| Intención    | Los huecos de color que lee un componente después de que una clase de intención elige un rol.   | [Temas → Tokens de intención](./usage/theming.md#tokens-de-intención)                     |
| Presentación | Los porcentajes de relleno y de borde que definen las clases de presentación.                   | [Personalización → Tokens de presentación](./usage/customizing.md#tokens-de-presentación) |
| Material     | Radio, grosor del borde, geometría de la sombra y transparencia.                                | [Personalización → Tokens de material](./usage/customizing.md#tokens-de-material)         |
| Estética     | Un control por estética, como `--pixel-unit` o `--tile-lift`.                                   | [Personalización → Tokens de estética](./usage/customizing.md#tokens-de-estética)         |

Los tokens de color y los tokens base son lo que la mayoría de las aplicaciones cambia primero, para ajustarse a una marca. El resto es de más bajo nivel: los componentes los leen, y las clases de presentación y de estética los definen por ti.

## Límites que conviene conocer ya

- **La intención no se hereda.** Escríbela en cada elemento que la muestre. La única excepción son las filas de tabla.
- **Las clases solo dan estilo.** `<div class="btn">` parece un botón, pero no puede recibir el foco ni pulsarse con el teclado. Usa `<button>` o `<a href>`, y consulta [Accesibilidad](./accessibility.md).
- **Una combinación que la documentación no describe no está soportada.** Puede que se renderice, pero puede cambiar en cualquier versión; consulta [Introducción → Qué se considera soportado](./index.md#qué-se-considera-soportado).

## Siguiente paso

La pantalla tiene una acción principal y una discreta. [Botones](./usage/buttons.md) añade el resto: una acción destructiva para la zona de peligro, botones de icono, tamaños y estados deshabilitados.
