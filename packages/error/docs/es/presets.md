---
title: Presets
description: Cada fallo que reconocen los presets del navegador, de Node.js, de HTTP y de Supabase, con su clave de traducción, y lo que deja fuera cada preset.
order: 4
source: 518329420d7f1c7075340d363850a388c230cdcc
---

# Presets

Un preset es un registro de solo lectura, listo para usar, para fallos que vienen de una plataforma o de un servicio y no de tu propio código. Alguien ya se leyó las listas de errores del navegador, de Node.js, de HTTP y de Supabase para que tú no tengas que hacerlo; esta página es lo que encontró.

Hay cuatro presets. Cada uno es un import aparte, así que una aplicación solo carga los que usa, e importar uno no cambia nada hasta que lo fusionas:

```ts
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

getErrorRegistry().merge(browserErrorRegistry);
```

Cada preset también exporta sus mapeos crudos, congelados, para cuando quieras armar algo propio a partir de una parte de un preset. Los mapeos de códigos y de nombres son objetos planos indexados por identificador; los mapeos de patrones son listas de pares `[pattern, feedback]`:

| Ruta de importación                   | Registro                | Mapeos crudos                                           |
| ------------------------------------- | ----------------------- | ------------------------------------------------------- |
| `@codenhub/error/registries/browser`  | `browserErrorRegistry`  | `browserErrorNames`, `browserErrorPatterns`             |
| `@codenhub/error/registries/node`     | `nodeErrorRegistry`     | `nodeErrorCodes`, `nodeErrorNames`, `nodeErrorPatterns` |
| `@codenhub/error/registries/http`     | `httpErrorRegistry`     | `httpErrorCodes`                                        |
| `@codenhub/error/registries/supabase` | `supabaseErrorRegistry` | `supabaseErrorCodes`, `supabaseErrorNames`              |
| `@codenhub/error/registries`          | Los cuatro              | Los ocho                                                |

## Cómo están escritos los mensajes

Cada mensaje de los presets dice qué pasó y qué puede hacer a continuación quien lo lee, con palabras sencillas, y afirma solo lo que demuestra el identificador que coincidió. Ninguno da por hecho que tu aplicación tiene una página para restablecer la contraseña, un chat de soporte ni ninguna otra función. Donde quien lee no puede hacer nada más, el mensaje dice que contacte a soporte sin decir cómo, porque el preset no tiene ni idea de si tu soporte es un widget de chat o una sola persona con mucha paciencia.

Los fallos que solo un desarrollador puede arreglar, como una tabla o una columna que falta, comparten un mismo mensaje que dice que el problema no es culpa de quien lo lee y no nombra nada interno:

> Something went wrong on our side, and it isn't caused by anything you did. Contact support if it keeps happening.

Los mensajes de los presets están en inglés, porque el paquete solo trae mensajes en inglés. Los detalles quedan en `originalError` para tus logs.

Cuando tu aplicación puede decir algo más útil, registra tu propio mapeo para el mismo identificador después de fusionar el preset. Gana el último, como hace [Primeros pasos](getting-started.md#2-crea-un-módulo-que-configure-los-errores) con `23505`.

Cada mapeo tiene un `messageKey`. Las claves son estables: cada clave conserva su significado entre versiones, aunque cambie su redacción en inglés, así que un catálogo de traducciones puede confiar en ellas. Varios identificadores comparten una clave cuando significan lo mismo para quien lee: Supabase tiene cuatro códigos distintos para "tu sesión terminó", y a quien lee le basta con escucharlo una vez. ErrorKit no trae traducciones; consulta [Recetas](recipes.md#traducir-los-mensajes).

Las tablas de abajo enumeran todos los mapeos, así que también puedes armar un catálogo directamente desde esta página.

## Navegador

Para el código que se ejecuta en un navegador. Reconoce los nombres de `DOMException` que lanzan las Web APIs, un `fetch` fallido y un chunk de code splitting que no se pudo cargar.

| Nombre               | `messageKey`                         | Reintentable |
| -------------------- | ------------------------------------ | ------------ |
| `AbortError`         | `error.browser.abort`                | No           |
| `QuotaExceededError` | `error.browser.storageQuotaExceeded` | No           |
| `NotAllowedError`    | `error.browser.permissionDenied`     | No           |
| `NotFoundError`      | `error.browser.notFound`             | No           |
| `SecurityError`      | `error.browser.security`             | No           |
| `TimeoutError`       | `error.browser.timeout`              | No           |
| `NotSupportedError`  | `error.browser.notSupported`         | No           |
| `InvalidStateError`  | `error.browser.invalidState`         | No           |
| `NetworkError`       | `error.browser.network`              | No           |
| `NotReadableError`   | `error.browser.notReadable`          | No           |
| `EncodingError`      | `error.browser.encoding`             | No           |
| `ChunkLoadError`     | `error.browser.moduleLoadFailed`     | No           |

Sus patrones de `fetch` solo coinciden con mensajes completos, y su patrón de `import()` coincide con el comienzo del mensaje, así que un texto que simplemente contiene las mismas palabras no se clasifica:

| Mensaje                                                                                                                                                                                    | `messageKey`                     | Reintentable |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------ |
| Un `fetch` fallido: `Failed to fetch` (Chromium), `NetworkError when attempting to fetch resource.` (Firefox), `Load failed` (Safari)                                                      | `error.browser.requestFailed`    | No           |
| Un `import()` fallido: `Failed to fetch dynamically imported module: …` (Chromium), `error loading dynamically imported module: …` (Firefox), `Importing a module script failed.` (Safari) | `error.browser.moduleLoadFailed` | No           |

Notas:

- **Nada es reintentable.** Un `fetch` fallido se ve igual si la conexión nunca se abrió que si la respuesta se perdió después de que el servidor procesó la solicitud, como pasa con un bloqueo de CORS o una conexión caída. Un `TimeoutError` de `AbortSignal.timeout()` puede dispararse después de que el servidor recibió la solicitud. Los mensajes le piden a quien lee que revise si la acción se completó antes de volver a intentarlo.
- **Un chunk fallido suele ser una pestaña que quedó abierta durante un deploy**: la página pide un archivo que el nuevo deploy eliminó. El mensaje le dice a quien lee que recargue la página. Siempre hay alguien con esa pestaña abierta desde el jueves pasado. `ChunkLoadError` es lo que lanza webpack; Vite y otros bundlers que usan `import()` nativo producen el mensaje del navegador.
- **`AbortError` suele ser deliberado.** También se dispara cuando tu propio código cancela una solicitud, como la limpieza de un efecto o una búsqueda nueva que reemplaza a una anterior. Consulta [Salvedades](caveats.md#las-solicitudes-canceladas-también-son-errores).

## Node.js

Para el código de servidor. Reconoce los fallos de red de sockets, de búsquedas DNS y del `fetch` integrado, que pone el fallo real en el `cause` de su `TypeError: fetch failed`, y los errores que lanza un `AbortSignal`.

| Código                    | `messageKey`                             | Reintentable |
| ------------------------- | ---------------------------------------- | ------------ |
| `ECONNREFUSED`            | `error.node.network.connectionRefused`   | Sí           |
| `ENOTFOUND`               | `error.node.network.addressNotFound`     | Sí           |
| `UND_ERR_CONNECT_TIMEOUT` | `error.node.network.connectionTimeout`   | Sí           |
| `EAI_AGAIN`               | `error.node.network.addressLookupFailed` | Sí           |
| `EHOSTUNREACH`            | `error.node.network.unreachable`         | Sí           |
| `ENETUNREACH`             | `error.node.network.unreachable`         | Sí           |
| `ECONNRESET`              | `error.node.network.connectionReset`     | No           |
| `UND_ERR_SOCKET`          | `error.node.network.connectionClosed`    | No           |
| `EPIPE`                   | `error.node.network.connectionClosed`    | No           |
| `ETIMEDOUT`               | `error.node.network.responseTimeout`     | No           |
| `UND_ERR_HEADERS_TIMEOUT` | `error.node.network.responseTimeout`     | No           |
| `UND_ERR_BODY_TIMEOUT`    | `error.node.network.responseTimeout`     | No           |

| Nombre         | `messageKey`                         | Reintentable |
| -------------- | ------------------------------------ | ------------ |
| `TimeoutError` | `error.node.network.responseTimeout` | No           |
| `AbortError`   | `error.node.abort`                   | No           |

| Mensaje                                | `messageKey`                       | Reintentable |
| -------------------------------------- | ---------------------------------- | ------------ |
| `fetch failed`, sin una causa conocida | `error.node.network.requestFailed` | No           |

Notas:

- **Los mensajes hablan de "un servicio del que esto depende".** En un servidor, la llamada que falla es tu servidor llamando a otra cosa, así que la persona que lee el mensaje no es aquella cuya conexión falló, y los mensajes no le piden que la revise.
- **Solo son reintentables los fallos anteriores a establecer una conexión**: conexión rechazada, una dirección que no se resolvió, un host inalcanzable, un timeout de conexión. Un reset, un socket cerrado o un timeout de respuesta pueden venir después de una solicitud que el otro lado ya procesó. `ETIMEDOUT` tampoco es reintentable, porque Node.js lo lanza tanto para un intento de conexión como para un socket que ya transportó la solicitud.
- **No se cubren:** los códigos del sistema de archivos, como `ENOENT`, porque el mensaje correcto depende de lo que estaba haciendo la aplicación, ni los códigos de certificados TLS, que solo puede arreglar quien opera el servicio.
- **`TimeoutError` y `AbortError` también son nombres del preset del navegador.** Son los nombres de `DOMException` que lanza un `AbortSignal`, como en `fetch(url, { signal: AbortSignal.timeout(5000) })`. El código de servidor debería usar este preset para ellos: el mensaje de `TimeoutError` del preset del navegador le dice a quien lee que revise su conexión a internet. Cuando fusionas los dos, gana el que se fusionó último.
- Los códigos se observaron en Node.js 24. Otros runtimes de servidor, como Deno o Bun, pueden informar los fallos de red de otra manera.

## HTTP

Para el estado de una respuesta fallida. `fetch` se resuelve con un `404` o un `500`, porque para `fetch` la solicitud salió perfecta, así que un estado no es algo que `createAppError` encuentre por su cuenta. Pasa el estado como `code`, y pasa este preset como `registry` de esa llamada en lugar de fusionarlo en el global. Los estados son números cortos que solo significan algo para una respuesta, y podrían chocar con los códigos de otro servicio.

```ts
import { err } from "@codenhub/error";
import { httpErrorRegistry } from "@codenhub/error/registries/http";

if (!response.ok) {
  return err({ code: response.status }, { registry: httpErrorRegistry });
}
```

| Código | `messageKey`                 | Reintentable |
| ------ | ---------------------------- | ------------ |
| `400`  | `error.http.badRequest`      | No           |
| `401`  | `error.http.unauthorized`    | No           |
| `403`  | `error.http.forbidden`       | No           |
| `404`  | `error.http.notFound`        | No           |
| `409`  | `error.http.conflict`        | No           |
| `413`  | `error.http.payloadTooLarge` | No           |
| `422`  | `error.http.unprocessable`   | No           |
| `429`  | `error.http.rateLimited`     | No           |
| `500`  | `error.http.serverError`     | No           |
| `502`  | `error.http.badGateway`      | No           |
| `503`  | `error.http.unavailable`     | No           |
| `504`  | `error.http.gatewayTimeout`  | No           |

Notas:

- **Nada es reintentable.** Un estado es la respuesta del servidor, así que la solicitud llegó; incluso un `503` o un `504` pueden venir después de una solicitud que el servidor, o un servicio detrás de él, ya procesó. Un `429` necesita una espera que el flag no puede expresar.
- **Los mensajes son genéricos.** Un `401` en un formulario de inicio de sesión significa una contraseña incorrecta, y un `404` en una búsqueda significa que no hubo resultados. Donde un estado signifique algo específico, registra tu propio mapeo para esa llamada en un registro propio.
- **`500` lleva el mensaje compartido de fallo del desarrollador**, y debería llegar a tu tracker de errores; consulta [Recetas](recipes.md#reportar-a-un-tracker-de-errores).
- **No se cubren:** los estados `1xx`, `2xx` y `3xx`, que no son fallos, ni los estados `4xx` y `5xx` menos comunes. Se resuelven a `"unknown"`.
- **Cuando tu servidor envía `error.toJSON()`**, reconstruye ese error con `appErrorFromJSON`; dice más que el estado.

## Supabase

Para el código que llama a Supabase. Reconoce los códigos de error de Auth con los que se puede topar una persona que usa tu aplicación y frente a los que puede hacer algo, algunos códigos de error de PostgreSQL y los nombres de error que lanza el cliente de Supabase.

Códigos de Supabase Auth:

| Código                              | `messageKey`                                         | Reintentable |
| ----------------------------------- | ---------------------------------------------------- | ------------ |
| `invalid_credentials`               | `error.supabase.auth.invalidCredentials`             | No           |
| `email_not_confirmed`               | `error.supabase.auth.emailNotConfirmed`              | No           |
| `phone_not_confirmed`               | `error.supabase.auth.phoneNotConfirmed`              | No           |
| `user_already_exists`               | `error.supabase.auth.userAlreadyExists`              | No           |
| `email_exists`                      | `error.supabase.auth.emailExists`                    | No           |
| `phone_exists`                      | `error.supabase.auth.phoneExists`                    | No           |
| `signup_disabled`                   | `error.supabase.auth.signupDisabled`                 | No           |
| `provider_disabled`                 | `error.supabase.auth.methodUnavailable`              | No           |
| `email_provider_disabled`           | `error.supabase.auth.methodUnavailable`              | No           |
| `phone_provider_disabled`           | `error.supabase.auth.methodUnavailable`              | No           |
| `otp_disabled`                      | `error.supabase.auth.methodUnavailable`              | No           |
| `provider_email_needs_verification` | `error.supabase.auth.providerEmailNeedsVerification` | No           |
| `otp_expired`                       | `error.supabase.auth.otpExpired`                     | No           |
| `invite_not_found`                  | `error.supabase.auth.inviteNotFound`                 | No           |
| `weak_password`                     | `error.supabase.auth.weakPassword`                   | No           |
| `same_password`                     | `error.supabase.auth.samePassword`                   | No           |
| `email_address_invalid`             | `error.supabase.auth.emailAddressInvalid`            | No           |
| `validation_failed`                 | `error.supabase.auth.validationFailed`               | No           |
| `captcha_failed`                    | `error.supabase.auth.captchaFailed`                  | No           |
| `user_banned`                       | `error.supabase.auth.userBanned`                     | No           |
| `user_not_found`                    | `error.supabase.auth.userNotFound`                   | No           |
| `session_expired`                   | `error.supabase.auth.sessionEnded`                   | No           |
| `session_not_found`                 | `error.supabase.auth.sessionEnded`                   | No           |
| `refresh_token_not_found`           | `error.supabase.auth.sessionEnded`                   | No           |
| `refresh_token_already_used`        | `error.supabase.auth.sessionEnded`                   | No           |
| `reauthentication_needed`           | `error.supabase.auth.reauthenticationNeeded`         | No           |
| `reauthentication_not_valid`        | `error.supabase.auth.reauthenticationNotValid`       | No           |
| `mfa_verification_failed`           | `error.supabase.auth.mfaVerificationFailed`          | No           |
| `mfa_challenge_expired`             | `error.supabase.auth.mfaChallengeExpired`            | No           |
| `insufficient_aal`                  | `error.supabase.auth.insufficientAal`                | No           |
| `flow_state_expired`                | `error.supabase.auth.signInInterrupted`              | No           |
| `flow_state_not_found`              | `error.supabase.auth.signInInterrupted`              | No           |
| `bad_oauth_callback`                | `error.supabase.auth.signInInterrupted`              | No           |
| `pkce_code_verifier_not_found`      | `error.supabase.auth.signInInterrupted`              | No           |
| `bad_oauth_state`                   | `error.supabase.auth.badOAuthState`                  | No           |
| `sms_send_failed`                   | `error.supabase.auth.smsSendFailed`                  | No           |
| `over_sms_send_rate_limit`          | `error.supabase.auth.overSmsSendRateLimit`           | No           |
| `over_email_send_rate_limit`        | `error.supabase.auth.overEmailSendRateLimit`         | No           |
| `over_request_rate_limit`           | `error.supabase.auth.overRequestRateLimit`           | No           |
| `request_timeout`                   | `error.supabase.auth.requestTimeout`                 | No           |
| `unexpected_failure`                | `error.supabase.auth.unexpectedFailure`              | No           |

Códigos de PostgreSQL, tal como los devuelve la API de base de datos de Supabase:

| Código  | Significado                                | `messageKey`                                  | Reintentable |
| ------- | ------------------------------------------ | --------------------------------------------- | ------------ |
| `23502` | Falta un valor obligatorio                 | `error.supabase.database.notNullViolation`    | No           |
| `23503` | Los datos vinculados faltan o están en uso | `error.supabase.database.foreignKeyViolation` | No           |
| `23505` | Un valor único ya está ocupado             | `error.supabase.database.uniqueViolation`     | No           |
| `42P01` | Una tabla no existe                        | `error.supabase.database.undefinedTable`      | No           |
| `42703` | Una columna no existe                      | `error.supabase.database.undefinedColumn`     | No           |
| `57014` | Una consulta tardó demasiado               | `error.supabase.database.timeout`             | No           |

Nombres de error que lanza el cliente de Supabase:

| Nombre                    | `messageKey`                       | Reintentable |
| ------------------------- | ---------------------------------- | ------------ |
| `AuthSessionMissingError` | `error.supabase.auth.sessionEnded` | No           |
| `FunctionsHttpError`      | `error.supabase.functions.http`    | No           |
| `FunctionsRelayError`     | `error.supabase.functions.relay`   | No           |
| `FunctionsFetchError`     | `error.supabase.functions.fetch`   | No           |

Notas:

- **Nada es reintentable.** Los errores de límite de solicitudes necesitan una espera que el flag no puede expresar, así que reintentar de inmediato solo vuelve a sumar contra el límite; sus mensajes le dicen a quien lee cuánto esperar. Los errores de Edge Functions llegan cuando la función pudo haberse ejecutado ya.
- **`AuthSessionMissingError` no tiene código.** Es lo que devuelven la mayoría de las llamadas de Auth cuando nadie inició sesión, y se clasifica como una sesión terminada. `pkce_code_verifier_not_found` lo lanza el propio cliente, cuando un enlace de inicio de sesión se abre en un navegador distinto del que lo pidió.
- **No se cubren:** los códigos de Auth que solo puede resolver un desarrollador, como `bad_jwt` y las familias `hook_*` y `saml_*`. Se resuelven a `"unknown"`, que es justo lo que quieres reportar.
- **`23505` es genérico a propósito.** "Un valor único ya está ocupado" no puede decir qué valor. Registra tu propio mapeo de `23505` donde lo sepas, como hace el gestor de proyectos en [Primeros pasos](getting-started.md#2-crea-un-módulo-que-configure-los-errores), o clasifica los errores de una tabla específica contra su propio registro.

## Siguiente

Los presets y tus propios mapeos cubren qué significa un fallo. [Resultados](results.md) cubre otra pregunta: cómo viaja un fallo por tu código, como un valor en el tipo de retorno en lugar de una excepción que alguien tiene que acordarse de atrapar.
