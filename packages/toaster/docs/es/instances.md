---
title: Instancias de toaster
description: Cada opción del toaster y su valor por defecto, valores por defecto por tipo, cambiar la configuración después, toasters acotados, limpieza con destroy() y renderizado del lado del servidor.
order: 3
source: 47dbaf81642378c7949cb72ef150ffccba0188ef
---

# Instancias de toaster

Hasta ahora todo pasó por `toast`, el toaster listo para usar. Esta página trata de crear los tuyos con `createToaster()` y de las opciones que comparten los dos: dónde aparecen los toasts, cuánto duran, cuántos caben y qué dicen sus etiquetas integradas. También cubre la limpieza, que importa en cuanto un toaster vive dentro de algo que puede desaparecer, y el renderizado del lado del servidor.

## Cuándo necesitas el tuyo

La mayoría de las apps nunca necesitan más que `toast`, configurado una vez. Crea un toaster aparte cuando:

- Los toasts tienen que ir dentro de un elemento concreto, como un panel lateral, un widget embebido o [tu propio diálogo modal](dialogs.md#tus-propios-diálogos-modales), en vez de sobre toda la página.
- Estás construyendo un widget que se embebe en páginas que no controlas, y sus toasts no deberían mezclarse con los de la página que lo aloja.
- Quieres un toaster nuevo por test, para que los toasts que deja un test no puedan hacer fallar al siguiente.

Para tener ajustes distintos en distintas partes de una misma página, normalmente bastan las opciones por llamada de `toast`. Más toasters son más stacks, y [dos toasters en la misma esquina](#las-instancias-son-independientes) acaban uno encima del otro.

## Configuración

`createToaster()` acepta un objeto de configuración opcional. Todos los campos son opcionales:

```ts
import { createToaster } from "@codenhub/toaster";

const sidebarToaster = createToaster({
  container: document.querySelector<HTMLElement>("#sidebar")!,
  position: "bottom-left",
  maxVisible: 3,
  duration: 6000,
  dismissible: true,
  labels: { dismiss: "Cerrar notificación" },
});

sidebarToaster.success("Carpeta creada");
```

| Opción        | Por defecto                            | Qué hace                                                                                                                                                                |
| ------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container`   | `document.body`                        | El elemento al que se añaden los stacks de toasts. No se puede cambiar después.                                                                                         |
| `position`    | `"top-right"`                          | Dónde aparecen los toasts cuando una llamada no lo dice. Una de las seis [posiciones](toasts.md#posiciones-y-márgenes).                                                 |
| `maxVisible`  | `5`                                    | Cuántos toasts muestra cada posición a la vez antes de que el resto [haga cola](toasts.md#cómo-se-llena-el-stack). Un número entero igual o mayor que 1.                |
| `duration`    | `4000`                                 | Milisegundos antes de que un toast se cierre solo. 0 o más.                                                                                                             |
| `autoDismiss` | `true`                                 | Si los toasts se cierran solos pasado `duration`.                                                                                                                       |
| `dismissible` | `false`                                | Si los toasts llevan botón de cerrar.                                                                                                                                   |
| `margin`      | 1rem, o el área segura del dispositivo | Distancia al borde, como longitud CSS o `{ x, y }`. Consulta [márgenes](toasts.md#posiciones-y-márgenes).                                                               |
| `className`   | Ninguno                                | Clases CSS extra en cada toast de este toaster.                                                                                                                         |
| `labels`      | En inglés                              | `dismiss`, el nombre accesible del botón de cerrar (`"Dismiss toast"`), y `notifications`, el nombre que dan los lectores de pantalla a cada stack (`"Notifications"`). |
| `semantic`    | Ninguno                                | Valores por defecto para `success`, `error`, `warning`, `info` y los resultados de `promise`. Consulta [Valores por defecto por tipo](#valores-por-defecto-por-tipo).   |
| `loading`     | Ninguno                                | Valores por defecto para los toasts `loading` y la parte de carga de `promise`.                                                                                         |
| `custom`      | Ninguno                                | Valores por defecto para los toasts `custom`.                                                                                                                           |

El `toast` que importas es un toaster creado sin opciones, así que estos valores por defecto son exactamente como se comporta hasta que le hagas `configure()`.

`createToaster()` copia la configuración. Cambiar después el objeto que le pasaste no hace nada; para eso está `configure()`.

Los valores incorrectos lanzan una excepción en el acto, al crear el toaster:

- `Toaster duration must be a finite number greater than or equal to 0.`
- `Toaster maxVisible must be a positive integer.` Un `maxVisible` de 0, 2.5 o -1 lanza en los tres casos.
- `Toaster nested duration must be a finite number greater than or equal to 0.` La misma regla para `semantic.duration` y `custom.duration`.
- `Invalid toast position: …` Para `position` o cualquier `position` por tipo.

## Valores por defecto por tipo

A veces un tipo de toast necesita otros valores por defecto. Los errores, por ejemplo, suelen merecer más tiempo de lectura y un botón de cerrar, porque nadie lee un mensaje de error en menos de 4 segundos, y menos aún el que dice que perdiste tu trabajo:

```ts
import { createToaster } from "@codenhub/toaster";

const notesToaster = createToaster({
  duration: 4000,
  semantic: { duration: 8000, dismissible: true },
  loading: { position: "bottom-right" },
  custom: { autoDismiss: false },
});
```

| Grupo      | Se aplica a                                                       | Campos                                               |
| ---------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `semantic` | `success`, `error`, `warning`, `info` y el resultado de `promise` | `position`, `duration`, `dismissible`, `autoDismiss` |
| `loading`  | `loading` y la parte de carga de `promise`                        | `position`, `dismissible`                            |
| `custom`   | `custom`                                                          | `position`, `duration`, `dismissible`, `autoDismiss` |

Una llamada simple a `toast()` usa solo los ajustes de la instancia. Para todos los demás tipos, cada ajuste se busca en este orden, y gana el primero que esté definido:

1. La opción pasada en la propia llamada.
2. El grupo por tipo correspondiente.
3. El ajuste de la instancia.
4. El valor por defecto integrado.

Con la configuración de arriba, `notesToaster.error("Falló la sincronización")` dura 8 segundos con botón de cerrar, `notesToaster("Guardado")` dura 4, y `notesToaster.error("Falló la sincronización", { duration: 2000 })` dura 2. Una opción puesta a `undefined` en una llamada cuenta como no definida, así que no borra el valor por defecto del tipo.

## Cambiar la configuración después

`configure()` cambia cualquier opción excepto `container`. Pasa solo lo que cambia:

```ts
import { toast } from "@codenhub/toaster";

toast.configure({
  position: "bottom-center",
  labels: { dismiss: "Cerrar", notifications: "Notificaciones" },
});
```

La mayoría de los cambios se aplican a los toasts que se muestren después. Tres se aplican en el acto a los toasts que ya están en pantalla:

- **`maxVisible`**: bajarlo cierra enseguida los toasts más antiguos que sobrepasan el nuevo límite, excepto los [protegidos](toasts.md#cómo-se-llena-el-stack), que se van cuando quedan libres.
- **`margin`**: los stacks existentes se mueven.
- **`labels.notifications`**: los stacks existentes cambian de nombre.

`configure()` valida igual que `createToaster()` y lanza los mismos errores. Pasarle `container` lanza `Toaster container cannot be changed after construction.` Para mover los toasts a otro sitio, crea un toaster nuevo allí y destruye el viejo.

## Limpieza con `destroy()`

Un toaster añade elementos, temporizadores y event listeners a la página. Cuando desaparece aquello a lo que pertenece, como una barra lateral que se cierra o un widget que se desmonta, llama a `destroy()`:

```ts
import { createToaster } from "@codenhub/toaster";

function mountSidebar(sidebar: HTMLElement) {
  const sidebarToaster = createToaster({ container: sidebar });

  // … usa sidebarToaster mientras la barra lateral está abierta …

  return function unmountSidebar() {
    sidebarToaster.destroy();
  };
}
```

`destroy()` actúa en el acto, sin animaciones:

1. Todos los toasts, visibles o en cola, se cierran de golpe. Su estado pasa a `"hidden"` y sus promesas `settled` se resuelven.
2. Los stacks y las regiones para lectores de pantalla del toaster se quitan de la página.
3. Se eliminan sus temporizadores y listeners.
4. Cualquier llamada posterior sobre él lanza `This toaster instance has been destroyed. Create a new one with createToaster().`

Volver a llamar a `destroy()` no hace nada, así que es seguro en código de limpieza que podría ejecutarse dos veces. Destruir un toaster no afecta a ninguna instancia de diálogos, y destruir una instancia de diálogos no afecta a los toasters.

También puedes destruir el `toast` listo para usar, pero después no hay forma de recuperarlo. Déjalo tranquilo salvo que toda la app se esté cerrando.

## Las instancias son independientes

Dos toasters nunca se coordinan. Cada uno tiene sus propios stacks, su propia cola y su propio `maxVisible`, incluso en la misma posición:

```ts
const first = createToaster({ position: "top-right" });
const second = createToaster({ position: "top-right" });

first.success("Desde el primer toaster");
second.success("Desde el segundo toaster"); // se dibuja encima del primero
```

Los dos stacks quedan en la misma esquina y se solapan. Dale a cada toaster su propia posición o su propio contenedor, o usa un solo toaster con opciones por llamada.

## Renderizado del lado del servidor

Toaster se puede importar en cualquier parte. Crear un toaster, incluido el `toast` listo para usar, no toca la página, así que es seguro mientras se renderiza en el servidor. Mostrar algo necesita una página, así que una llamada de toast o de diálogo hecha donde no hay `document` lanza:

- `DOM document is not available. Toaster operations require a browser environment.`
- `DOM document is not available. Dialogs require a browser environment.`

En Next.js, Remix, SvelteKit, Astro y frameworks parecidos, muestra los toasts desde código que solo se ejecuta en el navegador: event handlers, efectos (`useEffect`, `onMount`) o módulos solo de cliente:

```tsx
"use client";

import { toast } from "@codenhub/toaster";

export function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
  return <button onClick={() => toast.promise(onSave(), { loading: "Guardando…", success: "Guardado", error: "No se pudo guardar" })}>Guardar</button>;
}
```

## Siguiente

La app de notas ya tiene todos los toasts y diálogos que necesita. Toca que parezcan de la casa: [Estilos](styling.md) cubre colores, presentación, tamaño, modo oscuro y Content Security Policy.
