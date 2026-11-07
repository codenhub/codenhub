---
title: El AppError
description: Cada campo de un AppError, lo que promete cada uno, qué pasa cuando un error se normaliza dos veces y cómo enviar uno de un servidor a un cliente.
order: 2
source: 22c25e35a2fe369705cc18d5d5ed7003bd1e2bed
---

# El AppError

Todo en este paquete termina en un `AppError`. Esta página repasa sus campos, las reglas que lo mantienen estable mientras pasa por las capas de tu código y cómo enviarlo a través de la red o a un worker. Si vas a leer con calma una sola página, que sea esta, y tómate tu tiempo con `isRetryable`.

## Los campos

Este es el error que recibe el gestor de proyectos cuando alguien inicia sesión con la contraseña equivocada:

```ts
const error = createAppError({ code: "invalid_credentials" }, { registry: supabaseErrorRegistry });

error.name; // "AppError"
error.message; // "We couldn't sign you in. The email or password is incorrect. Check them and try again."
error.type; // "known"
error.code; // "invalid_credentials"
error.messageKey; // "error.supabase.auth.invalidCredentials"
error.source; // "supabase.auth"
error.isRetryable; // false
error.details; // null
error.originalError; // { code: "invalid_credentials" }
```

El `message` sale en inglés porque el paquete solo trae mensajes en inglés; [Recetas](recipes.md#traducir-los-mensajes) muestra cómo traducirlos con `messageKey`.

`AppError` se exporta como tipo. Nunca construyes uno tú mismo; las siguientes secciones dicen de dónde salen.

### `message`

Texto que se puede mostrar sin riesgo a la persona que usa la aplicación. Es el mensaje del mapeo que coincidió, o el mensaje de respaldo cuando nada coincidió. Nunca es el mensaje crudo del valor que le pasaste.

### `type`

Cómo coincidió el error, con el tipo `AppErrorType`:

- `"known"`: coincidió un código, un nombre, un mensaje exacto o un prefijo.
- `"heuristic"`: solo coincidió una expresión regular.
- `"unknown"`: no coincidió nada.

No dice nada sobre la gravedad. Una tabla que falta es `"known"` una vez que registras su código, y un usuario sin conexión es `"heuristic"` porque los navegadores solo lo informan en un mensaje.

### `code`

El identificador que clasificó el error, para ramificar según un fallo específico:

```ts
if (error.code === "email_not_confirmed") {
  redirectTo("/confirm-email");
}
```

Contiene el código registrado que coincidió, o el nombre registrado cuando lo que coincidió fue un nombre. Una coincidencia por mensaje, prefijo o patrón no tiene código, así que ahí `code` es `null`, y también en los errores desconocidos.

Cuando el mismo fallo puede llegar por más de un camino, ramifica según `messageKey`. El caso clásico es un chunk de code splitting desactualizado. Webpack lo informa por nombre, así que `code` es `"ChunkLoadError"`. Un navegador informa un `import()` fallido solo en su mensaje, así que `code` es `null`. Ambos se resuelven a `messageKey: "error.browser.moduleLoadFailed"`.

### `messageKey`

Una clave de traducción del mapeo que coincidió, o `null`. Los presets integrados le dan una a cada mapeo, y las claves son estables: una clave conserva su significado entre versiones aunque se reescriba el mensaje en inglés. ErrorKit no trae traducciones; [Recetas](recipes.md#traducir-los-mensajes) muestra cómo conectar las tuyas.

### `source`

Una etiqueta de dónde vino el fallo, con el tipo `AppErrorSource`: `"supabase.auth"`, `"browser.network"` o lo que registres para tus propios mapeos. Es `null` cuando el mapeo no tiene una o cuando nada coincidió. Viene bien para agrupar en logs y dashboards, así el gráfico de las 3 de la mañana dice "supabase.auth" en lugar de "errores, en general".

### `isRetryable`

Si la llamada que falló se puede repetir tal cual, sin pedirle nada a la persona y sin el riesgo de que se ejecute dos veces. Es `false` salvo que el mapeo que coincidió diga lo contrario.

El flag es estricto a propósito. Un fallo que pudo ocurrir después de que el servidor recibió la solicitud no es reintentable, por muy probable que sea que un segundo intento funcione, porque repetirlo podría cobrar una tarjeta dos veces o enviar un correo dos veces. En los presets integrados, solo son reintentables los fallos que ocurren antes de establecer una conexión, como `ECONNREFUSED` en el preset de Node.js.

Hay dos consecuencias fáciles de pasar por alto:

- **El flag describe la llamada que falló, que puede estar varias capas más adentro.** Supongamos que una función `publish()` sube un archivo y después no logra guardar un registro, con `ECONNREFUSED`. El error es reintentable, pero eso vale para el guardado, no para `publish()`: repetir `publish()` vuelve a subir el archivo. Reintenta según el flag solo donde tu código hizo la llamada que falló.
- **El flag habla de un error que levantó tu propio runtime.** Un servidor que reenvía su fallo upstream como `{ "code": "ECONNREFUSED" }` en el cuerpo de una respuesta coincide con el mismo mapeo, pero esa solicitud sí llegó al servidor. Clasifica los cuerpos de respuesta contra un registro que tenga los códigos de ese servicio y ningún preset de red; consulta [Recetas](recipes.md#clasificar-respuestas-http).

### `details`

Datos que tu código adjuntó a propósito, como el campo del formulario que falló, o `null`. Pásalos con la opción `details` de `createAppError`, `err`, `attempt` o `attemptAsync`:

```ts
getErrorRegistry().codes.add("project.name_missing", { message: "Ponle un nombre al proyecto y vuelve a guardar." });

const result = err({ code: "project.name_missing" }, { details: { field: "name" } });

result.error.details; // { field: "name" }
```

La opción tiene que ser un objeto plano, y las reglas de lo que puede contener son:

- **Solo valores JSON:** strings, números finitos, booleanos, `null`, listas y objetos planos, con un anidamiento de ocho niveles como máximo.
- **Las claves `undefined` se descartan,** como las descarta `JSON.stringify`, así que no tienes que revisar antes un campo opcional.
- **Cualquier otra cosa lanza `TypeError`,** como un `Date` o una entrada `undefined` en una lista.
- **Se copia y se congela,** así que cambiar después el objeto que pasaste no cambia nada.

A diferencia del error crudo, `details` forma parte de `toJSON()`, así que llega al cliente. Nunca se lee del valor crudo que se está normalizando, solo de la opción y de un `AppError` que tu código ya creó, así que no entra nada que tu código no haya puesto ahí. Deja fuera cualquier cosa secreta.

Cuando un error pasa por varias capas, cada una puede agregar claves, y un `AppError` envuelto dentro del valor trae consigo sus propios `details`. Una clave que el error ya tiene conserva su valor, así que una capa externa nunca sobrescribe lo que registró una interna.

### `originalError` y `cause`

El valor que le pasaste a `createAppError`, intacto, para logs y depuración. También es el `cause` estándar del error, así que los trackers de errores y el `console.error` de Node.js lo muestran sin trabajo extra. No es enumerable y queda fuera de `JSON.stringify`, así que los detalles crudos no se filtran en una respuesta por accidente.

## Un AppError no se puede cambiar

Ninguno de los campos propios de un `AppError` se puede cambiar ni borrar, e intentarlo lanza una excepción en modo estricto. El `stack` es la única excepción: describe dónde se creó el error, no qué significa, y las bibliotecas que vuelven a lanzar un error que atraparon llaman a `Error.captureStackTrace` sobre él, lo que lanzaría una excepción con un stack bloqueado.

Eso sí, el error sigue abierto a propiedades nuevas, porque algunos frameworks agregan las suyas a cada error que atrapan: Koa define `status`, y `Boom.boomify` de hapi define `isBoom`. Un error congelado por completo haría que esos frameworks lanzaran una excepción dentro de su propio manejador de errores, o sea, un manejador de errores con su propio error, y nadie quiere depurar eso.

`createAppError` y `appErrorFromJSON` son las únicas formas de crear uno. Usa `isAppError(value)` para comprobar si algo lo es. Solo reconoce los errores creados por esta copia del paquete, no objetos que simplemente se parecen, así que un `{ name: "AppError", … }` escrito a mano no pasa.

## Normalizar dos veces

Es habitual que el código pase un error por varias capas, y cada capa puede volver a llamar a `createAppError`. La regla es que la primera capa que clasifica un fallo se queda con su redacción:

```ts
const first = createAppError(caught, { registry: billingRegistry });
const again = createAppError(first, { fallbackMessage: "Falló el pago." });

again === first; // true, cuando billingRegistry coincidió con `caught`
```

Pasar un `AppError` devuelve el mismo objeto, salvo que un `fallbackMessage` lo vuelva a redactar o que `details` agregue claves, y en ese caso recibes uno nuevo con la misma clasificación. `fallbackMessage` y `maxDepth` nunca cambian la clasificación. La redacción todavía se puede completar, una sola vez: un `fallbackMessage` sí redacta un error `"unknown"` que todavía tiene el mensaje por defecto, porque ninguna capa anterior eligió una redacción. Una vez que alguna capa la eligió, su mensaje se queda:

```ts
const inner = await attemptAsync(() => db.loadProject(id)); // aquí no hay mensaje de respaldo
const outer = await attemptAsync(() => unwrap(inner), { fallbackMessage: "No se pudo cargar el proyecto." });

outer.ok || outer.error.message; // "No se pudo cargar el proyecto."
```

Pasar un `registry` es la única forma de cambiar la clasificación. En ese caso, el valor crudo de adentro se vuelve a clasificar, y el resultado solo puede mejorar:

- Una coincidencia por patrón reemplaza a un error `"unknown"`.
- Una coincidencia conocida reemplaza a cualquier cosa de la que difiera.
- Todo lo demás conserva la clasificación que tiene.

Un `AppError` envuelto dentro de otro error, como en `new Error("checkout failed", { cause: appError })`, es un candidato más entre los valores que encuentra `createAppError`. Su clasificación se usa tal cual, salvo que pases un `registry`, pero una coincidencia conocida en un envoltorio externo todavía puede ganar, porque gana la coincidencia conocida más externa.

## Enviar un error a otro entorno

Un `AppError` se serializa en exactamente ocho campos, en cualquier motor de JavaScript:

```ts
JSON.stringify(error);
// {"name":"AppError","message":"…","type":"known","code":"23505","messageKey":"…","source":"…","isRetryable":false,"details":null}
```

`originalError` y `cause` quedan fuera a propósito: pueden contener secretos, datos personales u objetos cíclicos.

Del lado que recibe, `appErrorFromJSON` reconstruye un `AppError` a partir de esa forma:

```ts
// Servidor
return Response.json({ error: error.toJSON() }, { status: 409 });

// Cliente
const body = await response.json();
const error = appErrorFromJSON(body.error);
```

Se aplican tres reglas:

- **No consulta ningún registro.** El error reconstruido trae el mensaje que eligió quien lo envió, así que úsalo solo con datos de una fuente en la que confíes para redactar tus errores, como tu propio servidor.
- **`isRetryable` siempre vuelve como `false` para datos serializados.** El flag del emisor describía su propia llamada, no la solicitud que trajo el error de vuelta. Un `AppError` que le pases se devuelve tal cual.
- **Cualquier cosa que no sea exactamente la forma serializada** se normaliza como entrada cruda, como haría `createAppError`.

Para pasarle un error a un worker, mediante `postMessage`, `structuredClone` o IndexedDB, envía también `error.toJSON()`. Un structured clone copia un `AppError` como un `Error` común sin sus campos, y en algunos motores arrastra además el `cause` crudo.

## Opciones

`createAppError(error, options)` acepta un objeto `AppErrorOptions`:

| Opción            | Valor por defecto                 | Efecto                                                              |
| ----------------- | --------------------------------- | ------------------------------------------------------------------- |
| `fallbackMessage` | `"An unexpected error occurred."` | El mensaje cuando nada coincide. Tiene que ser un string no vacío.  |
| `registry`        | El registro global                | Dónde buscar coincidencias. Consulta [Registros](registries.md).    |
| `maxDepth`        | `3`                               | Qué tan adentro buscar en los errores envueltos, de `0` a `3`.      |
| `details`         | Ninguno                           | Datos para adjuntar como `details`. Consulta [`details`](#details). |

Con la profundidad por defecto, una cadena de `cause` por sí sola se sigue más lejos, hasta una profundidad de `8`, porque un fallo que se envuelve una vez por cada capa de una aplicación suele quedar a más de tres niveles. Un `maxDepth` menor detiene todos los campos, `cause` incluido, en esa profundidad.

El mensaje por defecto se exporta como `DEFAULT_APP_ERROR_MESSAGE`, para las pruebas y para comparar.

Una opción inválida es un error de programación, así que lanza `TypeError` antes de empezar cualquier trabajo. La entrada común nunca lanza excepciones: `createAppError` acepta cualquier valor, incluidos `null`, números y objetos cuyas propiedades lanzan una excepción al leerlas. Normalizar un error no debería ser una nueva forma de fallar.

## Siguiente

Ya sabes lo que trae un `AppError`. [Registros](registries.md) explica de dónde salen su mensaje, su clave y su flag: cómo se llena un registro, cómo lo recorre `createAppError` y qué coincidencia gana cuando varias podrían hacerlo.
