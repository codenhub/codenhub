---
title: Formularios
description: Reglas entre campos, campos opcionales y valores predeterminados, errores junto a cada campo, archivos y los tipos que contiene un formulario.
order: 2
source: 1ff0836cb731bb25d0500b44a4838571dc4d9066
---

# Formularios

Un formulario es donde más abunda la entrada inválida, ya que una persona la escribe en el teléfono, con prisa y con el autocompletado ayudando a su manera. También es donde esa persona necesita saber qué corregir. Esta página convierte el registro en un formulario: una contraseña escrita dos veces, campos opcionales con valores predeterminados, un archivo de avatar y errores que se muestran junto a cada campo. Termina con los tipos que necesita una biblioteca de formularios.

## Campos que deben coincidir

Una verificación pasada a un `object` se ejecuta cuando todas las propiedades pasaron, y ve el objeto completo, tipado. Por eso puede comparar campos. Dirige su problema al campo que hay que corregir con `path`:

```ts
import { check, object, string } from "@codenhub/validation";

const passwords = object(
  { password: string({ min: 12, max: 200 }), confirm: string({ max: 200 }) },
  check((data) => data.password === data.confirm, { path: ["confirm"], message: "Passwords must match" }),
);

passwords({ password: "correct horse battery", confirm: "nope" }); // { ok: false, ... }, código "custom"
```

`data` no necesita anotación: su tipo viene del objeto. [Validadores personalizados](./custom-validators.md#agregar-una-regla-con-check) explica qué más puede reportar una verificación.

### Una regla que no espera a los demás campos

Esa verificación no dice nada mientras alguna propiedad falle, ya que no hay un objeto completo que darle. En un formulario, eso suele ser demasiado tarde: con el nombre todavía vacío, el usuario se entera de que las contraseñas no coinciden solo después de corregir todo lo demás.

`checkFields(keys, test, issue?)` es una verificación que nombra las propiedades que necesita. Se ejecuta cuando esas propiedades pasaron, hayan pasado o no las demás, y su prueba recibe un objeto con solo esas propiedades:

```ts
import { checkFields, email, object, string } from "@codenhub/validation";

const signupForm = object(
  {
    name: string({ trim: true, min: 2, max: 100 }),
    email: email(),
    password: string({ min: 12, max: 200 }),
    confirm: string({ max: 200 }),
  },
  checkFields(["password", "confirm"], (data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "Passwords must match",
  }),
);

signupForm({ name: "", email: "ada@example.com", password: "correct horse battery", confirm: "nope" });
// { ok: false, ... }, código "too_small"
```

Esa llamada reporta dos problemas: el de `name`, y "Passwords must match" en `confirm`. Algunos detalles:

- Igual espera a las propiedades que nombra. Mientras `password` sea demasiado corta, no se dice nada sobre `confirm`, ya que la prueba compararía un valor que no es válido.
- Sus problemas van después de los de las propiedades, en el orden en que se pasaron las verificaciones.
- `data` contiene las propiedades nombradas y ninguna otra, así que la prueba no puede llegar a depender de una que tal vez falló. Una propiedad nombrada que está ausente, como puede estarlo una opcional, también está ausente de `data`.
- Recibe su problema igual que `check`, y una prueba que devuelve una promesa hace asíncrono al objeto.
- Una validación sigue dando un único resultado. Cuando otra propiedad tiene que esperar, como una que consulta a un servidor, la prueba de `checkFields` se ejecuta en cuanto puede, y su problema llega junto con el resto cuando todas las propiedades respondieron.
- Un nombre que el objeto no tiene lanza un `TypeError` cuando se crea el objeto, ya que es un error de escritura. Lo mismo pasa con una lista sin nombres, cuando se crea la verificación.

Funciona en `object` y en `objectLike`. Reserva `check` para una regla que necesita el objeto completo, y usa ambas en un mismo objeto cuando tengas los dos tipos de regla.

## Campos opcionales y valores predeterminados

Tres envoltorios aceptan un valor ausente además de lo que acepta el validador que envuelven:

- `optional(validator)` acepta `undefined`.
- `nullable(validator)` acepta `null`.
- `nullish(validator)` acepta ambos.

El valor aceptado se deja pasar, y cualquier otro valor va al validador interno. Así, `optional` no trata `null` ni la cadena vacía como ausentes. Los envoltorios no reportan problemas propios, así que no reciben opciones ni verificaciones: dáselas al validador que envuelven.

Dentro de un `object`, una propiedad cuyo validador puede producir `undefined` es opcional en el tipo, y se omite de la salida cuando la entrada no la tiene.

### Valores predeterminados

`optional(validator, value)` reemplaza `undefined` por un valor predeterminado, y pasa cualquier otro valor al validador. Así, un valor inválido se sigue rechazando, y solo se reemplaza uno que falta:

```ts
import { array, oneOf, optional, string } from "@codenhub/validation";

const plan = optional(oneOf(["free", "pro"]), "free");
const interests = optional(array(string({ max: 50 }), { max: 10 }), () => []);

plan(undefined); // { ok: true, value: "free" }
plan("gold"); // { ok: false, ... }, código "invalid_value"
```

Dentro de un `object`, una propiedad con valor predeterminado siempre está presente en el tipo de salida. Algunas reglas:

- El valor predeterminado se considera confiable, y no se valida.
- Un primitivo se usa directamente. Una función se llama cada vez, sin argumentos, para crear el valor predeterminado.
- Un array o un objeto debe venir de una función, como `() => []`. Un único valor quedaría compartido por todos los resultados, y un cambio en uno aparecería en el siguiente: un bug que tarda una semana en encontrarse y una línea en arreglarse. Los tipos lo rechazan, y `optional` lanza un `TypeError` cuando recibe uno desde JavaScript.
- Por la misma razón, un valor predeterminado que es en sí una función, como un callback para `func()`, se devuelve desde otra función: `optional(func(), () => noop)`. Si recibiera `noop` directamente, `optional` lo llamaría y usaría lo que devuelve, así que los tipos lo rechazan siempre que el validador interno pueda producir una función.
- El tipo supone que el validador nunca produce `undefined` para un valor presente, algo que todos los validadores integrados cumplen. Un `transform` que devuelve `undefined` se deja pasar, y el valor predeterminado reemplaza solo un valor que falta.

## Errores junto a cada campo

`flatten` agrupa por campo los mensajes de un resultado fallido, que es lo que muestra un formulario:

```ts
import { checkFields, flatten, object, string } from "@codenhub/validation";

const signupForm = object(
  { name: string({ min: 2 }), password: string({ min: 12 }), confirm: string() },
  checkFields(["password", "confirm"], (data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "Passwords must match",
  }),
);

const result = signupForm({ name: "A", password: "correct horse battery", confirm: "nope" });
if (!result.ok) {
  flatten(result.error).fieldErrors; // { name: ["Must be at least 2 characters"], confirm: ["Passwords must match"] }
}
```

Los problemas en la raíz del valor van a `formErrors`, y el resto se agrupa por su ruta en `fieldErrors`. [Problemas y mensajes](./errors.md#errores-para-un-formulario) explica `flatten` en detalle, y cómo redactar los mensajes en otro idioma.

## Archivos

Un formulario que envía un archivo llega como un `FormData`, desde `request.formData()` en un servidor o `new FormData(form)` en el navegador. `formData` lo lee, y `file` verifica cada archivo que contiene:

```ts
import { contentType, file, formData, object, optional, string } from "@codenhub/validation";

const signupUpload = formData(
  object({
    name: string({ trim: true, min: 2, max: 100 }),
    avatar: optional(file({ maxSize: 1_000_000 }, contentType(["image/png", "image/jpeg"]))),
  }),
);

export const readSignup = async (request: Request) => {
  const form = await request.formData();
  const [avatar, ...others] = form.getAll("avatar");
  if (others.length === 0 && avatar instanceof File && avatar.name === "" && avatar.size === 0) {
    form.delete("avatar");
  }
  return signupUpload(form);
};
```

Un campo de archivo sin un archivo elegido igual envía una parte, porque la forma que tiene un navegador de no enviar ningún archivo es enviar uno vacío: un `File` sin nombre y sin contenido. `optional` ve un valor, así que `file` lo acepta y `contentType` lo rechaza, ya que no contiene ninguna imagen. `readSignup` quita esa parte primero, así que un registro sin avatar pasa.

### `formData`

`formData(validator, options?, ...checks)` lee un `FormData`, de este realm o de otro, y lo convierte en un objeto con sus campos, cada uno una cadena o un `File`. Después produce lo que `validator` obtiene de ese objeto.

- Una clave que aparece más de una vez falla en su ruta con `invalid_key`, a menos que se active la opción `repeated`. Una verificación que viera uno de los dos valores mientras el servidor lee el otro dejaría pasar un valor que nadie verificó.
- Con `repeated: true`, cada clave da una lista, como lo necesita un campo de varios archivos o varias casillas marcadas con el mismo nombre: `formData(object({ photos: array(file({ maxSize: 5_000_000 }), { max: 10 }) }), { repeated: true })`.
- Cualquier otra cosa, incluidos un `URLSearchParams` o un objeto plano, falla con `invalid_type` y `{ expected: "form data", received }`.

El formulario se lee antes de llegar al validador, y leerlo implica leer todo el cuerpo. Así que limita el tamaño del cuerpo donde se lee la solicitud, y dale a cada `file` un `maxSize`.

`audit` mira dentro de `formData` lo que contiene. `toJsonSchema` y `encode` rechazan `formData`, como rechazan cualquier validador que no pueden escribir.

### `file`

`file(options?, ...checks)` acepta un `File`, de este realm o de otro, y lo produce. Un `Blob` no es un archivo, ya que un formulario envía un archivo con su nombre, y tampoco lo es un objeto que solo dice serlo. Las opciones nunca leen el contenido del archivo, y ningún problema contiene su nombre, su tipo ni un solo byte de él.

| Opción    | Falla con                                                         |
| --------- | ----------------------------------------------------------------- |
| `minSize` | `too_small`, `{ minimum, type: "file" }`, en bytes                |
| `maxSize` | `too_big`, `{ maximum, type: "file" }`, en bytes                  |
| `types`   | `invalid_value`, `{ options, type: "file" }`, los tipos indicados |

`types` compara el tipo de medio que declara el archivo, sin distinguir mayúsculas de minúsculas y sin parámetros como `;charset=utf-8`. El cliente declara lo que quiera, así que `types` por sí solo deja pasar un script llamado `photo.png` con el tipo `image/png`. Para verificar lo que contiene el archivo, usa `contentType`.

[`audit`](./limits.md#comprobar-que-un-esquema-tenga-los-límites-que-necesita) reporta un `file` sin `maxSize`, ya que el programa carga en memoria cualquier tamaño que acepte.

### `contentType`

`contentType(types, message?)` es una verificación para `file`. Lee los primeros bytes del archivo, y pasa cuando corresponden a uno de los tipos indicados, declare lo que declare el archivo.

- Conoce `image/png`, `image/jpeg`, `image/gif`, `image/webp` y `application/pdf`, y lanza una excepción ante cualquier otro tipo cuando se crea la verificación.
- Los primeros bytes son la firma de un formato, no una prueba de que el resto esté bien formado. Un programa que decodifica el archivo igual tiene que manejar uno que no puede decodificar.
- La lectura es asíncrona, así que un `file` con esta verificación es un `AsyncValidator`.
- Se ejecuta cuando todas las opciones del `file` pasaron, así que `maxSize` rechaza un archivo grande antes de leer un solo byte.
- Un contenido que no coincide falla con `invalid_value` y `{ options, content: true }`. Un archivo que no se puede leer falla con `{ unreadable: true }`.

## Los tipos de un formulario

Un formulario contiene lo que escribió el usuario, antes de validarlo. Ese es el tipo de entrada del validador, que difiere del tipo que produce dondequiera que el validador cambie su valor. `InferInput<typeof validator>` obtiene el tipo de entrada, e `Infer`, el de salida:

```ts
import { coerceNumber, object, oneOf, optional, type Infer, type InferInput } from "@codenhub/validation";

const preferences = object({ age: coerceNumber(), plan: optional(oneOf(["free", "pro"]), "free") });

type Preferences = Infer<typeof preferences>; // { age: number; plan: "free" | "pro" }
type PreferencesInput = InferInput<typeof preferences>; // { age: string | number; plan?: "free" | "pro" | undefined }
```

Los dos tipos difieren en:

- `optional` con un valor predeterminado, cuya entrada puede estar ausente.
- Los validadores `coerce`, que aceptan texto, como explica [Entrada de texto](./text-input.md).
- `transform`, y `pipe`, que acepta lo que acepta su primer validador.
- `json`, que acepta texto, y `searchParams`, que acepta texto o un `URLSearchParams`. El tipo de `searchParams` es `string | Iterable<[string, string]>`, para no nombrar un global propio de un solo runtime.
- `fallback`, que acepta cualquier cosa.

La limpieza no crea una diferencia: `string({ trim: true })` acepta y produce un `string`.

Un validador se sigue llamando con cualquier valor. El tipo de entrada dice qué puede pasar, para los tipos de un formulario o de quien lo llama, y nunca limita el argumento. Un validador que escribes a mano tiene el tipo de entrada `unknown`, a menos que su tipo diga otra cosa, como hace `Validator<number, string>` para uno que lee un número de un texto.

Una biblioteca de formularios que acepta un [Standard Schema](./standard-schema.md) obtiene ambos tipos del validador. [Integraciones](./integrations.md#formularios) muestra react-hook-form y TanStack Form.

## Siguiente

El formulario de registro está listo para el navegador. El servidor desconfía más: recibe los mismos datos como un cuerpo JSON, de cualquier cliente, y a menudo más de lo que envía un formulario: listas, diccionarios y formas que varían. [Cuerpos de solicitud](./request-bodies.md) cubre todo eso.
