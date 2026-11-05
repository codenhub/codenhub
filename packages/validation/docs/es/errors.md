---
title: Problemas y mensajes
description: Qué contiene un resultado fallido, los códigos de problema integrados y sus params, y cómo convertir los problemas en texto en inglés, en portugués o con tus propias palabras.
order: 5
source: ae76c2953676715dddf6b0e9ceb9bd1af4d96632
---

# Problemas y mensajes

Cuando un valor no es válido, el resultado dice exactamente por qué. Esta página describe qué contiene un resultado fallido, los códigos que reportan los validadores integrados y cómo convertirlos en texto para una persona: los mensajes del formulario de registro, en inglés o en portugués, y el error que lanza un servidor ante una configuración incorrecta.

Los validadores no escriben texto cuando fallan. El texto es una decisión que tomas donde lo muestras, así que un programa que nunca muestra un problema no carga ninguna redacción.

## El resultado fallido

```ts
// Lo que devolvió un validador para { name: "A", email: "nope" }
const result = {
  ok: false,
  error: {
    issues: [
      { code: "too_small", path: ["name"], params: { minimum: 2, type: "string" } },
      { code: "invalid_format", path: ["email"], params: { format: "email" } },
    ],
  },
};
```

`error.issues` enumera todos los problemas que encontró el validador, en un orden fijo, y nunca está vacío. Su tipo también lo dice, así que `result.error.issues[0]` es un problema y no `undefined`, incluso con `noUncheckedIndexedAccess`.

- El orden sigue al esquema, no al tiempo que tardó cada regla. Un `object` estricto reporta primero sus claves no reconocidas, y luego los problemas de sus propiedades en el orden en que las enumera la forma.
- Una colección se detiene en 1000 problemas, como explica [Límites](./limits.md#una-entrada-que-falla-tiene-un-costo-acotado).

## El problema

| Campo     | Significado                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`    | Una cadena estable que nombra el tipo de fallo. Ramifica según este campo, nunca según el texto del mensaje.                                          |
| `path`    | Dónde está el valor inválido, desde la raíz de lo que validaste. Las claves son cadenas y los índices de array son números. Vacío para la raíz misma. |
| `params`  | Los datos detrás del fallo, como el límite que se superó. Presente cuando hay alguno.                                                                 |
| `message` | Texto fijo, cuando el problema recibió uno: mediante la opción `message` de un validador, el mensaje de una verificación o un validador propio.       |

**Un problema nunca contiene un valor de la entrada.** No hay ningún campo para eso, y `params` contiene nombres de tipo y límites, nunca el valor que se está verificando. Las entradas suelen ser contraseñas o tokens, y los problemas se registran en logs y se muestran, así que esto es una regla y no un valor predeterminado. Si necesitas el valor, ya lo tienes.

Las claves no son valores, y sí aparecen en los problemas:

- Una ruta pasa por las claves de la entrada, así que un problema de un `record` o un `map` nombra la clave a la que pertenece.
- Un `object` estricto reporta cada clave que no reconoce, en su ruta y en `params.key`.

Así que no pongas secretos en nombres de claves que valides. Una clave también es texto que eligió quien la envió. `englishMessages` la pone dentro del mensaje como una cadena entre comillas, como en `Unrecognized key "…"`, con las comillas y los saltos de línea escapados. `formatPath` la pone entre comillas de la misma forma en los nombres de campo de `flatten`. Así, una clave no puede romper una línea de log. Escapa ambos cuando los pongas en HTML.

Lo mismo vale para lo que nombra tu propio esquema: `literal` y `oneOf` reportan los valores que aceptan, en `params` y en el mensaje en inglés. Así que no verifiques un secreto con ellos, como advierte [Valores fijos](./getting-started.md#valores-fijos).

### Escribir una ruta

`formatPath(path)` escribe una ruta para mostrarla:

```ts
import { formatPath } from "@codenhub/validation";

formatPath(["user", "addresses", 0, "street"]); // "user.addresses[0].street"
formatPath([0, "title"]); // "[0].title"
formatPath(["a.b"]); // '["a.b"]'
```

Una clave se pone entre comillas y corchetes cuando está vacía o contiene `.`, `[`, `]`, `"`, un carácter de control como un salto de línea, o un separador de línea, con esos caracteres escapados. Así, una clave llamada `a.b` y la ruta `a`, `b` nunca dan el mismo texto.

## Códigos integrados

El conjunto de códigos es abierto: un validador personalizado reporta el código que quiera. Estos son los códigos que usan los validadores integrados. Cada página enumera el código y los `params` exactos junto a los validadores que cubre.

| Código                 | Significado                                                                                                                                                                                                                        | `params`                                                                                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invalid_type`         | El valor no es del tipo esperado, o no se pudo convertir a él.                                                                                                                                                                     | `expected` y `received`, ambos nombres de tipo, y `coerced: true` cuando un validador que convierte no pudo convertir el valor.                                                                                                                  |
| `invalid_format`       | Una cadena no tiene el formato requerido.                                                                                                                                                                                          | `format`, como `"email"` o `"regex"`, más lo que necesite la regla. Para una parte fallida de `url` o `email`, `part` e `issues`, lo que encontró el validador de la parte.                                                                      |
| `invalid_value`        | El valor tiene el tipo correcto, pero un valor que no está permitido.                                                                                                                                                              | Depende de la regla, como indica la lista debajo de esta tabla.                                                                                                                                                                                  |
| `too_small`            | Por debajo de un mínimo: demasiado corto, muy pocos elementos, o un número o una fecha demasiado pequeños.                                                                                                                         | `minimum`, `type`, e `inclusive` o `exact` cuando corresponda.                                                                                                                                                                                   |
| `too_big`              | Por encima de un máximo; anidado a más profundidad, o con más recursión, de lo que permite `lazy`; o una colección que se detuvo en 1000 problemas.                                                                                | `maximum`, `type` (`"depth"` o `"calls"` para `lazy`, `"issues"` para una colección que se detuvo), e `inclusive` o `exact` cuando corresponda.                                                                                                  |
| `unrecognized_key`     | Un objeto tiene una propiedad que su forma no incluye, en modo estricto.                                                                                                                                                           | `key`. La ruta del problema termina en la clave.                                                                                                                                                                                                 |
| `invalid_key`          | Una clave de un `record` o un `map` no pasó su validador de claves; su validador de claves la convirtió en una clave que ya tiene una entrada anterior; una clave aparece dos veces; o una clave es `__proto__` donde se copiaría. | `issues`: lo que encontró el validador de claves, con rutas relativas a la clave; para una clave repetida, un problema `invalid_value` con `unique: true`; para `__proto__`, uno con `reserved: true`. La ruta del problema termina en la clave. |
| `invalid_intersection` | Ambos validadores de una `intersection` pasaron, pero produjeron valores que no se pueden fusionar en uno.                                                                                                                         | Ninguno. La ruta del problema es donde difieren las dos salidas.                                                                                                                                                                                 |
| `invalid_union`        | Un valor no coincidió con ninguna de las opciones de una `union`, o una unión `tagged` recibió una etiqueta ausente o desconocida.                                                                                                 | Para `union`, `issues`: los problemas que encontró cada opción, en orden, con rutas relativas al valor de la unión. Para `tagged`, `discriminator` y `options`, y la ruta del problema es la de la etiqueta.                                     |
| `custom`               | El código predeterminado de una llamada a `check` o `fail` que no nombra ningún código.                                                                                                                                            | Lo que haya puesto quien lo reporta.                                                                                                                                                                                                             |

Los `params` de `invalid_value`:

- `expected` para un `literal`, y `options` para una lista de valores.
- Para un número, `type` y `format` (`"int"`, `"safeInt"`, `"nonZero"` o `"multipleOf"`), con el paso en `value` para `"multipleOf"`.
- `unique: true` para un repetido en un array o un set.
- `reserved: true` dentro del `invalid_key` de una clave `__proto__`.
- `unreadable: true` para una propiedad de una entrada de `objectLike` que lanzó una excepción al leerse, o para un archivo que `contentType` no pudo leer.
- `content: true` junto a `options` para un archivo cuyos primeros bytes no son de ninguno de los tipos que enumera `contentType`.
- `encodedSeparator: true` y `dotSegment: true` para las rutas de URL que se describen en [Formatos](./formats.md#rutas-que-un-servidor-lee-de-otra-forma).

Una clave `__proto__` se reporta donde se copiaría a un objeto nuevo: en un `record`, entre las claves no incluidas de un `object` passthrough, y en una `intersection` cuyos lados la dejaron pasar sin verificar.

`englishMessages` no tiene redacción para `custom`, porque una verificación fallida no lleva nada que redactar, así que `formatIssue` dice "Invalid value". Ponle un mensaje a una verificación donde las personas lean lo que reporta.

### Los nombres de tipo en `received`

`received` nombra los tipos de valor de la misma forma en todas partes: `null`, `array`, `nan`, `infinity`, `date`, `invalid date` para un `Date` que no contiene ningún instante, `object` para cualquier otro objeto (incluidos un `Map`, un `Set` o una instancia de clase), o el `typeof` de cualquier otra cosa. Nunca nombra una clase, porque para eso habría que leer el prototipo de la entrada.

Donde se espera un objeto plano (`object`, `record`, `tagged`), cualquier otro objeto es `non-plain object`. `englishMessages` lo redacta "Expected a plain object; copy it first, as in { ...value }", ya que una copia, como `{ ...process.env }`, es lo que pasa.

## Convertir un problema en texto

`formatIssue(issue, messages?)` convierte un problema en texto, a partir de un mapa de mensajes, `englishMessages` a menos que pases otro:

```ts
import { formatIssue, number } from "@codenhub/validation";

const result = number({ min: 18 })(15);
if (!result.ok) {
  formatIssue(result.error.issues[0]); // "Must be at least 18"
}
```

El texto sale del primero de estos que exista:

1. El `message` propio del problema, que establece la [opción `message`](#redactar-los-mensajes-de-un-validador) de un validador o el mensaje de una verificación.
2. Una entrada para su `code` en el mapa de mensajes.
3. La entrada `default` de ese mapa, que redacta todos los códigos para los que el mapa no tiene entrada.
4. El texto "Invalid value".

`englishMessages` es un valor independiente. Un programa lo empaqueta cuando llama a `formatIssue` o `flatten`, aunque sea con otro mapa, porque es su valor predeterminado. Un programa que nunca los llama no lo empaqueta. Un programa cuyos problemas llevan todos su propio `message` puede pasar `{}`. Un mapa que no es un objeto, como `null`, es un `TypeError`.

`formatIssue` redacta los problemas que devuelven los validadores. Un problema recibido de otra parte, como un JSON de un servidor que no controlas, es una entrada como cualquier otra, y uno mal formado puede lanzar una excepción: valídalo antes de redactarlo.

Un validador también tiene una redacción breve en inglés propia, para las bibliotecas que lo leen como un [Standard Schema](./standard-schema.md). Esa redacción no es `englishMessages`, y esa página la describe.

### Problemas que contienen otros problemas

Tres códigos guardan en `params.issues` los problemas que tienen detrás: `invalid_key`, `invalid_union` de `union`, e `invalid_format` para una parte fallida de una URL o de una dirección de correo. `englishMessages` los redacta junto con el problema que tienen detrás, para que el mensaje diga por qué:

- `invalid_key` con el primer problema que encontró el validador de claves, como en "Invalid key: Must be at least 3 characters". Una clave que aparece dos veces, en una query string o después de que un validador de claves volvió iguales dos claves, es "Must be given only once".
- Una parte fallida de la misma forma, como en "Invalid email address domain: Expected one of "company.com"".
- `invalid_union` con el primer problema de la única opción cuyo tipo tenía la entrada, cuando hay exactamente una: todas las demás opciones solo encontraron que la entrada no es de su tipo, o no es uno de los valores que acepta un `literal` o un `oneOf`. Así, `union([literal(""), email()])` con `"nope"` dice "Invalid email address". En otro caso, ninguna opción es la que se quiso decir, y dice "Does not match any of the allowed types". Los problemas de cada opción están en `params.issues` para un mensaje propio.

El problema de detrás se redacta con el mismo mapa. Así, sobrescribir `too_small` en una copia de `englishMessages` también llega al mensaje de una clave. Un problema citado que está más adentro que el valor donde se muestra el problema exterior empieza con su ruta, como en "width: Must be at least 1" para el `width` de una opción objeto.

Una lista de valores permitidos nombra los diez primeros, y cuántos más hay.

### Los problemas detrás de un problema

Un problema guardado en el `params.issues` de otro conserva los problemas que tiene detrás solo cuando ninguno de ellos contiene problemas propios. Así, los problemas se anidan como máximo a tres niveles, sea lo que sea que los componga:

- Una parte o una clave cuyos problemas son simples, como el `{ options: ["company.com"] }` de un dominio o el `{ unique: true }` de una clave repetida, los conserva.
- Los problemas de una unión son las listas de sus opciones. Así, una unión guardada dentro de otro problema, como una para una propiedad de una opción objeto dentro de una unión exterior, conserva su código y su ruta, sin los problemas de sus opciones.

Sin esta regla, un esquema recursivo anidaría problemas una vez por cada nivel. Donde los niveles comparten un resultado, como hacen las opciones de una unión recursiva a través de un único `lazy`, cada camino por ese anidamiento volvería a escribir el resultado completo, y una entrada pequeña podría dar un resultado demasiado grande para serializarlo.

La redacción que llega a un problema guardado sin sus problemas dice lo que puede sin ellos, como "Does not match any of the allowed types" para una unión. Si un límite de `lazy` detuvo la validación detrás de un problema así, nunca se descarta: el problema `too_big`, con su `maximum` y su `type`, ocupa su lugar. `flatten` y `standard` usan la misma redacción, así que ninguno enumera por separado los problemas anidados.

## Redactar los mensajes de un validador

Todo validador que reporta un problema propio recibe una opción `message`: el texto, o una función que redacta un problema a partir de su `code` y sus `params`.

```ts
import { email, object, startsWith, string } from "@codenhub/validation";

const signupForm = object({
  name: string({ min: 2, message: "Enter your full name" }),
  email: email({ message: (issue) => t(`errors.${issue.code}`) }),
  invite: string(startsWith("INV-", "Invitation codes start with INV-")),
});
```

- Redacta cada problema que ese validador reporta por sí mismo, y cada problema que una de sus verificaciones reporta sin un mensaje propio.
- No redacta ningún problema que reporte un hijo. Así, `object(shape, { message })` redacta una entrada que no es un objeto, y deja los problemas de cada propiedad a esa propiedad.
- Toda verificación integrada recibe un mensaje como último argumento, para una verificación que necesita su propia frase. `string({ message: "Invalid username" }, pattern(/^\w+$/))` dice "Invalid username" para cualquiera de los dos fallos, nunca el patrón.
- Una función recibe el problema tal como lo reporta ese validador. Así, su `path` es relativo al propio valor del validador, `[]` para el valor mismo, aunque el resultado ponga el problema más adentro de un objeto o un array. Redáctalo a partir del campo al que le diste la opción, no a partir de la ruta.

Un problema que lleva un mensaje se redacta primero con él, antes que con cualquier mapa de mensajes. Así es como un campo tiene su propia frase mientras un mapa redacta el resto.

## Idiomas integrados

El paquete incluye dos mapas. Cada uno es un valor independiente, así que un programa empaqueta los idiomas que importa y ningún otro:

| Mapa                 | Idioma                                   | `number({ min: 18 })(15)` |
| -------------------- | ---------------------------------------- | ------------------------- |
| `englishMessages`    | Inglés                                   | "Must be at least 18"     |
| `portugueseMessages` | Portugués, tal como se escribe en Brasil | "Deve ser no mínimo 18"   |

Ambos redactan los mismos nueve códigos. `formatIssue`, `flatten` y `standard` reciben el mapa como argumento, y `assert` lo recibe como su opción `messages`. Para un programa en varios idiomas, elige el mapa donde muestras el problema:

```ts
import { englishMessages, formatIssue, portugueseMessages, type Messages } from "@codenhub/validation";

const maps: Record<string, Messages> = { en: englishMessages, pt: portugueseMessages };
const wordingFor = (locale: string): Messages => maps[locale] ?? englishMessages;

formatIssue(issue, wordingFor("pt"));
```

`portugueseMessages` escribe los números como se escriben en Brasil:

```ts
import { formatIssue, multipleOf, number, portugueseMessages } from "@codenhub/validation";

const below = number({ min: 0.1 })(0);
if (!below.ok) {
  formatIssue(below.error.issues[0], portugueseMessages); // "Deve ser no mínimo 0,1"
}
const step = number(multipleOf(0.01))(0.001);
if (!step.ok) {
  formatIssue(step.error.issues[0], portugueseMessages); // "Deve ser múltiplo de 0,01"
}
```

- Un límite o un paso usa coma decimal.
- Una lista larga de valores permitidos termina en "e mais N", donde el inglés dice "or N more".
- Los mensajes sobre claves usan el femenino, porque "chave" es femenino en portugués: "Chave não reconhecida".

Lo que un mapa no traduce es lo que el problema contiene como datos: los nombres de los tipos, como en "Esperado string, recebido number", el nombre de un formato que el paquete no conoce, y el nombre de una parte de una URL o de una dirección.

Un problema cuyo código no está en el mapa, como el de una verificación personalizada, se redacta con la entrada `default` del mapa, "Valor inválido" en `portugueseMessages`. `englishMessages` no tiene `default`, porque la última redacción de `formatIssue`, "Invalid value", ya está en inglés.

## Cambiar la redacción y localizar

Un mapa de mensajes es un objeto de código a texto:

- Una cadena se usa directamente.
- Una función recibe el problema, así que puede usar `params`, y el mapa en el que se encontró, así que puede redactar un problema anidado en `params` con `formatIssue(nested, messages)` y el mismo mapa.

Para cambiar parte del inglés, copia `englishMessages` con un spread y sobrescribe los códigos que quieras. Está congelado, así que no se puede modificar directamente. Para traducir a un idioma que no tiene mapa aquí, escribe un mapa propio:

```ts
import { englishMessages, formatIssue, type Messages } from "@codenhub/validation";

const shorter: Messages = { ...englishMessages, too_small: "Too short" };

const pt: Messages = {
  invalid_type: (issue) => `Esperado ${String(issue.params?.expected)}`,
  too_small: (issue) => `Mínimo de ${String(issue.params?.minimum)}`,
  username_taken: "Este nome de usuário já existe",
  default: "Valor inválido",
};

formatIssue(issue, shorter);
formatIssue(issue, pt);
```

Cubre los códigos que pueden reportar tus validadores, que enumeran las tablas de arriba, y dale al mapa una entrada `default`, como texto o como función del problema. Sin ella, cada código que omitas dirá "Invalid value", en inglés. Los códigos propios de un validador personalizado también van en el mapa, o el problema puede llevar un `message`.

Una entrada debe ser texto o una función que devuelve texto. Cualquier otra cosa, como una búsqueda de traducción que devolvió `undefined` o una entrada que es un grupo de traducciones, lanza un `TypeError` cuando se redacta un problema de ese código. Esto vale por igual en `formatIssue`, `flatten`, `assert` y `standard`, así que un formulario nunca muestra `undefined`.

### La redacción de un código

La redacción en inglés de cada código también es una exportación propia. Un programa que solo puede reportar unos pocos códigos arma un mapa con esos. Uno que redacta sus problemas solo con [`assert`](#lanzar-una-excepción-ante-una-configuración-inválida) no empaqueta entonces ninguna otra redacción, mientras que `formatIssue`, `flatten` y `standard` empaquetan todo `englishMessages` de todos modos, [por ser su valor predeterminado](#convertir-un-problema-en-texto):

| Código                 | Exportación                  |
| ---------------------- | ---------------------------- |
| `invalid_type`         | `invalidTypeMessage`         |
| `invalid_format`       | `invalidFormatMessage`       |
| `invalid_value`        | `invalidValueMessage`        |
| `too_small`            | `tooSmallMessage`            |
| `too_big`              | `tooBigMessage`              |
| `unrecognized_key`     | `unrecognizedKeyMessage`     |
| `invalid_key`          | `invalidKeyMessage`          |
| `invalid_intersection` | `invalidIntersectionMessage` |
| `invalid_union`        | `invalidUnionMessage`        |

```ts
import { formatIssue, invalidTypeMessage, string, tooSmallMessage, type Messages } from "@codenhub/validation";

const messages: Messages = { invalid_type: invalidTypeMessage, too_small: tooSmallMessage };

const result = string({ min: 2 })("a");
if (!result.ok) {
  formatIssue(result.error.issues[0], messages); // "Must be at least 2 characters"
}
```

`englishMessages` es el mapa de los nueve. Una redacción que cita el problema que hay detrás de otro, como hacen `invalidKeyMessage`, `invalidUnionMessage` e `invalidFormatMessage`, lo redacta con el mapa con el que se la llamó. Así que incluye los códigos que puede tener el problema citado.

## Errores para un formulario

`flatten(failure, messages?)` agrupa los mensajes de un resultado fallido para mostrarlos. Los problemas de la raíz van a `formErrors`, y el resto se indexa por su ruta, escrita por `formatPath`, en `fieldErrors`:

```ts
import { flatten } from "@codenhub/validation";

const result = signup(input);
if (!result.ok) {
  const { formErrors, fieldErrors } = flatten(result.error);
  fieldErrors["email"]; // ["Invalid email address"]
  fieldErrors["addresses[0].street"]; // ["Must be at least 3 characters"]
}
```

Recibe el mismo mapa de mensajes que `formatIssue`, `englishMessages` a menos que se le pase otro. Lo que devuelve tiene el tipo `FlattenedErrors`.

`fieldErrors` no tiene prototipo. Así, un campo llamado `constructor` o `toString` no se puede confundir con un miembro heredado, y `fieldErrors["toString"]` es `undefined` cuando no existe ese campo. El costo es que no tiene métodos: pregunta con `"name" in fieldErrors` u `Object.hasOwn(fieldErrors, "name")`, no con `fieldErrors.hasOwnProperty("name")`.

## Lanzar una excepción ante una configuración inválida

Hay entradas que no se espera que sean inválidas. Un objeto de opciones que otro desarrollador le pasa a tu función, o el entorno de un servidor, solo está mal por error, y un error se lanza donde se cometió. `assert(validator, input, options?)` devuelve el valor que produjo el validador, o lanza un `TypeError`:

```ts
import { array, assert, invalidTypeMessage, object, string, tooSmallMessage } from "@codenhub/validation";

const config = object({ locales: array(string({ trim: true, min: 1 }), { min: 1 }) });
const messages = { invalid_type: invalidTypeMessage, too_small: tooSmallMessage };

export function createI18n(input: unknown) {
  const { locales } = assert(config, input, { subject: "[I18n]", messages });
  return locales;
}

createI18n({ locales: ["en", 1] }); // TypeError: [I18n] locales[1]: Expected string, received number
```

- El mensaje es el `subject`, escrito tal como lo diste, luego la ruta del primer problema, luego su redacción. Sin un `subject`, empieza en la ruta. Un problema en el valor mismo no tiene ruta.
- La redacción es el `message` propio del problema, luego el mapa `messages`, incluida su entrada `default`, y luego "Invalid value".
- **`assert` no tiene mapa predeterminado.** Sin `messages`, un problema sin mensaje propio dice "Invalid value", como en `TypeError: port: Invalid value`. La ruta igual dice qué opción está mal. Para más detalle, pasa `englishMessages`, un mapa de unos pocos códigos como el de arriba, o un `message` en cada validador, como más abajo.
- La `cause` del error es el fallo, así que `error.cause.issues` enumera todos los problemas que reportó el validador, no solo el primero.
- Acepta solo validadores síncronos, y lanza `TypeError: assert() needs a synchronous validator. Call the validator and await its result instead.` para uno que devuelve una promesa.
- Una opción que no conoce lanza una excepción, igual que en una fábrica: `TypeError: Unknown option subjct`.

```ts
import { assert, englishMessages, number, object } from "@codenhub/validation";

const options = object({ port: number({ int: true, min: 1, max: 65535 }) });

assert(options, { port: 8080 }, { subject: "createServer:" }); // { port: 8080 }
assert(options, { port: 0 }, { subject: "createServer:" }); // TypeError: createServer: port: Invalid value
assert(options, { port: 0 }, { subject: "createServer:", messages: englishMessages }); // TypeError: createServer: port: Must be at least 1
```

### Conservar tu propia redacción

Un paquete que ya lanza excepciones por sus opciones tiene una redacción que sus usuarios conocen. Dale a cada validador su `message`, y `assert` no necesita ningún mapa, así que no se empaqueta ninguna redacción de este paquete:

```ts
import { assert, boolean, nonBlank, objectLike, optional, string } from "@codenhub/validation";

const feedback = objectLike(
  {
    message: string({ message: "must be a non-empty string." }, nonBlank()),
    isRetryable: optional(boolean({ message: "must be a boolean when provided." })),
  },
  { message: "must be an object whose fields can be read." },
);

export function register(input: unknown) {
  return assert(feedback, input, { subject: "Registry feedback" });
}

register({ message: " " }); // TypeError: Registry feedback message: must be a non-empty string.
register({ message: "Try again", isRetryable: "yes" }); // TypeError: Registry feedback isRetryable: must be a boolean when provided.
register(null); // TypeError: Registry feedback must be an object whose fields can be read.
```

- El `message` de un validador redacta cada problema que reporta por sí mismo, y cada problema de sus verificaciones que no tiene mensaje. Así, una sola frase cubre un tipo incorrecto, un límite y `nonBlank()`. Dale a una verificación su propio mensaje donde las frases difieran.
- `assert` escribe la ruta antes del mensaje, así que el mensaje no nombra su campo: se lee después de `message:` o `locales[1]:`.
- `objectLike` acepta una instancia de clase o un `Error`, y reporta un getter que lanza una excepción con el mensaje del objeto. `object` solo aceptaría objetos planos, y dejaría pasar la excepción.

Usa `assert` para la configuración y otros argumentos. Para un formulario, una solicitud o cualquier otra cosa que un programa espera recibir inválida, llama al validador y lee su resultado, que enumera todos los problemas en lugar de lanzar una excepción por el primero.

## Enviar un resultado a otro lugar

Un resultado fallido son datos simples, así que se puede registrar en un log, enviar a un cliente o guardar. Ningún problema que reporta el paquete contiene un valor de la entrada, así que hacerlo no filtra lo que se envió. Un problema sí nombra las claves de la entrada, en `path`, y una verificación que escribas tú decide qué contiene su propio problema. Un resultado que pasó contiene el valor mismo.

Algunos valores no sobreviven intactos a JSON:

- Ningún problema contiene un bigint, que `JSON.stringify` no puede escribir: un límite o un valor esperado bigint se escribe como sus dígitos decimales, junto a `type: "bigint"`.
- Los límites de un validador `date` son `Date`, que `JSON.stringify` escribe como texto ISO. `englishMessages` redacta igual cualquiera de las dos formas.
- Un `literal` o un `oneOf` de `undefined`, de un símbolo o de un infinito contiene ese valor, que JSON escribe como `null` u omite. Redacta esos problemas antes de enviarlos.

## Siguiente

Los validadores integrados y sus mensajes cubren los casos comunes. Para una regla propia, como un nombre que no debe estar ya en uso, consulta [Validadores personalizados](./custom-validators.md).
