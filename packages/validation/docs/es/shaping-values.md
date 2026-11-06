---
title: Dar forma a los valores
description: Encadena validadores, convierte valores, vuelve a escribirlos, márcalos y congélalos, descríbelos, reemplaza un fallo por un valor de respaldo y reutiliza la forma de un objeto.
order: 8
source: 210016e82ea9da98e51685547f5408c1acffdfe7
---

# Dar forma a los valores

Un validador hace más que decir que sí o que no. Puede limpiar un valor, convertirlo en otro tipo y, más tarde, volver a escribirlo en su forma original. Esta página cubre las herramientas que cambian lo que produce un validador, o cómo se describe, y las formas de construir un objeto a partir de otro. En el registro, sirven para leer como `Date` el momento en que vence una invitación, marcar el id de un usuario para que ninguna otra cadena pase por uno, y derivar la actualización de una cuenta a partir de la forma que crea la cuenta.

## `pipe`

`pipe(a, b, ...)` ejecuta validadores en orden. Cada uno recibe el valor que produjo el anterior, y `pipe` produce lo que produce el último:

```ts
import { coerceNumber, email, pipe, string } from "@codenhub/validation";

const address = pipe(string({ trim: true, max: 254 }), email());
const age = pipe(string({ trim: true }), coerceNumber({ int: true, min: 13 }));
```

El primer fallo lo detiene, porque un paso posterior no tiene nada válido con qué trabajar. Úsalo para limpiar un valor antes de verificar un formato, o para verificar una regla después de otra.

Su tipo de entrada es el tipo de entrada de su primer validador.

## `transform`

`transform(validator, convert)` convierte el valor que produjo un validador en otro, como un texto en su longitud:

```ts
import { string, transform } from "@codenhub/validation";

const length = transform(string(), (text) => text.length);

length("Ada"); // { ok: true, value: 3 }
```

- `convert` se ejecuta solo cuando `validator` tuvo éxito, y no puede rechazar el valor. Para rechazar lo que produjo, coloca después un validador con verificaciones usando `pipe`. Una conversión que puede fallar es un validador en sí misma, como muestra [Validadores personalizados](./custom-validators.md#una-conversión-que-puede-fallar).
- Un `convert` que lanza una excepción es un bug, y la excepción se propaga.
- Un `transform` va en un solo sentido. [`encode`](#encode) no puede volver a escribir su valor, y lanza una excepción que indica dónde está. Donde un valor deba volver, usa un [`codec`](#codec).

Un `convert` que devuelve una promesa hace que el resultado sea asíncrono. Lo mismo ocurre con uno tipado como que puede devolver una, incluido uno tipado como que devuelve `unknown`. Y lo mismo con cualquier valor que tenga un método `then`, ya que `await` lo trataría como una promesa, quisiera serlo o no. Envuelve ese valor en un objeto antes de devolverlo.

Un `convert` tipado como que devuelve `any`, como `JSON.parse`, renunció a la verificación de tipos, y se tipa como síncrono. Así, `transform(string(), JSON.parse)` no necesita `await`. Si puede devolver una promesa, indícalo en su tipo de retorno.

## `codec`

`codec(input, output, { decode, encode })` lee un valor en la forma en que se envía, devuelve el valor que usa un programa y puede volver a escribirlo. Valida con `input`, le pasa lo que eso produjo a `decode` y valida el resultado con `output`. Así se verifican ambos extremos:

```ts
import { bigint, codec, date, datetime, pattern, string } from "@codenhub/validation";

const expiresAt = codec(datetime(), date(), {
  decode: (text) => new Date(text),
  encode: (value) => value.toISOString(),
});

// La entrada acepta solo el texto que BigInt lee, así que decode nunca lanza una excepción.
const amount = codec(string({ max: 40 }, pattern(/^-?\d+$/)), bigint(), {
  decode: (text) => BigInt(text),
  encode: (value) => value.toString(),
});
```

- `decode` recibe lo que produjo `input` y devuelve lo que valida `output`. `encode` recibe lo que produjo `output` y devuelve lo que valida `input`. Cada una está tipada así, y `Conversions<typeof input, typeof output>` es el tipo del par.
- Una función que lanza una excepción es un bug y se propaga, como la función de un `transform`. Para fallar, devuelve un valor que el otro validador rechace: un `decode` que da un `Date` inválido falla en `date()`. O haz que `input` acepte solo lo que `decode` puede leer, como hace `amount`, ya que `BigInt` lanza una excepción con cualquier otro texto.
- Ambas son síncronas. Una que devuelve una promesa lanza un `TypeError` cuando se llama, ya que el codec está tipado como que no espera. Una regla que espera va en una verificación.
- Se escribe como JSON Schema como su `input`, o como su `output` con `io: "output"`. Una salida que JSON Schema no puede expresar, como el `Date` de `expiresAt`, lanza una excepción en ese punto, a menos que se pase `unrepresentable: "any"`, como explica [JSON Schema](./json-schema.md).

## `encode`

`encode(validator, value)` vuelve a escribir un valor del tipo que produce un validador en lo que el validador acepta: el `Date` que leyó un `codec`, de vuelta a su texto; un objeto de ellos, de vuelta a un objeto de textos; y lo que `json` analizó, de vuelta a JSON. Devuelve un resultado, como un validador:

```ts
import { codec, date, datetime, encode, object, string } from "@codenhub/validation";

const expiresAt = codec(datetime(), date(), {
  decode: (text) => new Date(text),
  encode: (value) => value.toISOString(),
});
const invitation = object({ code: string(), expiresAt });

encode(invitation, { code: "AB12", expiresAt: new Date(0) });
// { ok: true, value: { code: "AB12", expiresAt: "1970-01-01T00:00:00.000Z" } }
```

`Encoded<typeof validator>` es el tipo de lo que devuelve: un resultado, que hay que esperar con `await` cuando el validador es asíncrono. Cada tipo de parte se vuelve a escribir a su manera:

- **Un `codec`** primero vuelve a escribir el valor a través de su `output`. Un codec dentro de la salida escribe su parte primero. Una salida escrita a mano verifica el valor y lo pasa sin cambios. Luego el codec ejecuta su `encode` sobre el resultado y verifica que su `input` acepte lo que eso devuelve.
- **Una parte que produce lo que acepta**, como `string`, `number`, un formato o una conversión, valida el valor y da lo que produjo. `email()` da la dirección tal como la lee el parser, y `coerceNumber()` da el número, que acepta.
- **Un compositor**, como `object`, `array`, `tuple`, `record`, `map`, `set`, `union` o `tagged`, vuelve a escribir cada una de sus partes con sus propias opciones, y ejecuta sus verificaciones sobre el valor una vez que sus partes pasaron. `optional`, `nullable` y `nullish` conservan lo que dejan pasar, y un `pipe` vuelve a escribir sus pasos empezando por el último.
- **`json` y `searchParams`** escriben texto: el `JSON.stringify` de lo que su validador volvió a escribir, y una query string con cada valor como texto y cada elemento de una lista como una clave repetida. Luego, el validador del que proviene vuelve a leer el texto, así que falla el texto que rechazaría: una lista escrita como clave repetida, que `searchParams` lee solo con `repeated: true`, y `undefined`, que no es JSON. Lo que `JSON.stringify` cambia queda cambiado: `NaN` se escribe como `null`, y una propiedad que es `undefined` se omite.
- **`optional` con un valor predeterminado** vuelve a escribir el valor predeterminado como `undefined` cuando su parte interna lo rechaza, ya que solo `undefined` lo produjo: `optional(string({ min: 3 }), "")` vuelve a escribir `""` como `undefined`. Un valor predeterminado creado por una función no se puede comparar. Un valor de `fallback` que su parte interna rechaza falla, ya que lo produce cualquier entrada que su parte interna rechace, y no se sabe cuál se pasó.

**Lo que no puede volver lanza** un `TypeError` que indica su lugar, como en `TypeError: encode cannot write back a transform at the root. Use a codec there`. Eso es un `transform`, cuya función va en un solo sentido, un validador escrito a mano y un `codec` con un `transform` en su salida. `formData` también se rechaza.

Así, un valor que el validador no pudo haber producido falla con los problemas que tiene, en sus rutas: `encode(expiresAt, new Date(Number.NaN))` falla como fallaría `date()`.

- Es síncrono a menos que una parte espere.
- Una conversión vuelve a escribir el valor que produjo, que acepta. Así, dentro de `json`, un `bigint` de `coerceBigint()` no se puede escribir como JSON, y lanza un `TypeError` que indica su lugar. Usa un codec que lo escriba como texto, como hace `amount` más arriba.
- En cada llamada, construye un validador de cada parte del esquema en el sentido contrario, con las mismas fábricas. Así, un programa que lo llama empaqueta todos los compositores.

## `brand`

`brand(validator, name)` marca con un nombre lo que produce un validador, solo en los tipos. TypeScript trata dos tipos de la misma forma como uno solo, así que una función que recibe un `string` al que llama id de usuario también recibe un email, un token de sesión o el texto de una página 404. Con una marca, la única forma de obtener un valor del tipo es a través del validador:

```ts
import { brand, uuid, type Infer } from "@codenhub/validation";

const userId = brand(uuid(), "UserId");
type UserId = Infer<typeof userId>;

declare function loadUser(id: UserId): Promise<unknown>;

const result = userId(input);
if (result.ok) {
  await loadUser(result.value);
}
// loadUser("not validated") es un error de compilación
```

- Nada cambia en tiempo de ejecución. `brand` devuelve el validador que recibió, así que valida, se describe y se escribe como JSON Schema igual que antes. `pick` y sus parientes siguen leyendo un `object` con marca.
- El tipo de entrada no se marca, ya que lo que se le pasa a un validador todavía no lo ha pasado.
- `null` y `undefined` quedan sin marcar, así que `brand(optional(string()), "Id")` produce una cadena marcada o `undefined`.
- Las marcas se suman, así que `brand(brand(string(), "A"), "B")` produce un tipo con ambas.
- `Branded<T, "Name">` es el tipo marcado, para cuando necesites escribirlo.

## `readonly`

`readonly(validator)` hace que lo que produce un validador sea de solo lectura: en su tipo, y congelando el objeto o el array. `ReadonlyOutput<T>` es el tipo que da.

```ts
import { array, object, readonly, string, type Infer } from "@codenhub/validation";

const settings = readonly(object({ theme: string(), tags: readonly(array(string())) }));
type Settings = Infer<typeof settings>; // { readonly theme: string; readonly tags: readonly string[] }
```

- Congela el valor en sí y no lo que hay dentro, como hace `Object.freeze` y como dice el tipo. Envuelve también un validador interno donde su valor no deba cambiar, como `tags` más arriba.
- Un valor que es la propia entrada nunca se congela, ya que le pertenece a quien llama. `instanceOf`, `guard` y `unknown` producen lo que recibieron, así que `readonly` cambia solo su tipo. `object`, `objectLike`, `array`, `tuple`, `record`, `set` y `map` producen un valor nuevo, que se congela.
- Un `Map` o un `Set` se tipa como `ReadonlyMap` o `ReadonlySet`, y solo el tipo lo protege: congelarlo no impide `set` ni `add`, que es lo que JavaScript entiende por congelado. Un typed array no se puede congelar, y queda sin congelar, al igual que un `DataView`. El tipo cubre propiedades y no métodos, así que un `Date` conserva sus setters.
- Un valor cuenta como de quien llama solo cuando es la propia entrada. Cuando un `transform` devuelve un valor de dentro de la entrada, como `(value) => value.tags`, ese valor se congela. Cópialo ahí cuando quien llama deba poder seguir modificándolo. Lo mismo vale para un objeto que devuelva de tus propios datos: `readonly(transform(string(), (key) => cache[key]))` congela la entrada en `cache`, así que devuelve una copia ahí también.
- `pick`, `omit`, `required` y `partial` leen un `object`, así que primero cambia la forma y después envuelve: `readonly(pick(user, ["name"]))`.

## `meta`

`meta(validator, { title, description, examples, deprecated })` dice para qué sirve un validador a quien lea el esquema: una persona que lee la documentación de una API, o un modelo de lenguaje que elige una herramienta y completa sus argumentos. [`toJsonSchema`](./json-schema.md#decir-para-qué-sirve-un-valor) escribe cada clave junto a los tipos, con el nombre que JSON Schema tiene para ella. `Meta` es el tipo del segundo argumento.

```ts
import { meta, number, object, string } from "@codenhub/validation";

const forecast = meta(
  object({
    city: meta(string({ min: 1 }), { description: "The city to get the weather for", examples: ["Lisbon"] }),
    days: meta(number({ int: true, min: 1, max: 7 }), { description: "How many days ahead" }),
  }),
  { title: "Forecast", description: "The weather for the coming days" },
);
```

- Devuelve un validador nuevo que valida exactamente como el que recibió. Su descripción es la del que recibió, con `meta` agregado. El validador recibido no cambia, así que el mismo puede describirse de forma distinta en dos lugares.
- Un `meta` aplicado a un validador que ya tiene uno reemplaza las claves que nombra y conserva las demás. Una clave pasada como `undefined` cuenta como no pasada.
- `title` y `description` son texto. `examples` es una lista de valores JSON: `null`, booleanos, números finitos, texto, y listas y objetos planos de ellos. `deprecated` es `true` o `false`. Cualquier otro valor, o cualquier otra clave, es un `TypeError` cuando se crea el validador.
- Un JSON Schema es JSON, así que un ejemplo de un `Date` se escribe como su texto. Los ejemplos se conservan tal como se pasaron y no se validan, ya que pueden mostrar la entrada o la salida.
- `pick`, `omit`, `required`, `partial` y `extend` leen a través de él hasta el objeto que describe. Lo que crean no tiene `meta`, ya que un título escrito para un objeto rara vez sirve para otro: dale uno propio.
- Lo que creó `standard` sigue siendo un Standard Schema bajo `meta`.

## `fallback`

`fallback(validator, value)` reemplaza un valor que falla en `validator` por un valor de respaldo, así que el resultado nunca falla:

```ts
import { fallback, oneOf } from "@codenhub/validation";

const theme = fallback(oneOf(["light", "dark"]), "light");

theme("purple"); // { ok: true, value: "light" }
```

Esto convierte una entrada mala en un valor que parece válido. Resérvalo para datos en los que un valor predeterminado sensato es más seguro que un error, como una preferencia guardada que puede estar desactualizada.

- El valor de respaldo es de confianza y no se valida.
- Una función se llama con los problemas encontrados, que es el lugar para registrarlos. Así, un valor de respaldo que es en sí una función se devuelve desde otra: `fallback(validator, () => callback)`. Los tipos rechazan el propio callback siempre que el validador interno pueda producir una función. Por la misma razón, una función que lee un argumento, como `Array` o `String`, recibiría los problemas: escribe `() => []`, no `Array`.
- Un primitivo se usa directamente. Un array o un objeto debe venir de una función, como `fallback(array(string()), () => [])`. Un único valor sería compartido por todos los resultados, y un cambio en uno aparecería en el siguiente. Los tipos lo rechazan, y `fallback` lanza un `TypeError` cuando se crea desde JavaScript.
- Un valor cuya validación `lazy` detuvo en uno de sus límites, como una entrada cíclica o una entrada anidada más allá de `maxDepth`, también falla, así que se reemplaza como cualquier otro fallo. Cuando esos límites deban reportarse, no uses `fallback` en un esquema recursivo.

Su tipo de entrada es `unknown`, ya que acepta cualquier cosa.

## Reutilizar formas

### Expandir una forma

Una forma es un objeto común, así que se reutiliza con JavaScript común. Expande una dentro de otra con spread para extenderla, y omite claves con desestructuración. `partial(shape)` devuelve una forma nueva con cada propiedad envuelta en `optional`, para una actualización en la que se puede omitir cualquier campo:

```ts
import { email, number, object, partial, string } from "@codenhub/validation";

const account = { name: string({ trim: true, min: 2, max: 100 }), email: email() };

const createAccount = object(account);
const updateAccount = object(partial(account)); // todas las propiedades opcionales
const withAge = object({ ...account, age: number({ int: true, min: 13 }) });
```

- La forma original no cambia, así que la versión con campos obligatorios sigue disponible.
- Una propiedad omitida sigue omitida. Así, un valor predeterminado dado con `optional(validator, value)` en la forma no se aplica en su versión `partial`: una actualización omite lo que no cambia.
- Una forma contiene solo claves de texto enumerables. `object`, `partial` y `tagged` lanzan un `TypeError` cuando se crean con una clave de símbolo o una clave no enumerable, ya que su validador nunca se ejecutaría.

`PartialShape<TShape>` es el tipo que devuelve `partial(shape)`.

### `pick`, `omit`, `required`, `partial` y `extend`

Cuando lo que tienes es el validador y no su forma, como uno que exporta otro módulo, estas funciones reciben el validador. Cada una recibe un validador creado por `object` y devuelve uno nuevo. El que recibió no cambia:

```ts
import { boolean, email, extend, number, object, omit, optional, partial, pick, required, string } from "@codenhub/validation";

const user = object({ id: number(), name: string({ min: 2 }), email: email(), bio: optional(string()) });

const contact = pick(user, ["name", "email"]); // { name: string; email: string }
const draft = omit(user, ["id"]); // todo menos el id
const patch = partial(user); // todas las propiedades opcionales
const complete = required(user); // bio también es obligatorio
const admin = extend(user, { admin: boolean() }); // todas las propiedades de user, y admin
```

- `pick(validator, keys)` conserva las propiedades nombradas, y `omit(validator, keys)` las omite. Una clave que el objeto no tiene es un `TypeError` cuando se crea el validador, ya que es un error de escritura.
- `partial(validator)` envuelve cada propiedad en `optional`, como hace `partial(shape)`.
- `extend(validator, shape)` agrega las propiedades de `shape`, como al expandir una forma dentro de otra. Una propiedad que el objeto ya tiene se reemplaza por la que se pasó, en su lugar.
- `required(validator)` hace obligatoria cada propiedad. Una propiedad creada con `optional` pasa a ser el validador que envolvía, así que también se quita su valor predeterminado, y una propiedad ausente falla. Una creada con `nullish` pasa a ser `nullable`, que sigue aceptando `null`. Una propiedad que acepta `undefined` de otra forma, como `unknown()`, se conserva sin cambios.

El objeto nuevo conserva las opciones del que proviene, `unknownKeys` y `message`. Recibe opciones y verificaciones propias después de sus argumentos, como `object`: `pick(user, ["name"], { unknownKeys: "strict" }, check(...))`.

- Cada opción pasada reemplaza la de su mismo nombre y deja las demás. Así, un objeto estricto del que se toman propiedades pasando solo un `message` sigue siendo estricto.
- Una opción pasada como `undefined` cuenta como no pasada, y conserva la del original. Así, `pick(strictUser, ["name"], { unknownKeys: undefined })` sigue siendo estricto.
- Un validador pasado como `unknownKeys` también se conserva. Así, una propiedad que `pick` u `omit` deja fuera va a él cuando la entrada la tiene, como cualquier otra clave que la forma nueva no incluye.

Un objeto con verificaciones se rechaza con un `TypeError`. Una verificación lee el objeto entero, así que puede leer una propiedad que le falta al objeto nuevo. Si se conservara, podría hacer fallar todos los valores. Si se descartara sin aviso, el objeto nuevo aceptaría lo que el primero se escribió para rechazar. Crea el objeto sin sus verificaciones, deriva a partir de ese y dale a cada resultado las verificaciones que necesita.

Necesitan un validador creado por `object`, ya que así conocen su forma. `objectLike`, un `pipe` o un `transform` alrededor de un objeto, y un validador escrito a mano, son un `TypeError`. Leen la forma a través de [`describe`](./json-schema.md#leer-un-esquema), que es como escribirías una función así por tu cuenta.

Los tipos que devuelven tienen nombre, para una biblioteca que exporta lo que deriva:

- `Picked<T, K>` y `Omitted<T, K>`: el tipo del objeto solo con las propiedades nombradas, o sin ellas.
- `AllOptional<T>` y `AllRequired<T>`: el tipo del objeto con todas las propiedades opcionales, o con todas presentes y ninguna `undefined`. Una propiedad de tipo `unknown` o `any` sigue admitiendo `undefined`, como `required` conserva sin cambios una propiedad `unknown()`.
- `Extended<T, TShape>`: el tipo de objeto `T` con las propiedades de `TShape` agregadas o reemplazadas.
- `Reshaped<TValidator, T, TInput?>`: un validador de `T` que es síncrono cuando lo es el validador del que se creó.

## Siguiente

Un validador creado con estas herramientas sigue siendo un solo validador, así que las bibliotecas que reciben un esquema lo reciben directamente. [Standard Schema](./standard-schema.md) explica cómo.
