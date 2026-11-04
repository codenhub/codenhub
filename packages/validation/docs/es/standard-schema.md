---
title: Standard Schema
description: Usa un validador en cualquier lugar donde una biblioteca acepte un Standard Schema, como bibliotecas de formularios, frameworks de API y routers.
order: 9
source: 92bc96df75f26600314838cf5d08c2a5ed86ec28
---

# Standard Schema

El formulario de registro corre en una biblioteca de formularios, y el endpoint de registro en un framework web. Ninguno debería necesitar código propio para cada biblioteca de validación. [Standard Schema](https://standardschema.dev/) es una pequeña interfaz compartida que permite a las bibliotecas aceptar un validador sin depender de la biblioteca que lo creó. Las bibliotecas de formularios, los frameworks de API y los routers que la soportan reciben directamente cualquier validador que la cumpla, de cualquier biblioteca. Esta página explica cómo un validador de este paquete lo es, y cómo elegir la redacción de sus mensajes.

Todo validador que crea una fábrica de este paquete ya es un Standard Schema:

```ts
import { email, number, object } from "@codenhub/validation";

const signup = object({ email: email(), age: number({ int: true }) });

signup["~standard"].validate({ email: "nope", age: 1.5 });
// {
//   issues: [
//     { message: "Invalid email", path: ["email"] },
//     { message: "Must be an integer", path: ["age"] },
//   ],
// }
```

Pásale `signup` a la biblioteca que pide un Standard Schema, y ella misma llamará a `~standard.validate`. No lo llamas tú, salvo que estés escribiendo esa biblioteca. Su tipo es [`Schema`](#los-tipos), que se lo indica a TypeScript.

## Inglés breve, o `standard`

La especificación exige un mensaje en cada problema. El `~standard` de un validador redacta cada uno en inglés breve: el `message` propio del problema, definido con la opción `message` o por una verificación, o una frase para su código, como "Must be at least 2 characters" o "Invalid email". Se mantiene breve porque todo programa que crea un validador lo empaqueta.

Algunos problemas reciben menos que una frase:

- Una verificación nombrada con un identificador de código, como `startsWith`, y un formato cuyo nombre se escribe así, como `creditCard`, se redactan como "Invalid value". El inglés breve no le muestra a un lector el nombre de una función.
- Una clave no reconocida es "Unrecognized key", ya que la clave es el último segmento de la ruta.

`standard` redacta ambos de forma completa.

`standard(validator, messages?)` da el mismo validador con un `~standard` propio que redacta los problemas como lo hace [`formatIssue`](./errors.md#convertir-un-problema-en-texto). Úsalo para:

- **El inglés completo**, como "Invalid email address" y "Must contain at most 3 items", que es el predeterminado.
- **Otro idioma**, con `portugueseMessages` o un mapa propio.
- **Un validador que escribiste a mano**, que no tiene un `~standard` propio, ya que este paquete no lo creó.

```ts
import { email, number, object, portugueseMessages, standard } from "@codenhub/validation";

const signup = standard(object({ email: email(), age: number({ int: true }) }), portugueseMessages);
```

## Los tipos

Una fábrica devuelve un `Schema<T, TInput>`, o un `AsyncSchema<T, TInput>` cuando una de sus reglas espera: un `Validator` o `AsyncValidator` que también es un `StandardSchemaV1<TInput, T>`. Se acepta en cualquier lugar donde se acepta un `Validator`, así que el código que recibe un validador, como `assert` o una función propia, lo recibe igual que antes. Un validador que escribes a mano se tipa como `Validator`, que no pide `~standard`, y el `brand` de uno sigue siendo un `Validator`, ya que `brand` devuelve el validador que recibe.

## Lo que devuelve `standard`

Un validador que se comporta exactamente como el que pasaste, con la propiedad `~standard` agregada, así que sigue siendo un validador común que puedes llamar y componer. El validador que pasaste no se modifica, así que el mismo se puede exponer dos veces, con mensajes distintos para públicos distintos.

`~standard.validate` devuelve `{ value }` si tiene éxito y `{ issues }` si falla, y nunca ambos. Devuelve su resultado directamente para un validador síncrono y una `Promise` para uno asíncrono, lo que la especificación permite. Eso vale incluso para un validador propio que devuelva otro tipo de thenable, como el de un query builder, ya que quienes llaman distinguen los dos casos con `instanceof Promise` y leerían cualquier otra cosa como un resultado sin problemas. El tipo de entrada es lo que acepta el validador, [`InferInput`](./forms.md#los-tipos-de-un-formulario), y el tipo de salida es lo que produce. Así, una biblioteca que infiere tipos a partir de un Standard Schema obtiene ambos. Una biblioteca de formularios tipa el campo de un `coerceNumber()` como `string | number`, ya que un número también pasa, y tipa como número lo que te entrega después de la validación.

El paquete exporta el tipo `StandardSchemaV1` para que puedas aceptar uno en tu propio código, y `StandardJSONSchemaV1` para uno que además lleva su JSON Schema.

## Los mensajes de `standard`

`standard` construye cada mensaje a partir del mapa de mensajes pasado como segundo argumento: el inglés integrado cuando no pasas ninguno, `portugueseMessages` para portugués, o un mapa propio. Un programa que llama a `standard` empaqueta el inglés, incluso cuando pasa otro mapa, ya que es el predeterminado. Un programa que redacta sus problemas con un mapa propio y nunca llama a `standard` no lo empaqueta. Un segundo argumento omitido o pasado como `undefined` es el inglés; cualquier otro que no sea un mapa, como `null`, un texto o una lista, es un `TypeError` cuando se llama a `standard`. Luego los mensajes vienen de [`formatIssue`](./errors.md#convertir-un-problema-en-texto): el `message` propio de un problema, luego una entrada para su `code` en el mapa, luego la entrada `default` del mapa, y luego "Invalid value".

```ts
import { englishMessages, number, standard } from "@codenhub/validation";

const age = standard(number({ min: 18 }), {
  ...englishMessages,
  too_small: (issue) => `Você precisa ter pelo menos ${String(issue.params?.minimum)} anos`,
});
```

El `path` de cada problema es la ruta propia del problema, como un array de cadenas y números.

## Con su JSON Schema

Algunas bibliotecas también necesitan escribir el esquema, como el AI SDK, que envía los argumentos de una herramienta a un modelo de lenguaje como un JSON Schema. Lo leen de `~standard.jsonSchema`, que [Standard JSON Schema](https://standardschema.dev/json-schema) agrega a la especificación. `standardJsonSchema(validator, messages?)` devuelve lo mismo que `standard`, con eso agregado:

```ts
import { meta, number, object, optional, standardJsonSchema, string } from "@codenhub/validation";

const forecast = standardJsonSchema(
  object({
    city: meta(string({ min: 1, max: 100 }), { description: "The city to get the weather for" }),
    days: optional(number({ int: true, min: 1, max: 7 })),
  }),
);

forecast["~standard"].jsonSchema.input({ target: "draft-07" });
// { $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: { city: { ..., description: "The city to get the weather for" }, ... }, required: ["city"] }
```

`input` y `output` escriben el validador con [`toJsonSchema`](./json-schema.md), con el lado y el draft que se pidan. Se escriben `"draft-2020-12"` y `"draft-07"`, y cualquier otro target lanza un `TypeError`. Cuando una parte del validador no se puede escribir como JSON Schema, como una verificación personalizada, `toJsonSchema` lanza una excepción por ella, y también `input` y `output`, a menos que la biblioteca pase `libraryOptions: { unrepresentable: "any" }`. Esa es la única opción de biblioteca, y cualquier otro nombre en `libraryOptions`, como uno mal escrito, lanza un `TypeError` en lugar de ignorarse. Aplica [`meta`](./shaping-values.md#meta) al validador antes de pasarlo aquí, ya que el esquema se escribe a partir del validador que recibe `standardJsonSchema`.

Es una exportación separada para que `standard`, que usa un formulario en el navegador, no empaquete el código que escribe un esquema: usa `standard` donde solo se pide validación, y `standardJsonSchema` donde además se lee el esquema.

## Una nota sobre las funciones

Aquí un validador es una función, y `standard` le agrega `~standard` a una función. La especificación permite cualquier objeto, y las bibliotecas que la siguen leen la propiedad, así que esto funciona. Una biblioteca que exija `typeof schema === "object"` antes de mirar no lo reconocería; si te encuentras con una, envuelve el validador en un objeto propio: `{ "~standard": standard(validator)["~standard"] }`.

## Siguiente

Algunas bibliotecas leen un esquema en lugar de llamarlo: una descripción de API, un generador de formularios o un modelo de lenguaje que elige los argumentos de una herramienta. [JSON Schema](./json-schema.md) explica cómo escribir un validador como uno.
