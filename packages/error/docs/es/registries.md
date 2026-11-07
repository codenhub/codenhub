---
title: Registros
description: Los cinco buckets, cómo se comparan los identificadores, qué coincidencia gana y cuándo usar un registro propio en lugar del global.
order: 3
source: d6f1ffe9188fb9264823b1f0b93e13ff24dbecdd
---

# Registros

Un registro es donde describes los fallos que conoces. Esta página explica cómo llenarlo, cómo lo recorre `createAppError` y cómo elegir entre el registro global y registros propios. Si alguna vez un error sale con un mensaje que no esperabas, la respuesta está en algún lugar de esta página.

## Feedback: lo que produce una coincidencia

Cada entrada asocia un identificador con un feedback, un objeto `ErrorFeedback`. Aquí el gestor de proyectos describe el límite de solicitudes de su API:

```ts
registry.codes.add("E_RATE_LIMIT", {
  message: "Recibimos demasiadas solicitudes. Espera unos minutos y vuelve a intentarlo.",
  messageKey: "error.myApp.api.rateLimit",
  source: "my-app.api",
  isRetryable: false,
});
```

| Campo         | Obligatorio | Significado                                                                                                                             |
| ------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `message`     | Sí          | El texto que ve la gente. Escribe qué pasó y qué hacer a continuación.                                                                  |
| `messageKey`  | No          | Una clave de traducción. Cualquier string no vacío, así que puedes reutilizar las claves que ya tiene tu catálogo.                      |
| `source`      | No          | Una etiqueta de dónde vino el fallo. Cualquier string no vacío.                                                                         |
| `isRetryable` | No          | Si la llamada que falla se puede repetir tal cual sin riesgo. Por defecto es `false`; consulta [El AppError](app-error.md#isretryable). |

Las entradas se validan y se copian cuando las agregas. Un `message` vacío, o un campo del tipo equivocado, lanza `TypeError` ahí mismo, al arrancar, en lugar de más tarde, en medio del manejo de algún otro error.

## Los cinco buckets

Un registro tiene cinco buckets, uno por cada forma en que se puede reconocer un fallo:

| Bucket     | Compara con                                 | Identificador de ejemplo       | Tipo de resultado |
| ---------- | ------------------------------------------- | ------------------------------ | ----------------- |
| `codes`    | La propiedad `code` del error               | `"23505"`, `"ECONNREFUSED"`    | `"known"`         |
| `names`    | La propiedad `name` del error               | `"AbortError"`                 | `"known"`         |
| `messages` | El `message` completo                       | `"Upload failed"`              | `"known"`         |
| `prefixes` | El comienzo del `message`                   | `"Quota exceeded for bucket"`  | `"known"`         |
| `patterns` | Una expresión regular aplicada al `message` | `/^request to .+ timed out$/i` | `"heuristic"`     |

Prefiere los buckets de arriba. Un código o un nombre lo elige quien escribió el código que falla, y rara vez cambia. Un mensaje es prosa, y la próxima versión de una biblioteca lo puede reescribir un martes cualquiera sin avisarle a nadie.

Todos los buckets tienen los mismos métodos para escribir y leer:

- `add(identifier, feedback)` agrega una entrada, o reemplaza la entrada con el mismo identificador.
- `addList(entries)` agrega una lista de pares `[identifier, feedback]`. Valida la lista completa antes de agregar nada, así que un error en la quinta entrada deja el bucket sin cambios.
- `delete(identifier)` elimina una entrada y devuelve `true` si había una para eliminar.
- `clear()` vacía el bucket.
- `values()` devuelve todas las entradas. Los buckets `codes`, `names` y `messages` devuelven pares `[identifier, feedback]` en el orden en que se agregaron. El bucket `prefixes` devuelve objetos con un campo `prefix` junto al feedback, primero el prefijo más largo. El bucket `patterns` devuelve objetos con un campo `pattern`, en el orden en que se agregaron.

Los buckets `codes`, `names` y `messages` también tienen `get(identifier)`, que devuelve el feedback de un identificador, o `undefined`.

### Cómo se comparan los identificadores

Cada bucket limpia un poco los identificadores antes de compararlos, de la misma forma cuando agregas uno y cuando se compara un error:

- **Los códigos y los nombres** se recortan quitando los espacios de alrededor y, por lo demás, se comparan exactamente, incluidas mayúsculas y puntuación. Un `code` numérico, como un estado HTTP, se compara como texto, así que `{ code: 404 }` coincide con un `"404"` registrado.
- **Los mensajes y los prefijos** se recortan, y se les quita todo `.`, `!`, `?` y espacio del final, así que `"Upload failed"`, `"Upload failed."` y `"Upload failed!! "` son el mismo identificador. La comparación distingue mayúsculas y minúsculas: `"upload failed"` no coincide.
- **Los prefijos** coinciden cuando el mensaje empieza con el prefijo. Cuando coinciden varios, gana el más largo.
- **Los patrones** se aplican al mensaje crudo, en el orden en que se agregaron, y gana el primero que coincide. Los flags `g` e `y` se quitan cuando se agrega un patrón, porque hacen que `test()` recuerde su última posición y dé respuestas distintas para el mismo texto. Usa el flag `i` para comparar sin distinguir mayúsculas y minúsculas.

Un `DOMException` se compara solo por su nombre. También trae un `code` numérico heredado (`20` para `AbortError`, por ejemplo) de la época en que las Web APIs numeraban sus errores, y ese número podría coincidir con códigos que no tienen nada que ver.

Agregar un identificador que ya existe reemplaza su feedback. Para los patrones, "el mismo" significa el mismo source y los mismos flags.

## Qué coincidencia gana

`createAppError` reúne el valor que le pasaste y cada error envuelto dentro de él, empezando por el más externo y avanzando hacia adentro. Después elige un resultado, en este orden:

1. Una coincidencia **conocida** en cualquier parte: un código, un nombre, un mensaje exacto o un prefijo, o un `AppError` que ya es `"known"`. Gana la más externa, con una excepción: cuando pasas un `registry`, una coincidencia conocida de ese registro le gana a un `AppError` conocido que esté dentro del valor, por profunda que sea la coincidencia, porque pasar un registro es pedir su redacción.
2. Si no, una coincidencia **heurística** en cualquier parte: un patrón, o un `AppError` que ya es `"heuristic"`.
3. Si no, cualquier `AppError` que se encuentre dentro del valor.
4. Si no, un error `"unknown"` con el mensaje de respaldo.

Dentro de un mismo valor envuelto, el orden es código, después nombre, después mensaje exacto, después prefijo, después patrón.

La primera regla es lo que hace funcionar a los fallos envueltos en profundidad. Un `fetch` que falla en Node.js lanza `TypeError: fetch failed`, que coincide con un patrón. Pero su `cause` trae `code: "ECONNREFUSED"`, que coincide con un código. La coincidencia conocida más profunda le gana a la heurística más superficial, así que obtienes el mensaje más específico.

Los errores envueltos se buscan en `cause`, `originalError`, `error`, `err`, `inner` e `innerError`, y en las primeras diez entradas de una lista `errors`, como en `AggregateError`. La búsqueda llega hasta tres niveles de profundidad, y una cadena de `cause` sigue hasta ocho; consulta [El AppError](app-error.md#opciones) para `maxDepth`. Los objetos ya visitados se saltan, así que un error que es su propia causa no puede mandar la búsqueda a dar vueltas en círculo.

## El registro global, o uno propio

`getErrorRegistry()` devuelve el registro global. Empieza vacío, y es el que usa `createAppError` cuando no pasas ningún `registry`. Para la mayoría de las aplicaciones, un solo registro global configurado al arrancar es todo lo que hace falta.

Crea el tuyo con `createErrorRegistry()` cuando un conjunto de mapeos no deba aplicarse en todas partes. El gestor de proyectos cobra pagos, y su proveedor de pagos tiene sus propios códigos:

```ts
import { createAppError, createErrorRegistry } from "@codenhub/error";

const billingRegistry = createErrorRegistry();
billingRegistry.codes.add("card_declined", {
  message: "Tu tarjeta fue rechazada. Prueba con otra tarjeta.",
  source: "my-app.billing",
});

const error = createAppError(caught, { registry: billingRegistry });
```

Recurre a un registro aparte cuando:

- **Dos servicios usan el mismo código para cosas distintas.** El bucket `codes` es un solo espacio de nombres, así que si tu proveedor de pagos y tu base de datos usan `"P0001"`, gana el que se agregó último, y el otro queda mal de una forma que ninguna prueba detecta. Dale a cada servicio su propio registro y clasifica sus errores contra él.
- **Los nombres de un preset son demasiado amplios para cierto código.** El bucket `names` coincide con cualquier valor que tenga ese nombre. Con el preset del navegador fusionado, la clase `TimeoutError` propia de una biblioteca se clasifica como la del navegador.
- **Clasificas datos que vienen de otro lado.** Los cuerpos de respuesta de otro servicio se deben clasificar contra los códigos de ese servicio, no contra presets de red pensados para tu propio runtime.

`createErrorRegistry(presets)` crea un registro a partir de una lista de otros, fusionados en orden:

```ts
import { createErrorRegistry } from "@codenhub/error";
import { nodeErrorRegistry } from "@codenhub/error/registries/node";

const apiRegistry = createErrorRegistry([nodeErrorRegistry, myApiRegistry]);
```

`setErrorRegistry(registry)` reemplaza por completo el registro global. Sirve sobre todo en las pruebas, para que cada prueba empiece desde un estado conocido.

## Combinar y congelar

`registry.merge(other)` copia cada entrada de `other` en `registry`, reemplazando las entradas con el mismo identificador. Primero valida el origen completo, así que una entrada inválida deja el destino sin cambios. `registry.clear()` vacía todos los buckets.

`freezeRegistry(registry)` devuelve una instantánea de solo lectura, con el tipo `ReadonlyErrorRegistry`. Solo tiene los métodos de lectura, `get` y `values`, aunque vayas a buscar con reflexión, y los cambios posteriores al original no le llegan. Los presets integrados son instantáneas congeladas, y congelar es la forma de compartir un conjunto de mapeos entre paquetes o equipos sin que nadie lo cambie por accidente:

```ts
import { createErrorRegistry, freezeRegistry } from "@codenhub/error";

const registry = createErrorRegistry();
registry.codes.add("project.not_found", { message: "No encontramos ese proyecto. Puede que se haya eliminado." });

export const projectErrors = freezeRegistry(registry);
```

Un registro congelado funciona en cualquier lugar donde se lee un registro: como la opción `registry`, en `merge` y en la lista que le pasas a `createErrorRegistry`.

Todo lo que devuelve un bucket también está congelado. `values()` devuelve la misma lista congelada hasta que el bucket cambia, y sus entradas, objetos de feedback y expresiones regulares están todos congelados. Expande uno en un objeto nuevo cuando necesites una copia que puedas cambiar.

## Escribir patrones

Un patrón se aplica al mensaje de cada fallo que llega a `createAppError`, y los mensajes pueden venir de cualquier parte, incluido alguien que intenta ralentizar tu servidor. Un patrón con mucho backtracking, como `/(a+)+$/`, puede quedarse colgado varios segundos con un mensaje armado a propósito. Mantén los patrones simples:

- Ánclalos con `^` y `$`.
- Evita la repetición anidada, como un `+` dentro de un grupo que a su vez se repite.
- Usa un código, un nombre, un mensaje o un prefijo siempre que exista uno.

Anclar también evita que un patrón coincida de más. `/load failed/i` coincide con `"Config load failed"`; `/^load failed\.?$/i` coincide solo con el mensaje del propio navegador.

## Tipos

Los tipos del registro se exportan para el código que construye registros o los pasa de un lado a otro:

| Tipo                                                      | Para qué sirve                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `ErrorFeedback`                                           | El objeto de feedback de una entrada, como en una comprobación `satisfies`. |
| `ErrorRegistry`                                           | Un registro que puedes cambiar, de `createErrorRegistry`.                   |
| `ReadonlyErrorRegistry`                                   | Una instantánea congelada, de `freezeRegistry`, y todos los presets.        |
| `ErrorRegistryBucket`                                     | Los buckets `codes`, `names` y `messages`.                                  |
| `ErrorPrefixRegistryBucket`, `ErrorPatternRegistryBucket` | Los buckets `prefixes` y `patterns`.                                        |
| `ErrorPrefixDefinition`, `ErrorPatternDefinition`         | Lo que devuelven de `values()` los buckets `prefixes` y `patterns`.         |

## Siguiente

Ya puedes escribir tus propios mapeos. La mayoría de las aplicaciones también quiere los que otra persona ya escribió: [Presets](presets.md) enumera cada fallo que reconocen los presets del navegador, de Node.js, de HTTP y de Supabase.
