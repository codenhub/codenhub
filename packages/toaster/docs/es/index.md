---
title: Visión general
description: Para qué sirve Toaster, cómo instalarlo y en qué orden leer sus páginas.
source: e7b22a43874e8eb5ff4fa4cbf1b0fe3c66733a95
---

# Toaster

Tarde o temprano, toda app necesita decirle dos tipos de cosas a quien la usa. Algunas noticias pueden esperar en una esquina: "Guardado", "Copiado", "Falló la sincronización, reintentando". Algunas preguntas no: "¿Borrar esta nota para siempre?". `@codenhub/toaster` se encarga de las dos. Los toasts son notificaciones pequeñas que se apilan en una esquina de la pantalla y se van solas. Los diálogos son preguntas modales que bloquean la página hasta que alguien responde.

Lo que te ahorras escribir a mano:

- **El stack.** Los toasts se alinean en una de seis posiciones de la pantalla. Los que sobran esperan en una cola, y el más antiguo se va para hacer sitio. Un toast se queda donde está mientras alguien tiene el puntero encima, tiene el foco dentro de él o mientras espera con un spinner de carga.
- **Los temporizadores.** Cada toast se cierra después de un tiempo fijo. La cuenta atrás se pausa mientras el puntero está encima, mientras tiene el foco y mientras la pestaña del navegador está en segundo plano, así que el tiempo en el que nadie podía leerlo no cuenta.
- **El malabarismo asíncrono.** `toast.promise()` muestra un spinner mientras tu trabajo corre y se convierte en un toast de éxito o de error cuando termina. Los diálogos devuelven algo a lo que le puedes hacer `await`, así que `if (await dialog.confirm("¿Borrar?"))` de verdad es `true` o `false`.
- **El trabajo sucio de la accesibilidad.** Los lectores de pantalla oyen cada toast. Los diálogos usan el propio elemento `<dialog>` del navegador, así que atrapar el foco, <kbd>Escape</kbd> y devolver el foco al final vienen de la plataforma.
- **Los deberes de seguridad.** Los strings siempre se muestran como texto plano y nunca se interpretan como HTML. El paquete no inyecta ningún elemento `<style>`, así que una Content Security Policy estricta no necesita excepciones por él.

Es TypeScript a pelo trabajando directamente con el DOM. No hay framework que adoptar ni dependencia de runtime que instalar.

## Instalación

```sh
pnpm add @codenhub/toaster
```

`npm install`, `yarn add` y `bun add` también funcionan. El paquete es solo ESM y tiene dos puntos de entrada más una hoja de estilos:

| Import                     | Lo que obtienes                                                           |
| -------------------------- | ------------------------------------------------------------------------- |
| `@codenhub/toaster`        | `toast`, un toaster listo para usar, y `createToaster()` para crear más.  |
| `@codenhub/toaster/dialog` | `dialog`, una instancia de diálogos lista para usar, y `createDialogs()`. |
| `@codenhub/toaster/styles` | La hoja de estilos. Obligatoria; sin ella nada se ve bien.                |

Los diálogos viven en su propio punto de entrada para que una app que solo muestra toasts no los meta en su bundle. Un bundle solo con toasts pesa unos 9 KB con gzip.

## Un primer toast

Carga la hoja de estilos una vez, en el archivo donde arranca tu app, y luego llama a `toast` desde donde quieras:

```ts
import "@codenhub/toaster/styles";
import { toast } from "@codenhub/toaster";

toast.success("Nota guardada");
```

Esa es toda la configuración. No hay provider que montar ni contenedor que crear. El primer toast crea su propio stack en `document.body`.

Toaster necesita un navegador. Importarlo durante el renderizado del lado del servidor es seguro, pero mostrar un toast ahí lanza una excepción, porque no hay página donde ponerlo. [Instancias de toaster](instances.md#renderizado-del-lado-del-servidor) explica cómo manejarlo.

## Orden de lectura

Las páginas se apoyan unas en otras y, juntas, siguen un mismo ejemplo pequeño: una app de notas que guarda, sincroniza, renombra y borra notas. La primera vez, léelas en orden.

1. [Toasts](toasts.md): cada tipo de toast, acciones, toasts de carga y de promesas, cómo actualizar un toast después de mostrarlo, y cómo se comportan el stack, la cola y los temporizadores.
2. [Diálogos](dialogs.md): `confirm`, `prompt` y `alert`, con qué se resuelven, cómo hacen cola, cómo traducir sus botones y qué pasa con los toasts mientras hay un diálogo abierto.
3. [Instancias de toaster](instances.md): cada opción de configuración y su valor por defecto, valores por defecto por tipo, toasters acotados a paneles y widgets, limpieza con `destroy()` y renderizado del lado del servidor.
4. [Estilos](styling.md): la hoja de estilos, los colores, las clases de presentación, el modo oscuro y la Content Security Policy.
5. [Accesibilidad y seguridad](accessibility.md): lo que oyen los lectores de pantalla, el comportamiento del teclado y del foco, el movimiento reducido y el límite de confianza del contenido personalizado.

La [referencia de la API](../reference/index.md) enumera cada símbolo exportado y su firma, generada a partir del código fuente. El [registro de cambios](../changelog/index.md) cuenta qué cambió en cada versión.

## Requisitos

- Un navegador con soporte nativo de `<dialog>` (`HTMLDialogElement.showModal()`) si usas diálogos. Todos los navegadores actuales lo tienen.
- `@codenhub/toaster/styles` cargado una vez en la página.
- Opcional: `@codenhub/styles` 0.3.0 o posterior. Cuando está en la página, los toasts y los diálogos toman sus colores y su aspecto de su tema. Sin él, el paquete usa sus propios colores integrados. [Estilos](styling.md) explica los dos casos.

El paquete es experimental. Su API, su renderizado y los nombres de sus clases CSS todavía pueden cambiar antes de una versión estable, y el [registro de cambios](../changelog/index.md) dice qué cambió cada vez.
