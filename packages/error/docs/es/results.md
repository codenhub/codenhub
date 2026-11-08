---
title: Resultados
description: Devuelve los fallos en lugar de lanzarlos, con Result, attempt y los helpers que los encadenan.
order: 5
source: ffdc4781d5f79dcb413f86b99dddb898b29b0716
---

# Resultados

Un error lanzado es invisible en el tipo de una función. `loadProject(id): Promise<Project>` no dice nada sobre las formas en que puede fallar, así que cada llamador tiene que acordarse de su propio `try`/`catch`, y el que se olvida se entera en producción. Un `Result` pone el fallo en el tipo, así que el compilador se acuerda por ti.

Esta página muestra cómo crear resultados, leerlos, envolver código que lanza excepciones y encadenar varios pasos. Todo lo de aquí es opcional: si tu código está contento con `try`/`catch` y `createAppError`, salta directamente a [Error boundaries](frameworks.md).

```ts
type Result<T> = Ok<T> | Err;

interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

interface Err {
  readonly ok: false;
  readonly error: AppError;
}
```

El lado del fallo siempre es un `AppError`, normalizado con el mismo registro que `createAppError`. Un `Result` es el mismo manejo de errores con otra forma, no un segundo sistema que configurar.

## Crear resultados

`ok(value)` envuelve un éxito, y `ok()` sin argumentos crea un `Ok<void>` para operaciones que no devuelven nada. `err(error, options?)` normaliza un fallo exactamente como lo haría `createAppError(error, options)`. Aquí el gestor de proyectos revisa el nombre de un proyecto antes de guardarlo:

```ts
import { err, getErrorRegistry, ok, type Result } from "@codenhub/error";

getErrorRegistry().codes.add("project.name_missing", {
  message: "Ponle un nombre al proyecto y vuelve a guardar.",
  source: "my-app.projects",
});

function validateName(name: string): Result<string> {
  const trimmed = name.trim();
  return trimmed === "" ? err({ code: "project.name_missing" }) : ok(trimmed);
}
```

Ambos devuelven objetos congelados.

Lanza tus propios fallos por código, como arriba, no por mensaje. Un string que se le pasa a `err` se compara como texto de mensaje contra los buckets `messages`, `prefixes` y `patterns`, nunca contra `codes`. Y un string que no coincide no se convierte en el mensaje: `err("Name is required")` te da `"An unexpected error occurred."`, salvo que coincida con un mensaje, prefijo o patrón registrado. Es la misma regla que mantiene el texto crudo fuera de la pantalla, aplicada también a tus propios strings. ErrorKit no hace excepciones, ni siquiera contigo.

## Leer resultados

Revisa `ok`, y TypeScript estrecha el resto:

```ts
const name = validateName(input);

if (!name.ok) {
  showFieldError(name.error.message);
  return;
}

save(name.value); // aquí name.value es un string
```

## Envolver código que lanza excepciones

La mayor parte del código que llamas lanza excepciones en lugar de devolver resultados: `JSON.parse`, `fetch`, los clientes de bases de datos. `attempt` y `attemptAsync` ejecutan un callback y convierten cualquier cosa que lance en un `Err`:

```ts
import { attempt, attemptAsync } from "@codenhub/error";

const config = attempt(() => JSON.parse(text) as Config);
const project = await attemptAsync(() => api.loadProject(id));
```

Ambos reciben como segundo argumento las mismas opciones que `createAppError`, como un `fallbackMessage` para esa llamada o un `registry`.

Unas cuantas reglas los mantienen honestos:

- **`attempt` es solo para callbacks síncronos.** Un callback que devuelve una promesa es un error de tipos. En runtime, donde el verificador de tipos no lo ve (un callback tipado como `any`, o JavaScript a secas), `attempt` lanza `TypeError` en lugar de devolver un `Ok` con una promesa cuyo rechazo nadie atraparía nunca. Usa `attemptAsync` para todo lo asíncrono.
- **Dentro de una función genérica, pasa el argumento de tipo en lugar de hacer un cast.** La comprobación de tipos de arriba tiene que saber qué devuelve el callback, así que un callback que devuelve un valor de un parámetro de tipo también es un error de tipos: `attempt(() => JSON.parse(text) as T)` no compila. Escribe `attempt<T>(() => JSON.parse(text))` en su lugar. Para un callback que devuelve un `T` que obtuvo de otro lado, haz un cast de su resultado a `never`: `attempt<T>(() => read() as never)`. La comprobación en runtime igual rechaza una promesa.
- **`attemptAsync` nunca se rechaza por algo que hizo el callback.** Su promesa siempre se resuelve con un `Result`.
- **Ambos validan sus argumentos antes de ejecutar el callback.** Un callback que no es una función, o una opción inválida, lanza `TypeError` sin ejecutar nada. En `attemptAsync`, en cambio, la promesa se rechaza con ese error.

## Encadenar resultados

La mayoría de los helpers restantes trabajan sobre el lado del éxito y dejan pasar un `Err` sin tocarlo. `orElse` y `orElseAsync` trabajan sobre el lado del fallo:

| Helper                           | Qué hace                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `map(result, mapper)`            | Transforma el valor de un `Ok`. Devuelve el `Err` sin cambios.                                                   |
| `mapAsync(result, mapper)`       | Como `map`, con un mapper que puede devolver una promesa. Siempre devuelve una promesa.                          |
| `andThen(result, mapper)`        | Ejecuta un mapper que devuelve otro `Result`, así que obtienes `Result<U>`, no `Result<Result<U>>`.              |
| `andThenAsync(result, mapper)`   | Como `andThen`, con un mapper que puede devolver una promesa de un `Result`. Siempre devuelve una promesa.       |
| `orElse(result, recover)`        | Ejecuta `recover` sobre un `Err` y devuelve el `Result` que este devuelva. Devuelve el `Ok` sin cambios.         |
| `orElseAsync(result, recover)`   | Como `orElse`, con una recuperación que puede devolver una promesa de un `Result`. Siempre devuelve una promesa. |
| `all(results)`                   | Un `Ok` con todos los valores en orden, o el primer `Err`.                                                       |
| `match(result, { onOk, onErr })` | Llama exactamente a uno de los dos callbacks y devuelve lo que este devuelva.                                    |
| `unwrap(result)`                 | Devuelve el valor del `Ok`, o lanza el `AppError`.                                                               |
| `unwrapOr(result, fallback)`     | Devuelve el valor del `Ok`, o `fallback`.                                                                        |

Juntos, forman un pequeño pipeline que se lee de arriba abajo. Este lee el puerto de un archivo de configuración:

```ts
import { andThen, attempt, err, map, match, ok } from "@codenhub/error";

const port = andThen(
  attempt(() => JSON.parse(text) as { port?: unknown } | null),
  (config) => (typeof config?.port === "number" ? ok(config.port) : err({ code: "config.port_missing" })),
);

const label = match(
  map(port, (value) => `Escuchando en ${value}`),
  {
    onOk: (text) => text,
    onErr: (error) => error.message,
  },
);
```

`orElse` se encarga de los fallos con los que puedes hacer algo y deja pasar el resto. Devuelve `err(error)` para cada fallo que la recuperación no maneje; ya es un `AppError`, así que vuelve tal cual. Aquí el gestor de proyectos recurre a su lista de proyectos en caché cuando el navegador reporta un fetch fallido:

```ts
import { attemptAsync, err, ok, orElse } from "@codenhub/error";

const projects = orElse(await attemptAsync(() => api.listProjects()), (error) => (error.messageKey === "error.browser.requestFailed" ? ok(cache.projects) : err(error)));
```

`all` convierte varios resultados en uno, y conserva el tipo de cada posición cuando le pasas una tupla. Para llamadas que se ejecutan en paralelo, espéralas juntas primero, en una línea aparte:

```ts
import { all, attemptAsync } from "@codenhub/error";

const settled = await Promise.all([attemptAsync(() => api.user(id)), attemptAsync(() => api.projects(id))]);
const loaded = all(settled);

if (loaded.ok) {
  const [user, projects] = loaded.value;
}
```

La línea extra no es decoración. Escrito de una sola vez, `all(await Promise.all([...]))`, TypeScript deduce el tipo de la lista a partir de lo que acepta `all` y no de lo que devuelven las llamadas, y cada posición termina siendo "un usuario o una lista de proyectos". La versión en dos líneas mantiene a `user` como un usuario.

Los helpers no atrapan nada. Si un mapper o un callback de `match` lanza una excepción, esta se propaga como lo haría desde cualquier otra función. Cuando un paso puede lanzar, envuelve ese paso en `attempt` o `attemptAsync`.

Usa `unwrap` en el borde donde tu código vuelve a lanzar excepciones, como un framework que espera que un loader lance, y mantén `Result` en todo lo que queda en medio.

## Siguiente

Los resultados manejan los fallos del código que llamas. Los fallos también pueden ocurrir mientras un componente se renderiza, donde no hay ningún `try` tuyo cerca. [Error boundaries](frameworks.md) cubre esos casos, para React y Svelte.
