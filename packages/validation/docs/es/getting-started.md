---
title: Primeros pasos
description: Qué es un validador, cómo leer su resultado, y los validadores de cadenas, números, fechas, valores fijos y objetos.
order: 1
source: b482583c60e9a0302dfe5d4c19e9cbe7050dddff
---

# Primeros pasos

Esta página cubre la base sobre la que se apoyan todas las demás: cómo se crea y se llama un validador, qué devuelve, y los validadores de cada tipo básico de valor. Al terminarla puedes escribir la primera versión del registro: un objeto con un nombre, una dirección de correo y una contraseña, y el tipo de TypeScript que sale de él.

## Un validador es una función

Todo validador recibe cualquier entrada y devuelve un resultado. Creas un validador llamando a una función, con opciones si las quieres. Después llamas al validador con el valor:

```ts
import { number, string } from "@codenhub/validation";

const port = number({ int: true, min: 1, max: 65535 });

port(8080); // { ok: true, value: 8080 }
port(70000); // { ok: false, ... }, código "too_big"

string({ min: 3 })("ab"); // { ok: false, ... }
```

La primera línea se ejecuta una sola vez, cuando se carga el módulo, y te da una función que puedes reutilizar para cada valor. Para verificar un único valor una sola vez, haz las dos llamadas juntas: `number({ int: true })(input)`.

Como un validador no es más que una función, puedes pasar cualquier validador donde se espera otro, y puedes escribir los tuyos sin ninguna ayuda. [Validadores personalizados](./custom-validators.md) muestra cómo.

### El orden de los argumentos

Todo validador recibe sus argumentos en el mismo orden:

1. Sus propios argumentos, como la forma de un objeto o el validador de los elementos de un array.
2. Un objeto de opciones, como `{ min: 3 }`.
3. Cualquier cantidad de verificaciones, que son reglas para casos menos comunes, como `string({ min: 3 }, startsWith("a"))`.

Las opciones se pueden omitir cuando hay verificaciones: `string(startsWith("a"))`. Todo validador que reporta un problema propio también acepta una opción `message`, que se explica en [Problemas y mensajes](./errors.md#redactar-los-mensajes-de-un-validador).

### Los errores en las opciones lanzan una excepción de inmediato

Las opciones se leen una sola vez, cuando se crea el validador. Una opción sin sentido es un error de tu código, no de la entrada, así que la fábrica lanza un `RangeError` o un `TypeError` en ese momento, y el programa falla justo donde está el error:

- Un valor que ninguna entrada puede cumplir: una longitud negativa, un límite `NaN`, o límites que se contradicen, como `{ min: 5, max: 2 }`.
- Opciones que no son un objeto plano, como `string(/^a/)` cuando se quería `string(pattern(/^a/))`. Si se ignoraran, aceptarían cualquier cadena.
- Un hijo que no es una función, como `object({ name: undefined })` después de un import que no resolvió a nada. Todo compositor verifica los validadores y callbacks que recibe, y nombra el incorrecto.
- Un nombre de opción que el validador no conoce, como `string({ mni: 2 })`, que lanza `TypeError: Unknown option mni`. Si se ignorara, quedaría sin fijar el límite que debía fijar. TypeScript también reporta un nombre así, pero no en opciones leídas de una configuración, tipadas de forma laxa o escritas en JavaScript.

Una opción con valor `undefined` equivale a no pasarla. Así, un límite que puede faltar se puede pasar directamente: `string({ max: limit })`.

## Leer el resultado

Un resultado es uno de dos objetos planos, así que decides según `ok`:

```ts
import { email, formatIssue } from "@codenhub/validation";

const result = email()(input);

if (result.ok) {
  save(result.value); // tipado como string
} else {
  for (const issue of result.error.issues) {
    console.log(issue.path, formatIssue(issue));
  }
}
```

Cuando algo está mal, el validador reporta todos los problemas que encuentra, no solo el primero, así que un formulario puede mostrar todos sus errores a la vez. Cada problema tiene un `code` estable sobre el cual decidir, la `path` hasta el valor que falló, y unos `params` que describen qué estaba mal. [Problemas y mensajes](./errors.md) los describe en detalle.

### La entrada inválida no lanza excepciones

Una entrada inválida es un resultado esperado, no un bug, así que el validador la devuelve en el resultado. Si prefieres detener el programa, basta una línea: `if (!result.ok) throw new Error(...)`, o [`assert`](./errors.md#lanzar-una-excepción-ante-una-configuración-inválida), que redacta el mensaje por ti.

Un tipo de entrada todavía puede lanzar una excepción: la entrada que ejecuta código propio mientras se lee, como un getter o un trap de `Proxy` que lanza una excepción. Esa excepción se propaga, igual que una de tu propio callback. Los datos obtenidos de JSON no tienen ese código. Dos validadores se comportan distinto:

- [`objectLike`](#objetos-que-no-son-planos) reporta como problema una propiedad que no pudo leer.
- `instanceOf` rechaza el valor con `invalid_type` cuando el trap de prototipo del valor, o el `Symbol.hasInstance` de la clase, lanza una excepción.

### El valor puede diferir de la entrada

`result.value` es el valor después de que se ejecutó el validador, que no siempre es la entrada que le diste:

- Se aplica la limpieza que pediste, como `trim`, `case` o `clamp`.
- Un objeto descarta las propiedades que su forma no incluye.
- Un formato con varias escrituras de un mismo valor produce una de ellas. `email` y `url` producen lo que lee el parser de URL, como un dominio en minúsculas, y `phone` produce `+` y los dígitos.

Así, una verificación posterior sobre el valor ve lo mismo que verá un servidor de correo o una solicitud. La entrada en sí nunca se modifica.

## Cadenas

`string(options?)` acepta cadenas y produce una cadena. Cualquier otra cosa falla con `invalid_type`, que nombra el tipo recibido.

```ts
import { string } from "@codenhub/validation";

const name = string({ trim: true, min: 2, max: 100 });

name("  Ada  "); // { ok: true, value: "Ada" }
name("A"); // { ok: false, ... }, código "too_small"
```

| Opción    | Significado                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trim`    | Quita los espacios en blanco al inicio y al final, como hace `String.prototype.trim`, antes de que se apliquen las demás opciones y en la salida.                     |
| `case`    | `"lower"` o `"upper"`: convierte la cadena antes de que se apliquen las demás opciones y en la salida, con la correspondencia Unicode completa, igual en todo idioma. |
| `min`     | Al menos esta cantidad de caracteres.                                                                                                                                 |
| `max`     | Como máximo esta cantidad de caracteres.                                                                                                                              |
| `length`  | Exactamente esta cantidad de caracteres.                                                                                                                              |
| `message` | Redacción de los problemas que reporta por sí mismo.                                                                                                                  |

La limpieza siempre ocurre primero, y después cada opción y cada verificación ven la cadena ya limpia. Por eso `string({ trim: true, min: 1 })` rechaza una cadena de espacios. Algunos detalles:

- `trim` quita los espacios en blanco y los terminadores de línea de Unicode, así que un espacio de no separación desaparece. Un espacio de ancho cero (U+200B) no es un espacio en blanco y se queda, así que `string({ trim: true, min: 1 })` lo acepta. La verificación `nonBlank()` lo rechaza.
- `case` puede cambiar la longitud que ven las demás opciones: `ß` en mayúsculas es `SS`, e `İ` en minúsculas son dos unidades de código.
- Las longitudes cuentan unidades de código UTF-16, como hace `String.length`, así que un emoji puede contar como dos.

Cada opción que falla reporta su propio problema:

| Falla                  | `code`         | `params`                                   |
| ---------------------- | -------------- | ------------------------------------------ |
| No es una cadena       | `invalid_type` | `{ expected: "string", received }`         |
| Más corta que `min`    | `too_small`    | `{ minimum, type: "string" }`              |
| Más larga que `max`    | `too_big`      | `{ maximum, type: "string" }`              |
| Más corta que `length` | `too_small`    | `{ minimum, exact: true, type: "string" }` |
| Más larga que `length` | `too_big`      | `{ maximum, exact: true, type: "string" }` |

Las reglas menos comunes son verificaciones, que se pasan después de las opciones: `pattern`, `startsWith`, `endsWith`, `includes`, `nonBlank`, `lowercase` y `uppercase`. [Verificaciones](#verificaciones) las enumera.

```ts
import { pattern, string } from "@codenhub/validation";

const handle = string({ trim: true, min: 3, max: 30 }, pattern(/^[a-z0-9_]+$/));
```

## Números

`number(options?)` acepta números finitos y produce un número. `NaN`, los infinitos y cualquier otro tipo fallan con `invalid_type`. `-0` se acepta y se produce tal cual, ya que es un número en sí mismo.

```ts
import { number } from "@codenhub/validation";

const age = number({ int: true, min: 0, max: 130 });

age(42); // { ok: true, value: 42 }
age(1.5); // { ok: false, ... }, código "invalid_value"
```

| Opción       | Significado                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `clamp`      | `{ min, max }`: lleva un valor finito dentro del rango en lugar de rechazarlo, antes de que se apliquen las demás opciones. |
| `min`, `max` | Al menos o como máximo este valor, inclusive.                                                                               |
| `gt`, `lt`   | Estrictamente mayor o menor que este valor.                                                                                 |
| `int`        | Un número entero.                                                                                                           |
| `safeInt`    | Un número entero que un double representa con exactitud, es decir, dentro de `Number.MAX_SAFE_INTEGER`.                     |
| `message`    | Redacción de los problemas que reporta por sí mismo.                                                                        |

Positivo, negativo y sus variantes "no" son límites: positivo es `gt: 0`, no negativo es `min: 0`, negativo es `lt: 0` y no positivo es `max: 0`.

`clamp` sigue rechazando un infinito, como todo `number`, ya que un infinito suele indicar más bien una falla anterior en el programa que un valor que haya que ajustar al rango.

Los límites se verifican cuando se crea el validador:

- Un límite `NaN`, o límites que ningún número finito puede cumplir, como `{ min: 5, max: 2 }`, `{ gt: 1, lt: 1 }` o `{ min: Infinity }`, lanza un `RangeError`.
- Un límite que no es un número, o un `clamp` que no es un rango con `min` y `max` numéricos, lanza un `TypeError`.
- Un `clamp` lanza un `RangeError` ante un límite `NaN`, un mínimo de `Infinity`, un máximo de `-Infinity`, un mínimo mayor que su máximo, o un rango en el que todo valor incumple un límite, como `{ clamp: { min: 0, max: 10 }, min: 11 }`.

Los límites que admiten números pero ningún entero, como `{ int: true, gt: 1, lt: 2 }`, no se detectan, porque esa verificación agregaría tamaño a todo programa que use `number`. Un validador así rechaza toda entrada.

| Falla                      | `code`          | `params`                                         |
| -------------------------- | --------------- | ------------------------------------------------ |
| No es un número finito     | `invalid_type`  | `{ expected: "number", received }`               |
| Por debajo de `min` o `gt` | `too_small`     | `{ minimum, inclusive, type: "number" }`         |
| Por encima de `max` o `lt` | `too_big`       | `{ maximum, inclusive, type: "number" }`         |
| `int` o `safeInt`          | `invalid_value` | `{ type: "number", format: "int" \| "safeInt" }` |

`multipleOf(step)` y `nonZero()` son verificaciones: `number({ min: 0 }, multipleOf(0.01))`.

## Booleanos y símbolos

`boolean()` acepta `true` y `false` y produce un booleano. Los valores truthy y falsy, y un texto como `"true"`, fallan con `invalid_type` y `{ expected: "boolean", received }`. Para leer `"true"` de un formulario o de una variable de entorno, usa `coerceBoolean`, de [Entrada de texto](./text-input.md).

`symbol()` acepta símbolos y falla de la misma forma, con `expected: "symbol"`. Para aceptar un único símbolo, usa `literal`.

## Bigints

`bigint(options?)` acepta bigints y produce un bigint. Los números, incluidos los enteros, fallan con `invalid_type`.

Las opciones son bigints: `min` y `max` son inclusivos, y `gt` y `lt`, exclusivos. Fallan como los límites de un número: `too_small` con `{ minimum, inclusive, type: "bigint" }`, o `too_big` con `{ maximum, inclusive, type: "bigint" }`. Positivo es `gt: 0n`, no negativo es `min: 0n` y negativo es `lt: 0n`.

En `params`, un límite se escribe con sus dígitos decimales, `"10"` para `10n`, para que el problema se pueda enviar como JSON, que no puede contener un bigint. Para recuperarlo, usa `BigInt(params.minimum)`.

## Fechas

`date(options?)` acepta objetos `Date` válidos y produce el mismo `Date`. Una fecha inválida como `new Date("nope")`, una marca de tiempo o una cadena fallan con `invalid_type` y `{ expected: "valid date", received }`. Para verificar una fecha en texto, usa [`isoDate` o `datetime`](./formats.md#datetime-y-time). Para leer un `Date` de un texto, usa [`coerceDate`](./text-input.md).

Las opciones `min` y `max` son `Date`, ambas inclusivas:

- Un valor que no es un `Date`, como una cadena de fecha, lanza un `TypeError` cuando se crea el validador.
- Un `Date` inválido, o un `min` posterior a `max`, lanza un `RangeError`.
- Se leen cuando se crea el validador, así que modificar después los objetos `Date` no tiene efecto.

Una fecha anterior a `min` falla con `too_small` y `{ minimum, inclusive: true, type: "date" }`, y una posterior a `max`, con `too_big` y `{ maximum, inclusive: true, type: "date" }`. El límite en `params` es un `Date`.

## Valores fijos

`literal(value)` acepta exactamente un valor, comparado con `===`, y produce ese valor con su tipo exacto. Así, `literal("admin")` produce el tipo `"admin"`, no `string`.

- Funciona con cualquier primitivo, y así es como se validan `null` y `undefined`: `literal(null)`.
- Produce el valor declarado, no la entrada. Los dos solo difieren en el caso del cero: `===` considera `-0` igual a `0`, y `literal(0)` produce `0` para ambos.
- `NaN` se rechaza con un `RangeError` cuando se crea el validador. `NaN === NaN` es falso, así que `literal(NaN)` no podría aceptar nada.

`oneOf(values)` acepta cualquier valor de una lista y produce su unión: `oneOf(["admin", "user"])` produce `"admin" | "user"`.

- Los valores pueden ser cualquiera de los primitivos que acepta `literal`, así que `oneOf([true, false, null])` es un indicador de tres estados.
- También acepta un `enum` de TypeScript. Ignora los nombres del mapeo inverso que TypeScript agrega a un enum numérico, así que solo los números son valores. Un objeto escrito como un enum se lee igual, así que `{ a: 1, "1": "a" }` contiene solo `1`.
- Produce el valor de la lista, así que `oneOf([0])` produce `0` para `-0`.
- Los valores se copian cuando se crea el validador.
- Estos casos lanzan un `TypeError` cuando se crea el validador: ningún valor, una lista con un hueco como `[, "a"]`, que aceptaría `undefined`, y un `Set` u otro objeto de una clase, que se leería como un enum sin miembros. Una lista que contiene `NaN`, al que ningún valor es igual, lanza un `RangeError`.

```ts
import { literal, oneOf } from "@codenhub/validation";

const plan = oneOf(["free", "pro"]);
const version = literal("v1", { message: "Only v1 is supported" });

enum Status {
  Active = "active",
  Archived = "archived",
}
const status = oneOf(Status);
```

Ambos fallan con `invalid_value`: `literal` reporta `{ expected }`, y `oneOf` reporta `{ options }`, la lista de valores aceptados.

Un bigint se reporta con sus dígitos decimales, para que el problema se pueda enviar como JSON: `literal(1n)` reporta `{ expected: "1", type: "bigint" }`, y un `oneOf` compuesto solo de bigints también agrega `type: "bigint"`. En un `oneOf` que mezcla bigints con otros valores, un bigint se reporta con sus dígitos, sin nada que lo distinga de una cadena.

`literal` y `oneOf` reportan los valores que aceptan, así que no los uses para verificar un secreto, como una clave de API: una verificación fallida lo imprimiría.

## Cualquier valor, ningún valor, funciones e instancias

- `unknown()` acepta cualquier valor y lo deja pasar sin cambios. Úsalo para una propiedad que no verificas, o como base para verificaciones sobre un valor sin un tipo concreto: `unknown(check((value) => JSON.stringify(value) !== undefined))`.
- `never()` rechaza cualquier valor con `invalid_type` y `{ expected: "never", received }`. Úsalo para prohibir una propiedad, o para una rama que nunca debe coincidir.
- `func()` acepta cualquier función de cualquier realm, como un iframe, incluidas clases y funciones asíncronas y generadoras, y la produce sin cambios. Falla con `invalid_type` y `{ expected: "function", received }`. Solo puede verificar que el valor es una función, no los parámetros que recibe ni lo que devuelve. Así que indica la firma que esperas como argumento de tipo, `func<(value: string) => void>()`, y se convierte en el tipo de salida sin verificarse, como lo haría un cast. Sin él, la salida acepta cualquier argumento y devuelve `unknown`.
- `instanceOf(Class)` acepta instancias de una clase, incluidas subclases y clases abstractas, verificadas con `instanceof`. Falla con `invalid_type` y `{ expected: "instance of Class", received }`. Una instancia de otro realm, como un iframe, no se reconoce; `date`, `map`, `set` y `object` aceptan valores de cualquier realm. Un destino que no es una función, como un import que no resolvió a nada, lanza un `TypeError` cuando se crea el validador.

## Verificaciones

Una verificación es una regla sobre un valor que ya tiene su tipo, y se pasa a un validador después de sus opciones:

```ts
import { check, number, startsWith, string, uppercase } from "@codenhub/validation";

string({ min: 2 }, startsWith("A"), uppercase());
number(check((n: number) => n % 2 === 0, "Must be even"));
```

Una verificación se ejecuta solo cuando el valor ya pasó la prueba de tipo del validador y todas sus opciones:

- En una cadena o un número, cuando la entrada tiene el tipo y pasó opciones como `min`, `max` o `int`.
- En un formato, cuando el texto tiene el formato, así que una verificación pasada a `ip()` o `uuid()` nunca ve un texto que no sea una dirección o un UUID.
- En un objeto o una colección, cuando todos los hijos pasaron, ya que antes de eso no hay un valor del tipo que verificar.

Mientras una opción falla, no se ejecuta ninguna verificación, y el validador reporta el problema de cada opción que falló. Así, `max` evita que una cadena larga llegue a un `pattern` costoso, y una verificación asíncrona, como una que le pregunta a un servidor si un nombre ya está en uso, nunca ve un valor que las opciones ya rechazaron. Una vez que las opciones pasan, se ejecutan todas las verificaciones y se reportan todos los problemas.

Cada verificación integrada se importa por separado, y recibe su mensaje como último argumento:

| Verificación       | Para    | Requiere                                                                                                                               | `code` y `params`                                                  |
| ------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pattern(regex)`   | cadenas | Una coincidencia. Los flags `g` e `y` se ignoran, para que la misma verificación dé la misma respuesta cada vez.                       | `invalid_format`, `{ format: "regex", pattern }`                   |
| `startsWith(text)` | cadenas | Este prefijo.                                                                                                                          | `invalid_format`, `{ format: "startsWith", value }`                |
| `endsWith(text)`   | cadenas | Este sufijo.                                                                                                                           | `invalid_format`, `{ format: "endsWith", value }`                  |
| `includes(text)`   | cadenas | Este texto en cualquier posición.                                                                                                      | `invalid_format`, `{ format: "includes", value }`                  |
| `lowercase()`      | cadenas | Que `toLowerCase()` no la cambie, así que una cadena sin letras pasa. No cambia nada; `string({ case: "lower" })` es lo que convierte. | `invalid_format`, `{ format: "lowercase" }`                        |
| `uppercase()`      | cadenas | Que `toUpperCase()` no la cambie.                                                                                                      | `invalid_format`, `{ format: "uppercase" }`                        |
| `nonBlank()`       | cadenas | Un carácter que no esté en blanco. No cambia nada; `string({ trim: true, min: 1 })` es lo que recorta.                                 | `invalid_format`, `{ format: "nonBlank" }`                         |
| `multipleOf(step)` | números | Un múltiplo del paso, comparados como los decimales con que se escriben ambos, así que `0.3` es múltiplo de `0.1`.                     | `invalid_value`, `{ type: "number", format: "multipleOf", value }` |
| `nonZero()`        | números | Cualquier cosa menos cero.                                                                                                             | `invalid_value`, `{ type: "number", format: "nonZero" }`           |
| `unique(by?)`      | arrays  | Elementos distintos, como explica [Cuerpos de solicitud](./request-bodies.md#array).                                                   | `invalid_value`, `{ unique: true }`, en el índice de cada repetido |

Algunos detalles:

- El mensaje en inglés de `pattern` muestra la expresión, como en `Must match /^[a-z0-9_]+$/`. Donde lo lean personas, dale un mensaje a la verificación: `pattern(regex, "Use letters, digits and _")`.
- Para `nonBlank`, en blanco son los espacios en blanco, los caracteres de formato (categoría Unicode Cf), los rellenos de Hangul y el patrón braille en blanco, que se muestran todos como espacio. Así que `""`, `"  "` y un espacio de ancho cero fallan.
- Un `pattern` que no es una expresión regular, y un paso de `multipleOf` que no es un número finito positivo, lanzan una excepción cuando se crea la verificación.
- `multipleOf` es exacto para todo número en su forma escrita: el texto más corto que, al leerse, da el mismo número, que es lo que transporta JSON. Más allá de `Number.MAX_SAFE_INTEGER`, ese texto no siempre es el número que contiene el double: `2 ** 60` se escribe `1152921504606847000`, así que no es múltiplo de `1024`, aunque `1e23` sí es múltiplo de `10`.
- Un número calculado en punto flotante no siempre es el decimal que aparenta: `0.1 + 0.2` es `0.30000000000000004`, que no es múltiplo de `0.1`.

`check(test, issue?)` crea una verificación propia. [Validadores personalizados](./custom-validators.md) la explica.

## Objetos

`object(shape, options?, ...checks)` recibe una forma, un objeto cuyos valores son validadores, y devuelve un validador para objetos con esa forma. Esta es la primera versión del registro:

```ts
import { email, number, object, optional, string, type Infer } from "@codenhub/validation";

const signup = object({
  name: string({ trim: true, min: 2, max: 100 }),
  email: email(),
  password: string({ min: 12, max: 200 }),
  age: optional(number({ int: true, min: 18 })),
});

export type Signup = Infer<typeof signup>;
// { name: string; email: string; password: string; age?: number | undefined }

signup({ name: "Ada", email: "ada@example.com", password: "correct horse battery" }); // ok
signup({ email: "nope" }); // { ok: false, ... }, código "invalid_type"
```

La segunda llamada reporta tres problemas, cada uno en su propia ruta: faltan `["name"]` y `["password"]`, y `["email"]` no es una dirección. Las rutas de los problemas llevan hasta el valor que falló, así que una dentro de una lista tiene segmentos como `["addresses", 0, "street"]`.

Cómo lee `object` su entrada:

- Acepta solo objetos planos, creados con `{}`, `Object.create(null)` o `JSON.parse`, en este realm o en otro, como un iframe. Los arrays, las instancias de clases, los objetos con un prototipo propio, los `Map`, los `Date` y `null` fallan con `invalid_type` y `{ expected: "object", received }`.
- Lee solo propiedades propias, así que un valor heredado a través del prototipo nunca cumple una propiedad obligatoria.
- Valida todas las propiedades, aunque una anterior haya fallado.
- Una propiedad cuyo validador acepta `undefined`, como una envuelta en `optional`, es opcional en el tipo, y se omite de la salida cuando la entrada no la tiene. [Formularios](./forms.md#campos-opcionales-y-valores-predeterminados) explica `optional` y sus valores predeterminados.
- La salida es un objeto nuevo, y la entrada nunca se modifica. La copia es superficial: el valor de una propiedad es lo que produjo su validador. Así, un valor que `unknown()` deja pasar es el propio objeto de la entrada, y modificarlo en la salida también modifica la entrada.

Una forma solo admite claves de texto enumerables. `object` lanza un `TypeError` cuando se crea con una clave de símbolo o una clave no enumerable, cuyo validador nunca se ejecutaría.

### Claves que la forma no incluye

La opción `unknownKeys` decide qué pasa con las propiedades de la entrada que la forma no incluye:

| `unknownKeys`   | Efecto                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `"strip"`       | Las descarta de la salida. Es el valor predeterminado.                                           |
| `"strict"`      | Rechaza cada una con un problema `unrecognized_key` en la ruta de la clave, y `params: { key }`. |
| `"passthrough"` | Las copia a la salida sin cambios y sin verificar, excepto `__proto__`, que se rechaza.          |

Cualquier otro valor, como un `"Strict"` mal escrito, lanza un `TypeError` cuando se crea el validador, en lugar de recurrir a `"strip"`.

Un objeto passthrough rechaza `__proto__` porque una clave `__proto__` conservada se convertiría en el prototipo de cualquier copia de la salida hecha por asignación, como `Object.assign({}, output)`. El problema es `invalid_key` con un problema dentro, `invalid_value` con `{ reserved: true }`.

### Objetos que no son planos

`objectLike(shape, options?, ...checks)` valida cualquier objeto que tenga las propiedades indicadas, mientras que `object` acepta solo objetos planos. Úsalo para un valor que se entrega como instancia, como un `Error` o un objeto con métodos, y usa `object` para los datos.

```ts
import { boolean, objectLike, optional, string } from "@codenhub/validation";

const feedback = objectLike({ message: string({ min: 1 }), isRetryable: optional(boolean()) });

feedback(new Error("Try again")); // { ok: true, value: { message: "Try again" } }
feedback({ message: "" }); // { ok: false, ... }, código "too_small"
```

- Acepta cualquier objeto que no sea un array: un objeto plano, una instancia de clase, un `Map`, un `Date`. Cualquier otra cosa, incluida una función, falla con `invalid_type` y `{ expected: "object", received }`.
- Lee cada propiedad indicada como `input[key]`, así que cuenta una propiedad heredada, no enumerable o calculada por un getter.
- Una propiedad que lanza una excepción al leerse, como puede hacerlo un getter o un trap de `Proxy`, se reporta como `invalid_value` con `params: { unreadable: true }` en la ruta de la propiedad, y las demás propiedades se siguen validando.
- La salida es un objeto plano nuevo que contiene solo las propiedades indicadas, sin las que tienen el valor `undefined`. No hay una opción `unknownKeys`.
- Sus verificaciones se ejecutan cuando todas las propiedades pasaron, y ven la salida.

Para elegir entre instancias según una propiedad, pon los validadores `objectLike` en una `union`. `tagged` lee la etiqueta solo de un objeto plano, como explica [Cuerpos de solicitud](./request-bodies.md#tagged).

## El tipo que produce un validador

`Infer<typeof validator>` es el tipo de TypeScript que produce un validador, sea síncrono o asíncrono. El validador es la única fuente de verdad, así que no hay una interfaz aparte que mantener sincronizada con él. En el registro de arriba, `Signup` tiene `name`, `email` y `password` obligatorios, y un `age` opcional.

Un validador también puede aceptar un tipo distinto del que produce, como un texto que lee como número. `InferInput` obtiene ese tipo, que es el que contiene un formulario: [Formularios](./forms.md#los-tipos-de-un-formulario) lo explica.

## Preguntar solo si un valor pasa

Cuando solo necesitas un sí o un no, usa `is(validator, input)`, que devuelve un `boolean`:

```ts
import { is, number } from "@codenhub/validation";

const isPort = (input: unknown): boolean => is(number({ int: true, min: 1, max: 65535 }), input);

isPort(8080); // true
```

`is` no estrecha el tipo de su entrada, e `isPort` no es un type guard, por la misma razón. Un type guard también afirma que un valor que falla no es del tipo, lo cual es falso para la mayoría de los validadores: `string({ min: 3 })` rechaza `"ab"`, que es una cadena. Llama al validador y lee `result.value` donde quieras el valor tipado.

Puedes envolver `is` en un type guard propio cuando el validador acepta todos los valores del tipo, como hace `string()` sin opciones: `(input: unknown): input is string => is(string(), input)`. `number()` no es un validador así, ya que rechaza `NaN`.

`is` acepta solo validadores síncronos, y lanza un `TypeError` ante uno que devuelve una promesa.

## Síncrono y asíncrono

Un validador es síncrono a menos que algo de lo que ejecuta sea asíncrono. Verificar un nombre contra una base de datos es asíncrono; verificar su longitud, no.

No eliges un modo. Escribes la regla, y los tipos se ajustan solos: un validador que contiene una regla asíncrona es un `AsyncValidator`, su resultado se debe esperar con `await`, y el compilador te impide leerlo como si ya estuviera listo. Todos los demás validadores siguen siendo síncronos y no pagan nada por los asíncronos. [Validadores personalizados](./custom-validators.md#reglas-asíncronas) tiene un ejemplo.

## Siguiente

El registro ya tiene una forma y un tipo. [Formularios](./forms.md) lo convierte en un formulario: una contraseña escrita dos veces, campos opcionales con valores predeterminados, un archivo de avatar y errores que se muestran junto a cada campo.
