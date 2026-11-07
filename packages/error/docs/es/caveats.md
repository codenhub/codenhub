---
title: Salvedades y limitaciones
description: Lo que ErrorKit no hace, las sorpresas que puede darte y cómo resolver cada una.
order: 8
source: b8a8740a6bd791d7442ab975a05a28a48120544b
---

# Salvedades y limitaciones

Todo lo que hay en esta página es deliberado, y cada punto ya sorprendió a alguien al menos una vez. Cada uno dice qué pasa, por qué y qué hacer en su lugar. Échale un vistazo a los títulos ahora; cuando más adelante algo parezca estar mal, la respuesta probablemente esté aquí.

## El texto que no coincide nunca se convierte en el mensaje

**Qué pasa:** `createAppError(new Error("Email is required"))` tiene el mensaje `"An unexpected error occurred."`, no `"Email is required"`. Lo mismo pasa con `err("Email is required")`.

**Por qué:** los mensajes de error crudos están escritos para desarrolladores y a menudo contienen nombres de tablas, rutas de archivos, fragmentos de consultas o datos de otras personas. ErrorKit solo muestra texto que alguien registró a propósito.

**En su lugar:** levanta tus propios fallos con un código registrado, `err({ code: "signup.email_missing" })`, o pasa un `fallbackMessage` que encaje con el lugar donde estás.

## Un código que nadie registró se pierde

**Qué pasa:** `createAppError({ code: "project.name_missing" })` es un error `"unknown"` con `code: null` hasta que ese código se registra. Una errata en el código, o un mapeo agregado en un archivo que nunca se ejecutó, falla en silencio.

**Por qué:** `code` nombra el mapeo que clasificó el error, así que una rama que dependa de él solo ve códigos que alguien describió. Conservar el código crudo, además, enviaría al cliente en `toJSON()` cualquier código que haya producido una base de datos o un servicio.

**En su lugar:** levanta tus propios errores a partir de un único objeto de códigos, para que una errata sea un error de tipos, o comprueba los códigos en una prueba; consulta [Recetas](recipes.md#crear-tus-propios-errores).

## El registro global es estado compartido

**Qué pasa:** `getErrorRegistry()` devuelve un registro por cada copia del paquete, compartido por todo lo que importa esa copia. En un servidor, todas las solicitudes ven los mismos mapeos.

**Por qué:** te permite configurar los errores una sola vez, al arrancar, y normalizar en cualquier parte sin tener que ir pasando un registro de un lado a otro.

**En su lugar:** configura el registro global una vez, antes de atender cualquier solicitud, y nunca lo cambies por solicitud; dos solicitudes concurrentes verían los cambios de la otra. Para mapeos que solo aplican en un lugar, pasa `{ registry }` a esa llamada. En las pruebas, reinícialo con `setErrorRegistry` (consulta [Recetas](recipes.md#configurar-los-errores-en-las-pruebas)).

## Dos copias del paquete no se conocen entre sí

**Qué pasa:** si tu aplicación termina con dos copias de `@codenhub/error`, por ejemplo dos versiones instaladas lado a lado, cada copia tiene su propio registro global, e `isAppError` de una copia devuelve `false` para un error creado por la otra.

**Por qué:** `isAppError` solo reconoce los errores que creó esta copia, para que los objetos con forma de `AppError`, incluidos los construidos a partir de JSON no confiable, nunca se confundan con uno.

**En su lugar:** mantén una sola versión instalada. `pnpm why @codenhub/error` muestra de dónde viene una segunda copia. Un `AppError` de otra copia igual se normaliza, como un objeto común.

## Gana el último mapeo agregado

**Qué pasa:** registrar un identificador que ya existe lo reemplaza, y `merge` sobrescribe las entradas que coinciden. Fusionar el preset de Supabase después de tu propio mapeo de `23505` reemplaza el tuyo con el del preset.

**En su lugar:** fusiona primero los presets y agrega tus propios mapeos al final. Cuando dos fuentes usan los mismos códigos para cosas distintas, dale a cada una su propio registro; consulta [Registros](registries.md#el-registro-global-o-uno-propio).

## Los nombres coinciden con cualquier error que tenga ese nombre

**Qué pasa:** con el preset del navegador o el de Node.js fusionado, cualquier error cuyo `name` sea `TimeoutError` se clasifica como el de ese preset, incluidos los errores de una biblioteca que casualmente usa el mismo nombre de clase. El preset del navegador hace lo mismo con `NotFoundError` y sus demás nombres.

**En su lugar:** clasifica los errores de esa biblioteca contra un registro sin el preset, o registra un código más específico para ellos.

## Las solicitudes canceladas también son errores

**Qué pasa:** cancelar un `fetch` con un `AbortController` lo rechaza con un `AbortError`, que el preset del navegador convierte en "The request was cancelled before it finished." Eso incluye las cancelaciones que tu propio código hizo a propósito.

**En su lugar:** revisa si la cancelaste tú, y en ese caso no muestres nada; consulta [Recetas](recipes.md#ignorar-solicitudes-canceladas).

## Para `fetch`, los códigos de estado HTTP no son errores

**Qué pasa:** un `fetch` que recibe un `404` o un `500` se resuelve con normalidad. Pasarle la `Response` a `createAppError` produce un error `"unknown"`, porque una respuesta no tiene código, nombre ni mensaje con el que coincidir.

**En su lugar:** revisa `response.ok` y clasifica el estado tú mismo; consulta [Recetas](recipes.md#clasificar-respuestas-http).

## La comparación distingue mayúsculas y minúsculas, salvo en los patrones

**Qué pasa:** un mensaje registrado como `"Upload failed"` no coincide con `"upload failed"`. Los códigos, los nombres, los mensajes y los prefijos se comparan distinguiendo mayúsculas y minúsculas.

**En su lugar:** registra el texto exacto que produce el código que falla, o usa un patrón con el flag `i`. La puntuación y los espacios del final nunca importan en los mensajes y los prefijos.

## Los errores envueltos se buscan hasta una profundidad limitada

**Qué pasa:** `createAppError` busca hasta tres niveles de profundidad en los campos envoltorio, y ocho niveles a lo largo de una cadena de `cause`. Solo lee las primeras diez entradas de una lista `errors`. Un fallo enterrado más abajo se resuelve como si no estuviera.

**Por qué:** cada nivel puede multiplicar la cantidad de valores que revisar, y la entrada puede venir de cualquier parte. Los límites mantienen el trabajo acotado con cualquier entrada.

**En su lugar:** normaliza más cerca de donde ocurre el fallo, o envuelve los fallos con `cause`, que es el que se sigue más lejos.

## Reintentable es más estricto que "a lo mejor la próxima vez funciona"

**Qué pasa:** un timeout de respuesta, una conexión reiniciada o un `fetch` fallido en el navegador nunca se marcan como reintentables, aunque volver a intentarlo a menudo funcione.

**Por qué:** cada uno de esos puede ocurrir después de que el servidor ya procesó la solicitud, y repetir una solicitud que ya se ejecutó puede cobrar una tarjeta dos veces. `isRetryable` promete seguridad, no probabilidad.

**En su lugar:** reintenta esos casos por tu cuenta solo donde repetir la solicitud sea inofensivo, como en un `GET`. Consulta [El AppError](app-error.md#isretryable).

## Los presets no lo cubren todo

- El preset del navegador reconoce un `fetch` fallido y un `import()` fallido por los mensajes que producen hoy Chromium, Firefox y Safari. Un navegador que los reescriba vuelve a `"unknown"` hasta que el preset se ponga al día.
- El preset de Node.js cubre los fallos de red y los errores que lanza un `AbortSignal`, y se observó en Node.js 24. Otros runtimes de servidor pueden informar los mismos fallos de otra manera.
- El preset de Supabase cubre los códigos de Auth frente a los que una persona puede hacer algo, seis códigos de PostgreSQL y los nombres de error propios del cliente. Asigna a un mismo mensaje compartido los pocos fallos de desarrollador con los que suele toparse una aplicación en marcha, como una tabla o una columna que falta, así que son `"known"`: repórtalos por `code`, no por tipo (consulta [Recetas](recipes.md#reportar-a-un-tracker-de-errores)). Otros códigos que solo un desarrollador puede arreglar, como `bad_jwt`, quedan sin mapear a propósito y llegan a tu tracker de errores como `"unknown"`.

Registra tu propio mapeo para todo lo que un preset no cubra. [Presets](presets.md) enumera exactamente lo que cubre cada uno.

## El paquete no trae traducciones

Cada mapeo de los presets tiene un `messageKey` estable, pero ErrorKit solo incluye los mensajes en inglés. Traduce las claves en tu propio catálogo; consulta [Recetas](recipes.md#traducir-los-mensajes).

## Structured clone descarta los campos

**Qué pasa:** enviar un `AppError` mediante `postMessage`, `structuredClone` o IndexedDB le entrega al otro lado un `Error` común sin `type`, `code` ni los demás campos, y en algunos motores con el `cause` crudo adjunto.

**En su lugar:** envía `error.toJSON()` y reconstrúyelo con `appErrorFromJSON` del otro lado; consulta [El AppError](app-error.md#enviar-un-error-a-otro-entorno).

## Los patrones que escribes pueden ser lentos

Un patrón se aplica a cada mensaje que ve `createAppError`, y un mensaje puede haberlo armado alguien que intenta ralentizar tu servidor. Un patrón con repetición anidada, como `/(a+)+$/`, puede tardar segundos con la entrada equivocada. Mantén tus patrones anclados y simples; consulta [Registros](registries.md#escribir-patrones). Los patrones integrados están todos anclados, sin repetición anidada.

## Siguiente

Eso es todo el paquete. Desde aquí:

- La [referencia de la API](../reference/index.md) tiene cada export con su firma exacta, para cuando necesites consultar algo puntual.
- [Recetas](recipes.md) tiene las soluciones completas, para cuando necesites construir algo.
- La [visión general](index.md) tiene el orden de lectura, para cuando le pases esto a un colega.
