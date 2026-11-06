---
title: Entrada de texto
description: Lee números, flags, bigints y fechas a partir de texto, como variables de entorno, query strings y campos de formulario.
order: 4
source: 064666ac4b45c870f700349d434130cdf4d09098
---

# Entrada de texto

Gran parte de los datos que recibe un programa es texto que se hace pasar por otra cosa. Cada variable de entorno, cada parámetro de una query string y cada campo de texto de un formulario es una cadena, ya represente un número de puerto, un flag de sí o no o una fecha. Un campo de archivo es un `File`, que cubre [Archivos](./forms.md#archivos). Esta página cubre los validadores que leen un valor a partir de ese texto, y dos lugares de donde viene: una query string y el entorno. El servidor del registro lee su configuración del entorno, y su página de registro lee una invitación de la query string.

Un validador estricto como `number()` rechaza `"8080"`, porque es una cadena. Es lo correcto, y aquí no ayuda. Un validador que convierte primero transforma el texto y luego valida el resultado, así que una sola llamada te da un valor tipado o los motivos por los que no pudo serlo:

```ts
import { coerceNumber } from "@codenhub/validation";

const port = coerceNumber({ int: true, min: 1, max: 65535 });

port("8080"); // { ok: true, value: 8080 }
port("0"); // { ok: false, ... }, código "too_small"
port("eighty"); // { ok: false, ... }, código "invalid_type"
```

## Los validadores que convierten

Hay uno para cada tipo que suele llegar como texto:

| Validador                | Produce | Acepta                                                                                                                            | Versión estricta |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `coerceString(options?)` | string  | Cadenas, números finitos, bigints y booleanos, convertidos a su forma de cadena.                                                  | `string`         |
| `coerceNumber(options?)` | number  | Números, y cadenas que contienen un número decimal, como `"42"`, `" 3.5 "`, `"-1"`, `".5"` o `"5."`.                              | `number`         |
| `coerceBoolean()`        | boolean | Booleanos, los números `1` y `0`, y las palabras `true`, `false`, `yes`, `no`, `on`, `off`, `1` y `0` en mayúsculas o minúsculas. | `boolean`        |
| `coerceBigint(options?)` | bigint  | Bigints, enteros seguros, y cadenas que contienen un entero decimal.                                                              | `bigint`         |
| `coerceDate(options?)`   | `Date`  | `Date`, timestamps enteros en milisegundos, y cadenas ISO 8601 como `2026-09-28` o `2026-09-28T14:30:00Z`.                        | `date`           |

Cada uno recibe las opciones de su versión estricta y las aplica al valor convertido. `coerceDate` recibe además una opción propia, `zoneless`, descrita en [Fechas](#fechas). Una opción incorrecta lanza una excepción al crear el validador, así que `coerceNumber({ min: Number.NaN })` falla de inmediato, igual que `number({ min: Number.NaN })`. También reciben verificaciones y una opción `message`, y el mensaje redacta también la entrada que no se puede convertir.

`coerceNumber` acepta un número escrito sin dígitos a un lado del punto, como `".5"` o `"5."`, porque así escribe la gente.

Los espacios en blanco alrededor se ignoran en el texto que leen `coerceNumber`, `coerceBigint`, `coerceBoolean` y `coerceDate`. Son espacios en blanco tal como los entiende el `trim` de JavaScript, que incluye el espacio de no separación y la marca de orden de bytes, así que también se lee el texto pegado con cualquiera de ellos. `coerceString` deja pasar una cadena sin cambios; quítale los espacios con `coerceString({ trim: true })`.

## Lo que no se convierte

La conversión es estrecha a propósito, porque una conversión que adivina convierte un bug en un valor que parece correcto. Estos casos fallan, con el motivo en el problema:

- **Cadenas:** `NaN` e `Infinity`, que deja una conversión numérica fallida en algún punto anterior del programa, y `null`, `undefined`, objetos, arrays, funciones y símbolos.
- **Números:** cadenas vacías, `"1e3"`, `"0x10"`, `"1,5"`, `"Infinity"` y `"NaN"`; texto que contiene un número entero mayor que `Number.MAX_SAFE_INTEGER`, que perdería dígitos sin avisar (usa `coerceBigint` para esos); un decimal distinto de cero demasiado pequeño para un double, que pasaría a ser `0` sin avisar; y booleanos, `null`, objetos y arrays. `Number(true)` es `1` y `Number("")` es `0`, y leer un flag o un valor ausente como una cantidad es justo como se esconden los bugs.
- **Booleanos:** cualquier otra palabra. Un error de tipeo como `"ture"` es un error, no `false`.
- **Bigints:** fracciones, números mayores que `Number.MAX_SAFE_INTEGER`, que ya perdieron precisión, y cualquier otro texto.
- **Fechas:** texto libre como `"yesterday"` o `"03/04/2026"`, cuya lectura depende del runtime y cuyo mes depende del continente, y días que no existen, como `2026-02-30`.

Un valor que no se puede convertir falla con `invalid_type`, y sus `params` son `{ expected, received, coerced: true }`. El mensaje en inglés nombra ambos tipos, como en "Cannot convert string to a number". El valor en sí nunca está en el problema.

Un valor que se convierte pero luego incumple una opción falla con el código propio de esa opción, igual que en el validador estricto.

Un valor que ya tiene el tipo se le pasa sin cambios al validador estricto. Así, `NaN` o un infinito pasados a `coerceNumber`, o un `Date` inválido pasado a `coerceDate`, fallan igual que con `number()` o `date()`: con `invalid_type`, y sin `coerced`.

Algunos detalles de las conversiones:

- El texto `"-0"` se lee como `0`. El número `-0` pasa sin cambios, como en `number`.
- Un decimal se lee como el double más cercano, así que `"0.30000000000000004999"` es `0.30000000000000004`.
- `coerceBigint` tarda más que un tiempo lineal en convertir un texto largo. [`audit`](./limits.md#comprobar-que-un-esquema-tenga-los-límites-que-necesita) pide un límite a cada lado de él, lo que también limita los dígitos que convierte.

## Fechas

`coerceDate` lee texto de fecha en estas formas de ISO 8601:

- Una fecha, `YYYY-MM-DD`, sola. Se lee como medianoche UTC.
- Una fecha seguida de `T` o de un espacio, y luego una hora, `HH:MM` o `HH:MM:SS`, con una fracción de segundo opcional después de los segundos.
- Luego una zona, que es `Z` o un desfase escrito `+HH`, `+HHMM` o `+HH:MM`, o con `-`.

Esto es más amplio que `datetime()`, que acepta solo el separador `T`, y `Z` o, con `offset`, `+HH:MM`. Un conversor lee lo que programas y personas suelen escribir, mientras que un [formato](./formats.md#datetime-y-time) verifica una única forma exacta de escribirlo.

Una fecha y hora sin zona falla. `2026-09-28T14:30` nombra una hora en algún reloj, no un instante, y el paquete no va a adivinar de quién es el reloj. Leída en una zona cualquiera, daría a todos los demás un instante desfasado por horas, sin decir nada. Cuando sabes que ese texto está escrito en UTC, pasa `zoneless: "utc"`, el único valor que acepta esa opción:

```ts
import { coerceDate } from "@codenhub/validation";

coerceDate()("2026-09-28T14:30"); // { ok: false, ... }, código "invalid_type"
coerceDate({ zoneless: "utc" })("2026-09-28T14:30"); // ok
```

Un input HTML `datetime-local` envía texto sin zona, y sin segundos cuando son cero. Agrégale el desfase del usuario a su valor antes de convertirlo.

En cualquier caso, el resultado no depende de la zona horaria de la máquina. Algunas reglas más:

- Una fracción de segundo más allá de los milisegundos se trunca, no se redondea, igual en todos los runtimes.
- Un timestamp con una fracción de milisegundo se rechaza, no se trunca.
- Los segundos intercalares (`23:59:60`) se rechazan, porque un `Date` no puede representarlos y prefiere creer que no existen.

## Una query string

`searchParams(validator, options?, ...checks)` lee una query string, con o sin su `?`, o un `URLSearchParams`, de este realm o de otro, y la convierte en un objeto con sus parámetros decodificados. Luego produce lo que `validator` hace con ese objeto. Cada valor es texto, así que el validador interno usa conversión para cualquier otra cosa:

```ts
import { array, coerceNumber, object, optional, searchParams, string } from "@codenhub/validation";

const invitation = searchParams(object({ invite: optional(string({ max: 64 })), step: coerceNumber({ int: true, min: 1 }) }));
invitation("?invite=AB12&step=2"); // { ok: true, value: { invite: "AB12", step: 2 } }

const tags = searchParams(object({ tag: array(string()) }), { repeated: true });
tags("tag=a&tag=b"); // { ok: true, value: { tag: ["a", "b"] } }
```

- Lee `+` como un espacio y decodifica las secuencias de escape.
- Una clave que aparece más de una vez, como en `?id=1&id=2`, falla con `invalid_key` en `[key]`, a menos que se active `repeated`. Una verificación que viera uno de los dos valores mientras un servidor lee el otro dejaría pasar un valor que nadie verificó.
- Con `repeated: true`, cada valor de cada clave es una lista, así que valídalo con `array`, como en `array(coerceNumber())`.
- Cualquier otra cosa falla con `invalid_type` y `{ expected: "query string", received }`.

La parte `query` de [`url`](./formats.md#partes-de-una-dirección-de-correo-o-una-url) lee los parámetros de la misma forma, pero solo para verificarlos: el valor que produce sigue siendo la URL completa.

## El entorno

Combina la conversión con `object` y con `optional` y un valor predeterminado para convertir un entorno en configuración tipada, y para reportar todos sus problemas a la vez:

```ts
import { coerceBoolean, coerceNumber, object, optional, string, transform } from "@codenhub/validation";

const env = object({
  PORT: coerceNumber({ int: true, min: 1, max: 65535 }),
  DEBUG: optional(coerceBoolean(), false),
  RETRIES: optional(coerceNumber({ int: true, min: 0 }), 3),
  ORIGINS: transform(string(), (text) => text.split(",")),
});

const result = env({ PORT: "8080", ORIGINS: "https://a.example,https://b.example" });
// { ok: true, value: { PORT: 8080, DEBUG: false, RETRIES: 3, ORIGINS: [...] } }
```

En Node.js, pasa una copia del entorno: `env({ ...process.env })`. `process.env` en sí no es un objeto plano, porque su prototipo no es `Object.prototype`, así que `object` lo rechaza como rechaza una instancia de clase, con un mensaje que dice que lo copies. Una variable ausente es `undefined`, que un valor predeterminado reemplaza y que todos los demás validadores rechazan.

El entorno es configuración, así que uno inválido es un error ante el que hay que detenerse: un servidor que se niega a arrancar es más fácil de depurar que uno que arranca y se porta mal a las 3 de la mañana. [`assert`](./errors.md#lanzar-una-excepción-ante-una-configuración-inválida) devuelve el valor o lanza un error que nombra la variable.

## Limpiar el texto primero

Para limpiar el texto antes de convertirlo, pon delante un validador estricto con `pipe`: `pipe(string({ trim: true }), coerceNumber())`. [Dar forma a los valores](./shaping-values.md#pipe) cubre `pipe`.

Para texto que contiene JSON, usa [`json`](./request-bodies.md#texto-json), que parsea el texto y valida el resultado.

## Siguiente

Todas las páginas hasta ahora han mostrado `{ ok: false, ... }` y se han saltado con mucha educación el `...`. [Problemas y mensajes](./errors.md) lo abre: qué contiene un resultado fallido, y cómo convertir sus problemas en texto que lee una persona.
