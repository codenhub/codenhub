---
title: Primeros pasos
description: Configura un registro para una aplicación real, normaliza los fallos por donde entran y decide qué mostrar y qué reportar.
order: 1
source: 48a886958cad7b0bbb662f9118351aa06933b552
---

# Primeros pasos

Esta página arma el manejo de errores del gestor de proyectos de la [visión general](index.md): una aplicación web donde la gente inicia sesión con Supabase, crea proyectos y llama a la API propia de la app con `fetch`. Al final, cada fallo que atrapa la aplicación se convierte en un mensaje con el que una persona puede hacer algo, y cada fallo que nadie previó sigue llegando intacto a tus logs.

Son cinco pasos, y los presets escriben la mayoría de los mensajes por ti.

## 1. Instala el paquete

```sh
pnpm add @codenhub/error
```

## 2. Crea un módulo que configure los errores

Pon toda la configuración del registro en una sola función y llámala una vez, antes de que se ejecute cualquier otra cosa. El registro es estado de módulo común y corriente: lo que registres es visible para cada llamada posterior a `createAppError` que use la misma copia del paquete. Usar una función, en lugar de código que se ejecuta al importarse, permite que una prueba vuelva a llamarla después de reemplazar el registro; consulta [Configurar los errores en las pruebas](recipes.md#configurar-los-errores-en-las-pruebas).

```ts
// src/errors.ts
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";
import { supabaseErrorRegistry } from "@codenhub/error/registries/supabase";

export function setUpErrors(): void {
  const registry = getErrorRegistry();

  // 1. Primero los presets: describen fallos que vienen de la plataforma y de Supabase.
  registry.merge(browserErrorRegistry);
  registry.merge(supabaseErrorRegistry);

  // 2. Tus propios mapeos al final, para que ganen donde se superpongan con un preset.
  registry.codes.addList([
    [
      "project.limit_reached",
      {
        message: "Llegaste al límite de proyectos de tu plan. Archiva un proyecto y vuelve a intentarlo.",
        messageKey: "error.project.limitReached",
        source: "my-app.projects",
      },
    ],
    [
      "23505",
      {
        message: "Ya tienes un proyecto con ese nombre. Elige otro.",
        messageKey: "error.project.nameTaken",
        source: "my-app.projects",
      },
    ],
  ]);
}
```

```ts
// src/main.ts
import { setUpErrors } from "./errors";

setUpErrors();
// …el resto de tu aplicación
```

Aquí el orden importa. Cuando dos mapeos del mismo bucket usan el mismo identificador, el que se agregó último reemplaza al otro. Por eso el mapeo de `23505` de arriba va después del preset de Supabase: el mensaje del preset para ese código es uno genérico sobre un valor duplicado, porque el preset no puede saber qué valor chocó, y en esta aplicación el único valor único con el que la gente puede chocar es el nombre de un proyecto, así que el nuestro lo dice.

Elige los presets según dónde se ejecuta el código:

- El preset del navegador para el código que se ejecuta en un navegador.
- El preset de Node.js para el código que se ejecuta en un servidor.
- El preset de Supabase dondequiera que llames a Supabase.

[Presets](presets.md) enumera exactamente lo que cubre cada uno. Fusionarlos todos "por si las moscas" es la forma en que un mensaje del navegador que te pide revisar el wifi termina en el log de un servidor, así que elige a propósito.

Cuando la misma configuración se ejecuta en un servidor y en un navegador, como en una aplicación de Next.js o SvelteKit, recibe el preset del runtime como parámetro y pasa el correcto desde cada punto de entrada. Adivinar el runtime a partir de los globales falla en los lugares que menos pruebas, como un web worker, que no tiene `window`:

```ts
// src/errors.ts
import { getErrorRegistry, type ReadonlyErrorRegistry } from "@codenhub/error";

export function setUpErrors(runtimePreset: ReadonlyErrorRegistry): void {
  const registry = getErrorRegistry();

  registry.merge(runtimePreset);
  // …el preset de Supabase y tus propios mapeos, como arriba
}

// En el punto de entrada del cliente: setUpErrors(browserErrorRegistry);
// En el punto de entrada del servidor: setUpErrors(nodeErrorRegistry);
```

## 3. Normaliza por donde los fallos entran a tu código

Llama a `createAppError` en la frontera donde un fallo llega a un código que tiene que decidir qué hacer con él. Normalmente es un manejador de eventos, un manejador de rutas o un cargador de datos:

```ts
import { createAppError } from "@codenhub/error";

async function onSubmit(form: FormData) {
  try {
    await createProject(form);
    showToast("Proyecto creado.");
  } catch (caught) {
    const error = createAppError(caught);

    showToast(error.message);
    reportIfUnexpected(error);
  }
}
```

No necesitas desenvolver nada antes. `createAppError` busca dentro del valor errores envueltos en `cause`, `originalError`, `error`, `err`, `inner`, `innerError` y las primeras diez entradas de una lista `errors`. Un `23505` enterrado dos `cause` más adentro igual se resuelve como "Ya tienes un proyecto con ese nombre.", siempre que ningún envoltorio por fuera de él tenga una coincidencia conocida propia. Una coincidencia por patrón por fuera de él no detiene la búsqueda; [Qué coincidencia gana](registries.md#qué-coincidencia-gana) tiene el orden completo.

## 4. Decide qué mostrar

Todo `AppError` tiene un `message`, y ese mensaje se puede mostrar sin riesgo siempre que los mensajes que registras también se puedan mostrar:

- Cuando un mapeo coincidió, es el mensaje que registraste tú o el preset. Un error reconstruido con `appErrorFromJSON` trae el mensaje de quien lo envió, así que reconstruye solo lo que envió un emisor de confianza.
- Cuando nada coincidió, es `"An unexpected error occurred."`, nunca el texto crudo del fallo.

Esa segunda regla es deliberada. Los mensajes crudos están escritos para desarrolladores, y a menudo contienen nombres de tablas, rutas de archivos, detalles del stack o datos de otra persona. ErrorKit solo muestra texto que alguien registró a propósito.

Donde sabes más sobre el contexto que un simple "algo falló", reemplaza el texto genérico:

```ts
const error = createAppError(caught, {
  fallbackMessage: "No pudimos crear tu proyecto. Vuelve a intentarlo en un momento.",
});
```

## 5. Decide qué reportar

`error.type` dice cómo coincidió el error:

| `type`        | Significado                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| `"known"`     | Coincidió un código, un nombre, un mensaje exacto o un prefijo de mensaje.     |
| `"heuristic"` | Solo coincidió una expresión regular, como el "Failed to fetch" del navegador. |
| `"unknown"`   | No coincidió nada. El mensaje es el de respaldo.                               |

Un error `"unknown"` es el que más te interesa tener en tu tracker de errores, porque es un fallo que nadie ha descrito todavía. El valor crudo está en `error.originalError`, y también en `error.cause`, que la mayoría de los trackers de errores ya sigue:

```ts
import type { AppError } from "@codenhub/error";

function reportIfUnexpected(error: AppError) {
  if (error.type === "unknown") {
    errorTracker.captureException(error.originalError);
  }
}
```

Una cosa a tener en cuenta: `type` dice cómo coincidió el error, no qué tan grave es. Una tabla de la base de datos que falta es `"known"` una vez que registras su código, y sigue siendo un bug con todas las letras. [Recetas](recipes.md#reportar-a-un-tracker-de-errores) muestra cómo reportar esos también.

## Siguiente

Ya tienes el ciclo completo: describir, normalizar, mostrar, reportar. La siguiente página, [El AppError](app-error.md), repasa cada campo que acabas de usar, incluido `code` para ramificar según un fallo específico e `isRetryable` para decidir cuándo un reintento es seguro.
