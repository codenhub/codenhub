---
title: JSON Schema
description: Escribe un validador como JSON Schema, para el cuerpo de una API HTTP, los argumentos de una herramienta que llama un modelo de lenguaje o un generador de formularios.
order: 10
source: d803b9b6b958da6617332343c97771eed2d675a4
---

# JSON Schema

`toJsonSchema(validator)` escribe un validador como un [JSON Schema](https://json-schema.org/), draft 2020-12. Es lo que reciben un documento OpenAPI, las definiciones de herramientas de un modelo de lenguaje y muchos generadores de formularios. Así, un mismo validador puede verificar un valor y además decirle a otro programa cómo debe ser ese valor. El endpoint de registro puede publicar su cuerpo en un documento OpenAPI a partir del mismo validador que lo verifica.

Esta página cubre lo que promete el esquema, cómo se escribe cada validador y cómo leer un validador por tu cuenta con `describe`. El esquema que devuelve tiene el tipo `JsonSchema`, y sus opciones, el tipo `JsonSchemaOptions`.

```ts
import { email, number, object, optional, string, toJsonSchema } from "@codenhub/validation";

const user = object({
  name: string({ min: 2 }),
  email: email(),
  age: optional(number({ int: true, min: 0 })),
});

toJsonSchema(user);
// {
//   $schema: "https://json-schema.org/draft/2020-12/schema",
//   type: "object",
//   properties: {
//     name: { type: "string", minLength: 2 },
//     email: { type: "string" },
//     age: { type: "integer", minimum: 0 },
//   },
//   required: ["name", "email"],
// }
```

El resultado es un objeto plano nuevo que `JSON.stringify` puede escribir. Se importa por separado, así que un programa que nunca pide un esquema no empaqueta el código que lo escribe.

## Lo que promete el esquema

Un esquema dice menos de lo que verifica un validador. `email()` rechaza una dirección en `localhost`, y el formato `email` de JSON Schema no tiene esa regla. Por eso el esquema se escribe para cumplir una promesa: **un valor que el validador acepta pasa el esquema**. El esquema puede aceptar un valor que luego el validador rechaza, y el validador sigue siendo la verificación que cuenta. Valida lo que recibes con el validador, y dale el esquema a quien necesite conocer la forma.

Hay tres casos que doblan esa promesa. En dos, el validador limpia un valor antes de verificarlo, algo que un esquema no puede expresar, y en el otro, los dos cuentan de forma distinta la longitud del texto:

- **Opciones de limpieza.** `string({ trim: true, max: 5 })` se escribe con `maxLength: 5`, que describe un texto que no necesita que se le quiten espacios. Un texto con espacios alrededor de cinco letras pasa el validador y no el esquema. Con `case` pasa lo mismo, y también con `clamp` junto a un límite, como en `number({ max: 10, clamp: { min: 0, max: 10 } })`: el esquema describe el valor después de la limpieza. El rango de un `clamp` en sí no se escribe.
- **Longitud del texto.** El `length` de una cadena cuenta un emoji, y cualquier otro carácter fuera del Plano Multilingüe Básico, como dos, y JSON Schema lo cuenta como uno, así que un `min` o un `max` pueden diferir en la cantidad de esos caracteres. Con un `pattern` pasa lo mismo: un esquema lo lee en modo Unicode, el flag `u`, así que en uno escrito sin ese flag, `.` y una clase negada como `[^a]` coinciden con un carácter entero en el esquema y con medio emoji en el validador.
- **Formatos que aceptan varias escrituras.** `phone()` acepta `+55 (11) 98765-4321` y produce `+5511987654321`. Una verificación sobre un formato así, como en `hostname(pattern(/^[a-z.]+$/))`, ve la escritura que produce el formato y se escribe para el texto tal como llega, así que `EXAMPLE.com` pasa el validador y no el esquema.

## Entrada y salida

Un validador que cambia su valor tiene dos formas: lo que acepta y lo que produce. `toJsonSchema` escribe la entrada por defecto, ya que es lo que debe cumplir una solicitud o una llamada a una herramienta. Pasa `{ io: "output" }` para lo que produce el validador, como el cuerpo de una respuesta.

```ts
import { coerceNumber, object, oneOf, optional, toJsonSchema } from "@codenhub/validation";

const query = object({
  page: coerceNumber({ int: true }),
  sort: optional(oneOf(["new", "top"]), "new"),
});

toJsonSchema(query).properties;
// { page: { anyOf: [{ type: "integer" }, { type: "string" }] }, sort: { enum: ["new", "top"], default: "new" } }
// y solo `page` es obligatorio

toJsonSchema(query, { io: "output" }).properties;
// { page: { type: "integer" }, sort: { enum: ["new", "top"] } }
// y ambos son obligatorios
```

| Validador                                          | Entrada                                                                                                                                                              | Salida                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `optional(validator, value)`                       | El esquema del validador, no obligatorio, con `default` cuando el valor predeterminado es un primitivo de JSON                                                       | El esquema del validador, obligatorio                           |
| `lazy`, `json` o `searchParams` con verificaciones | Para `lazy` y `json`, las verificaciones en un `allOf` junto a aquello a lo que se refiere o que analiza. Para `searchParams`, una cadena, que no dice nada de ellas | Las verificaciones en un `allOf` junto al esquema del validador |
| Los validadores `coerce`                           | Un `anyOf` del esquema del tipo que producen, con límites y verificaciones incluidos, y de los tipos desde los que convierten                                        | El tipo que producen                                            |
| `transform`                                        | El esquema del validador desde el que convierte                                                                                                                      | No se puede escribir                                            |
| `pipe`                                             | Su primer validador                                                                                                                                                  | El último                                                       |
| `json(validator)`                                  | Una cadena, con `contentSchema` para lo que analiza                                                                                                                  | El esquema del validador                                        |
| `searchParams(validator)`                          | Una cadena                                                                                                                                                           | El esquema del validador                                        |
| `fallback`                                         | Cualquier cosa, ya que nunca falla                                                                                                                                   | El esquema del validador que envuelve                           |

El lado de salida supone que un valor predeterminado y el valor de un `fallback` pasan el validador al que se aplican. Ninguno de los dos se valida, así que `optional(string({ min: 3 }), "")` produce un texto que su propio esquema de salida rechaza: usa un valor predeterminado que su validador acepte.

## Cómo se escribe cada validador

| Validador                                                   | Esquema                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `string`                                                    | `type: "string"` con `minLength` y `maxLength`                                                                           |
| `number`                                                    | `type: "number"`, o `"integer"` con `int` o `safeInt`, con `minimum`, `maximum`, `exclusiveMinimum` y `exclusiveMaximum` |
| `boolean`, `unknown`, `never`                               | `type: "boolean"`, `{}` y `{ not: {} }`                                                                                  |
| `literal`, `oneOf`                                          | `const` y `enum`                                                                                                         |
| Un formato                                                  | `type: "string"` con `format`, como lo escribe la tabla de abajo                                                         |
| `port`, `base64`                                            | Un entero de 1 a 65535, y una cadena con `contentEncoding`                                                               |
| `object`, `objectLike`                                      | `type: "object"` con `properties`, `required`, y `additionalProperties: false` para un `object` estricto                 |
| `array`                                                     | `type: "array"` con `items`, `minItems` y `maxItems`                                                                     |
| `tuple`                                                     | `prefixItems`, con `items` para `rest` y `false` sin él                                                                  |
| `record`                                                    | `propertyNames` y `additionalProperties`, con `minProperties` y `maxProperties`                                          |
| `union`, `intersection`                                     | `anyOf` y `allOf`                                                                                                        |
| `tagged`                                                    | `oneOf`, con la etiqueta como propiedad `const` de cada variante                                                         |
| `nullable`, `nullish`                                       | `anyOf` con `type: "null"`                                                                                               |
| `readonly`, `brand`                                         | Lo mismo que el validador interno                                                                                        |
| `codec`                                                     | Su `input`, o su `output` con `io: "output"`                                                                             |
| `lazy`                                                      | Un `$ref` a una definición bajo `$defs`                                                                                  |
| `pattern`, `startsWith`, `endsWith`, `includes`, `nonBlank` | `pattern`                                                                                                                |
| `multipleOf`, `nonZero`, `unique()`                         | `multipleOf`, `not: { const: 0 }` y `uniqueItems`                                                                        |

`multipleOf` se escribe solo para un paso que el punto flotante binario representa con exactitud: un entero que representa tal como está escrito, así que no `1e23`, o una fracción como `0.5` o `0.25`. Un lector divide en binario, donde `0.3 / 0.1` no es `3`, así que con un paso como `0.1` o `0.01` rechazaría valores que el validador acepta; ese paso se omite. Ajv también rechaza algunos números muy grandes: divide el valor entre el paso y lee el resultado con `parseInt`, que lee mal un resultado de `1e21` o más, así que rechaza `1e25` con `multipleOf: 5`, que `number(multipleOf(5))` acepta. Donde Ajv lee el esquema, dale al número un `min` y un `max` que mantengan el valor dividido entre el paso estrictamente por encima de `-1e21` y por debajo de `1e21`. Por encima de `2 ** 53`, donde un número no es el entero que escriben sus dígitos, cualquier lector que divida puede rechazar un valor que el validador acepta, como rechaza `20054952883093950` con `multipleOf(5)`. `uniqueItems` se escribe solo para elementos que son primitivos, ya que `unique()` compara un objeto por identidad y `uniqueItems` por lo que contiene.

Un formato se escribe con el nombre que JSON Schema le da, y sin `format` cuando las reglas de ese nombre rechazan un texto que el validador acepta, lo que rompería la promesa de arriba:

| Formato                                                                  | Entrada                                                   | Salida     |
| ------------------------------------------------------------------------ | --------------------------------------------------------- | ---------- |
| `email`                                                                  | Ninguno, ya que el dominio puede estar internacionalizado | `email`    |
| `domain`                                                                 | Ninguno, por la misma razón                               | `hostname` |
| `hostname`, `uuid`                                                       | Sus propios nombres                                       | Lo mismo   |
| `datetime`                                                               | `date-time`, y ninguno con `local`, que no tiene offset   | Lo mismo   |
| `isoDate`                                                                | `date`                                                    | Lo mismo   |
| `ip`                                                                     | `ipv4` con `version: "v4"`, y ninguno en otro caso        | Lo mismo   |
| `time`, `duration`, `url`                                                | Ninguno                                                   | Ninguno    |
| `port`, `base64`                                                         | Como los escribe la tabla de arriba                       | Lo mismo   |
| Cualquier otro, y cualquiera creado con `format`, sea cual sea su nombre | Ninguno                                                   | Ninguno    |

Un formato se omite donde el de JSON Schema tiene reglas más estrictas: `time` necesita un offset, que una hora del día como `12:00` nunca tiene; `duration` no permite fracciones, como en `PT0.5S`, ni semanas junto a días, como en `P1W1D`; una dirección IPv6 puede tener una zona, como en `fe80::1%eth0`, que `ipv6` no permite; y una URL puede contener `|` o `^`, que una URI no puede. La entrada de `email` y `domain` puede estar internacionalizada, como en `user@bücher.example`, que `email` y `hostname` rechazan; `idn-email` e `idn-hostname` servirían, pero [ajv-formats](https://github.com/ajv-validator/ajv-formats) no los conoce, y Ajv, en su modo estricto predeterminado, se niega a compilar un esquema con un formato que no conoce. Por eso también un formato para el que JSON Schema no tiene nombre, como `phone`, `slug` o uno creado con `format`, se escribe sin ninguno.

Una propiedad se omite de `required` cuando su validador acepta `undefined`: `optional`, `nullish`, `unknown`, `fallback`, un `literal` o un `oneOf` de `undefined`, una `union` con uno de ellos, o un `lazy`, `nullable`, `readonly`, `transform` o `pipe` alrededor de uno. Una `intersection` se omite cuando todos los validadores que contiene aceptan `undefined`. JSON no tiene `undefined`, así que `literal(undefined)` dentro de una `union` se omite de su `anyOf`, y una `union` o un `oneOf` sin nada más se escribe como `{ not: {} }`, que ningún valor pasa.

Un esquema recursivo se escribe una sola vez, como una definición a la que el esquema se refiere:

```ts
import { array, lazy, object, string, toJsonSchema, type Validator } from "@codenhub/validation";

interface Category {
  name: string;
  children: Category[];
}

const category: Validator<Category> = object({ name: string(), children: array(lazy(() => category)) });

toJsonSchema(category).$defs;
// {
//   schema1: {
//     type: "object",
//     properties: { name: { type: "string" }, children: { type: "array", items: { $ref: "#/$defs/schema1" } } },
//     required: ["name", "children"],
//   },
// }
```

Construye un esquema recursivo una sola vez y haz referencia a él, como explica [Límites](./limits.md#construye-un-esquema-recursivo-una-sola-vez). Uno construido de nuevo en cada nivel, como hace `lazy(() => build())` dentro de `build`, no tiene un final que escribir, y `toJsonSchema` lanza un `TypeError` que lo indica.

## Decir para qué sirve un valor

Un esquema que solo da los tipos le dice a un lector qué enviar, pero no qué significa. [`meta`](./shaping-values.md#meta) agrega un título, una descripción, ejemplos y si un valor está obsoleto (deprecated) a la parte a la que se aplica, y `toJsonSchema` escribe cada uno bajo la palabra clave de JSON Schema del mismo nombre. Un modelo de lenguaje lee la `description` de los argumentos de una herramienta para decidir qué poner en ellos, y un documento OpenAPI muestra los cuatro.

```ts
import { meta, number, object, string, toJsonSchema } from "@codenhub/validation";

const forecast = meta(
  object({
    city: meta(string({ min: 1 }), { description: "The city to get the weather for", examples: ["Lisbon"] }),
    days: meta(number({ int: true, min: 1, max: 7 }), { description: "How many days ahead" }),
  }),
  { title: "Forecast" },
);

toJsonSchema(forecast);
// {
//   $schema: "https://json-schema.org/draft/2020-12/schema",
//   type: "object",
//   title: "Forecast",
//   properties: {
//     city: { type: "string", minLength: 1, description: "The city to get the weather for", examples: ["Lisbon"] },
//     days: { type: "integer", minimum: 1, maximum: 7, description: "How many days ahead" },
//   },
//   required: ["city", "days"],
// }
```

Las claves se escriben en el esquema que corresponda a la parte, junto a un `$ref` para un `lazy` y junto a un `anyOf` para un `nullable`, y lo mismo en el lado de entrada que en el de salida. En draft-07, que ignora una palabra clave junto a un `$ref`, la referencia se envuelve en un `allOf` y las claves se escriben junto a él. Los ejemplos se escriben tal como se pasaron y no se verifican contra el validador.

## Drafts

El esquema se escribe en el draft 2020-12, a menos que `target: "draft-07"` pida el draft anterior, que algunos lectores todavía usan, como las herramientas de un modelo de lenguaje en el AI SDK. En draft-07, los elementos de una `tuple` se enumeran bajo `items` y su `rest` bajo `additionalItems`, las definiciones están bajo `definitions`, y lo que analiza `json` no se escribe, ya que ese draft no tiene `contentSchema`. Cualquier otro target es un `TypeError`, y también lo es una opción que `toJsonSchema` no tiene, como `draft` escrito en lugar de `target`, igual que una opción desconocida lo es para una fábrica. [`standardJsonSchema`](./standard-schema.md#con-su-json-schema) escribe el draft que pida una biblioteca, mediante la misma función.

## Lo que no se puede escribir

JSON Schema no tiene palabras para parte de lo que un validador puede verificar, y JSON no tiene valor para parte de lo que puede producir:

- `date`, `bigint`, `symbol`, `func`, `instanceOf`, `set`, `map` y `file`, ninguno de los cuales es un valor JSON; `formData`, que lee un formulario y no JSON; y un validador creado por `guard`, cuya prueba es una función que nadie puede leer.
- Un validador que escribiste a mano, y una verificación creada por `check`, cuya regla es una función que nadie puede leer.
- `lowercase`, `uppercase`, `unique` con una función de clave, y un `pattern` con un flag como `i` o `v`, que los patrones de JSON Schema no tienen. Los flags `g` e `y`, que `pattern` descarta, se omiten, y también `u`, el modo en que un esquema lee todos los patrones.
- Un `pattern` escrito sin `u` que el modo Unicode lee de otra forma: uno que es un error en ese modo, como `/^\@x$/`, cuyo `\@` solo ese modo rechaza, y uno con `\u{…}` o `\p{…}`, que son escapes solo en ese modo y texto con llaves fuera de él.
- Lo que devuelve un `transform`, en el lado de salida.
- Una verificación sobre un `object`, y una variante de `tagged` que no es un `object`, como un `lazy`. Con `unrepresentable: "any"`, esa variante se escribe como un objeto que tiene solo su etiqueta, para que las demás variantes sigan coincidiendo con una sola rama del `oneOf`.

Por defecto, `toJsonSchema` lanza un `TypeError` que nombra la parte y dónde está, como `toJsonSchema cannot write a validator of kind "date" at createdAt`, para que un esquema nunca sea, sin que lo notes, más débil de lo que querías. Pasa `{ unrepresentable: "any" }` para escribir esa parte como `{}`, que acepta cualquier cosa, y para omitir esa verificación:

```ts
import { check, date, object, string, toJsonSchema } from "@codenhub/validation";

const post = object({ title: string(check((text) => !text.includes("spam"))), createdAt: date() });

toJsonSchema(post, { unrepresentable: "any" }).properties;
// { title: { type: "string" }, createdAt: {} }
```

Para enviar una fecha como JSON, valida el texto en que viaja, con `datetime()` o `isoDate()`, o conviértela con `coerceDate()`, cuyo lado de entrada es una cadena o un número entero de milisegundos.

## Leer un esquema

`toJsonSchema` escribe una notación. Para escribir otra, o para construir un formulario a partir de un esquema, lee el validador por tu cuenta. `describe(validator)` devuelve de qué está hecho un validador, como datos planos, con el tipo `Description`: su `kind`, las `options` que recibió, sus `checks` y los validadores que contiene. Un programa recorre un esquema con él, para escribir el esquema en otra notación, para construir un formulario a partir de él o para crear otro validador a partir de sus partes.

```ts
import { describe, email, object, optional, string, type AnyValidator } from "@codenhub/validation";

const signupForm = object({ name: string({ min: 2 }), email: email(), nickname: optional(string()) });

const top = describe(signupForm);
top?.kind; // "object"
const shape = top?.["shape"] as Record<string, AnyValidator>;
describe(shape["name"] as AnyValidator)?.options; // { min: 2 }
describe(shape["email"] as AnyValidator)?.["format"]; // "email"
describe(shape["nickname"] as AnyValidator)?.kind; // "optional"
```

Un validador dentro de otro se da como el propio validador, para describirlo a su vez. Así, un esquema recursivo se lee un nivel a la vez, y nunca sin fin. La descripción y sus opciones están congeladas, y son una copia de lo que recibió la fábrica. Así, cambiar un objeto de opciones después no cambia ni el validador ni lo que dice de sí mismo.

| `kind`                                                                                                  | Creado por                                              | Además de `options` y `checks`                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `"string"`, `"number"`, `"bigint"`, `"boolean"`, `"date"`, `"symbol"`, `"unknown"`, `"never"`, `"file"` | El validador de ese nombre                              |                                                                                                                                       |
| `"function"`                                                                                            | `func`                                                  |                                                                                                                                       |
| `"literal"`                                                                                             | `literal`                                               | `value`                                                                                                                               |
| `"oneOf"`                                                                                               | `oneOf`                                                 | `values`, una lista, también para un enum                                                                                             |
| `"instance"`                                                                                            | `instanceOf`                                            | `target`, la clase                                                                                                                    |
| `"guard"`                                                                                               | Una fábrica creada por `guard`                          | `expected`                                                                                                                            |
| `"format"`                                                                                              | Todo formato, `port`, y una fábrica creada por `format` | `format`, su nombre, como en el problema que reporta                                                                                  |
| `"coerce"`                                                                                              | Los validadores `coerce`                                | `inner`, el validador estricto, que tiene las opciones; `options` para una opción propia de la conversión, `zoneless` de `coerceDate` |
| `"object"`, `"objectLike"`                                                                              | `object`, `objectLike`                                  | `shape`                                                                                                                               |
| `"array"`, `"set"`                                                                                      | `array`, `set`                                          | `item`                                                                                                                                |
| `"tuple"`                                                                                               | `tuple`                                                 | `items`, y `rest` cuando tiene uno                                                                                                    |
| `"record"`, `"map"`                                                                                     | `record`, `map`                                         | `key`, `value`                                                                                                                        |
| `"union"`, `"intersection"`                                                                             | `union`, `intersection`                                 | `members`                                                                                                                             |
| `"tagged"`                                                                                              | `tagged`                                                | `key`, `variants`                                                                                                                     |
| `"optional"`                                                                                            | `optional`                                              | `inner`, `default`; sin `options` ni `checks`                                                                                         |
| `"nullable"`, `"nullish"`                                                                               | `nullable`, `nullish`                                   | `inner`; sin `options` ni `checks`                                                                                                    |
| `"readonly"`                                                                                            | `readonly`                                              | `inner`; sin `options` ni `checks`                                                                                                    |
| `"fallback"`                                                                                            | `fallback`                                              | `inner`, `value`; sin `options` ni `checks`                                                                                           |
| `"transform"`                                                                                           | `transform`                                             | `inner`, `convert`; sin `options` ni `checks`                                                                                         |
| `"pipe"`                                                                                                | `pipe`                                                  | `steps`; sin `options` ni `checks`                                                                                                    |
| `"codec"`                                                                                               | `codec`                                                 | `input`, `output`, `decode`, `encode`; sin `options` ni `checks`                                                                      |
| `"lazy"`                                                                                                | `lazy`                                                  | `getter`, que devuelve el validador                                                                                                   |
| `"json"`, `"searchParams"`, `"formData"`                                                                | `json`, `searchParams`, `formData`                      | `inner`                                                                                                                               |
| `"check"`                                                                                               | Toda verificación integrada                             | `code` y `params` del problema que reporta                                                                                            |

Una verificación se describe de la misma manera, así que también se puede leer la lista en `checks`: `describe(pattern(/^a/))` da `{ kind: "check", code: "invalid_format", params: { format: "regex", pattern: "/^a/" } }`. Una verificación creada por `checkFields` da `{ kind: "check", fields }`, las propiedades que espera, y sin `params`, ya que su prueba es una función. Lo que nadie puede leer da `undefined`: un validador o una verificación que escribiste a mano, y una verificación creada por `check`, cuya prueba es una función. Quien lee un esquema decide qué significa para él una regla así, y el código que convierte un esquema a otra notación suele rechazarla. La función con la que convierte un `transform` y el getter de un `lazy` están en la descripción como funciones, por la misma razón. La prueba de un `guard` y aquello con lo que lee un formato no están: un `guard` da el `expected` que nombra, y un formato, su nombre.

Lo que devuelve `standard` se describe como el validador que envuelve, y lo mismo lo que devuelve `meta`, con una parte `meta` agregada: `{ title, description, examples, deprecated }`, cada clave solo cuando se pasó. Un validador escrito a mano al que se le aplicó `meta` se describe como `{ kind: "meta", inner, meta }`. Las partes se tipan como `unknown`, ya que lo que es una parte depende del kind: lee primero `kind`, y luego las partes de ese kind según la tabla.

## Siguiente

Las bibliotecas que reciben un Standard Schema o un JSON Schema tienen cada una algunos detalles propios. [Integraciones](./integrations.md) muestra las más comunes, con el registro.
