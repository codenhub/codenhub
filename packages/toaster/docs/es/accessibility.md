---
title: Accesibilidad y seguridad
description: Lo que oyen los lectores de pantalla, cómo funcionan el foco y el teclado, el movimiento reducido, lo que te toca a ti y el límite de confianza del contenido personalizado.
order: 5
source: 9d6cd71bd7f37c5430ab5261d35e504cba0a20d6
---

# Accesibilidad y seguridad

Un toast que solo algunas personas pueden percibir es un aviso que solo les llega a algunas. Esta página cubre lo que hace el paquete por los usuarios de lectores de pantalla y de teclado sin que se lo pidas, las pocas cosas que te deja a ti y la frontera de seguridad entre texto y nodos del DOM en el contenido personalizado.

## Lo que oyen los lectores de pantalla

Cada toast se anuncia. Cada toaster añade dos "live regions" ocultas a su contenedor: elementos cuyo texto, cuando cambia, los lectores de pantalla leen en voz alta automáticamente. Una es cortés (polite) y la otra enérgica (assertive). El `role` de un toast elige cuál lo lee:

- **`"status"`** es cortés: se lee después de lo que el lector de pantalla esté diciendo en ese momento. Es el valor por defecto de `toast()`, `success()`, `info()`, `loading()` y `custom()`.
- **`"alert"`** es enérgico: se lee en el acto, interrumpiendo. Es el valor por defecto de `error()` y `warning()`.

Cámbialo por toast cuando el valor por defecto no encaje:

```ts
import { toast } from "@codenhub/toaster";

// Una advertencia rutinaria que no necesita interrumpir a nadie.
toast.warning("La nota se está haciendo larga", { role: "status" });
```

Cualquier otro valor de `role` lanza `Invalid toast role: …`.

Lo que se lee:

- El título, el mensaje y la descripción del toast, o el texto dentro del contenido personalizado.
- La etiqueta del botón de acción, después del texto, como en "Movida a la papelera. Deshacer", para que quien escucha sepa que hay algo que hacer.
- No el botón de cerrar, ni los botones dentro del contenido personalizado.

Un toast se vuelve a anunciar cada vez que una actualización cambia su texto o su rol. Así es como un toast con promesa anuncia tanto "Guardando…" como "Guardado".

Dos detalles de tiempos explican comportamientos que quizá notes al probar:

- **El primer anuncio llega con un pequeño retraso.** Los lectores de pantalla a menudo se pierden una live region que aparece con el texto ya dentro, porque solo anuncian cambios en regiones que ya están vigilando. Por eso cada región se añade vacía y su primer texto llega 100ms después, siguiendo la [técnica ARIA22 del W3C](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22.html).
- **El texto anunciado se borra a los 7 segundos**, para que las regiones ocultas no acumulen mensajes viejos.

El toast visible en sí no es una live region y no tiene atributo `role`. Los tests que buscan toasts por `role="status"` o `aria-live` necesitan otro selector.

### Encontrar los toasts

Cada stack es una región landmark llamada "Notifications". Los usuarios de lectores de pantalla pueden saltar a ella desde su lista de landmarks para llegar a los botones de un toast. Traduce el nombre con las `labels` del toaster:

```ts
import { createToaster } from "@codenhub/toaster";

const toaster = createToaster({
  labels: {
    notifications: "Notificaciones",
    dismiss: "Cerrar notificación",
  },
});
```

`dismiss` es el nombre accesible del botón de cerrar de los toasts [con botón de cerrar](toasts.md#temporizadores-y-cierre-automático). Por defecto es "Dismiss toast".

### Toasts bajo un diálogo

Mientras hay abierto un diálogo de este paquete, los toasts de los toasters que comparten su contenedor se anuncian desde dentro del diálogo. Los toasts de otros toasters, y los que se muestran bajo un diálogo modal que abrió tu propia app, no se anuncian en absoluto, ni tampoco después. [Toasts mientras hay un diálogo abierto](dialogs.md#toasts-mientras-hay-un-diálogo-abierto) explica por qué y cómo evitarlo.

## Teclado y foco

Los toasts nunca roban el foco. Mostrar uno no mueve el teclado a ningún sitio, que es lo que quieres de algo que se supone que no debe estorbar.

Cuando alguien sí mueve el foco a un toast, por ejemplo tabulando hasta su botón de acción:

- Su temporizador se pausa, y queda [protegido para que no lo echen](toasts.md#cómo-se-llena-el-stack) de un stack lleno.
- Si una actualización cambia solo su texto, el foco se queda en el botón. Si la actualización sustituye la acción, el foco pasa al botón nuevo.
- Cuando se cierra, el foco vuelve a lo que tenía el foco cuando apareció el toast, siempre que ese elemento siga en la página. Si mientras tanto el foco ya se movió a otro sitio, se queda allí.

Los diálogos usan el elemento `<dialog>` nativo del navegador con `showModal()`, así que es el propio navegador el que se encarga de:

- **Ocultar el resto de la página.** Todo lo que está detrás del diálogo queda inerte: sin clics, sin foco, y los lectores de pantalla se lo saltan.
- **Mantener el foco dentro.** <kbd>Tab</kbd> recorre los controles del propio diálogo.
- **<kbd>Escape</kbd>**, que cancela.
- **Devolver el foco.** Cuando se cierra el último diálogo de una [cola](dialogs.md#uno-a-la-vez), el foco vuelve al elemento que lo tenía antes de que se abriera el primero.

El título y el mensaje se enlazan al diálogo como su nombre y su descripción accesibles, y el mensaje de un prompt hace de etiqueta de su campo de texto.

## Movimiento reducido

Hay gente que activa el movimiento reducido en su sistema operativo, porque los deslizamientos y los fundidos pueden causar mareos o náuseas. Cuando `prefers-reduced-motion: reduce` está activo:

- Los toasts aparecen y desaparecen sin animación.
- Los toasts de un stack saltan a su nueva posición en vez de deslizarse.
- Los backdrops de los diálogos aparecen y desaparecen sin fundido.

No hay nada que configurar. El ajuste se lee en vivo, así que cambiarlo con la página abierta surte efecto en la siguiente animación.

## Lo que te toca a ti

El paquete se encarga de la mecánica, pero hay decisiones que solo puedes tomar tú:

- **Tiempo para leer.** Un toast que se cierra a los 4 segundos está bien para "Guardado" y es demasiado rápido para cualquier cosa sobre la que haya que actuar o que haya que leer dos veces. Dale a los toasts importantes un `duration` más largo, o `autoDismiss: false` con `dismissible: true`. Mejor aún, no pongas solo en un toast nada que una persona no se pueda perder.
- **Etiquetas en otros idiomas.** Las etiquetas integradas están en inglés. Define las `labels` del toaster y las `labels` de los diálogos, como muestra [Diálogos](dialogs.md#etiquetas-de-los-botones-y-traducción).
- **Contenido personalizado.** Los nodos que pasas a `toast.custom()` son tuyos: dales nombres accesibles a los botones y enlaces, mantén un orden de lectura con sentido y deja los elementos interactivos alcanzables con el teclado.
- **Colores sobrescritos.** Los colores que defines con `--toast-color-*` necesitan suficiente contraste entre sí. Los colores integrados están pensados para eso; los que tú sobrescribas son cosa tuya.

## Contenido personalizado y confianza

`toast.custom()` y la opción `content` de `update()` aceptan un string o un nodo del DOM, y los dos se tratan de forma muy distinta:

| Lo que pasas | Qué pasa                                                        | ¿Seguro para entrada no confiable?      |
| ------------ | --------------------------------------------------------------- | --------------------------------------- |
| Un string    | Se muestra como texto plano. Nunca se interpreta como HTML.     | Sí.                                     |
| Un nodo      | Se inserta exactamente como se construyó.                       | Solo si lo construiste de forma segura. |
| Una función  | Se llama con el handle; su resultado sigue las filas de arriba. | Depende de lo que devuelva.             |

### Los strings son texto

Un string se convierte en un único nodo de texto. Las etiquetas que contenga aparecen como caracteres y no crean elementos:

```ts
import { toast } from "@codenhub/toaster";

// Muestra los caracteres <b>Lista de la compra</b>, no texto en negrita.
toast.custom("<b>Lista de la compra</b>");
```

Eso hace que los strings sean seguros para cualquier cosa que controlen los usuarios o los servidores, como títulos de notas, nombres de usuario y mensajes de error de una API. Lo mismo vale para todas las demás opciones de texto: `message`, `title`, `description`, las etiquetas de las acciones y el texto de los diálogos se insertan como texto.

### Los nodos son de confianza

Un nodo se inserta tal cual. El paquete no lo inspecciona ni lo limpia, así que quien lo construye es responsable de su seguridad. Constrúyelo con métodos del DOM y mete el texto no confiable con `textContent`, nunca con `innerHTML`:

```ts
import { toast } from "@codenhub/toaster";

toast.custom((handle) => {
  const wrapper = document.createElement("div");

  const text = document.createElement("span");
  text.textContent = `Compartiste "${note.title}" con ${recipient.name}`;

  const button = document.createElement("button");
  button.textContent = "Copiar enlace";
  button.addEventListener("click", () => {
    copyShareLink(note.id);
    handle.dismiss();
  });

  wrapper.append(text, button);
  return wrapper;
});
```

Los event listeners que añades a tus propios nodos los gestionas tú. Se liberan con el nodo cuando nada más lo referencia, pero cualquier cosa que retengan en otro sitio, como una suscripción o un temporizador, necesita tu propia limpieza, por ejemplo en `handle.onHidden()`.

### Trusted Types

El paquete nunca asigna a `innerHTML` ni a ninguna otra propiedad que interprete HTML. Sus propios toasts, iconos y diálogos se construyen con métodos del DOM. Una página que aplica Trusted Types con `require-trusted-types-for 'script'` no necesita ninguna política de Trusted Types para él. Sus estilos también son compatibles con CSP; consulta [Content Security Policy](styling.md#content-security-policy).

## Siguiente

Hasta aquí el recorrido. Para las firmas y los tipos exactos, consulta la [referencia de la API](../reference/index.md). Para ver qué cambió entre versiones, consulta el [registro de cambios](../changelog/index.md). Para empezar otra vez desde arriba, vuelve a la [visión general](index.md).
