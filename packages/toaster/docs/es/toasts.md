---
title: Toasts
description: Cada tipo de toast, acciones, toasts de carga y con promesas, handles y actualizaciones, posiciones, cola, temporizadores y los errores que lanzan los toasts.
order: 1
source: 28f68381d35607225966017585f49e470bd2dd6f
---

# Toasts

Esta página cubre todo lo que puede hacer un toast: los distintos tipos, los botones, los spinners de carga, cómo actualizar un toast después de que aparece, dónde salen los toasts y qué pasa cuando llegan demasiados a la vez. Los ejemplos siguen una app de notas, empezando por la función más importante de cualquier app de notas: avisarte de que guardó.

Todos los ejemplos dan por hecho que `@codenhub/toaster/styles` está cargado una vez, como muestra la [visión general](index.md#un-primer-toast).

## Tus primeros toasts

`toast` es un toaster listo para usar. Llámalo directamente para un toast neutro, o usa uno de sus cuatro atajos para un toast con significado:

```ts
import { toast } from "@codenhub/toaster";

toast("Nota guardada");
toast.success("Nota publicada");
toast.error("No se pudo conectar con el servidor");
toast.warning("Estás sin conexión. Los cambios se sincronizarán más tarde.");
toast.info("Hay una versión nueva disponible");
```

`toast()` da un toast neutro sin icono. Los otros cuatro tienen cada uno su icono y su color, y se diferencian en la urgencia con la que los leen los lectores de pantalla:

| Llamada           | Cómo lo leen los lectores de pantalla          |
| ----------------- | ---------------------------------------------- |
| `toast()`         | Con cortesía, después de lo que estén diciendo |
| `toast.success()` | Con cortesía, después de lo que estén diciendo |
| `toast.info()`    | Con cortesía, después de lo que estén diciendo |
| `toast.warning()` | En el acto, interrumpiendo                     |
| `toast.error()`   | En el acto, interrumpiendo                     |

Las advertencias y los errores interrumpen porque suelen ser justo lo que la persona necesita oír ya. Puedes cambiarlo por toast con `role`; [Accesibilidad](accessibility.md#lo-que-oyen-los-lectores-de-pantalla) explica cómo.

Un toast se cierra solo a los 4 segundos. Si prefieres que se quede, lee [Temporizadores](#temporizadores-y-cierre-automático) más abajo.

### Dos formas de llamarlo

Cada método de toast recibe o bien un mensaje más un objeto de opciones opcional, o bien un único objeto de opciones:

```ts
toast.success("Nota guardada", { duration: 6000 });

toast.success({ message: "Nota guardada", duration: 6000 });
```

Hacen lo mismo. La primera se lee mejor para un mensaje rápido. La segunda viene bien cuando el toast se construye a partir de datos, o cuando tiene un `title` y ningún `message`.

## Títulos, descripciones y un botón de acción

Un toast puede tener más de una línea. `title` va arriba en negrita, `message` es el texto principal y `description` va debajo, en letra más pequeña. `action` añade un botón:

```ts
import { toast } from "@codenhub/toaster";

toast.success("Movida a la papelera", {
  title: "Lista de la compra",
  description: "Las notas de la papelera se borran a los 30 días.",
  action: {
    label: "Deshacer",
    onClick: (_event, handle) => {
      restoreNote("groceries");
      handle.dismiss();
    },
  },
});
```

`onClick` recibe el `MouseEvent` del clic y el handle del toast. **Hacer clic en la acción no cierra el toast.** Es a propósito: algunas acciones deberían dejarlo abierto, como "Ver detalles". Cuando la acción ya no necesita el toast, llama a `handle.dismiss()`, como arriba.

Un toast necesita algo que decir. Llamar a uno sin `message` ni `title` lanza `Toast requires a non-empty message or content.` Un `description` solo no cuenta: es la letra pequeña, y letra pequeña sin titular es puro misterio.

## Toasts de carga

Hay trabajo que tarda. `toast.loading()` muestra un spinner y se queda en pantalla hasta que lo cambies:

```ts
const syncing = toast.loading("Sincronizando notas…");
```

Por defecto, un toast de carga no tiene temporizador ni botón de cerrar, porque un "sigo trabajando" no debería desaparecer mientras el trabajo sigue en marcha. Para terminarlo, llama a `update()` en el handle y conviértelo en un toast normal:

```ts
import { toast } from "@codenhub/toaster";

const syncing = toast.loading("Sincronizando notas…");

try {
  const count = await syncNotes();
  syncing.update({
    type: "success",
    message: `${count} notas sincronizadas`,
    autoDismiss: true,
  });
} catch {
  syncing.update({
    type: "error",
    message: "Falló la sincronización. Tus notas están a salvo en este dispositivo.",
    autoDismiss: true,
  });
}
```

Cambiar `type` sustituye el spinner por el icono y el color correspondientes. Poner `autoDismiss: true` arranca el temporizador, que el toast de carga no tenía. Si te olvidas de esa línea, tu toast de éxito se quedará ahí para siempre, muy orgulloso de sí mismo.

`toast.loading()` acepta `title`, `message`, `description`, `position`, `dismissible`, `className` y `margin`. No tiene opción `duration` ni `autoDismiss`, porque nunca se cierra solo; ponlas en el `update()` que lo termina.

## Toasts con promesas

Ese patrón de intentar y actualizar es tan común que tiene atajo. `toast.promise()` muestra un toast de carga mientras corre una promesa y luego lo convierte en un toast de éxito o de error:

```ts
import { toast } from "@codenhub/toaster";

const note = await toast.promise(saveNote(draft), {
  loading: "Guardando…",
  success: (saved) => `Se guardó "${saved.title}"`,
  error: (error) => `No se pudo guardar: ${error instanceof Error ? error.message : String(error)}`,
});
```

Devuelve el resultado de la promesa original, así que `note` es lo que sea con lo que se resolvió `saveNote()`. Si `saveNote()` se rechaza, `toast.promise()` muestra el toast de error y luego se rechaza con el mismo error, así que tu propio `try`/`catch` se sigue ejecutando. El toast es un efecto secundario; tu flujo de control no cambia.

El rechazo llega a `error` con tipo `unknown`, porque JavaScript deja que una promesa se rechace con cualquier cosa, no solo con un `Error`. Compruébalo antes de leer `.message`, como arriba.

Lo que acepta cada opción:

- **`loading`**: un string, o el mismo objeto de opciones que acepta `toast.loading()`.
- **`success`** y **`error`**: un string, un objeto de opciones de toast, o una función que recibe el resultado (o el error) y devuelve cualquiera de los dos. Devuelve un objeto cuando quieras un título, una descripción o una acción:

```ts
await toast.promise(syncNotes(), {
  loading: "Sincronizando notas…",
  success: (result) => ({
    title: "Sincronización completa",
    description: `${result.updated} notas actualizadas, ${result.added} nuevas.`,
  }),
  error: () => ({
    message: "Falló la sincronización",
    duration: 10000,
    action: { label: "Reintentar", onClick: () => syncAgain() },
  }),
});
```

- **`position`**, **`className`** y **`margin`** se aplican al toast de principio a fin.
- **`duration`** y **`dismissible`** se aplican al toast del resultado. Si no las pones, salen de los valores por defecto `semantic` de la instancia y, después, de la propia instancia. [Valores por defecto por tipo](instances.md#valores-por-defecto-por-tipo) explica esa cadena.

El toast del resultado se cierra solo pasado su `duration`, aunque el toast de carga anterior no lo hiciera. Para mantenerlo abierto, devuelve `autoDismiss: false` desde `success` o `error`.

Si tu función `success` o `error` lanza una excepción, el toast de carga se cierra y el error se reporta al navegador como error no capturado, así que aparece en la consola y en los rastreadores de errores. `toast.promise()` igualmente se resuelve o se rechaza con el resultado de la promesa original, así que una errata en un mensaje no rompe el guardado.

## Handles: controlar un toast después de que aparece

Cada método de toast devuelve un `ToastHandle`. Guárdalo cuando quieras cambiar, cerrar u observar el toast más tarde:

```ts
import { toast } from "@codenhub/toaster";

const upload = toast("Subiendo adjunto… 0%", { autoDismiss: false });

onProgress((percent) => {
  upload.update({ message: `Subiendo adjunto… ${percent}%` });
});

onDone(() => {
  upload.update({ type: "success", message: "Adjunto subido", autoDismiss: true });
});

cancelButton.addEventListener("click", () => upload.dismiss());
```

### `update()`

`update()` cambia un toast en su sitio. Pasa solo lo que quieras cambiar:

- `title`, `message`, `description`: texto nuevo, o `null` para quitar esa línea.
- `action`: un botón nuevo, o `null` para quitarlo.
- `type`: `"success"`, `"error"`, `"warning"`, `"info"` o `"default"`. Cambia el color, el icono y la urgencia con la que lo anuncian los lectores de pantalla.
- `icon`: `"success"`, `"error"`, `"warning"`, `"info"` o `"loader"` para elegir otro icono, o `null` para ninguno. Cuando cambias `type` sin `icon`, el icono sigue al tipo.
- `content`: lo sustituye todo por contenido personalizado, como se describe en [Contenido personalizado](#contenido-personalizado). Si lo pasas, se ignoran `message` e `icon` en la misma llamada.
- `duration`, `autoDismiss`, `dismissible`: cambian los tiempos y el botón de cerrar.
- `className`: añade más clases CSS.

Algunos detalles que importan en la práctica:

- **Un toast en cola conserva sus actualizaciones.** Si el toast sigue esperando sitio en el stack, la actualización se guarda y se aplica cuando aparece.
- **Un toast que ya terminó ignora las actualizaciones.** Una vez que el toast se ha cerrado del todo, `update()` no hace nada y no lanza ninguna excepción. Llamarlo tarde no hace daño.
- **El foco se queda donde estaba.** Si alguien tiene el foco en el botón de acción cuando una actualización cambia solo el texto, el foco se queda en el botón. Si la actualización sustituye la acción en sí, el foco pasa al botón nuevo.
- **El texto cambiado se vuelve a anunciar**, así que un lector de pantalla oye tanto "Subiendo…" como "Adjunto subido".

`update()` lanza una excepción si `duration` no es un número finito igual o mayor que 0, si `type` no es uno de los cinco de arriba o si `content` está vacío.

### `dismiss()`

`dismiss()` arranca la animación de salida del toast. Es seguro llamarlo más de una vez, y también sobre un toast que todavía está en cola, que entonces nunca aparece.

### Estado, `settled` y eventos del ciclo de vida

Un toast pasa por cuatro estados, que se leen en `handle.state`:

```text
queued → visible → hiding → hidden
```

- **`queued`**: esperando sitio en un stack lleno. Un toast que tiene sitio pasa directamente a `visible`.
- **`visible`**: en pantalla.
- **`hiding`**: reproduciendo su animación de salida.
- **`hidden`**: fuera de la página.

`handle.settled` es una promesa que se resuelve cuando el toast está `hidden` y su elemento se ha quitado. Hazle `await` cuando algo deba pasar solo después de que el toast se haya ido del todo.

Para afinar más, suscríbete a cada paso. Cada método devuelve una función que cancela la suscripción:

```ts
const handle = toast("Nota archivada");

handle.onShow(() => console.log("añadido a la página"));
handle.onShown(() => console.log("terminó la animación de entrada"));
handle.onHide(() => console.log("empieza la animación de salida"));
const stop = handle.onHidden(() => console.log("quitado de la página"));

stop(); // pensándolo mejor, este último no
```

Un suscriptor añadido después de que su paso ya ocurrió se llama en el acto, así que no puedes perderte un evento por suscribirte tarde. Si un suscriptor lanza una excepción, el toast termina de cerrarse igualmente y el error se reporta como error no capturado.

## Posiciones y márgenes

Por defecto, los toasts aparecen arriba a la derecha. Elige otro sitio por toast con `position`:

```ts
toast("Copiado al portapapeles", { position: "bottom-center" });
```

Las seis posiciones son `"top-left"`, `"top-center"`, `"top-right"`, `"bottom-left"`, `"bottom-center"` y `"bottom-right"`. Cualquier otra cosa lanza `Invalid toast position: …`. Cada posición tiene su propio stack. Para cambiar el valor por defecto de todos los toasts, configura el toaster; consulta [Instancias de toaster](instances.md#configuración).

`margin` define la distancia al borde de la pantalla. Acepta una longitud CSS para las dos direcciones, o `x` e `y` por separado:

```ts
toast("Guardado", { margin: "24px" });
toast("Guardado", { margin: { x: "16px", y: "4rem" } });
```

El margen pertenece al stack, no a un toast. Todos los toasts de una misma posición comparten un margen, así que el toast más reciente que lo definió mueve todo el stack, y un toast que no lo define deja el stack donde está. Sin margen, un stack queda a 1rem del borde, o más lejos cuando el dispositivo tiene un notch o esquinas redondeadas que necesitan más espacio.

Cada toast mide 22.25rem (356px) de ancho y se encoge para caber en pantallas estrechas. [Estilos](styling.md#tamaño) muestra cómo cambiarlo.

## Cómo se llena el stack

Cada posición muestra como mucho 5 toasts a la vez. Pon `maxVisible` en el toaster para cambiarlo. Cuando llega un sexto:

1. El toast nuevo entra en una cola FIFO: el primero en llegar es el primero en salir.
2. El toast más antiguo que tiene permitido irse empieza a cerrarse para hacer sitio.
3. El toast de la cola aparece en su lugar.

Algunos toasts no pueden irse antes de tiempo, porque quitárselos a alguien de delante de las narices sería de mala educación:

- Un toast sobre el que está el puntero.
- Un toast con el foco del teclado dentro, por ejemplo en su botón de acción.
- Un toast que muestra el spinner de carga. Representa trabajo que sigue en marcha.

Si todos los toasts visibles están protegidos, los nuevos esperan en la cola hasta que uno de ellos quede libre o se cierre. Cuando un stack es más alto que la pantalla, hace scroll por su cuenta, sin mostrar barra de desplazamiento, para que todos los toasts sigan siendo alcanzables.

## Temporizadores y cierre automático

Un toast se cierra solo pasados `duration` milisegundos, 4000 por defecto:

```ts
toast("Recordatorio creado", { duration: 8000 });
toast("Lee esto con calma", { autoDismiss: false });
```

`autoDismiss: false` mantiene un toast abierto hasta que se cierre. `duration` tiene que ser un número finito igual o mayor que 0, o la llamada lanza una excepción.

La cuenta atrás se pausa mientras el puntero está sobre el toast, mientras el foco está dentro y mientras la pestaña del navegador está en segundo plano. Al reanudarse, sigue con el tiempo que quedaba; no vuelve a empezar. Además, el reloj no arranca hasta que termina la animación de entrada.

Un toast que se queda abierto debería tener una salida. Pon `dismissible: true` para añadir un botón de cerrar:

```ts
toast.error("Tu nota es demasiado larga para guardarla", { autoDismiss: false, dismissible: true });
```

## Limpiar toasts

```ts
toast.clear(); // cierra todos los toasts de este toaster, visibles y en cola
toast.dismiss(handle); // lo mismo que handle.dismiss()
toast.dismiss(); // lo mismo que toast.clear()
```

Estos solo afectan a los toasts del mismo toaster. Una [instancia aparte](instances.md) se queda con sus propios toasts.

## Contenido personalizado

Cuando la maquetación integrada no encaja, `toast.custom()` acepta tu propio contenido. Viene en tres formas:

```ts
import { toast } from "@codenhub/toaster";

// 1. Un string, mostrado como texto plano.
toast.custom("Notas de la semana 12 exportadas");

// 2. Un nodo del DOM, insertado tal cual.
const message = document.createElement("p");
const link = document.createElement("a");
link.href = "/trash";
link.textContent = "la papelera";
message.append("Borrada. Todavía puedes encontrarla en ", link, ".");
toast.custom(message);

// 3. Una función que recibe el handle y devuelve un string o un nodo.
toast.custom((handle) => {
  const button = document.createElement("button");
  button.textContent = "Entendido";
  button.addEventListener("click", () => handle.dismiss());
  return button;
});
```

Un string nunca se interpreta como HTML: `toast.custom("<b>Hola</b>")` muestra las etiquetas como caracteres. Eso hace que los strings sean seguros para texto que no controlas, como el título de una nota. Un nodo entra exactamente como lo construiste, así que su seguridad es responsabilidad tuya. [Accesibilidad y seguridad](accessibility.md#contenido-personalizado-y-confianza) explica ese límite.

`toast.custom()` acepta `position`, `duration`, `dismissible`, `autoDismiss`, `className`, `role` y `margin`, como segundo argumento o junto con `content` en un único objeto. Un toast personalizado no tiene icono y, por defecto, se anuncia con cortesía.

Lo que no puede ser el contenido personalizado:

- Un string vacío o solo con espacios. Lanza `Toast content must not be an empty string.` en vez de mostrar una caja vacía.
- Un nodo que no sea un elemento, un nodo de texto o un `DocumentFragment`. Los comentarios y los documentos lanzan `Toast content Node must be an Element, Text, or DocumentFragment.`
- Una función que devuelva algo que no sea un string o un nodo. Eso lanza `Toast content must resolve to a string or DOM Node.`

## Cuándo lanzan excepciones los toasts

Los toasts validan su entrada cuando los llamas, así que un error falla justo donde lo cometiste, y no un rato después en el navegador. Cada error es un `Error` normal:

| El mensaje empieza por                           | Causa                                                | Solución                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Toast requires a non-empty message or content.` | No hay `message` ni `title`, o los dos están vacíos. | Dale algo de texto al toast.                                                                         |
| `Toast duration must be a finite number…`        | `duration` es negativo, `NaN` o `Infinity`.          | Usa 0 o más. Para "nunca", usa `autoDismiss: false`.                                                 |
| `Invalid toast position: …`                      | Una posición que no está en la lista de seis.        | Usa una de las seis [posiciones](#posiciones-y-márgenes).                                            |
| `Invalid toast role: …`                          | `role` no es `"status"` ni `"alert"`.                | Usa uno de esos dos.                                                                                 |
| `Invalid semantic toast type: …`                 | `type` no es una severidad conocida.                 | Usa `"success"`, `"error"`, `"warning"`, `"info"`, `"default"`.                                      |
| `Toast content …`                                | Contenido personalizado vacío o no soportado.        | Consulta [Contenido personalizado](#contenido-personalizado).                                        |
| `DOM document is not available…`                 | Mostrar un toast donde no hay `document`.            | Muestra toasts solo en el navegador; consulta [SSR](instances.md#renderizado-del-lado-del-servidor). |
| `This toaster instance has been destroyed…`      | Llamar a un toaster después de `destroy()`.          | Crea uno nuevo con `createToaster()`.                                                                |

## Siguiente

Los toasts informan; a veces hace falta preguntar. [Diálogos](dialogs.md) cubre `confirm`, `prompt` y `alert`, que la app de notas usa para preguntar antes de borrar una nota y para renombrarla.
