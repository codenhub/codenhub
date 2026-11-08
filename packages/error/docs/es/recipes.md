---
title: Recetas
description: Ejemplos completos para fetch y los códigos de estado HTTP, llamadas a Supabase, tus propios códigos de error, reintentos seguros, traducciones, reporte de errores y pruebas.
order: 7
source: dafb18aafc4badff0516e1a1c33f780b45206f6d
---

# Recetas

Cada receta resuelve un problema de principio a fin, con las piezas de las páginas anteriores. Son las preguntas que aparecen en la primera semana de uso de ErrorKit, normalmente en este orden. Copia las partes que necesites; ninguna depende de otra.

## Clasificar respuestas HTTP

`fetch` solo se rechaza cuando no llegó ninguna respuesta. Una respuesta con estado `404` o `500` se resuelve con normalidad: el servidor respondió, y `fetch` da su trabajo por terminado. Así que `createAppError(response)` no tiene nada que reconocer y devuelve un error `"unknown"`. Los códigos de estado necesitan un mapeo propio.

Pasa el estado como `code` y clasifícalo contra el preset de HTTP. Mantén ese preset fuera del registro global: los códigos de estado son números cortos que podrían chocar con los códigos de otros servicios, y solo significan algo para las respuestas.

```ts
import { attemptAsync, err, type Result } from "@codenhub/error";
import { httpErrorRegistry } from "@codenhub/error/registries/http";

export async function getJson<T>(url: string): Promise<Result<T>> {
  const sent = await attemptAsync(() => fetch(url));

  if (!sent.ok) {
    return sent; // La solicitud nunca se completó; el registro global la clasificó.
  }

  const response = sent.value;

  if (!response.ok) {
    return err({ code: response.status }, { registry: httpErrorRegistry });
  }

  return attemptAsync(() => response.json() as Promise<T>);
}
```

Que no llegue ninguna respuesta puede deberse a un fallo de red, un bloqueo de CORS o una cancelación, y en cualquiera de esos casos la solicitud igual pudo haber llegado al servidor. Toda respuesta que sí llegó se resuelve, así que revisar el estado te toca a ti.

El cuerpo queda fuera a propósito: terminaría en `originalError` y, de ahí, en tu tracker de errores, así que agrégalo como `body` solo cuando sea seguro registrarlo. Nunca lo pases como `cause`: `createAppError` busca dentro de `cause`, y un `code` en el cuerpo podría entonces ganarle al estado. Un estado que el preset no mapea, como `418`, se resuelve con el mensaje de respaldo. [Presets](presets.md#http) enumera lo que mapea. Para redactar un estado en un endpoint concreto, como un `401` de un formulario de inicio de sesión, crea un registro a partir del preset y agrega el tuyo: `createErrorRegistry([httpErrorRegistry])`, y después `.codes.add("401", …)`.

Cuando el servidor es tuyo y envía `{ error: error.toJSON() }`, reconstruye su error: `appErrorFromJSON(body.error)`. Cuando todo el cuerpo es el error serializado, pasa `appErrorFromJSON(body)`. Consulta [El AppError](app-error.md#enviar-un-error-a-otro-entorno).

Elige una de las dos por endpoint, no ambas. `appErrorFromJSON` no puede decirte si reconoció la forma: un valor que no reconoce se clasifica como entrada cruda y queda tal cual en `originalError`, que es justo lo que la llamada de arriba, solo con el estado, mantiene fuera de tu tracker. Usa `appErrorFromJSON` para los endpoints que siempre envían un error serializado, y el estado para todo lo demás.

## Manejar llamadas a Supabase

El cliente de Supabase devuelve los fallos en lugar de lanzarlos, como `{ data, error }`. Pásale el `error` a `err` y el preset de Supabase hace el resto:

```ts
import { err, ok, type Result } from "@codenhub/error";

export async function signIn(email: string, password: string): Promise<Result<Session>> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  return error ? err(error) : ok(data.session);
}
```

Esto da por hecho que el preset de Supabase está fusionado en el registro global, como en [Primeros pasos](getting-started.md). El `code` del resultado te dice qué fallo fue cuando necesitas actuar en consecuencia:

```ts
const result = await signIn(email, password);

if (!result.ok && result.error.code === "email_not_confirmed") {
  redirectTo("/confirm-email");
}
```

Los errores de base de datos funcionan igual: `supabase.from("projects").insert(row)` devuelve un `error` cuyo `code` es un código de PostgreSQL como `"23505"`.

## Crear tus propios errores

Un error que lanzas con un código vale lo que vale su registro. `err({ code: "project.name_mising" })`, con una errata o con un mapeo que nadie agregó, es un error `"unknown"` cuyo `code` es `null`, y una comprobación de `error.code === "project.name_missing"` nunca se cumple. Nada te avisa, y una errata de una sola letra pasa el code review sin que nadie la note.

Guarda tus códigos y su feedback en un solo objeto, regístralos desde ahí y lanza los errores con una función que solo acepte sus claves. Así una errata es un error de tipos, y cada código que puedes lanzar está registrado:

```ts
// src/project-errors.ts
import { err, type ErrorFeedback } from "@codenhub/error";

export const projectErrors = {
  "project.name_missing": { messageKey: "error.project.nameMissing", message: "Ponle un nombre al proyecto y vuelve a guardar.", source: "my-app.projects" },
  "project.not_found": { messageKey: "error.project.notFound", message: "No encontramos ese proyecto.", source: "my-app.projects" },
} satisfies Record<string, ErrorFeedback>;

export type ProjectErrorCode = keyof typeof projectErrors;

export const projectError = (code: ProjectErrorCode, details?: Record<string, unknown>) => err({ code }, { details });
```

Registra el objeto en la función `setUpErrors` de [Primeros pasos](getting-started.md#2-crea-un-módulo-que-configure-los-errores), con `registry.codes.addList(Object.entries(projectErrors))`. Después, `projectError("project.name_missing", { field: "name" })` se lee como lo que es, y `error.code` se puede comparar con un `ProjectErrorCode`.

Cuando los códigos se registran en más de un lugar, compruébalos en una prueba; consulta [Configurar los errores en las pruebas](#configurar-los-errores-en-las-pruebas).

## Reintentar sin riesgo

`isRetryable` dice que una llamada fallida se puede repetir sin el riesgo de que se ejecute dos veces. Reintenta según ese flag solo alrededor de la llamada que falló, no alrededor de una operación más grande que la contiene:

```ts
import { attemptAsync, type Result } from "@codenhub/error";

export async function withRetry<T>(call: () => Promise<T>, attempts = 3): Promise<Result<T>> {
  for (let attempt = 1; ; attempt += 1) {
    const result = await attemptAsync(call);

    if (result.ok || !result.error.isRetryable || attempt >= attempts) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
}

const users = await withRetry(() => db.query("select * from users"));
```

Envuelve la consulta individual a la base de datos o el `fetch` individual, no una función `publish()` que sube un archivo y después guarda un registro. Si el guardado falla con un `ECONNREFUSED` reintentable, repetir `publish()` sube el archivo por segunda vez. [El AppError](app-error.md#isretryable) explica por qué el flag es tan estricto.

El bucle espera 500 ms, y después 1 s, entre intentos. Agrega jitter si muchos clientes pueden fallar en el mismo momento, para que no vuelvan todos en el mismo momento también.

## Traducir los mensajes

Cada mapeo de los presets, y cualquier mapeo que registres con uno, trae un `messageKey`. Busca la clave en tu catálogo y, cuando el catálogo no tenga una entrada, recurre al mensaje en inglés:

```ts
import type { AppError } from "@codenhub/error";

export function errorText(error: AppError, translate: (key: string) => string | undefined): string {
  return (error.messageKey === null ? undefined : translate(error.messageKey)) ?? error.message;
}
```

Las claves son estables entre versiones, y cada una conserva su significado aunque cambie su redacción en inglés. [Presets](presets.md) enumera todas las claves integradas. Para armar un catálogo en código, léelas de los mapeos crudos:

```ts
import { browserErrorNames, browserErrorPatterns } from "@codenhub/error/registries/browser";

const browserKeys = new Set([...Object.values(browserErrorNames).map((feedback) => feedback.messageKey), ...browserErrorPatterns.map(([, feedback]) => feedback.messageKey)]);
```

Un error `"unknown"` no tiene clave: nada coincidió, así que nada lo nombró. Tradúcelo a través del mensaje que pasas, para que el fallo más común no sea el que se queda en inglés:

```ts
import { createAppError, DEFAULT_APP_ERROR_MESSAGE } from "@codenhub/error";

const error = createAppError(caught, { fallbackMessage: translate("error.unexpected") || DEFAULT_APP_ERROR_MESSAGE });
```

Eso solo cubre los errores `"unknown"`. Un mapeo que registraste sin `messageKey` ya tiene mensaje, así que `fallbackMessage` lo deja en inglés. Dale una clave a cada mapeo que registres. Además, el mensaje de respaldo solo redacta un error `"unknown"` que ninguna capa redactó todavía, así que cada capa que pase un `fallbackMessage` debería pasar uno traducido.

ErrorKit no trae traducciones. Las claves son el contrato; las palabras las pones tú.

## Reportar a un tracker de errores

Reporta lo que nadie describió todavía, más los fallos que sí describiste pero que siguen siendo bugs:

```ts
import type { AppError } from "@codenhub/error";

// Fallos que solo un desarrollador puede arreglar. Las claves nombran el preset, así que el "500" de otro servicio no cuenta.
const BUG_KEYS = new Set(["error.supabase.database.undefinedTable", "error.supabase.database.undefinedColumn", "error.supabase.auth.unexpectedFailure", "error.browser.invalidState", "error.http.serverError"]);

export function shouldReport(error: AppError): boolean {
  return error.type === "unknown" || (error.messageKey !== null && BUG_KEYS.has(error.messageKey));
}

if (shouldReport(error)) {
  errorTracker.captureException(error.originalError, { tags: { source: error.source ?? "none" } });
}
```

Reporta `originalError`, no el `AppError`: el original trae el mensaje y el stack reales. La mayoría de los trackers también siguen el `cause` de un error, y el `cause` de un `AppError` es ese mismo valor original, así que reportar el propio `AppError` también funciona. La única excepción es la [receta de HTTP](#clasificar-respuestas-http): su `originalError` es un objeto plano `{ code }`, sin stack.

No reportes solo porque `type === "heuristic"`. Una coincidencia heurística suele ser un fallo de red del lado de quien lee, y ningún deploy tuyo va a arreglar el wifi del aeropuerto.

## Ignorar solicitudes canceladas

Cancelar una solicitud con un `AbortController` hace que falle con un `AbortError`, que el preset del navegador convierte en "The request was cancelled before it finished." Cuando la canceló tu propio código, como hace la limpieza de un efecto o una búsqueda nueva que reemplaza a una anterior, nadie debería ver eso:

```ts
const result = await attemptAsync(() => fetch(url, { signal }));

if (!result.ok && signal.aborted) {
  return; // La cancelamos nosotros.
}
```

Aquí `signal` tiene que venir de un `AbortController` que sea de este código. Así, revisar `signal.aborted` funciona con o sin el preset del navegador, y no oculta una cancelación que vino de otro lado.

## Configurar los errores en las pruebas

El registro global lo comparten todas las pruebas del mismo archivo. Reemplázalo en un hook de setup para que cada prueba empiece con los mismos mapeos, y después vuelve a ejecutar tu configuración sobre el registro nuevo:

```ts
import { createErrorRegistry, setErrorRegistry } from "@codenhub/error";
import { beforeEach } from "vitest";

import { setUpErrors } from "../src/errors";

beforeEach(() => {
  setErrorRegistry(createErrorRegistry());
  setUpErrors();
});
```

La segunda línea es la que la gente olvida. Un registro nuevo empieza vacío, así que sin ella cada código que registra tu aplicación se resuelve como `"unknown"`, y las pruebas que pasan en el navegador fallan en el test runner sin ningún motivo visible. Si tu `setUpErrors` recibe un preset del runtime, pasa el del lugar donde se ejecutan tus pruebas.

Haz las aserciones sobre `code`, `messageKey` o `type`, no sobre `message`. Los mensajes están escritos para personas y se reescriben; los códigos y las claves son la parte estable. Una prueba que se rompe porque alguien corrigió una coma es una prueba que todo el mundo aprende a ignorar.

Para detectar un código que tu aplicación lanza pero nunca registró, compara cada uno con el registro que arma tu configuración. Con el hook de arriba en su lugar, los códigos de [Crear tus propios errores](#crear-tus-propios-errores) están a un `Object.keys` de distancia:

```ts
import { getErrorRegistry } from "@codenhub/error";
import { expect, it } from "vitest";

import { projectErrors } from "../src/project-errors";

it.each(Object.keys(projectErrors))("registra %s", (code) => {
  expect(getErrorRegistry().codes.get(code)).toBeDefined();
});
```

Esto revisa cada código de `projectErrors`. Un código lanzado sin `projectError`, como un `err({ code })` escrito a mano, queda fuera tanto del tipo como de esta prueba, así que lanza cada error del proyecto a través de esa función.

## Siguiente

Las recetas cubren los caminos comunes. [Salvedades y limitaciones](caveats.md) cubre los poco comunes: cada sorpresa que puede darte el paquete, por qué funciona así y qué hacer en su lugar. Léela una vez ahora y te ahorrará una tarde de depuración más adelante.
