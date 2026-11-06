<!-- source: 8b6a2bc0d318fab0e498b4bcc66249a8ac563b48 -->

# @codenhub/validation

Validación para datos que no controlas: el cuerpo de una solicitud, una query string, un formulario, un mensaje de otro origen. Un validador te da el valor tipado o las razones por las que no lo es, y está hecho para una entrada que puede ser hostil:

- **Los formatos devuelven lo que leyó un parser.** `email()` y `url()` producen lo que ve el parser de URL de la plataforma, así que el valor que guardas es el que usará una solicitud o un servidor de correo.
- **Lo que reporta una entrada que falla está acotado.** Cada colección deja de reportar en 1000 problemas, como explica [Límites](docs/es/limits.md#una-entrada-que-falla-tiene-un-costo-acotado), y una entrada anidada demasiado profundo es un solo problema, no un desbordamiento de pila, siempre que el límite de profundidad de un esquema recursivo, [`maxDepth`](docs/es/limits.md#maxdepth), quepa en la pila.
- **Los problemas nunca contienen un valor de la entrada**, así que registrar una validación fallida no puede registrar una contraseña que se envió. Sí contienen aquello con lo que se configuró el esquema, como los valores que acepta un `oneOf` o el prefijo de un `startsWith`, y las claves de la entrada, en `path`, como explica [El problema](docs/es/errors.md#el-problema).

Cada validador es una función que importas por separado, así que un programa empaqueta solo los validadores que usa. Sin dependencias, así que el único código que auditar es el nuestro.

> [!WARNING]
>
> **Experimental:** anterior a 1.0. La API debería mantenerse en todas las versiones de parche de una versión menor, como cada 0.4.x. Un cambio que rompa el código que la usa, si llega a ser necesario, sale en la siguiente versión menor, y el [registro de cambios](docs/changelog/index.md) lo enumera, junto con las migraciones desde versiones anteriores.

## Instalación

```sh
pnpm add @codenhub/validation
```

## Uso

Un validador es una función. Eso es casi todo el diseño. Crea uno para la forma que esperas, llámalo con cualquier valor y lee el resultado:

```ts
import { email, flatten, object, string, type Infer } from "@codenhub/validation";

const signup = object({
  name: string({ trim: true, min: 2, max: 100 }),
  email: email(),
});

type Signup = Infer<typeof signup>; // { name: string; email: string }

const result = signup(requestBody);

if (result.ok) {
  result.value.name; // una cadena, sin espacios al inicio ni al final
} else {
  flatten(result.error).fieldErrors; // por ejemplo { email: ["Invalid email address"] }
}
```

Una entrada inválida no lanza excepciones: el resultado dice por qué falló. `signup` también es un [Standard Schema](docs/es/standard-schema.md), así que una biblioteca de formularios o un router que acepte uno lo acepta directamente.

## Documentación

- [Visión general de la documentación](docs/es/index.md), con el orden de lectura desde un primer validador hasta los límites de la entrada no confiable
- [Primeros pasos](docs/es/getting-started.md)
- [Formularios](docs/es/forms.md) y [Cuerpos de solicitud](docs/es/request-bodies.md)
- [Problemas y mensajes](docs/es/errors.md)
- [Referencia de la API](docs/reference/index.md)
- [Registro de cambios](docs/changelog/index.md)

## Requisitos

- Node.js 24 o posterior, o un navegador, worker o runtime de edge actual. `url()`, `email()`, `domain()` y `hostname()` necesitan `URL.canParse`, que Safari anterior a la 17 no tiene, así que ahí lanzan una excepción. `ip()` y `cidr()` también usan el parser de `URL`.
- Resolución de paquetes compatible con ESM. El paquete es solo ESM y está marcado con `sideEffects: false`. El código CommonJS puede cargarlo con `require()` en todas las versiones de Node.js compatibles.
- TypeScript 5.0 o posterior, para los tipos, que usan parámetros de tipo `const`.

## Notas

- **Una entrada inválida nunca lanza excepciones.** Una opción incorrecta, como `string({ min: -1 })`, lanza una excepción cuando se crea el validador. Las excepciones de tus propios callbacks se propagan, y también las de un getter o un trap de `Proxy` en la entrada, salvo con `objectLike`. [Leer el resultado](docs/es/getting-started.md#leer-el-resultado) tiene los detalles.
- **Los valores cambian solo cuando lo pides**, con `trim`, `case` o `clamp`, o cuando un formato tiene varias formas de escribir un mismo valor. `email()` y `url()` producen lo que leyó el parser de URL, e `ip()`, `uuid()`, `phone()` y los demás producen una única escritura canónica. Consulta [Formatos](docs/es/formats.md).
- **`email()` y `url()` aceptan solo nombres de host públicos**, no `localhost`, direcciones IP ni nombres como `db.internal`. `url({ host: hostname() })` acepta cualquier host. Ninguno de los dos resuelve el nombre. Consulta [`url`](docs/es/formats.md#url).
- **La validación es síncrona hasta que una regla devuelve una promesa**, y entonces los tipos indican que hay que esperar el resultado con `await`. Consulta [Síncrono y asíncrono](docs/es/getting-started.md#síncrono-y-asíncrono).
- **La entrada que pasa se revisa completa.** Limita el tamaño de la entrada no confiable, dale un `max` a cada colección y usa `audit(validator)` en una prueba para ver qué deja abierto un esquema. Un mensaje recibido por structured clone, como desde `postMessage`, puede contener millones de elementos en unos pocos bytes, y solo `max` lo acota. [Límites](docs/es/limits.md) tiene los detalles, y también [lo que logra una entrada hostil](docs/es/limits.md#lo-que-logra-una-entrada-hostil).

## Licencia

Licencia [Apache-2.0](LICENSE).
