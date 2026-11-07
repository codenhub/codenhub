---
title: Diálogos
description: Diálogos confirm, prompt y alert, con qué se resuelven, handles, cola, etiquetas de los botones, instancias de diálogos y toasts mientras hay un diálogo abierto.
order: 2
source: 1bd953478c8ac67aaea0101ff1513e6e4231103d
---

# Diálogos

Un toast avisa; un diálogo pregunta. Los diálogos bloquean la página hasta que alguien responde, así que son para los momentos que piden una decisión: "¿Borrar esta nota?", "¿Cómo la llamamos?", "Tu sesión caducó". Esta página cubre los tres tipos de diálogo, con qué se resuelve cada uno, cómo se ponen en fila cuando se abren varios, cómo traducir sus botones y cómo se llevan con los toasts.

Los diálogos vienen de su propio punto de entrada, así que una app que solo muestra toasts no paga por ellos:

```ts
import { dialog } from "@codenhub/toaster/dialog";
```

Usan la misma hoja de estilos que los toasts, `@codenhub/toaster/styles`.

## Confirm

`dialog.confirm()` hace una pregunta de sí o no y se resuelve con un booleano:

```ts
import { dialog } from "@codenhub/toaster/dialog";

if (await dialog.confirm("¿Borrar esta nota? No se puede deshacer.")) {
  await deleteNote(note.id);
}
```

Se resuelve con `true` cuando se pulsa el botón de confirmar y con `false` ante cualquier otra salida: el botón de cancelar, <kbd>Escape</kbd>, un clic en el backdrop o `dismiss()`.

Deja claro qué está en juego con un título, etiquetas de botón concretas y `type: "error"`, que colorea el botón de confirmar como destructivo:

```ts
const confirmed = await dialog.confirm('¿Borrar "Lista de la compra"? No se puede deshacer.', {
  title: "Borrar nota",
  type: "error",
  confirmLabel: "Borrar nota",
  cancelLabel: "Mejor no",
});
```

"Borrar nota" y "Mejor no" ganan a "Aceptar" y "Cancelar": nadie ha tenido que releer jamás un botón que dice exactamente lo que hace.

## Prompt

`dialog.prompt()` pide una línea de texto. Se resuelve con el texto cuando se envía, o con `null` cuando se cancela:

```ts
import { dialog } from "@codenhub/toaster/dialog";

const name = await dialog.prompt("Nuevo nombre para esta nota", {
  title: "Renombrar nota",
  defaultValue: note.title,
  placeholder: "Sin título",
  submitLabel: "Renombrar",
});

if (name !== null && name.trim() !== "") {
  await renameNote(note.id, name.trim());
}
```

El texto vuelve exactamente como se escribió, espacios incluidos, y puede venir vacío, así que compruébalo antes de usarlo. <kbd>Enter</kbd> en el campo de texto envía, salvo que la persona esté a mitad de componer un carácter con un editor de métodos de entrada (IME), como al escribir en japonés o chino. <kbd>Escape</kbd> cancela. El mensaje es la etiqueta del campo de texto, así que los lectores de pantalla lo anuncian junto con el campo.

## Alert

`dialog.alert()` entrega un mensaje que hay que reconocer antes de que pase cualquier otra cosa. Es un sustituto accesible de `window.alert()`, y se resuelve con `undefined` una vez cerrado:

```ts
import { dialog } from "@codenhub/toaster/dialog";

await dialog.alert("Tu sesión ha caducado. Vuelve a iniciar sesión para seguir editando.", {
  title: "Sesión caducada",
  okLabel: "Iniciar sesión",
});

goToSignIn();
```

Un alert tiene un solo botón, pero <kbd>Escape</kbd> y el backdrop también lo cierran. Las tres formas se resuelven igual, porque un alert no tiene nada que decidir.

## Opciones de los diálogos

Los tres métodos reciben primero el mensaje y después un objeto de opciones:

| Opción            | Diálogos            | Por defecto | Qué hace                                                                        |
| ----------------- | ------------------- | ----------- | ------------------------------------------------------------------------------- |
| `title`           | Todos               | Ninguno     | Un encabezado sobre el mensaje.                                                 |
| `type`            | Todos               | `"primary"` | Color del botón principal: `"primary"`, `"secondary"`, `"success"` o `"error"`. |
| `backdropDismiss` | Todos               | `true`      | Si un clic en el backdrop cierra el diálogo como una cancelación.               |
| `className`       | Todos               | Ninguno     | Clases CSS extra en el elemento `<dialog>`.                                     |
| `confirmLabel`    | `confirm`           | `"Confirm"` | Texto del botón de confirmar.                                                   |
| `cancelLabel`     | `confirm`, `prompt` | `"Cancel"`  | Texto del botón de cancelar.                                                    |
| `submitLabel`     | `prompt`            | `"Submit"`  | Texto del botón de enviar.                                                      |
| `okLabel`         | `alert`             | `"OK"`      | Texto del único botón.                                                          |
| `defaultValue`    | `prompt`            | `""`        | Texto que ya está en el campo cuando se abre el diálogo.                        |
| `placeholder`     | `prompt`            | Ninguno     | Pista que se muestra mientras el campo está vacío.                              |

Pon `backdropDismiss: false` cuando un clic perdido no deba contar como respuesta, por ejemplo en un formulario que a alguien le costó rellenar. <kbd>Escape</kbd> sigue cancelando; así funciona el `<dialog>` del navegador, y los usuarios de teclado dependen de ello.

El mensaje no puede estar vacío. Un mensaje vacío o solo con espacios lanza `Interactive dialog message must not be empty.`

## Handles

Cada método devuelve un `DialogHandle`. Puedes hacerle `await` directamente, como todos los ejemplos hasta ahora. También puedes guardarlo y controlar el diálogo mientras está abierto:

```ts
import { dialog } from "@codenhub/toaster/dialog";

const question = dialog.confirm("¿Descartar los cambios sin guardar?");

// Ciérralo si mientras tanto la nota se guarda por otro lado.
onAutosave(() => question.dismiss());

const discard = await question;
```

| Miembro     | Qué es                                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `await`     | La respuesta: `boolean` para confirm, `string \| null` para prompt, `undefined` para alert.                                                         |
| `result`    | La misma respuesta como una `Promise` de verdad, para el código que quiere una en vez de un valor que solo se parece a una promesa.                 |
| `dismiss()` | Cierra el diálogo como una cancelación. También funciona con diálogos en cola. Es seguro llamarlo más de una vez.                                   |
| `state`     | `"queued"`, `"visible"`, `"hiding"` o `"hidden"`, los mismos estados que [tienen los toasts](toasts.md#estado-settled-y-eventos-del-ciclo-de-vida). |
| `settled`   | Una promesa que se resuelve cuando termina la animación de cierre y el diálogo se ha limpiado.                                                      |

Que al handle se le pueda hacer `await` es justo la gracia. Muchas bibliotecas de diálogos devuelven un objeto desde `confirm()`, y entonces `if (await confirm(...))` siempre es verdadero, porque un objeto siempre es truthy. Ese bug es el que llega a producción como un botón "Cancelar" que borra igual. Aquí, `await` te da la respuesta de verdad.

Cerrar con `dismiss()` le da a cada tipo su valor de cancelación: `false` para confirm, `null` para prompt, `undefined` para alert.

## Uno a la vez

Una instancia de diálogos muestra un diálogo a la vez. Llamar a `confirm()` mientras hay otro diálogo abierto no apila un segundo diálogo encima: el nuevo espera en una cola, con estado `"queued"`, y se abre cuando se cierra el actual. Cerrar un diálogo en cola lo saca de la cola con su valor de cancelación; nunca llega a aparecer.

Cuando se cierra el último diálogo de una secuencia, el foco vuelve al elemento que lo tenía antes de que se abriera el primero.

Si el navegador se niega a abrir un diálogo, que es cuando `showModal()` lanza una excepción, el handle de ese diálogo se rechaza con el error del navegador, y el siguiente diálogo de la cola tiene su turno igualmente. Envuelve el `await` en `try`/`catch` si tu página puede llegar a un estado en el que pase eso.

## Etiquetas de los botones y traducción

En vez de pasar las etiquetas en cada llamada, defínelas una vez en una instancia de diálogos con `createDialogs()`:

```ts
import { createDialogs } from "@codenhub/toaster/dialog";

const dialogs = createDialogs({
  labels: {
    confirm: "Confirmar",
    cancel: "Cancelar",
    submit: "Enviar",
    ok: "Entendido",
  },
});

if (await dialogs.confirm("¿Borrar esta nota?")) {
  await deleteNote(note.id);
}
```

Una etiqueta pasada en una llamada concreta sigue ganando a la etiqueta de la instancia. Las etiquetas de los toasts, para el botón de cerrar y el nombre del stack, se definen en el toaster; consulta [Instancias de toaster](instances.md#configuración).

## Instancias de diálogos

`createDialogs()` crea una instancia independiente con los mismos métodos `confirm`, `prompt` y `alert` que `dialog`, que a su vez no es más que una instancia creada sin opciones. Cada instancia tiene su propia cola.

| Opción      | Por defecto     | Qué hace                                                                           |
| ----------- | --------------- | ---------------------------------------------------------------------------------- |
| `container` | `document.body` | El elemento al que se añade el `<dialog>`. No se puede cambiar después de crearla. |
| `labels`    | En inglés       | Etiquetas por defecto de los botones: `confirm`, `cancel`, `submit`, `ok`.         |
| `className` | Ninguno         | Clases CSS extra en cada diálogo de esta instancia.                                |

`configure()` cambia `labels` y `className` más tarde. Las etiquetas nuevas se aplican a los diálogos que llames después; un diálogo que ya espera en la cola conserva las etiquetas con las que lo llamaste. Un `className` nuevo se aplica a todo diálogo que se abra después, incluidos los de la cola. Pasarle `container` lanza `Dialogs container cannot be changed after construction.`

`destroy()` cierra el diálogo abierto y descarta los que están en cola, resolviendo cada uno con su valor de cancelación, y quita el elemento `<dialog>` de la instancia. Llamarlo dos veces no hace nada. Cualquier otra llamada posterior lanza `This dialogs instance has been destroyed. Create a new one with createDialogs().`

Abrir un diálogo fuera de un navegador lanza `DOM document is not available. Dialogs require a browser environment.` Igual que los toasts, los diálogos se pueden importar sin problema durante el renderizado del lado del servidor; lo que no se puede es abrirlos.

## Toasts mientras hay un diálogo abierto

Un diálogo modal vuelve inerte el resto de la página: nada detrás de él se puede pulsar, enfocar ni oír con un lector de pantalla. Un toast atascado detrás del backdrop no serviría de nada, así que mientras hay abierto un diálogo de este paquete, los toasts se mudan dentro de él.

Más en detalle: cada toaster que renderiza en el mismo elemento que el diálogo mueve sus stacks y sus anuncios para lectores de pantalla dentro del diálogo abierto. Los toasts se quedan en su esquina de siempre, por encima del backdrop, y siguen siendo clicables y anunciados. Vuelven a su sitio en cuanto el diálogo empieza a cerrarse. Con diálogos abiertos dentro de diálogos, los toasts siguen al más reciente.

```ts
const deleting = dialog.confirm("¿Borrar esta nota?");
toast.info("Autoguardado en pausa"); // se muestra por encima del backdrop, sigue siendo clicable
```

Los toasters con otro contenedor, como uno acotado a una barra lateral, no se mueven. Sus toasts se quedan detrás del backdrop, inertes y sin anunciarse, hasta que el diálogo se cierra, y tampoco se anuncian después.

### Tus propios diálogos modales

Esto solo funciona con diálogos de este paquete. Un `<dialog>` que tu app abre con `showModal()` también vuelve inerte la página, y el paquete no va a mover los toasts dentro de él. Los toasts que se muestren mientras está abierto se renderizan detrás de su backdrop, donde nadie puede pulsarlos y los lectores de pantalla se los saltan.

La solución es un toaster que viva dentro de tu diálogo. Créalo cada vez que se abre el diálogo y destrúyelo cuando se cierra, porque un toaster destruido no resucita:

```ts
import { createToaster } from "@codenhub/toaster";

const settings = document.querySelector<HTMLDialogElement>("#settings")!;

function openSettings() {
  const settingsToaster = createToaster({ container: settings });
  settings.addEventListener("close", () => settingsToaster.destroy(), { once: true });
  settings.showModal();
  return settingsToaster;
}

const settingsToaster = openSettings();
settingsToaster.success("Preferencias guardadas");
```

## Siguiente

La app de notas ya tiene toasts y diálogos de las instancias listas para usar. [Instancias de toaster](instances.md) cubre cada opción de configuración, los valores por defecto por tipo de toast y los toasters aparte como el de arriba.
