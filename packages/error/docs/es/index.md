---
title: Visión general
description: Para qué sirve ErrorKit, la idea sobre la que está construido, un recorrido de cinco minutos y el orden en que leer el resto de la documentación.
source: 2f96329b1cd9629ce0b944a81f0dfd91ea08a4b3
---

# Convierte lo que atrapaste en un error que puedas usar

`@codenhub/error` (ErrorKit) toma cualquier valor que haya atrapado tu código y te devuelve un único `AppError` predecible. Ese error tiene un mensaje que le puedes mostrar a una persona, una clave que puedes traducir, un código para ramificar y un flag que dice si repetir la llamada es seguro. El valor original queda adjunto para tus logs.

## El problema

En TypeScript, un bloque `catch` te entrega `unknown`, que es la forma educada que tiene el sistema de tipos de decir "suerte con eso". En la práctica, ese valor puede ser cualquier cosa:

- Un `fetch` fallido es un `TypeError`, y su mensaje depende del navegador al que le preguntes.
- Una llamada a Supabase devuelve un objeto con un `code` como `"invalid_credentials"`.
- Un driver de base de datos lanza un error cuyo `code` es `"23505"`, que en PostgreSQL quiere decir "ese valor ya está ocupado".
- Una biblioteca envuelve el fallo real tres niveles más adentro, en `cause`.
- Y en algún lugar, alguien lanza un string a secas. Sus razones tendría.

Así que cada lugar que atrapa un error termina con su propio traductor casero, y con el tiempo esos traductores se van separando. Una pantalla le muestra a un cliente `duplicate key value violates unique constraint "projects_name_key"`, y ahora conoce los nombres de tus tablas y sigue sin saber qué hacer. Otra pantalla muestra "Algo salió mal" para un fallo que podría haber dicho exactamente cómo arreglarlo.

## La idea

ErrorKit divide el trabajo en dos:

1. **Un registro describe los fallos que conoces.** Lo llenas una sola vez, cuando arranca la aplicación. Cada entrada asocia algo que identifica un fallo (un código, un nombre de error, un mensaje exacto, un prefijo de mensaje o una expresión regular) con el feedback que quieres que la gente vea.
2. **`createAppError` normaliza cualquier cosa** contra ese registro. Revisa el valor y los errores envueltos dentro de él, elige la mejor coincidencia y devuelve un `AppError`. Cuando nada coincide, igual obtienes un `AppError`, con un mensaje genérico seguro, así que el texto crudo de un fallo inesperado nunca llega a la pantalla.

Unos registros listos para usar, llamados presets, cubren fallos comunes del navegador, de Node.js, de HTTP y de Supabase. Son opcionales: importar uno no cambia nada hasta que lo fusionas.

Encima de eso están los helpers de resultados (`ok`, `err`, `attempt`, `attemptAsync` y compañía), para el código que prefiere devolver un fallo en lugar de lanzarlo.

## Instalación

```sh
pnpm add @codenhub/error
```

El paquete es ESM y no tiene dependencias en runtime. Tiene ocho puntos de entrada, así que importas solo lo que usas:

| Ruta de importación                   | Qué contiene                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `@codenhub/error`                     | `createAppError`, las funciones del registro y los helpers de resultados                   |
| `@codenhub/error/registries/browser`  | El preset del navegador y de las Web APIs                                                  |
| `@codenhub/error/registries/node`     | El preset de red de Node.js                                                                |
| `@codenhub/error/registries/http`     | El preset de estados de respuesta HTTP                                                     |
| `@codenhub/error/registries/supabase` | El preset de Supabase                                                                      |
| `@codenhub/error/registries`          | Los cuatro presets en un solo import                                                       |
| `@codenhub/error/react`               | `AppErrorBoundary`, un error boundary de React; consulta [Error boundaries](frameworks.md) |
| `@codenhub/error/svelte`              | `createAppErrorBoundary`, para un `<svelte:boundary>` de Svelte                            |

## Un recorrido de cinco minutos

Todos los ejemplos de esta documentación pertenecen a una misma aplicación pequeña: un gestor de proyectos donde la gente inicia sesión con Supabase, crea proyectos, y el navegador llama a la API propia de la app con `fetch`. Cada página le agrega una pieza.

Primero, describe los fallos que conoces, una vez, al arrancar:

```ts
// src/errors.ts, importado una sola vez cuando arranca la aplicación
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

const registry = getErrorRegistry();

registry.merge(browserErrorRegistry);
registry.codes.add("project.limit_reached", {
  message: "Llegaste al límite de proyectos de tu plan. Archiva un proyecto y vuelve a intentarlo.",
  messageKey: "error.project.limitReached",
  source: "my-app.projects",
});
```

Después, normaliza en cada lugar por donde un fallo entra a tu código:

```ts
import { createAppError } from "@codenhub/error";

try {
  await createProject(draft);
} catch (caught) {
  const error = createAppError(caught);

  showToast(error.message); // Seguro de mostrar: viene del registro o del mensaje de respaldo.
  console.error(error.originalError); // El valor crudo, para ti, no para quien lee.
}
```

Esto es lo que dice el toast en cada caso:

- `createProject` lanzó `{ code: "project.limit_reached" }`: el toast explica el límite del plan.
- Se cayó la red: el preset del navegador reconoce el `fetch` fallido y lo dice.
- Algo que nadie previó: el toast dice `"An unexpected error occurred."`, y tu log sigue teniendo la historia completa.

Si prefieres devolver los fallos en lugar de lanzarlos, la misma normalización alimenta los helpers de resultados:

```ts
import { attemptAsync } from "@codenhub/error";

const result = await attemptAsync(() => createProject(draft));

if (!result.ok) {
  showToast(result.error.message);
}
```

## Requisitos

- Node.js 24 o posterior, o un navegador, worker o runtime de edge compatible con ES2022.
- Soporte nativo de `cause` en `Error`, que tienen todos los runtimes de arriba.
- ESM. El código CommonJS puede cargar el paquete con `require()` en los runtimes que permiten hacer `require` de módulos ES, como Node.js 24.
- Solo para los adaptadores: React 18 o posterior para `@codenhub/error/react`, y Svelte 5.3 o posterior para `@codenhub/error/svelte`. Ambos son peer dependencies opcionales, así que el resto del paquete se instala sin ellos.

El paquete nunca toca globales del navegador ni de Node.js, así que funciona igual en un navegador, en un servidor, durante el renderizado en el servidor, en un worker o en un runtime de edge. Importar un preset no contacta ningún servicio ni necesita ningún otro paquete.

## Lo que no hace

ErrorKit decide qué significa un fallo. Lo que pasa después depende de ti:

- **No reporta errores.** Te da los campos para decidir cuáles vale la pena reportar, y guarda el valor crudo para tu tracker de errores; consulta [Recetas](recipes.md#reportar-a-un-tracker-de-errores).
- **No reintenta.** `isRetryable` dice cuándo un reintento es seguro, y [Recetas](recipes.md#reintentar-sin-riesgo) muestra un pequeño bucle que lo usa.
- **No trae traducciones.** Cada mensaje de los presets tiene una clave de traducción estable para tu propio catálogo; consulta [Recetas](recipes.md#traducir-los-mensajes).
- **No lee los estados HTTP por su cuenta.** `fetch` se resuelve con un `404`, así que el estado se lo pasas tú; consulta [Recetas](recipes.md#clasificar-respuestas-http).

[Salvedades y limitaciones](caveats.md) cubre el resto de las sorpresas.

## Orden de lectura

La primera vez, léelas en orden; cada página se apoya en las anteriores.

1. [Primeros pasos](getting-started.md): configura el registro del gestor de proyectos, normaliza los fallos por donde entran y decide qué mostrar y qué reportar.
2. [El AppError](app-error.md): cada campo y lo que promete, qué pasa cuando un error se normaliza dos veces y cómo enviar uno de un servidor a un cliente.
3. [Registros](registries.md): las cinco formas de reconocer un fallo, qué coincidencia gana y cuándo conviene un registro propio en lugar del global.
4. [Presets](presets.md): cada fallo que reconocen los presets del navegador, de Node.js, de HTTP y de Supabase, con su clave de traducción y su flag de reintento.
5. [Resultados](results.md): devuelve los fallos en lugar de lanzarlos, con `Result`, `attempt` y los helpers que los encadenan.
6. [Error boundaries](frameworks.md): muestra un mensaje seguro cuando un componente de React o Svelte falla al renderizar, y repórtalo una sola vez.
7. [Recetas](recipes.md): soluciones completas para estados HTTP, llamadas a Supabase, tus propios códigos de error, reintentos, traducciones, reporte de errores y pruebas.
8. [Salvedades y limitaciones](caveats.md): todo lo que sorprende a la gente, por qué funciona así y qué hacer en su lugar.

La [referencia de la API](../reference/index.md) enumera cada export con su firma, generada a partir del código fuente. Es el lugar para consultar algo puntual, no para empezar.
