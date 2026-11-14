---
title: Validadores personalizados
description: Agrega reglas con verificaciones, crea validadores que se comportan como los integrados, valida de forma asíncrona y nombra los tipos que exporta una biblioteca de validadores.
order: 6
source: f41eee1c5e2e39b89c00f8aae7f67d9a014f2b4f
---

# Validadores personalizados

Los validadores integrados cubren los casos comunes. Un registro real tiene reglas propias: un nombre reservado, un nombre de usuario que alguien ya tomó, un código de producto que tu empresa inventó hace años y que nadie se atreve a cambiar. Esta página muestra cómo escribirlas. Ninguno de los dos tipos necesita registrarse:

- Una **verificación** agrega una regla a un validador que ya tienes, como que un nombre no esté tomado.
- Un **validador** comprueba un tipo o un formato propio, como un código postal.

Los helpers `check`, `format` y `guard` construyen ambos sobre la misma base interna que los integrados. Así, lo que construyes se comporta como ellos: las mismas formas de problema, una opción `message` y verificaciones propias.

## Agregar una regla con `check`

`check(test, issue?)` crea una verificación a partir de una prueba sobre un valor ya tipado. Pásala a un validador después de sus opciones:

```ts
import { check, number, string } from "@codenhub/validation";

const mustBeEven = check((n: number) => n % 2 === 0, "Must be even");

const seats = number({ int: true }, mustBeEven);
const username = string(
  { trim: true, max: 30 },
  check((name) => name !== "admin", { code: "reserved_name", message: "That name is reserved" }),
);

username("admin"); // { ok: false, ... }, código "reserved_name"
```

La prueba recibe el valor que produjo el validador, después de su limpieza. Devuelve `true` cuando el valor es aceptable. Una verificación del tipo equivocado, como una verificación de números pasada a `string`, es un error de compilación.

El segundo argumento es el problema que se reporta cuando la prueba devuelve `false`:

- Una cadena es su mensaje.
- Una función del problema lo redacta en el momento en que se reporta, como hace el mensaje de una verificación integrada. Debe devolver texto; si no, el validador lanza un `TypeError` al reportar el problema.
- Un objeto puede definir `code`, `path`, `params` y `message`. Un `path` es una lista de claves e índices. Cualquier otra cosa, como texto o un símbolo, lanza un `TypeError` cuando se crea la verificación.

Sin código, el problema tiene el código `custom`, en la ubicación del propio valor. Un problema sin mensaje propio lo redacta la opción `message` del validador al que se pasa la verificación, si la tiene. Si no, solo queda su código, y `formatIssue` dice "Invalid value". Así que dale un mensaje a una verificación siempre que haya personas que lean lo que reporta.

Una verificación se ejecuta una vez que el valor tiene su tipo y pasó las opciones propias del validador. Por eso `username`, arriba, nunca prueba un nombre de más de 30 caracteres. En un objeto, eso significa una vez que todas las propiedades pasaron, así que una verificación puede compararlas. [Formularios](./forms.md#campos-que-deben-coincidir) muestra dos contraseñas que deben coincidir, y [`checkFields`](./forms.md#una-regla-que-no-espera-a-los-demás-campos), una verificación que se ejecuta antes de que los demás campos hayan pasado.

### Una verificación que reporta varios problemas

Una prueba también puede devolver los problemas que encontró, y una lista vacía para un valor que acepta. Así es como una verificación reporta varios problemas a la vez, o elige una ruta para cada falla:

```ts
import { check, string, type IssueInput } from "@codenhub/validation";

const strongPassword = check((password: string) => {
  const issues: IssueInput[] = [];
  if (!/\d/.test(password)) {
    issues.push({ code: "missing_digit" });
  }
  if (!/[A-Z]/.test(password)) {
    issues.push({ code: "missing_uppercase" });
  }
  return issues;
});

const password = string({ min: 12, max: 200 }, strongPassword);

password("correct horse battery"); // { ok: false, ... }, código "missing_digit"
```

Cada problema de la lista es un objeto, tal como lo recibe `fail()`:

- Un problema sin `code` tiene el código `custom`, y uno sin `path` está en la ubicación del propio valor.
- Un problema sin `message` lo redacta el segundo argumento de `check`, cuando este es un mensaje o un problema que tiene uno.
- Cualquier otra cosa en la lista, como `null` o texto, lanza un `TypeError` cuando la verificación la reporta. También lo lanza un `path` que no es una lista, como `"confirm"`.

Una prueba que devuelve algo que no es un booleano ni una lista lanza un `TypeError` cuando la verificación se ejecuta. Eso incluye el `undefined` de una prueba que olvidó devolver algo: leído como un valor que pasa, aceptaría todos los valores.

Un validador recibe como verificación solo lo que creó `check`, [`checkFields`](./forms.md#una-regla-que-no-espera-a-los-demás-campos) o una verificación integrada como `nonBlank()`. Una función pasada en el lugar de una verificación lanza un `TypeError` cuando se crea el validador. El código que ejecuta una prueba y lee su respuesta viene con `check`, así que un esquema que no tiene ninguno no carga nada de ese código.

## Crear un validador

### Un formato con `format`

`format(name, test)` crea la fábrica de un formato de cadena, que se comporta como `email()` o `uuid()`:

- Lo que no es una cadena falla con `invalid_type`.
- Una cadena que la prueba rechaza falla con `invalid_format`, con `params.format` igual a `name`.
- Una cadena que la prueba acepta se produce tal como está escrita.

```ts
import { format } from "@codenhub/validation";

export const postcode = format("postcode", (text) => /^\d{5}(?:-\d{4})?$/.test(text));

postcode()("12345"); // { ok: true, value: "12345" }
postcode({ message: "Enter a ZIP code" })("abc"); // { ok: false, ... }
```

La prueba debe responder de inmediato. Una prueba que devuelve una promesa lanza un `TypeError` cuando el validador se ejecuta, ya que una respuesta pendiente dejaría pasar cualquier valor. Una regla que espera es una verificación, como muestra [Reglas asíncronas](#reglas-asíncronas).

`name` forma parte del contrato del formato: quienes lo llaman se basan en él para decidir, y los mapas de mensajes lo usan para redactar, así que elígelo una sola vez: cambiarle el nombre después rompe a todos los que se basaron en él. [JSON Schema](./json-schema.md) no escribe ningún `format` para él, ya que JSON Schema no conoce ese nombre.

### Un tipo con `guard`

`guard(expected, typeGuard)` crea la fábrica de un validador para cualquier tipo, a partir de un type guard. Un valor que el guard rechaza falla con `invalid_type`, con `params.expected` igual a `expected`. El guard debe responder de inmediato, igual que la prueba de `format`:

```ts
import { guard, object } from "@codenhub/validation";

export const blob = guard("Blob", (input): input is Blob => input instanceof Blob);

const attachment = object({ content: blob({ message: "Choose a file" }) });
```

Para un `File` de un formulario, usa el [`file`](./forms.md#file) del propio paquete, que además comprueba el tamaño y el tipo.

### Un validador con opciones propias

Un validador con opciones es una función que comprueba sus opciones y devuelve lo que crea un builder o un validador integrado. Comprueba las opciones cuando se llama a la función, no cuando el validador se ejecuta, para que un error en un esquema se detecte de inmediato:

```ts
import { check, string, type Validator } from "@codenhub/validation";

export function sku(prefix: string): Validator<string> {
  if (!/^[A-Z]{2,4}$/.test(prefix)) {
    throw new RangeError(`prefix must be 2 to 4 capital letters, received "${prefix}"`);
  }
  return string(check((text) => new RegExp(`^${prefix}-\\d{6}$`).test(text), { code: "invalid_sku", params: { prefix } }));
}
```

### A mano

`validator(validate)` crea un validador a partir de una función que recibe una entrada y devuelve un resultado. Devuelve `pass(value)` cuando la entrada es aceptable, y `fail(...)` cuando no lo es:

```ts
import { fail, pass, validator } from "@codenhub/validation";

const even = validator((input) => (typeof input === "number" && input % 2 === 0 ? pass(input) : fail({ code: "not_even" })));

even(4); // { ok: true, value: 4 }
even(3); // { ok: false, ... }, código "not_even"
```

El parámetro es `unknown`, porque un validador existe para comprobar datos en los que todavía no confías. El tipo que produce el validador se lee de lo que devuelve la función, así que `even` es un validador de `number`, y `Infer` lo dice.

- Para nombrar un tipo que el cuerpo no muestra, tipa lo que devuelve la función: `validator((input): ValidationResult<User> => ...)`.
- Para indicar qué acepta, para [`InferInput`](./forms.md#los-tipos-de-un-formulario), tipa la función como un validador antes de pasarla: una tipada como `Validator<number, string>` lee un número a partir de texto. Sin eso, el tipo de entrada es `unknown`.

Lo que devuelve `validator` funciona en cualquier lugar donde funciona uno integrado, como dentro de `object`, `optional` y `pipe`, y es un [Standard Schema](./standard-schema.md) igual que ellos. No tiene opción `message` ni verificaciones a menos que las escribas tú, y para eso están los builders.

Un compositor recibe una función escrita a mano solo a través de `validator`. El código que llama a una función así, comprueba lo que devolvió y la espera viene con `validator`, así que un esquema que no tiene ninguno no carga nada de ese código.

`fail` recibe uno o más problemas. Cada uno puede definir:

| Campo     | Significado                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`    | Una cadena estable con la que deciden quienes llaman. Por defecto es `"custom"`. Elige el tuyo, como `"username_taken"`.                                                            |
| `path`    | Dónde está el problema, relativo al valor que recibiste. Por defecto es el propio valor. Un padre agrega sus propios segmentos delante.                                             |
| `params`  | Datos sobre la falla, para construir un mensaje o para que quienes llaman los inspeccionen. Nunca pongas la entrada aquí: un problema es algo que quienes llaman registran en logs. |
| `message` | Texto fijo del mensaje. Sin él, [`formatIssue`](./errors.md#convertir-un-problema-en-texto) construye el texto a partir de `code` y `params`.                                       |

`fail` lanza un `TypeError` si no recibe ningún problema, ya que una falla sin problemas no dice nada. También lo lanza para un `path` que no es una lista, como `"confirm"` cuando se quería `["confirm"]`, que se dividiría en un segmento por letra.

### Una función que no es un validador

Una función que este paquete no creó se rechaza donde va un validador, con un `TypeError` que nombra el argumento cuando se crea el compositor:

```ts
import { object, string, type Validator } from "@codenhub/validation";

object({ name: string as unknown as Validator<string> }); // TypeError: shape.name is not a validator of this copy of the package. A factory is called first, as in string(), and any other function is given to validator()
```

La causa habitual es una fábrica pasada donde va su validador, como `string` en lugar de `string()`. Los tipos lo rechazan, así que ocurre en JavaScript, o tras un cast. La otra es una función escrita a mano que no se pasó a `validator`, que los tipos aceptan cuando está tipada como un `Validator`. El nombre es el del argumento: `shape.name`, `item`, `options[1]` de un `union`, `key` de un `record`. Un `lazy` lee su validador la primera vez que se ejecuta, así que lanza la excepción entonces.

Un validador hecho por otra copia instalada de este paquete se rechaza de la misma forma, y también una de sus verificaciones: ocurre cuando dos paquetes dependen de versiones de `@codenhub/validation` que no coinciden, y a uno se le da un esquema del otro. Cada copia se reporta los problemas a sí misma, así que una no puede ejecutar los validadores de la otra como propios. Instala una sola versión para ambos, o pasa el validador a `validator`, que lo ejecuta como cualquier función escrita a mano y conserva sus problemas, aunque ya no lo que `describe` y `toJsonSchema` leen de él.

Una función pasada a `validator` que devuelve algo que no es un resultado también es un bug: nada, la propia entrada o una falla sin problemas. El validador lanza un `TypeError` cuando se ejecuta, "A validator written by hand must return pass(value) or fail(issue)".

### Una conversión que puede fallar

[`transform`](./shaping-values.md#transform) convierte el valor que produjo un validador en otro, y no puede rechazarlo. Una conversión que puede fallar, como leer un día como un `Date`, es un validador en sí mismo, que se coloca después del primero con `pipe`:

```ts
import { fail, isoDate, pass, pipe, validator } from "@codenhub/validation";

// isoDate ya comprobó que el texto es un día como 2026-09-28, así que esto lo lee como medianoche UTC
// de la misma forma en todos los runtimes. `new Date(text)` sobre texto libre no lo haría.
const startOfDay = validator((input) => {
  const date = new Date(`${String(input)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? fail({ code: "invalid_date" }) : pass(date);
});

const birthday = pipe(isoDate(), startOfDay);
```

Para fechas en general, [`coerceDate`](./text-input.md#fechas) ya hace esta conversión.

## Reglas asíncronas

Una regla que necesita esperar, como comprobar un nombre de usuario en una base de datos, es una verificación cuya prueba devuelve una promesa:

```ts
import { check, email, object, string } from "@codenhub/validation";

const username = string(
  { trim: true, min: 3, max: 30 },
  check(async (name) => !(await isTaken(name)), { code: "username_taken" }),
);

const signup = object({ username, email: email() });

const result = await signup(input);
```

No cambia nada más. Un validador que recibe una verificación asíncrona se convierte en un `AsyncValidator`, y lo mismo pasa con todo lo que lo contiene: `signup`, arriba, lo es porque `username` lo es.

El tipo le dice al compilador que el resultado debe esperarse con `await`. Así, leer `signup(input).ok` sin `await` es un error que encuentras mientras escribes, no un bug que encuentras en producción, donde una promesa no tiene `ok`: `!result.ok` rechazaría todos los registros, y `result.ok === false` los dejaría pasar todos. Una verificación cuya prueba puede esperar es un `AsyncCheck<T>`, y una cuya prueba responde de inmediato es un `Check<T>`, que mantiene síncronos sus validadores.

También puedes escribir un validador asíncrono directamente:

```ts
import { fail, pass, validator } from "@codenhub/validation";

const existingUser = validator(async (input) => {
  const user = typeof input === "string" ? await findUser(input) : undefined;
  return user ? pass(user) : fail({ code: "unknown_user" });
});
```

Lo que un validador así llama después de su propio `await` es una validación aparte, ya que el paquete no puede seguir un `await` que no hizo él. Un `lazy` al que llega vuelve a contar su `maxCalls` desde cero, así que la recursión a través de él no está acotada. Cuando el validador lleva de vuelta a un esquema recursivo, deja el `await` en una verificación, cuyos `await` sí hace el paquete.

Lo que debes saber sobre la validación asíncrona:

- **Espera siempre con `await` el resultado de un `AsyncValidator`.** Puede ser una promesa, o un resultado normal cuando el validador pudo responder sin esperar, por ejemplo `optional(existingUser)` con `undefined`. `await` maneja ambos casos.
- **Las propiedades y los elementos independientes ejecutan sus reglas de forma concurrente.** En `signup`, arriba, la búsqueda del nombre de usuario y la verificación del correo empiezan juntas. Lo mismo pasa con la regla de cada elemento de un array, sin límite. Dale un `max` al array antes de validar una lista que no escribiste tú, para que no pueda iniciar miles de búsquedas a la vez.
- **Los problemas se mantienen en un orden fijo.** Siguen el orden de la forma y de las verificaciones, no el orden en que terminaron las promesas.
- **`is` y `assert` necesitan un validador síncrono.** Lanzan un `TypeError` para uno que devuelve una promesa.
- **Una promesa rechazada es un bug, no una entrada inválida.** Si tu prueba lanza una excepción o se rechaza, la excepción se propaga. Reporta una entrada inválida devolviendo `false` o un problema. Solo `instanceOf` convierte una excepción en una falla: si el `Symbol.hasInstance` de la clase, o un trap de prototipo del valor, lanza una excepción, el valor falla con `invalid_type`, igual que `objectLike` reporta una propiedad que no pudo leer.

## Lo que no debes hacer

- **No pongas la entrada en un problema.** Ningún valor de `params`, y ningún `message` construido a partir de la entrada. Los problemas se registran en logs, y las entradas son contraseñas y tokens.
- **No lances excepciones por una entrada mala.** Devuelve `false` o una lista de problemas desde una prueba, o `fail` desde un validador. Lanza excepciones solo por un error en cómo se configuró un validador, y hazlo cuando se crea, no cuando se ejecuta.
- **No modifiques la entrada.** Devuelve un valor nuevo con `pass` cuando un validador lo cambia.
- **No crees un validador al cargar un módulo a menos que la llamada esté marcada como pura.** `export const postcode = format(...)` se ejecuta cuando se carga el módulo, así que un bundler la conserva incluso en un programa que nunca la usa. En una app eso no hace daño. Una biblioteca de validadores que quiere que cada uno se descarte cuando no se usa escribe `export const postcode = /* @__PURE__ */ format(...)`.

## Probar un validador

Un validador es una función, así que una prueba lo llama y mira el resultado:

```ts
import { expect, it } from "vitest";

// `even` es el validador escrito arriba.
it("rejects odd numbers with the not_even code", () => {
  const result = even(3);
  expect(result.ok).toBe(false);
  expect(!result.ok && result.error.issues[0]?.code).toBe("not_even");
});
```

## Tipos

Una biblioteca que exporta validadores propios los nombra en sus declaraciones. Estos son los tipos que exporta el paquete para eso. Cada uno está documentado en su código fuente y aparece en la [referencia de la API](../reference/index.md).

Los tipos que más escribes:

- `Validator<T, TInput?>` y `AsyncValidator<T, TInput?>`: un validador, síncrono o no. `AnyValidator` es cualquiera de los dos.
- `Schema<T, TInput?>` y `AsyncSchema<T, TInput?>`: un validador creado por una fábrica de este paquete, que además es un [Standard Schema](./standard-schema.md). Lo que devuelve `validator` también lo es. Una función solo tipada como `Validator` no lo es, y ningún compositor la recibe.
- `Check<T>` y `AsyncCheck<T>`: una verificación.
- `Infer` e `InferInput`: el tipo que produce un validador, y el tipo que puede pasarlo.
- `ValidationResult<T>`, que es `ValidationOk<T>` o `ValidationErr`. Un `ValidationErr` contiene un `ValidationFailure`, cuyos `issues` son `ValidationIssue`.
- `ValidationIssueCode`, los códigos integrados, abierto a cualquier otra cadena, y `ValidationPathSegment`, una clave o un índice de un `path`.
- `IssueInput`, un problema tal como lo recibe `fail`, y `CheckAnswer`, lo que devuelve la prueba de un `check`.
- `Validated`, lo que devuelve una función pasada a `validator`, y `ValidatedValue`, el tipo del valor que contiene.
- `Message`, el texto o la función de una opción `message`, y `MessageOptions`, las opciones que acepta todo validador.

Las opciones de cada validador llevan su nombre: `StringOptions`, `NumberOptions`, `BigintOptions`, `DateOptions`, `FileOptions`, `ArrayOptions`, `TupleOptions`, `LazyOptions`, `FormDataOptions`, `SearchParamsOptions`, `CoerceDateOptions`, `EmailOptions`, `UrlOptions`, `IpOptions`, `UuidOptions`, `DatetimeOptions`, `TimeOptions` y `Base64Options`. `SizeOptions` contiene los `min`, `max` y `length` que aceptan `set`, `map` y `record`. `AssertOptions`, `JsonSchemaOptions` y los demás pertenecen a las páginas de sus funciones.

Los tipos de las formas, que nombran lo que un compositor produce y acepta:

- `Shape`, las propiedades de un `object`, con `InferShape` e `InferShapeInput`.
- `InferRecord` e `InferRecordInput`, para un `record`.
- `InferTuple` e `InferTupleInput`, para un `tuple`.
- `Variants`, las variantes de una unión `tagged`, con `InferTagged` e `InferTaggedInput`.
- Los tipos de `pick` y sus parientes, en [Dar forma a los valores](./shaping-values.md#reutilizar-formas).

La maquinaria de las firmas, que casi siempre ves en los tooltips de tu editor:

- `Factory<T, TOptions, TInput?>`, la fábrica que devuelve un builder como `format`: primero las opciones, luego las verificaciones.
- `Rest<T, TOptions>` y `AsyncRest<T, TOptions>`, lo que sigue a los argumentos propios de un validador: opciones, luego verificaciones.
- `Composed<TChildren, TOutput, TInput?>`, el validador que devuelve un compositor: síncrono mientras todos sus hijos lo sean.
- `LiteralValue`, un valor que acepta `literal`. `EnumLike`, un objeto creado por un `enum` de TypeScript, que acepta `oneOf`. `AnyFunction`, cualquier función, para `func`. `Constructor`, una clase, para `instanceOf`.

## Siguiente

Muchas reglas propias son formatos de texto. Antes de escribir una, revisa si el paquete ya la tiene, porque cada regex de correo que circula por internet está mal a su manera. [Formatos](./formats.md) enumera direcciones de correo, URL, direcciones IP, fechas y el resto.
