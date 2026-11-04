---
title: Límites
description: Lo que cuesta una entrada que falla, los límites de los esquemas recursivos, los tamaños que necesita una entrada no confiable y cómo audit encuentra los límites que un esquema deja abiertos.
order: 12
source: e0d538a88e38b7688c5582656ba6fe10474f3eb6
---

# Límites

Un endpoint de registro recibe lo que cualquiera le envíe, incluida una entrada escrita para volverlo lento, agotar su memoria o hacerlo caer. Esta página dice qué limita el paquete por ti, qué te deja a ti y cómo comprobar que un esquema fija los límites que necesita. Léela antes de validar entradas que llegan de una red pública.

En resumen:

- Una entrada que falla reporta un número acotado de problemas: se detienen en 1000, y un esquema recursivo se detiene en una profundidad y en un número de llamadas.
- Una entrada que pasa se valida completa. Así que limitar su tamaño te corresponde a ti, con un `max` en el texto y en cada colección.
- `audit` enumera cada lugar donde un esquema deja un tamaño abierto, para que una prueba lo mantenga cerrado.

## Lo que logra una entrada hostil

La suite de pruebas ejecuta cada línea de abajo contra el paquete compilado, con el resultado que indica su comentario:

```ts
import { array, lazy, number, object, record, string, unknown, url, type Validator } from "@codenhub/validation";

// Un millón de elementos inválidos dan 1001 problemas: mil de ellos y uno que dice que la lista se detuvo ahí.
const flood = array(number())(Array.from({ length: 1_000_000 }, () => "x"));
String(flood.ok || flood.error.issues.length); // "1001"

// Una entrada anidada 100 000 niveles da un problema, donde una recursión sin límite desborda la pila.
interface Tree {
  children: Tree[];
}
const tree: Validator<Tree> = object({ children: array(lazy(() => tree)) });
let deep: Tree = { children: [] };
for (let level = 0; level < 100_000; level += 1) {
  deep = { children: [deep] };
}
tree(deep); // { ok: false, ... }, código "too_big"

// Una URL cuyo host está escrito como una dirección que un servidor no debe solicitar falla. El host no se resuelve,
// así que un nombre público que se resuelve a una dirección de esas pasa: comprueba también la dirección a la que te conectas.
url()("http://169.254.169.254/latest/meta-data"); // { ok: false, ... }
url()("http://localhost:3000"); // { ok: false, ... }
url()("javascript:alert(1)"); // { ok: false, ... }

// Una contraseña que falló no está en lo que registras.
const login = object({ password: string({ min: 12 }) })({ password: "hunter2" });
String(JSON.stringify(login).includes("hunter2")); // "false"

// Se rechaza una clave que se convertiría en el prototipo de una copia de la salida.
record(string(), unknown())(JSON.parse('{"__proto__":{"admin":true}}')); // { ok: false, ... }, código "invalid_key"
```

## Una entrada que falla tiene un costo acotado

Una colección se detiene una vez que sus elementos reportaron 1000 problemas. Los elementos que siguen no se validan. Un problema más, `too_big` con `{ maximum: 1000, type: "issues" }` en la ruta de la colección, indica que se detuvo.

- Un problema que contiene otros en `params.issues` cuenta junto con ellos. Así, un elemento que falla una `union` cuenta una vez, y una vez más por cada problema de cada opción. Una clave que falla cuenta junto con el problema que tiene detrás.
- Las claves desconocidas de un `object` estricto, las repeticiones que encuentran `unique` y `set`, las claves que una query string repite y los conflictos de una `intersection` se enumeran hasta el mismo límite.
- Solo se cuentan los problemas. Así que una entrada que pasa nunca se ve afectada, y una entrada que falla sigue fallando. Lo que cambia es que una lista larga de elementos inválidos no se reporta completa, y no cuesta la memoria ni el tiempo de reportarla.
- Para reportar cada fila inválida de una lista larga, como en una importación, llama tú mismo al validador de los elementos en cada fila.
- Los elementos que se validan de forma asíncrona ya comenzaron todos antes de que se cuente alguno. Así que el límite recorta lo que reportan, pero no su trabajo: dale a una colección así un `max`.

Un tamaño incorrecto se reporta de inmediato, sin validar los elementos. Así, una entrada enorme que excede un `max` nunca se recorre entera solo para ser rechazada.

## Datos recursivos

Un esquema recursivo usa `lazy`, como muestra [Cuerpos de solicitud](./request-bodies.md#datos-recursivos). La recursión es donde una entrada pequeña puede costar más, así que `lazy` tiene dos límites:

| Opción     | Valor predeterminado | Cuenta                                                       | Al superarlo                               |
| ---------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `maxDepth` | 128                  | Los niveles de `lazy` abiertos a la vez, de cualquier `lazy` | `too_big` con `{ maximum, type: "depth" }` |
| `maxCalls` | 10 000               | Las llamadas que un `lazy` hace en una validación            | `too_big` con `{ maximum, type: "calls" }` |

Cada uno debe ser un entero positivo, o `lazy` lanza una excepción al crearse.

### `maxDepth`

Cada nivel de anidamiento es un nivel de recursión, y la pila de JavaScript solo admite una cantidad limitada. Así que `lazy` los cuenta, y un valor que se encuentra más profundo que `maxDepth` falla en su propia ruta:

- Un cuerpo de solicitud con miles de arrays anidados y un objeto cíclico, que un validador recursivo seguiría para siempre, vuelven ambos con ese fallo y nunca lanzan una excepción.
- La cuenta la comparten todos los `lazy`; no se lleva una por cada uno. Eso es lo que limita la pila cuando dos validadores recursivos se llaman entre sí. Significa que un límite se compara con todos los niveles ya abiertos: `lazy(getter, { maxDepth: 1 })` usado dentro de cualquier otro `lazy` falla de inmediato, porque el exterior ya está un nivel adentro. Fija `maxDepth` para todo el anidamiento, no para la parte de un solo validador.
- Un nivel abierto antes de un `await` sigue abierto después. Así que un esquema recursivo asíncrono también está sujeto a `maxDepth`, incluso con un objeto cíclico.

Sube `maxDepth` solo para datos que sabes que son más profundos. Para un esquema que no espera en cada nivel, súbelo solo hasta donde la pila de tu runtime aguante para los validadores que escribiste. Cuánto aguanta una pila depende del runtime. Un worker tiene más o menos la mitad de la pila de una página en Chromium y Firefox. Un esquema con muchos validadores en cada nivel necesita más pila, así que baja `maxDepth` para un esquema así donde se ejecute en un worker.

### `maxCalls`

El trabajo puede crecer más rápido que la entrada. Una `union` prueba cada opción, y un `object` verifica cada propiedad incluso después de que una falló. Así que en una `union` recursiva de objetos, las opciones que no coinciden igual llegan a los hijos, en cada nivel.

Un `lazy` guarda lo que encontró para cada objeto en cada ruta durante una validación, y lo devuelve otra vez cuando llega al mismo objeto en la misma ruta. Así, esas opciones comparten el resultado de los hijos, y el trabajo crece con la entrada. Una verificación asíncrona debajo de él se ejecuta una vez por cada uno de esos pares de objeto y ruta, sin importar cuántas opciones lleguen a ella. Un primitivo no se guarda, ya que no tiene hijos que multipliquen el trabajo.

El trabajo que crea un objeto nuevo en cada nivel, como un `transform` que copia su valor antes de un `lazy`, no se puede compartir. Su trabajo se duplica con cada nivel, así que una entrada válida pequeña puede tardar muchísimo. `maxCalls` lo detiene: al superarlo, cada llamada siguiente de ese `lazy` falla.

```ts
import { array, lazy, literal, object, union, type Validator } from "@codenhub/validation";

const kids = array(lazy(() => node, { maxCalls: 5_000 })); // un límite para todos los nodos del cuerpo de la solicitud
const node: Validator<unknown> = union([object({ type: literal("a"), kids }), object({ type: literal("b"), kids })]);
const body = array(node, { max: 100 });
```

Qué cuenta como una validación:

- Una llamada como `body(input)`, y todo lo que alcanza hasta que su resultado se resuelve, sea cual sea el validador de la raíz. Así, los elementos de un `array` de valores recursivos comparten la cuenta de cada `lazy`, y las validaciones hechas una después de otra, como una por solicitud, tienen cuentas propias.
- Cada `lazy` cuenta sus propias llamadas contra su propio límite. Así, otro `lazy` que alcance la validación nunca anula el límite fijado en uno.
- Una validación hecha desde un callback que escribiste se cuenta aparte de la validación que ejecutó el callback: la prueba de un `check`, la función de un `transform`, un `guard`, la prueba de un `format`, el valor predeterminado de `optional` o `fallback`, o el getter de un `lazy`. Un validador pasado como hijo, incluso uno escrito a mano, forma parte de la validación que llega a él.
- Igual que `maxDepth`, se mantiene a través de los `await` de este paquete, como los de un `check` asíncrono. Un `await` dentro de un validador que escribes tú mismo no se ve: lo que ese validador llama después inicia una validación propia, con cuentas y niveles nuevos, así que ninguno de los dos límites acota la recursión a través de él. Pon el trabajo asíncrono en un `check`, o acota tú mismo un validador así.

Qué cuenta como una llamada:

- Cada objeto, array u otro valor con partes que llega al `lazy`, no solo cada nivel. Así, un esquema para cualquier valor JSON, cuyos arrays y records contienen elementos `lazy`, se detiene en 10 000 de ellos, por planos que sean.
- No cuenta un primitivo que llega al `lazy` y termina la recursión ahí, como un número en una lista. Así, una lista de un millón de números no tiene más límite que su `max`.
- Sí cuenta un primitivo a través del cual sigue la recursión, como un texto del que un `json` o un `transform` lee el nivel siguiente, y uno cuyo resultado está pendiente, como debajo de un `check` asíncrono.

Una validación que el límite detuvo conserva los problemas encontrados en el camino, cada uno con una ruta no más profunda de lo que permite `maxDepth`. Fija el límite en cada `lazy` del esquema, más bajo para entradas no confiables pequeñas, y súbelo para datos recursivos con más nodos que eso en una sola validación.

Un `lazy` debajo de una `union` falla como esa opción. Así que el código que ve quien llama es el `invalid_union` de la unión, con el problema `too_big` dentro de `params.issues`. `englishMessages` redacta la unión con él, "Too complex to check within 10000 recursive steps", sin importar lo que encontraron las otras opciones, ya que la entrada puede ser válida y solo demasiado grande. Para objetos que se distinguen por una propiedad, usa [`tagged`](./request-bodies.md#tagged), que lee primero la propiedad y valida solo la variante que coincide.

### Construye un esquema recursivo una sola vez

Un `lazy` creado mientras se ejecuta el getter de otro `lazy` comparte la cuenta de ese otro, y cada uno limita la cuenta a su propio `maxCalls`. Eso es lo que acota un esquema que se construye de nuevo en cada nivel, mediante un getter que llama a la función que lo construye, como en `const node = () => union([object({ kids: array(lazy(node)) }), …])`. Cada nivel crea validadores `lazy` nuevos, que de otro modo tendrían cada uno una cuenta propia, y su trabajo no tendría límite.

Un esquema así tampoco comparte resultados, ya que cada nivel es un validador nuevo. Así que su trabajo se duplica con cada nivel hasta que el límite lo detiene, y rechaza entradas válidas profundas que un esquema construido una sola vez acepta. `audit` y `toJsonSchema` lanzan un `TypeError` para él. Construye un esquema recursivo una sola vez y haz referencia a él, también dentro de una función que lo construye por ti:

```ts
import { array, lazy, object, string, type Validator } from "@codenhub/validation";

interface Comment {
  text: string;
  replies: Comment[];
}

const thread = (maxCalls: number): Validator<Comment> => {
  const comment: Validator<Comment> = object({ text: string(), replies: array(lazy(() => comment, { maxCalls })) });
  return comment;
};
```

## Limitar los tamaños te corresponde a ti

Los límites de arriba tratan de la pila y del trabajo por cada nodo. No tratan del tamaño, así que no detienen una entrada grande y plana. Los problemas de un valor que falla no crecen con él, ya que cada colección se detiene en 1000, y los de un valor recursivo están acotados por `maxDepth` y `maxCalls`. Pero el trabajo sobre un valor que pasa, o que falla solo cerca de su final, sigue creciendo con su tamaño. Así que:

- Limita el tamaño del texto no confiable antes de parsearlo, como en `pipe(string({ max: 100_000 }), json(category))`.
- Dale un `max` a cada `array`, `set`, `map` y `record`.
- Dale un `maxSize` a cada `file`, y limita el tamaño del cuerpo de una solicitud donde se lee la solicitud.

Un valor recibido por structured clone, como `event.data` de `postMessage`, necesita el `max` sea cual sea su tamaño en bytes. Puede contener un array disperso, o un mismo array en muchos lugares, así que un mensaje de unos pocos bytes puede contener millones de elementos.

## Comprobar que un esquema tenga los límites que necesita

Una entrada que pasa un validador se valida completa. Así que un cuerpo de un millón de elementos, o de un texto de un gigabyte, cuesta lo que cuesta su tamaño, y es lo que guardas. `audit(validator)` lee un esquema, sin llamarlo, y enumera cada lugar donde el tamaño de lo que acepta queda abierto:

```ts
import { array, audit, email, object, string } from "@codenhub/validation";

const signupBody = object({ name: string({ max: 100 }), email: email(), interests: array(string({ max: 50 })) });

audit(signupBody); // [{ rule: "unbounded_size", path: "interests", kind: "array" }]
```

Dale a `interests` un `max`, y la lista queda vacía, algo que una prueba verifica:

```ts
import { array, audit, email, object, string } from "@codenhub/validation";

const signupBody = object({ name: string({ max: 100 }), email: email(), interests: array(string({ max: 50 }), { max: 10 }) });

audit(signupBody); // []
```

Cada hallazgo es un `AuditFinding`, con una `rule`, la `path` de la parte en el esquema y su `kind`:

| `rule`             | Se reporta para                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"unbounded_size"` | Un `array`, `set`, `map` o `record` sin `max` ni `length`, una `tuple` con `rest` y sin `max`, y un `file` sin `maxSize`                                                                          |
| `"unbounded_text"` | Un `string` o `coerceString` sin `max` ni `length`, un formato que no acota su propio texto, `json` o `searchParams` que reciben texto abierto, y un `coerceBigint` sin un límite en cada extremo |
| `"raised_limit"`   | Un `lazy` cuyo `maxDepth` o `maxCalls` está por encima de su valor predeterminado                                                                                                                 |
| `"unreadable"`     | Un validador que no puede leer, como uno escrito a mano, cuyo límite no puede determinar                                                                                                          |

Cómo lee un esquema:

- **Los formatos cuya entrada está acotada por lo que aceptan** no necesitan `max`: `email`, `uuid`, `ulid`, `cuid2`, `nanoid`, `ip`, `cidr`, `mac`, `port`, `phone`, `creditCard`, `isoDate`, `hostname` y `domain`. Cualquier otro, como `url`, `hex`, `jwt` o uno creado con `format`, es texto como cualquier otro. Acótalo con un `pipe`, como se muestra abajo.
- **Cuenta un límite anterior.** Un paso de `pipe` lee lo que produjeron los pasos anteriores. Así que, después de un paso que acota su valor, nada necesita un límite propio. En `pipe(string({ max: 10_000 }), json(object({ tags: array(string()) })))`, el texto tiene como máximo 10 000 caracteres, y también todo lo que se parsea a partir de él. `pipe(string({ max: 2048 }), url())` acota una URL de la misma forma. El `max` de una colección acota cuántos elementos tiene, no lo que contiene cada uno, así que los elementos después de él siguen necesitando sus propios límites, a menos que los elementos anteriores también estuvieran acotados o sean números, booleanos, fechas o literales, que no contienen nada más.
- **El texto que se lee como bigint** tarda más que un tiempo lineal en convertirse. Así que `coerceBigint` necesita `min` o `gt`, y `max` o `lt`. Estos limitan los dígitos que convierte, y un texto con más dígitos se rechaza sin convertirse.
- **Una ruta** une los nombres de propiedad con `.`. Escribe `[]` para los elementos de un array o un set, `[0]` para un elemento de una tupla, `{}` para las claves y los valores de un record o un map, y `""` para el propio validador.
- **Un esquema recursivo** se lee una vez en cada lugar donde se usa, y no otra vez donde se refiere a sí mismo. Uno que se construye de nuevo en cada nivel, como lo construye `lazy(() => build())`, nunca se repite, así que `audit` lanza un `TypeError` para él, igual que `toJsonSchema`.
- **`formData`** se lee de punta a punta, hasta lo que contiene.

Lo que no juzga:

- Si un `max` es lo bastante pequeño. Cualquier número indica que alguien lo decidió.
- Las verificaciones, ya que se ejecutan sobre un valor que ya pasó, ni nada de lo que hace por dentro un `guard` o un validador escrito a mano.
- Lo que ninguna opción acota. Las claves que conserva un `object` con `unknownKeys: "passthrough"` y lo que acepta `unknown()` no se reportan. Usa `"strip"` o `"strict"` para las claves que el esquema no nombra, y un validador del tipo que esperas en lugar de `unknown()`.

## Siguiente

Aquí termina el orden de lectura. Para la firma exacta de cada exportación, consulta la [referencia de la API](../reference/index.md). Para lo que cambió entre versiones y cómo actualizar, consulta el [registro de cambios](../changelog/index.md).
