---
title: Formularios
description: Campos con etiqueta, pistas y errores, iconos y prefijos fijos, selects y toggles de checkbox, radio y switch.
order: 2
source: bb81303c18d3da5ae193ff34ad8a96225cee0cf8
---

# Formularios

La tarjeta de perfil tiene un botón Guardar pero nada que guardar. Esta página la completa: un nombre visible con una pista, una dirección de email que muestra un error de validación, una dirección de perfil con un prefijo fijo, un select de idioma y los toggles de notificaciones, facturación y visibilidad del perfil. El paquete da estilo a cada control; tu HTML aporta las etiquetas, la validación y los mensajes de error, y esta página muestra cómo conectarlos.

## Un campo con etiqueta

Un campo es una etiqueta, un control y una pista opcional, apilados:

```html
<div class="field">
  <label class="label" for="display-name">Display name</label>
  <input class="ipt" id="display-name" name="display-name" aria-describedby="display-name-hint" />
  <span class="hint" id="display-name-hint">Shown on invoices and shared projects.</span>
</div>
```

- `.field` apila sus hijos con una separación pequeña (0.35rem) y ocupa todo el ancho.
- `.label` define el texto de la etiqueta: 1rem, peso medio.
- `.hint` es un texto de ayuda más pequeño y en color secundario. Mantenlo fuera del `<label>` y apunta `aria-describedby` a él, para que un lector de pantalla lo anuncie como descripción en lugar de leerlo como parte del nombre del campo.
- `.ipt` da estilo a un `<input>`. Usa `.textarea` para un `<textarea>` y `.select` para un `<select>`.

Un control de texto mide al menos 2.5rem de alto (`--control-height`), la misma altura que un botón por defecto, así que un campo y un botón quedan alineados en una fila. Su aspecto por defecto es sin relleno y con borde. Un `.textarea` mide al menos 7rem de alto y se puede redimensionar en vertical.

### Tamaños

`.ipt`, `.select`, `.textarea` e `.input-group` aceptan las clases de tamaño del botón, así que un campo pequeño y un botón pequeño quedan alineados en una fila:

| Clase       | Altura | Relleno lateral | Texto     |
| ----------- | ------ | --------------- | --------- |
| `.sm`       | 2rem   | 0.625rem        | 0.875rem  |
| por defecto | 2.5rem | 0.75rem         | heredado  |
| `.lg`       | 3rem   | 1rem            | 1.0625rem |

Las esquinas escalan con el tamaño, como las de un botón. Un `.textarea` conserva su altura mínima de 7rem en todos los tamaños; la clase cambia su texto, su relleno y sus esquinas. Define el tamaño de un `.input-group` en el grupo, no en el control de dentro: el control y sus adornos toman el tamaño de texto del grupo.

```html
<div class="cluster tight">
  <input class="ipt sm" aria-label="Coupon code" />
  <button class="btn sm" type="button">Apply</button>
</div>
```

## Mostrar un error de validación

Marca el control como inválido con `aria-invalid="true"` y dale al mensaje de error `.hint.destructive`:

```html
<div class="field">
  <label class="label" for="email">Email</label>
  <input class="ipt" type="email" id="email" name="email" value="ada@" aria-invalid="true" aria-describedby="email-error" />
  <span class="hint destructive" id="email-error">Enter a full email address, such as ada@example.com.</span>
</div>
```

Un control inválido dibuja su borde, su anillo de foco y el texto escrito en el color destructivo, tenga la clase de intención que tenga. El texto usa el tono legible de ese color, `--intent-strong`, para que siga siendo legible sobre la página. El paquete solo pinta el estado: decidir que el valor es inválido, poner y quitar `aria-invalid` y escribir el mensaje es cosa de tu código. Quita `aria-invalid` en cuanto el valor vuelva a ser válido; si lo dejas puesto, el campo sigue en rojo. En un checkbox, un radio o un switch, `aria-invalid="true"` dibuja el toggle exactamente igual que `.destructive`, marca de activado incluida.

Un `.hint` acepta cualquier intención con nombre, no solo `.destructive`: `.hint.success` confirma que se aceptó un valor, y `.hint.warning` señala uno que está permitido pero es inusual. Cada uno se muestra en el tono legible de su intención, `--intent-strong`, que mantiene 4.5:1 frente a la página en los dos temas. Un `.hint` sin intención, o con `.neutral`, se queda en el color secundario. Solo lo colorea una clase en el propio `.hint`; una intención en el campo o en un contenedor que lo rodee no lo hace.

```html
<input class="ipt success" id="username" value="ada" aria-describedby="username-hint" /> <span class="hint success" id="username-hint">That username is available.</span>
```

## Montar el formulario de perfil

```html
<form class="card stack" aria-labelledby="profile-title">
  <h2 class="text-title-sm" id="profile-title">Profile</h2>

  <div class="field">
    <label class="label" for="display-name">Display name</label>
    <input class="ipt" id="display-name" name="display-name" value="Ada Lovelace" aria-describedby="display-name-hint" />
    <span class="hint" id="display-name-hint">Shown on invoices and shared projects.</span>
  </div>

  <div class="field">
    <label class="label" for="email">Email</label>
    <input class="ipt" type="email" id="email" name="email" value="ada@example.com" />
  </div>

  <div class="field">
    <label class="label" for="bio">Bio</label>
    <textarea class="textarea" id="bio" name="bio" rows="3"></textarea>
  </div>

  <div class="field">
    <label class="label" for="language">Language</label>
    <select class="select" id="language" name="language">
      <option>English</option>
      <option>Português</option>
      <option>Español</option>
    </select>
  </div>

  <div class="cluster">
    <button class="btn primary" type="submit">Save changes</button>
    <button class="btn ghost" type="reset">Cancel</button>
  </div>
</form>
```

Un `.select` dibuja su propia flecha. Con `multiple` o con un `size` mayor que 1 se convierte en un cuadro de lista: sin flecha y tan alto como las filas que muestra. La lista de opciones abierta la dibujan el navegador y el sistema operativo, así que no toma el aspecto del paquete.

## Añadir un icono o un prefijo fijo

`.input-group` pone un icono o un fragmento de texto dentro del borde de un campo. El grupo dibuja el borde, el fondo, el anillo de foco y los estados inválido y deshabilitado; el control de dentro renuncia a los suyos, así que el borde se dibuja una sola vez. Coloca el adorno antes del control para ponerlo al principio, o después para ponerlo al final. Un grupo mide lo mismo que un campo solo, así que queda alineado con los campos y los botones que tiene al lado.

La dirección del perfil siempre empieza con el mismo host, así que es un prefijo fijo:

```html
<div class="field">
  <label class="label" for="profile-url">Profile address</label>
  <div class="input-group" style="--input-group-gap: 0">
    <span>app.example.com/u/</span>
    <input class="ipt" id="profile-url" name="profile-url" value="ada" />
  </div>
</div>
```

La separación entre el control y su adorno es `--input-group-gap`, 0.5rem por defecto. Eso le va bien a un icono, pero un texto que debe leerse como parte del valor parece roto con un espacio detrás, así que el ejemplo la pone a `0`. Defínela en el propio `.input-group`: el grupo declara su propio valor por defecto, así que un valor definido en un elemento padre no tiene efecto. Es una de las seis [variables públicas de componente](./customizing.md#variables-de-componente).

Una búsqueda de miembros, con un icono al principio (las clases `ic-lucide-*` necesitan `@codenhub/icons` cargado; consulta [Botones → Cargar los iconos](./buttons.md#cargar-los-iconos)):

```html
<div class="field">
  <label class="label" for="member-search">Find a member</label>
  <div class="input-group">
    <i class="ic-lucide-search" aria-hidden="true"></i>
    <input class="ipt" type="search" id="member-search" name="q" />
  </div>
</div>
```

Un `.select` también funciona en un grupo. El grupo quita el relleno lateral del control, excepto al final de un select de una sola fila, que conserva 1.75rem para que el texto de la opción elegida no quede bajo la flecha.

Cualquier elemento sirve como adorno: una clase de icono, un `<svg>` en línea, un `<img>` o texto. El paquete no incluye iconos para los campos, porque una imagen incorporada no podría seguir tu color de texto, tu tema ni tu estética.

El grupo lee la intención y la presentación igual que un `.ipt` solo: `.input-group.primary` colorea el borde y el texto escrito, y `.input-group.soft.edgeless` es un campo hundido en la página. Pon la intención en el grupo, no en el control de dentro: el grupo dibuja el campo, así que el texto del control toma la intención del grupo y una clase de intención en el control no tiene efecto. `aria-invalid="true"` o `disabled` en el control de dentro se aplica a todo el grupo, y lo mismo si cualquiera de los dos está en el propio grupo. El anillo de foco del grupo aparece cuando su campo tiene el foco, así que, a diferencia de un campo solo, también se muestra después de un clic con el ratón. Un botón dentro del grupo, como un botón para borrar, dibuja su propio anillo cuando tiene el foco, y el grupo no dibuja ninguno: un solo anillo marca siempre el único control que tiene el foco.

## Decoraciones del navegador

Algunos tipos de input traen botones integrados: el botón del selector de un campo de fecha u hora, las flechas arriba y abajo de un campo numérico y el botón de borrar de un campo de búsqueda. El paquete los conserva, porque cada uno también hace algo: el botón del selector es la única forma de abrir el selector con el ratón, y el botón de borrar vacía el campo.

`.unadorned` los quita, para un campo en el que dibujas los tuyos. Ponlo en el control o en su `.input-group`. Quitar una decoración quita lo que hacía, así que conecta tú mismo su reemplazo: `input.showPicker()` abre un selector, `stepUp()` y `stepDown()` sustituyen a las flechas, y poner `value` a `""` y lanzar un evento `input` sustituye a un botón de borrar. Escribir sigue funcionando en cualquier caso. Firefox no ofrece ninguna forma de quitar el botón de su selector de fecha, así que se queda.

```html
<div class="field">
  <label class="label" for="member-filter">Find a member</label>
  <div class="input-group unadorned">
    <i class="ic-lucide-search" aria-hidden="true"></i>
    <input class="ipt" type="search" id="member-filter" name="q" />
    <button class="btn icon ghost p-xs" type="button" aria-label="Clear search">
      <i class="ic-lucide-x" aria-hidden="true"></i>
    </button>
  </div>
</div>
```

El botón de borrar de arriba es un `<button>` real con un nombre accesible. Un botón dentro de un grupo conserva sus propias clases: un `.btn.ghost` no tiene relleno y, como cualquier botón por defecto, tampoco borde, así que queda dentro del borde del campo sin dibujar uno propio.

## Toggles

La pantalla de ajustes tiene tres tipos de toggle: un checkbox para activar los emails de facturas, botones de radio para elegir un periodo de facturación y un switch para hacer público el perfil. Cada clase va en un `<input>` nativo del tipo correspondiente:

```html
<fieldset class="stack tight">
  <legend class="label">Notifications</legend>
  <label class="cluster tight">
    <input class="checkbox" type="checkbox" name="invoice-email" checked />
    Email me when an invoice is ready
  </label>
</fieldset>

<fieldset class="stack tight">
  <legend class="label">Billing period</legend>
  <label class="cluster tight">
    <input class="radio" type="radio" name="period" value="monthly" />
    Monthly
  </label>
  <label class="cluster tight">
    <input class="radio" type="radio" name="period" value="yearly" checked />
    Yearly, two months free
  </label>
</fieldset>

<label class="cluster tight">
  <input class="switch primary" type="checkbox" role="switch" name="public-profile" />
  Public profile
</label>
```

- `.checkbox` va en `type="checkbox"`, `.radio` en `type="radio"` y `.switch` en `type="checkbox"`. Dale tú mismo `role="switch"` a un switch, para que se anuncie como activado o desactivado en lugar de marcado.
- `.cluster.tight` en el `<label>` alinea el control con su texto y deja una separación de 0.5rem.
- Un checkbox con la propiedad `indeterminate` activada, para un grupo en el que solo algunos elementos están marcados, muestra un guion, y lo mantiene aunque también esté `checked`, como hace el checkbox propio del navegador. Actívala desde un script (`input.indeterminate = true`); no hay atributo para ello.

### Colores marcado y sin marcar

Una clase de intención define el color de marcado. Sin intención, un toggle marcado se rellena con el color del texto y la marca se dibuja en el color de la página: una casilla negra con un tick blanco en una página clara. A diferencia de un botón neutro, un toggle neutro se rellena por completo cuando está marcado.

La presentación solo cambia el aspecto sin marcar. Todos los toggles reposan en `.soft`; una vez marcados, cada uno tiene un único aspecto sea cual sea su presentación:

| Toggle               | Relleno sin marcar | Marcado                                                 |
| -------------------- | ------------------ | ------------------------------------------------------- |
| `.ghost`             | 0%                 | Relleno del 100%, con la marca en el color de contraste |
| `.soft`, por defecto | 12%                | Relleno del 100%, con la marca en el color de contraste |
| `.solid`             | 40%                | Relleno del 100%, con la marca en el color de contraste |

Un checkbox marcado y un switch marcado recortan su marca sobre la placa rellena. Un radio marcado engrosa su anillo hasta el doble del grosor de línea en reposo, con un máximo de 3px, toma en él el color completo de la intención y muestra un punto. El límite de 3px evita que el anillo se trague el punto bajo una estética de línea gruesa.

`.checkbox` y `.radio` siempre dibujan su borde, incluso con `.edgeless`, porque el borde es lo único que muestra una casilla sin marcar. `.switch.ghost` también conserva su borde, ya que sin relleno y sin borde nada marcaría el carril. Estos casos aparecen en [Composición](./composing.md#referencia-de-ejes-por-componente).

Una estética que dibuja su borde como sombra interior, como `.pixel`, no puede hacer esa sombra más ancha que el grosor del borde del toggle. Un checkbox de 16px o un switch de 20px no tiene espacio para un anillo interior más grueso sin tapar la marca. Esto solo importa si defines tú mismo `--ui-shadow-spread`; consulta [Personalización → Tokens de material](./customizing.md#tokens-de-material).

## Relleno y borde en los controles de texto

Los controles de texto aceptan intención, que colorea el borde, el anillo de foco y el texto escrito, este último en el tono legible de la intención (`--intent-strong`). También aceptan los dos ejes de presentación. Su relleno tiene un tope bajo, para que el texto escrito siga siendo legible:

| En un control de texto                                  | Relleno |
| ------------------------------------------------------- | ------- |
| `.ghost`, por defecto                                   | 0%      |
| Cualquier relleno de un contenedor (`.soft` o `.solid`) | 6%      |
| `.soft` en el control                                   | 12%     |
| `.solid` en el control                                  | 20%     |

El relleno de un contenedor está pensado para las superficies que contiene, así que un campo al que nadie ha puesto clase solo toma un tenue 6%. Pon la clase en el propio campo para tener más.

El borde funciona igual. Un `.edgeless` heredado de un contenedor se ignora, para que una barra de herramientas no pueda dejar un campo sin borde visible. Un `.edgeless` escrito en el propio control sí se respeta: así es como pides un campo sin borde. Un campo sin borde no cumple el requisito de contraste WCAG 1.4.11 para el límite de un control, así que nunca es un valor por defecto; su anillo de foco sigue mostrándose.

```html
<input class="ipt success" placeholder="Matches your current password" />
<input class="ipt soft edged" placeholder="Tinted, with a border" />
<input class="ipt soft edgeless" placeholder="Sunk into the page" />
<div class="soft">
  <input class="ipt" placeholder="A container's .soft gives a 6% tint" />
</div>
```

En reposo, el borde de un campo es deliberadamente más claro que 3:1 frente a la página, para que el hover y el foco tengan un cambio visible que hacer. [Accesibilidad → Límites de los controles](../accessibility.md#límites-de-los-controles) explica esta contrapartida y cómo conseguir un borde más intenso.

## Controles deshabilitados

`disabled`, `aria-disabled="true"`, `data-disabled` o `.disabled` en un control lo dibujan con opacidad reducida y un cursor de no permitido. Como con los botones, solo el atributo `disabled` impide la entrada; los demás solo cambian el aspecto.

## Construir tu propio control

Para un control de tipo texto que el paquete no incluye, `.text-control` le da a un elemento los mismos estilos de borde, placeholder, hover, foco, inválido y deshabilitado que `.ipt`, sin su altura ni su relleno. [Personalización → Helpers de composición](./customizing.md#helpers-de-composición) lo explica junto con las demás piezas.

## Siguiente paso

El formulario se puede rellenar y enviar. [Feedback](./feedback.md) muestra lo que hace la pantalla a continuación: un botón Guardar que indica que está guardando, un mensaje de éxito, un badge del plan y una barra de uso de almacenamiento.
