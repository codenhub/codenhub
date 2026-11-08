<!-- source: ed397dff330de855ba727407630a388ae64ded85 -->

# @codenhub/toaster

Notificaciones toast y diálogos modales nativos para el navegador. Los toasts se apilan en una esquina, hacen cola cuando hay demasiados y se cierran solos. Los diálogos hacen una pregunta y te dan una respuesta a la que le puedes hacer `await`. Los dos son accesibles de fábrica, los dos funcionan con una Content Security Policy estricta y ninguno necesita un framework.

> [!WARNING]
>
> Este paquete es experimental. Su API, su renderizado y los nombres de sus clases CSS pueden cambiar antes de una versión estable. El [registro de cambios](docs/changelog/index.md) (en inglés) enumera cada cambio.

## Instalación

```sh
pnpm add @codenhub/toaster
```

## Uso

Carga la hoja de estilos una vez donde arranca tu app y luego llama a `toast` desde cualquier parte. Los diálogos vienen de su propio punto de entrada, así que una app que solo muestra toasts no los mete en su bundle:

```ts
import "@codenhub/toaster/styles";
import { toast } from "@codenhub/toaster";
import { dialog } from "@codenhub/toaster/dialog";

toast.success("Nota guardada");

// Un spinner de carga que se convierte en un toast de éxito o de error cuando la promesa termina.
const note = await toast.promise(saveNote(draft), {
  loading: "Guardando…",
  success: "Guardada",
  error: "No se pudo guardar",
});

// Se resuelve con true o false, no con un objeto que siempre es truthy.
if (await dialog.confirm("¿Borrar esta nota?", { type: "error", confirmLabel: "Borrar" })) {
  await deleteNote(note.id);
}
```

Sin provider y sin llamada de configuración: el primer toast crea su propio stack. Para toasts dentro de un elemento concreto, o con ajustes distintos por zona, crea tus propias instancias con `createToaster()` y `createDialogs()`.

Las llamadas validan su entrada y lanzan una excepción en el acto ante un error, como un mensaje vacío o una posición desconocida. Mostrar un toast o un diálogo fuera de un navegador también lanza una excepción.

## Documentación

- [Visión general de la documentación](docs/es/index.md): qué hace el paquete y en qué orden leer las guías.
- [Toasts](docs/es/toasts.md): cada tipo de toast, acciones, toasts con promesas, actualizaciones, cola y temporizadores.
- [Diálogos](docs/es/dialogs.md): `confirm`, `prompt`, `alert`, cola y etiquetas traducidas.
- [Instancias de toaster](docs/es/instances.md): cada opción y su valor por defecto, toasters acotados, `destroy()` y SSR.
- [Estilos](docs/es/styling.md): colores, clases de presentación, modo oscuro y CSP.
- [Accesibilidad y seguridad](docs/es/accessibility.md): lectores de pantalla, foco, movimiento reducido y contenido personalizado.
- [Referencia de la API](docs/reference/index.md) (en inglés): cada símbolo exportado, generado a partir del código fuente.
- [Registro de cambios](docs/changelog/index.md) (en inglés): qué cambió en cada versión.

## Requisitos

- Un navegador. Importar y crear instancias es seguro durante el renderizado del lado del servidor, pero mostrar un toast o un diálogo necesita un `document`.
- `@codenhub/toaster/styles` cargado una vez. Sin él, los toasts no tienen posición, layout ni color.
- Soporte nativo de `<dialog>` para los diálogos, que tienen todos los navegadores actuales.
- Opcional: `@codenhub/styles` 0.3.0 o posterior. Cuando está presente, los toasts y los diálogos toman sus colores y su aspecto de su tema; si no, se usan los colores integrados. Si usas su hoja de estilos para elementos nativos, impórtala **antes** de `@codenhub/toaster/styles`, o los botones de los diálogos pierden sus colores. Consulta [Estilos](docs/es/styling.md).
- Las instancias que creas son dueñas de elementos del DOM, temporizadores y listeners. Llama a `destroy()` cuando desaparezca la zona a la que pertenecen.

## Licencia

Este proyecto tiene licencia [Apache-2.0](LICENSE).

Los iconos SVG de Lucide incluidos usan la licencia ISC. Consulta [NOTICE](NOTICE).
