---
title: Cuerpos de solicitud
description: Texto JSON, listas, tuplas, diccionarios, sets y maps, elegir entre formas, y datos recursivos.
order: 3
source: 65bf294a1b14a3d7ace2b4c620bd9494786c3beb
---

# Cuerpos de solicitud

Un servidor recibe lo que cualquier cliente haya decidido enviar. Esta página cubre las formas que un cuerpo de solicitud contiene más allá de un objeto plano de un solo nivel: texto JSON, listas, diccionarios, elegir entre formas y datos que se anidan dentro de sí mismos. La API de registro recibe una lista de intereses, una referencia que puede tener dos formas y un cuerpo que todavía es texto JSON.

## Texto JSON

`json(validator?, options?, ...checks)` acepta texto que contiene JSON, lo parsea y le pasa el valor parseado a `validator`:

```ts
import { array, email, json, object, pipe, string, unique } from "@codenhub/validation";

const signupBody = pipe(
  string({ max: 100_000 }),
  json(
    object({
      name: string({ trim: true, min: 2, max: 100 }),
      email: email(),
      interests: array(string({ max: 50 }), { max: 10 }, unique()),
    }),
  ),
);

signupBody('{"name":"Ada","email":"ada@example.com","interests":["math"]}'); // ok
signupBody("{"); // { ok: false, ... }, código "invalid_format"
```

- Un valor que no es una cadena falla con `invalid_type`, y un texto que no es JSON falla con `invalid_format` y `{ format: "json" }`.
- Sin un validador, el resultado es `unknown`.
- Las rutas de los problemas que reporta `validator` son relativas al valor parseado.
- Una función en la primera posición es el validador, así que las verificaciones necesitan uno: `json(object(shape), {}, check(...))`.
- Cualquier otra cosa en la primera posición que no sean opciones lanza un `TypeError` al crearse, incluido `undefined`. Así, un validador que falta, como uno leído de una clave que no existe, nunca produce un `json` que acepte cualquier JSON.

El texto lo parsea `JSON.parse`, así que se aplican dos de sus reglas:

- Una clave que aparece dos veces conserva su último valor: `{"a":1,"a":2}` da `{ a: 2 }`.
- Un número que excede lo que un double representa con exactitud pierde dígitos: `12345678901234567890` se convierte en `12345678901234567000`. Envía esos números como cadenas y léelos con `coerceBigint`.

El `string({ max: 100_000 })` del principio limita el texto antes de parsearlo. [Límites](./limits.md) explica por qué un cuerpo necesita un límite como ese.

## Listas y otras colecciones

Todo validador de colección recibe el validador de sus elementos y luego las opciones y las verificaciones. Verifica cada elemento y reporta cada problema con una ruta que pasa por la posición del elemento.

Las opciones de tamaño son `min`, `max` y `length`, todas enteros no negativos, y `min` y `max` son inclusivos:

- Un fallo de tamaño es `too_small` con `{ minimum, type }` o `too_big` con `{ maximum, type }`, donde `type` es `"array"`, `"set"`, `"map"` o `"record"`. Para `length` se agrega `exact: true`.
- Un tamaño incorrecto se reporta de inmediato, sin validar los elementos, así que los elementos de una entrada enorme nunca se validan solo para rechazarla. Un `record` igual lista las claves de la entrada, para contarlas.
- Un tamaño que no es un número, como `"3"`, lanza un `TypeError` al crear el validador. Un número que no es un entero no negativo lanza un `RangeError`, y lo mismo ocurre con límites que ningún tamaño puede cumplir a la vez, como un `min` mayor que `max`, o un `length` fuera de ellos.

Una colección también se detiene cuando sus elementos ya reportaron 1000 problemas. [Límites](./limits.md#una-entrada-que-falla-tiene-un-costo-acotado) explica ese límite.

### `array`

`array(item, options?, ...checks)` acepta arrays en los que cada elemento pasa `item`, y produce un array nuevo con lo que produjo `item`. Recibe `min`, `max` y `length`.

Los huecos de un array disperso se validan como `undefined`, así que el trabajo crece con el `length` del array, no con los elementos que contiene. Ponle un `max` a la entrada no confiable; se comprueba antes que cualquier elemento.

La verificación `unique(by?, message?)` rechaza los repetidos:

```ts
import { array, string, unique } from "@codenhub/validation";

const interests = array(string({ trim: true, min: 1, max: 50 }), { max: 10 }, unique());

interests(["math", "music"]); // ok
interests(["math", "math"]); // { ok: false, ... }, código "invalid_value"
```

- Compara los elementos validados como lo hace un `Set`, o bien la clave que `by` devuelve para cada elemento: `unique((user) => user.id)` hace que los ids sean únicos.
- Cada repetido se reporta en su propio índice, como `invalid_value` con `{ unique: true }`, y se conserva la primera aparición.
- Como toda verificación, se ejecuta solo cuando todos los elementos son válidos.
- Un `Set` considera iguales dos objetos solo cuando son el mismo objeto. Cada objeto o lista que produce un compositor como `object` o `array` es nuevo, y dos `Date` del mismo instante son dos objetos. Así que, sin `by`, `unique()` no encontraría ningún repetido entre ellos. Sus tipos lo aceptan solo para un array de primitivos; un array de objetos, listas o fechas necesita `by`, como `unique((day) => day.getTime())`.

### `tuple`

`tuple(items, options?)` acepta un array de longitud fija en el que cada posición tiene su propio validador, y produce un tipo tupla:

```ts
import { number, string, tuple } from "@codenhub/validation";

const point = tuple([number(), number()]); // [number, number]
const call = tuple([string()], { rest: number(), max: 10 }); // [string, ...number[]], como máximo 10 elementos
```

- Sin `rest`, el array debe tener exactamente la longitud de `items`. Una longitud incorrecta falla con `too_small` y `{ minimum, type: "array", exact: true }`, o con `too_big` y `{ maximum, type: "array", exact: true }`.
- La opción `rest` es un validador para cada posición después de las fijas, así que el array puede ser más largo. Aun así debe tener al menos tantos elementos como `items`, y falla con `too_small`, sin `exact`, cuando tiene menos.
- `max` solo se permite con `rest`, y limita la longitud total, incluidos los elementos fijos. Un array más largo falla de inmediato con `too_big` y `{ maximum, type: "array" }`, sin validar los elementos. Ponle un `max` a la entrada no confiable, como harías con un `array`.

### `record`

`record(key, value, options?)` acepta un objeto plano usado como diccionario: cualquier cantidad de claves, cada una de las cuales pasa `key`, y cada valor pasa `value`.

```ts
import { number, oneOf, record, string } from "@codenhub/validation";

const scores = record(string({ max: 50 }), number(), { max: 100 });
const hours = record(oneOf(["mon", "tue"]), number()); // { mon?: number; tue?: number }
```

- La ruta de un problema termina en la clave a la que pertenece.
- Una clave que falla se reporta como un problema `invalid_key`, cuyo `params.issues` contiene lo que encontró el validador de claves, para que no se confunda con un problema del valor. El valor de una clave inválida se verifica de todos modos.
- Una clave que el validador de claves modifica, por ejemplo al pasarla a minúsculas, debe seguir siendo distinta. `{ A: 1, a: 2 }` con `string({ case: "lower" })` reporta la segunda clave como `invalid_key` con un problema `invalid_value` dentro, `{ unique: true }`, en lugar de descartar un valor.
- El tipo de salida tiene todas las claves cuando `key` produce `string`, y es parcial cuando `key` produce un conjunto fijo de cadenas, como `oneOf(["mon", "tue"])`.
- Una clave `__proto__`, que un JSON parseado puede contener, se reporta como `invalid_key`, con un problema `invalid_value` dentro, `{ reserved: true }`. Esto vale tanto si la entrada tiene la clave como si la produce el validador de claves. Si se conservara, se convertiría en el prototipo de cualquier copia de la salida hecha por asignación, como `Object.assign({}, output)`.
- `min`, `max` y `length` cuentan claves, así que `record(string(), number(), { max: 100 })` rechaza un diccionario de más de 100 claves antes de verificar cualquiera de ellas.

### `set` y `map`

`set(item, options?)` acepta un `Set` y produce un `Set` nuevo con los valores validados. `map(key, value, options?)` acepta un `Map` y produce un `Map` nuevo. Ninguno de los dos acepta arrays ni objetos planos. Ambos reciben `min`, `max` y `length`.

- En un set, la ruta pasa por la posición del valor, en orden de iteración.
- En un map, la ruta pasa por la clave de la entrada cuando la clave es una cadena, y por su posición, un número, para cualquier otra clave. Así, una clave numérica y una clave de objeto nunca comparten ruta.
- Una clave de map que falla se reporta como `invalid_key`, igual que en `record`. Lo mismo ocurre con una clave que, después de que el validador de claves la modificó, ya tiene otra entrada.
- Un valor de set que `item` vuelve igual a uno anterior, como `"A"` y `"a"` con `string({ case: "lower" })`, se reporta como `invalid_value` con `{ unique: true }` en su posición, en lugar de fusionarse. Así, la salida nunca tiene menos valores de los que permiten las opciones de tamaño.

## Elegir entre formas

### `union`

`union(options)` acepta un valor que pasa cualquiera de varios validadores, y produce lo que produjo el primero que lo acepta. Así que pon primero las opciones más específicas:

```ts
import { coerceNumber, number, string, union } from "@codenhub/validation";

const id = union([string({ min: 1 }), number({ int: true })]);

union([coerceNumber(), string()])("5"); // { ok: true, value: 5 }
union([string(), coerceNumber()])("5"); // { ok: true, value: "5" }
```

Un valor que ninguna opción acepta falla con un único problema `invalid_union` en la ruta del propio valor. Su `params.issues` enumera, para cada opción en orden, los problemas que esa opción encontró, con rutas relativas al valor que recibió la unión.

- Una unión que falló dentro de una opción, como una para una propiedad de una opción objeto, aparece con su código y su ruta, sin los problemas de sus propias opciones. [Los problemas detrás de un problema](./errors.md#los-problemas-detrás-de-un-problema) explica por qué. Para ver esos problemas, llama a la unión interna con el valor.
- Cada opción se ejecuta hasta que una acepta el valor. Así que, en una unión recursiva de objetos, todas las opciones llegan a los hijos. Usa `tagged` para objetos que se distinguen por una propiedad: valida solo la variante que corresponde.
- Si un límite de `lazy` detuvo la validación, se conserva, como explica [Límites](./limits.md#datos-recursivos).

### `tagged`

`tagged(key, variants, options?, ...checks)` es para objetos que comparten una propiedad de etiqueta y difieren en el resto, como eventos con un `type`. Recibe el nombre de la propiedad de etiqueta y un record con un validador para cada valor de la etiqueta. La etiqueta de la entrada elige la variante, y la variante valida el resto de la entrada. Un fallo reporta los problemas de esa variante, no una lista de todo lo que no coincidió.

El registro acepta una referencia de un amigo o de una campaña:

```ts
import { email, object, string, tagged, type Infer } from "@codenhub/validation";

const referral = tagged("source", {
  friend: object({ email: email() }),
  campaign: object({ code: string({ min: 3, max: 20 }) }),
});

type Referral = Infer<typeof referral>;
// { source: "friend"; email: string } | { source: "campaign"; code: string }

referral({ source: "campaign", code: "SPRING" }); // { ok: true, value: { source: "campaign", code: "SPRING" } }
referral({ source: "ad" }); // { ok: false, ... }, código "invalid_union"
```

**Una variante no debe incluir la etiqueta.** En otras bibliotecas, cada variante se escribe `object({ source: literal("friend"), ... })`. Aquí una variante recibe la entrada sin su etiqueta, así que una variante que incluye la etiqueta nunca podría pasar. Su tipo se rechaza, así que el error es un error de compilación en esa variante. La clave del record ya dice para qué etiqueta es la variante.

Como una variante nunca ve la etiqueta:

- Un `object` estricto funciona como variante, y también un `record`, que verifica todas las claves excepto la etiqueta.
- Una salida que declara la etiqueta junto a una firma de índice se rechaza igual, porque la variante nunca la recibe.
- El tipo de una variante `record` tiene una firma de índice junto a la etiqueta. Leerlo y acotar el tipo por la etiqueta funcionan, pero TypeScript rechaza escribir un objeto así a mano cuando la etiqueta no es del tipo de valor del record.

La etiqueta se vuelve a agregar a la salida, así que el resultado es una unión etiquetada como corresponde, y comprobar `referral.source` acota el tipo. Una etiqueta ausente, desconocida o que no es una cadena falla con `invalid_union` en la ruta de la etiqueta, con `params: { discriminator, options }` enumerando las etiquetas aceptadas.

Cada variante debe producir un objeto plano, ya que eso es lo que puede llevar la etiqueta. Una variante tipada para producir un array o una función es un error de compilación. Una variante que en tiempo de ejecución produce cualquier otro valor que no sea un objeto plano, como un `Date` o una instancia de clase salida de un `transform`, lanza un `TypeError` que nombra la variante, ya que es un error en el esquema. `tagged` lee la etiqueta solo de un objeto plano, así que rechaza una instancia de clase antes de que la vea cualquier variante. Para elegir entre instancias, pon validadores `objectLike` en una `union`.

### `intersection`

`intersection(left, right)` acepta un valor solo cuando pasa ambos validadores. Reporta juntos los problemas de los dos, y produce las dos salidas fusionadas:

- Los objetos planos se fusionan clave por clave, y los arrays de la misma longitud elemento por elemento, de forma recursiva.
- Dos `Map` o dos `Set` del mismo tamaño se fusionan entrada por entrada en orden de iteración, que ambos validadores conservan de la entrada. Así, también se fusiona un map con claves de objeto o un set de objetos. Un conflicto dentro de uno de ellos se reporta en la clave de la entrada cuando es una cadena, y si no, en su posición.
- Los objetos cíclicos o compartidos en las salidas se fusionan una sola vez, y la salida fusionada conserva su forma.
- Cualquier otro par debe ser el mismo valor (`0` y `-0` se fusionan como `0`) o dos fechas del mismo instante.

Donde las salidas difieren de cualquier otra forma, como `"  ab "` cuando un lado le quita los espacios y el otro lo pasa a mayúsculas, ningún valor satisface a ambos. Cada uno de esos lugares falla con `invalid_intersection` en su ruta, en lugar de que un lado gane sin avisar.

El objeto fusionado es nuevo. Así que una clave `__proto__` propia que un lado dejó pasar sin verificar, como hace `unknown()`, se reporta como `invalid_key` con un problema dentro, `{ reserved: true }`, igual que la reporta `record`. Si la forma de alguno de los lados incluye `__proto__` en ese lugar, la conserva, pero solo si esa forma produjo el valor ahí. No lo produjo una forma que un `transform` ejecuta antes de su función, ni una en un paso de `pipe` seguido de un paso que crea un objeto nuevo, ni el validador de claves de una entrada de `map`, para el valor de esa entrada. Un valor que ambos lados dejaron pasar entero, por ejemplo con `unknown()` en los dos, es el propio objeto de la entrada, y se conserva sin cambios.

Ambos validadores ven la entrada completa, así que dos `object` con `unknownKeys: "strict"` solo pasan juntos cuando cada clave de la entrada está incluida en ambas formas: cada uno rechaza las claves que solo incluye el otro. Para combinar formas estrictas, expándelas en una sola: `object({ ...named, ...aged }, { unknownKeys: "strict" })`.

## Datos recursivos

`lazy(getter, options?, ...checks)` busca otro validador la primera vez que se ejecuta, así que un validador puede referirse a sí mismo. TypeScript no puede inferir un tipo que se refiere a sí mismo, así que anota la variable con el tipo que produce:

```ts
import { array, lazy, object, string, type Validator } from "@codenhub/validation";

interface Category {
  name: string;
  children: Category[];
}

const category: Validator<Category> = object({
  name: string({ max: 100 }),
  children: array(
    lazy(() => category),
    { max: 50 },
  ),
});

category({ name: "Science", children: [{ name: "Math", children: [] }] }); // ok
```

Una entrada recursiva puede ser lo bastante profunda como para desbordar la pila, o lo bastante ancha como para que el trabajo crezca más rápido que la entrada. `lazy` tiene dos límites para esos casos:

- `maxDepth`, 128 por defecto: la mayor cantidad de niveles de `lazy` que pueden estar abiertos a la vez. Una entrada más profunda falla con `too_big` y `{ maximum, type: "depth" }`.
- `maxCalls`, 10 000 por defecto: la mayor cantidad de llamadas que un `lazy` puede hacer en una validación. Pasado ese número, cada llamada falla con `too_big` y `{ maximum, type: "calls" }`.

Una entrada anidada a miles de niveles de profundidad, o un objeto cíclico, vuelve como uno de esos fallos y no lanza una excepción, siempre que `maxDepth` quepa en la pila. Un esquema con muchos validadores en cada nivel puede desbordar antes la pila de un worker, así que [baja `maxDepth`](./limits.md#maxdepth) para él en el worker. [Límites](./limits.md#datos-recursivos) explica ambos límites, cuándo cambiarlos y cómo construir un esquema recursivo para que se cumplan.

## Siguiente

El cuerpo de una solicitud es JSON, pero mucho de lo que lee un servidor es texto: una query string, una variable de entorno, un campo de formulario. [Entrada de texto](./text-input.md) lee números, flags y fechas a partir de texto.
