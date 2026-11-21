---
title: Escribe tus traducciones
description: Diccionarios, archivos JSON, placeholders, mensajes ICU, plurales, formateadores, claves y valores tipados, cómo detectar claves sin traducir y límites de tamaño.
order: 1
source: 29b380f64cf0e7828f2c1d2390e7e9364778ce9f
---

# Escribe tus traducciones

Un diccionario es un objeto simple cuyos valores son strings u otros objetos. Esta página explica cómo organizar los diccionarios, cargarlos, meter valores y cantidades en el texto, hacer que TypeScript lo compruebe todo y mantener completo cada idioma.

Parte de los diccionarios `en` y `pt` de la tienda de té de la [visión general](index.md#recorrido). Al final, la tienda puede saludar a un cliente por su nombre, sumar el total de su carrito, decir cuándo se envía su pedido y detectar una palabra que falta en portugués antes que un cliente.

## Forma del diccionario

Anida las claves para agrupar los textos relacionados. Cada hoja tiene que ser un string:

```json
{
  "nav": { "home": "Home", "cart": "Cart" },
  "product": {
    "title": "Our teas",
    "shipping": { "label": "Shipping", "hint": "Free on orders over 50 euros" }
  }
}
```

El gestor aplana el anidamiento en claves separadas por puntos: `nav.home`, `product.shipping.hint`. También puedes escribir claves planas directamente, como `{ "nav.home": "Home" }`, o mezclar las dos formas, siempre que dos escrituras nunca produzcan la misma clave.

Un diccionario se rechaza con un `TypeError` cuando contiene alguna de estas cosas:

- Algo que no es texto ni un grupo, como un número, un array o `null`.
- Una clave que el gestor no puede usar, como `"nav..home"` o `" home"` con un espacio al principio.

El error nombra el locale y la clave, como en `[I18n] Invalid locale dictionary key "nav. home" in locale "pt".`; [Se rechaza un diccionario](troubleshooting.md#se-rechaza-un-diccionario) repasa cada regla y cómo corregirla.

Un diccionario vacío no es problema. Un locale que agregaste pero todavía no tradujiste arranca con normalidad y muestra el texto del locale por defecto en todas partes.

## Guarda los diccionarios en archivos JSON

La mayoría de las apps tiene un archivo JSON por locale, a menudo porque los editan traductores o un servicio de traducción, y un archivo JSON es más fácil de pasarle a alguien que uno de TypeScript:

```text
src/locales/
  en.json
  pt.json
```

Cárgalos con un `import()` dinámico, para que un visitante descargue solo los idiomas que el gestor necesita: el suyo, más tu idioma por defecto como respaldo:

```ts
import { createI18n } from "@codenhub/i18n";
import type en from "./locales/en.json";

export const i18n = createI18n({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  async loadLocale(locale): Promise<typeof en> {
    const module = await import(`./locales/${locale}.json`);
    return module.default;
  },
});
```

Esto comparte un único gestor en toda una app de navegador. En un servidor o en un build estático, envuelve `createI18n()` en una función y llámala para cada solicitud o página, como explica [Renderiza en un servidor](server-rendering.md#un-gestor-por-solicitud).

El tipo de retorno `Promise<typeof en>` es lo que te da las claves tipadas: un import dinámico devuelve `any`, que de otro modo dejaría pasar cualquier string. `import type` necesita `"resolveJsonModule": true` en tu `tsconfig.json`, y nunca termina en tu bundle.

Para pedir los diccionarios a un servidor, devuelve el JSON ya parseado, lanza una excepción cuando la respuesta falla y date por vencido después de un rato:

```ts
async loadLocale(locale): Promise<typeof en> {
  const response = await fetch(`/locales/${locale}.json`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Locale request failed: ${response.status}`);
  return response.json();
}
```

El `throw` hace que el gestor informe el fallo en lugar de cargar tu página 404 como si fuera un diccionario. El timeout importa más de lo que parece; la siguiente sección explica por qué.

Tu loader se encarga de todo lo relativo al transporte: URLs, encabezados de caché, reintentos, timeouts y credenciales. El gestor solo lo llama y comprueba lo que devuelve.

### Cómo se comporta la carga

- El gestor carga un locale la primera vez que lo necesita y guarda el resultado, así que volver a un idioma no llama otra vez a tu loader.
- Arrancar con un locale que no es el por defecto, o cambiar a uno, carga ese locale, los locales a los que recurre y el locale por defecto, todos juntos, como explica [Variantes regionales](#variantes-regionales).
- Si tu loader lanza una excepción o se rechaza, la llamada que lo necesitaba se rechaza con un `I18nError`, y el gestor mantiene su idioma actual. La siguiente llamada vuelve a intentar con el loader. [La carga de un locale falla](troubleshooting.md#la-carga-de-un-locale-falla-con-i18nerror) muestra cómo mostrarle ese error al visitante.
- Mientras un locale se está cargando, cualquier otra llamada que lo necesite espera a esa misma carga en lugar de volver a llamar a tu loader. Así que un loader que nunca termina, como un `fetch()` a un servidor que acepta la conexión y después no dice nada, bloquea ese locale para siempre. Cada `setLocale()` posterior a ese locale, botón de reintentar incluido, espera a la misma promesa atascada. Haz que tu loader tenga un timeout, como con `AbortSignal.timeout()` arriba; un timeout se rechaza, y la siguiente llamada vuelve a intentar.
- Devolver siempre el mismo objeto, como un import a nivel de módulo, permite que todos los gestores compartan una sola copia ya comprobada. Eso importa en un servidor, que [crea un gestor por solicitud](server-rendering.md).
- Trata un diccionario como de solo lectura una vez cargado. El gestor guarda una copia congelada y comprobada, que comparten todos los gestores que cargan el mismo objeto, así que los cambios posteriores al objeto no tienen ningún efecto.

## Variantes regionales

Un locale regional solo necesita las palabras que cambian. La tienda quiere un "Oi" más informal para los visitantes de Brasil, donde su portugués general dice "Olá", así que agrega `pt-BR` junto a `pt`. Con los dos en `locales`, el diccionario de `pt-BR` puede tener solo las palabras brasileñas, y todas las demás claves vienen de `pt`:

```ts
export const i18n = createI18n({
  locales: ["en", "pt", "pt-BR"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});
// pt-BR: { home: { greeting: "Oi, {name}!" } }
// pt:    { home: { title: "Bem-vindo", greeting: "Olá, {name}!" }, ... }
await i18n.init({ locale: "pt-BR" });
t("home.greeting", { name: "Ana" }); // "Oi, Ana!"
t("home.title"); // "Bem-vindo", de pt
```

Una clave se busca en este orden:

1. El locale activo.
2. Cada locale configurado que resulta de quitarle sus últimos subtags, como `zh-Hant` para `zh-Hant-TW`. Un padre escrito en otro script se omite: `zh` es chino simplificado, así que una página `zh-Hant` recurre al locale por defecto en lugar de mezclar escrituras.
3. El locale configurado que nombran su idioma y su script, como `zh-Hant` para `zh-HK`, que se escribe en chino tradicional, o `sr-Latn` para `sr-ME`. Así que un diccionario `zh-HK` puede contener solo lo que Hong Kong dice distinto.
4. El locale por defecto.

Un grupo de plurales usa las reglas del locale en cuyo diccionario está.

Todos los locales de esa cadena se cargan junto con el activo, así que arrancar en `pt-BR` carga `pt-BR`, `pt` y `en`. Si uno de ellos falla, la llamada se rechaza como con cualquier locale.

Solo cuentan esos padres. `es-MX` no recurre a `es-419`, porque `es-419` no es ni una versión más corta de `es-MX` ni su idioma y script. Dale su propio diccionario, o atiende a los visitantes de México directamente con `es-419`, como muestra [Convierte entradas externas en un locale](index.md#convierte-entradas-externas-en-un-locale).

## Pon valores en el texto

Escribe `{name}` donde va un valor, y pásale el valor a `t()`:

```json
{ "order": { "confirmed": "Thanks, {name}. Order {orderId} ships tomorrow." } }
```

```ts
t("order.confirmed", { name: "Ana", orderId: "1042" });
// "Thanks, Ana. Order 1042 ships tomorrow."
```

Los valores pueden ser strings, números, bigints o fechas. Un bigint va donde va un número, y se formatea sin perder dígitos. Los nombres de los placeholders usan letras ASCII, dígitos y `_`, como `{firstName}` o `{first_name}`. Un nombre con cualquier otra cosa, como `{first-name}` o `{nome_ç}`, no es un placeholder: el mensaje tiene sintaxis inválida, registra una advertencia y muestra `{first-name}` tal como está escrito.

Usa placeholders en lugar de juntar fragmentos. `t("before") + name + t("after")` obliga a todos los idiomas a seguir el orden de palabras del inglés, mientras que una oración entera con un placeholder deja que cada traducción ponga el valor donde corresponde. El orden de las palabras es lo primero que todo traductor quiere cambiar, y casi siempre tiene razón.

Algunos detalles:

- Un placeholder sin un valor que le corresponda se queda tal como está escrito, así que un valor que falta aparece en pantalla como `{name}` en lugar de desaparecer.
- Una llamada a `t()` completa como máximo 100 argumentos, contando los que están dentro de las formas de plural y de select, y deja el resto tal como está escrito. Una oración de interfaz no se acerca ni de lejos; el límite evita que un mensaje enorme traído de fuera cueste un paso de formateo por placeholder.
- Un número en un `{name}` simple se formatea para el lector, como hace `{name, number}`: `1234.5` se lee "1,234.5" en inglés y "1.234,5" en portugués. Escribe `{name, number, integer}` u otro estilo, como muestra la siguiente sección, para formatearlo de otra manera.
- Las llaves y los apóstrofos son sintaxis de los mensajes, así que el texto que los muestra literalmente necesita comillas; consulta [Llaves y apóstrofos literales](#llaves-y-apóstrofos-literales).

### Formatea números y fechas en el texto

Los mensajes usan la sintaxis de [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/), así que una traducción puede decir cómo se escribe cada valor:

```json
{
  "cart": {
    "total": "Total: {amount, number}",
    "discount": "{rate, number, percent} off"
  },
  "order": {
    "shipped": "Shipped on {date, date, long} at {date, time, short}"
  }
}
```

```ts
t("cart.total", { amount: 1234.5 }); // "Total: 1,234.5", o "Total: 1.234,5" con el texto en portugués
t("cart.discount", { rate: 0.15 }); // "15% off"
t("order.shipped", { date: new Date() });
```

| Argumento               | Estilos                                                            | Valor                   |
| ----------------------- | ------------------------------------------------------------------ | ----------------------- |
| `{n, number}`           | ninguno, `integer`, `percent`                                      | número o bigint         |
| `{d, date}`             | `short`, `medium` (el valor por defecto), `long`, `full`           | `Date` o un timestamp   |
| `{d, time}`             | `short`, `medium` (el valor por defecto), `long`, `full`           | `Date` o un timestamp   |
| `{n, plural, …}`        | consulta [Plurales](#plurales)                                     | número o bigint         |
| `{n, selectordinal, …}` | formas ordinales, como `one {#st} two {#nd} few {#rd} other {#th}` | número o bigint         |
| `{v, select, …}`        | cualquier palabra, más `other`                                     | string, número o bigint |

El formato usa el idioma del diccionario del que vino el texto, así que un texto en inglés que cubre una clave que falta en portugués se escribe a la manera del inglés. Un argumento cuyo valor tiene el tipo equivocado, como un string para `{n, number}`, se queda tal como está escrito.

Dos cosas que los mensajes no pueden hacer, las dos a propósito:

- **Skeletons y monedas.** `{n, number, ::currency/EUR}` y `{n, number, currency}` son sintaxis inválida: una traducción no puede saber en qué moneda está el importe. Formatea el importe en el código, como abajo, y pasa el string.
- **Anidar más de 10 niveles.** Un `plural` o un `select` puede ir dentro de las opciones de otro, hasta 10 niveles de profundidad. Un nivel 11 se trata como sintaxis inválida. Si un mensaje se acerca a eso, ya dejó de ser un solo mensaje; divídelo.

Un `select` elige el texto según un valor, como un pronombre, y necesita una opción `other`:

```json
{ "review": { "replied": "{gender, select, female {She} male {He} other {They}} replied to your review" } }
```

Para formatear un valor en el código, usa los formateadores del gestor. Siguen el locale activo:

```ts
i18n.formatNumber(9.99, { style: "currency", currency: "EUR" }); // "€9.99"
i18n.formatDate(new Date(), { dateStyle: "long" }); // "November 2, 2026"
i18n.formatRelativeTime(-1, "day", { numeric: "auto" }); // "yesterday"
i18n.formatList(["Ana", "Bia", "Caio"]); // "Ana, Bia, and Caio"
```

Aceptan las mismas opciones que `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` e `Intl.ListFormat`. Leen esas opciones igual que las lee `Intl`, incluidas las opciones que un objeto hereda, como las de un objeto de valores por defecto compartido que se pasó a `Object.create()`. Ante opciones inválidas lanzan lo mismo que lanzan esos.

### Zonas horarias

Las fechas y las horas se escriben en la zona horaria del runtime. En un navegador es la del lector, que suele ser la correcta. En un servidor es la del servidor.

Así que un pedido enviado a la 01:00 UTC del 2 de noviembre se renderiza como "November 2" para un lector en São Paulo, donde todavía es 1 de noviembre, y el texto cambia en cuanto el navegador toma el control. Zonas horarias: la razón por la que una fecha nunca es solo una fecha. Asigna a `timeZone` la zona que debe usar el texto:

```ts
createI18n({
  // ...
  timeZone: "America/Sao_Paulo",
});
```

Se aplica a `{d, date}`, a `{d, time}` y a una fecha en `{d}`, y es el valor por defecto de `formatDate`; `formatDate(value, { timeZone: "UTC" })` igual lo reemplaza. Una zona que `Intl` no conoce lanza un `TypeError` cuando se crea el gestor. En un servidor, defínela por solicitud, como en [Muestra las fechas en la zona horaria del lector](server-rendering.md#muestra-las-fechas-en-la-zona-horaria-del-lector).

### Llaves y apóstrofos literales

Un apóstrofo antes de `{` o `}` pone entre comillas el texto hasta el siguiente apóstrofo, y dos apóstrofos forman uno. Un apóstrofo en cualquier otra parte es un apóstrofo normal, así que "Don't" no necesita nada:

| Escrito en el diccionario | Se muestra              |
| ------------------------- | ----------------------- |
| `Don't forget {name}`     | `Don't forget Ana`      |
| `Type '{name}' to insert` | `Type {name} to insert` |
| `It''s '{'here'}'`        | `It's {here}`           |
| `Ouvrir l''{app}`         | `Ouvrir l'éditeur`      |
| `Ouvrir l’{app}`          | `Ouvrir l’éditeur`      |

Cuidado con un apóstrofo justo antes de un placeholder, como el que pone la elisión en francés, italiano y catalán. `Ouvrir l'{app}` pone `{app}` entre comillas, así que muestra `Ouvrir l{app}`, y nada avisa, porque el texto es válido. Escribe dos apóstrofos, `l''{app}`, o el apóstrofo tipográfico `’`, que la tipografía francesa prefiere de todos modos y que nunca es sintaxis.

Dentro de las formas de un plural, `#` representa el número; escribe `'#'` para un `#` literal. Un `select` anidado en una forma no es el plural en sí, así que un `#` ahí se muestra tal como está escrito, igual que en ICU; pon `{count}` en su lugar.

El texto entre comillas también es texto para los tipos: en `'{it''s {x}'`, que muestra `{it's {x}`, `x` no es un valor que `t()` pida.

Un texto que no es sintaxis válida, como una `{` sin cerrar o una `}` suelta, registra una advertencia, salvo que el gestor esté en silencio, y se muestra con solo sus placeholders `{name}` completados. La advertencia nombra la clave y el locale, y aparece una vez por cada texto en cada locale, entre los 1000 más recientes. [Encuentra claves sin traducir](#encuentra-claves-sin-traducir) muestra un test que comprueba cada mensaje.

## Plurales

"1 items" está mal en inglés, y otros idiomas tienen más formas que el inglés. El árabe tiene seis. Para que cada idioma elija, escribe la clave como un grupo de formas en lugar de un solo string. El carrito de la tienda ya lo hace:

```json
{
  "cart": {
    "items": {
      "one": "{count} item",
      "other": "{count} items"
    }
  }
}
```

Después pasa un número como `count`:

```ts
t("cart.items", { count: 1 }); // "1 item"
t("cart.items", { count: 5 }); // "5 items"
```

El gestor le pregunta al `Intl.PluralRules` integrado qué forma usa el idioma para ese número, y `count` también completa el placeholder `{count}`. Los nombres de las formas son las [categorías de plural de CLDR](https://cldr.unicode.org/index/cldr-spec/plural-rules) estándar:

| Forma   | Se usa para                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------- |
| `zero`  | Idiomas con una forma para el cero, como el árabe y el letón. El inglés usa `other` para 0.        |
| `one`   | Singular. El francés y el portugués de Brasil (`pt`, `pt-BR`) también la usan para 0; `pt-PT`, no. |
| `two`   | Dual, como en árabe, hebreo y galés.                                                               |
| `few`   | Números pequeños, como 2–4 en polaco y checo.                                                      |
| `many`  | Números grandes en algunos idiomas, como el polaco y el árabe.                                     |
| `other` | Todo lo demás. **Inclúyela siempre**; es el respaldo de cualquier forma que dejes fuera.           |

Cada diccionario solo necesita las formas que usa su propio idioma: el archivo en inglés tiene `one` y `other`, y el archivo en árabe tiene las seis. Busca las formas de un idioma en la [tabla de reglas de plural de CLDR](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html).

Cuando a un locale le falta un grupo de plurales, se usa el grupo del locale por defecto, con las reglas del idioma por defecto, ya que ese texto está en el idioma por defecto.

Tres cosas a tener en cuenta:

- **`count` tiene que ser un número o un bigint.** Un string como `"5"` no elige ninguna forma; el grupo se trata entonces como una clave que falta. Conviértelo donde entra, como con `Number(params.get("count"))`. El gestor no adivina, porque `"1,5"` es uno y medio en portugués y para JavaScript ni siquiera es un número.
- **Un string simple bajo la misma clave gana sobre las formas.** Si `cart.items` es un string, `count` solo completa `{count}`.
- **Sin `other`, no es un grupo de plurales.** `{ "one": "…", "two": "…" }` funciona solo para las cantidades cuya forma justo está ahí; cualquier otra cantidad muestra la clave. `has()` dice que ese grupo no es una clave, y las claves tipadas no lo ofrecen. Agrega `other`.

### Plurales dentro de una oración

Un grupo de plurales elige el texto entero. Para elegir solo una parte de una oración, o para darle al `0` su propia redacción, escribe un plural ICU en un solo string. `#` es el número, formateado para el idioma, y `=N` coincide con un número exacto antes de consultar las formas:

```json
{
  "cart": {
    "summary": "Hi {name}, {count, plural, =0 {your cart is empty} one {you have # item in your cart} other {you have # items in your cart}}."
  }
}
```

```ts
t("cart.summary", { name: "Ana", count: 0 }); // "Hi Ana, your cart is empty."
t("cart.summary", { name: "Ana", count: 1200 }); // "Hi Ana, you have 1,200 items in your cart."
```

`=N` compara números, no texto, así que `=1`, `=1.0` y `=01` coinciden todos con 1. Eso también hace que dos de ellos en un mismo mensaje sean la misma opción dos veces: `{n, plural, =1 {…} =1.0 {…} other {…}}` es sintaxis inválida. Escribe cada número una sola vez.

`offset:N` le resta al número antes de elegir una forma y completar `#`, pero no antes de comparar con `=N`. Una página de producto puede usarlo para decir quién más compró un té:

```json
{
  "product": {
    "buyers": "{count, plural, offset:1 =0 {Nobody} =1 {{name}} one {{name} and # other} other {{name} and # others}}"
  }
}
```

Con un `count` de 2, `t("product.buyers", { name: "Ana", count: 2 })` muestra `Ana and 1 other`.

Las dos formas de escribir plurales están soportadas. Los grupos de plurales mantienen cada forma como una clave normal, algo que algunas herramientas de traducción manejan mejor.

## Claves tipadas

Cuando TypeScript puede ver el tipo de tu diccionario, `t()` solo acepta las claves que existen:

```ts
t("cart.items", { count: 2 }); // ok: un grupo de plurales
t("cart.items.one"); // ok: una sola forma también es una clave
t("cart"); // error de compilación: un grupo de textos no es una clave
t("cart.itmes", { count: 2 }); // error de compilación: mal escrita
```

El tipo sale de lo que devuelve tu loader. Si devuelve varios diccionarios `as const`, se acepta una clave de cualquiera de ellos. Si devuelve `any` o `unknown`, como hacen `response.json()` y los imports dinámicos, se acepta cualquier string; dale al loader un tipo de retorno, como en el ejemplo de JSON de arriba, para recuperar la comprobación.

Una clave que construyes en tiempo de ejecución, como ``t(`errors.${code}`)`` para un código de error del checkout, no compila aunque exista, porque TypeScript no puede saber el valor de `code`. Compruébala con `has()`, que la acota a una clave que `t()` acepta, y elige un respaldo cuando no está:

```ts
const key = `errors.${code}`;
const message = i18n.has(key) ? i18n.t(key) : i18n.t("errors.unknown");
```

`has()` busca en los mismos diccionarios que `t()`:

- Un grupo de plurales cuenta como clave cuando tiene una forma `other`, sea cual sea el idioma activo. `t()` solo lee un grupo con un `count` numérico, así que, cuando la clave puede ser uno, pásalo, como en `i18n.t(key, { count })`; sin él, `t()` no la encuentra y llama a `onMissingKey`.
- Una clave no encontrada no llama a `onMissingKey` ni advierte, porque una clave que esperas que a veces falte no es un hueco en las traducciones.
- Un string que ningún diccionario puede contener, como uno con un salto de línea o de más de 1000 caracteres sin contar los espacios de los extremos, tampoco se encuentra, así que `code` puede venir de una respuesta o de un query string.

Cuando sabes que las claves están, haz un cast:

```ts
import type { TranslationKey } from "@codenhub/i18n";
import type en from "./locales/en.json";

type Key = TranslationKey<typeof en>;

t(`errors.${code}` as Key);
```

`TranslationKey` también sirve para tipar una prop de un componente o un helper que recibe una clave.

### Valores tipados

Cuando el diccionario por defecto es un objeto `as const` en un archivo `.ts`, TypeScript ve el texto de cada mensaje, y `t()` también comprueba sus valores:

```ts
// locales/en.ts
export default {
  home: { greeting: "Hello, {name}!" },
  cart: {
    total: "Total: {amount, number}",
    items: { one: "{count} item", other: "{count} items" },
  },
} as const;
```

```ts
t("home.greeting", { name: "Ana" }); // ok
t("home.greeting"); // error de compilación: name es obligatorio
t("cart.total", { amount: "3" }); // error de compilación: {amount, number} necesita un número
t("cart.items", { count: 2 }); // ok: un grupo de plurales requiere un count numérico
```

Qué valores acepta cada argumento:

- Los argumentos `number`, `plural` y `selectordinal` aceptan un número o un bigint.
- `date` y `time` aceptan un `Date` o un timestamp.
- `select` acepta un string, un número o un bigint.
- Un `{name}` simple acepta cualquiera de estos.

Se permiten valores de más. Cuando hay varios diccionarios tipados, una clave necesita los valores de cada uno que la tenga.

Un import de JSON tipa todo el texto como `string`, porque TypeScript no conserva los valores de los strings JSON, así que un diccionario JSON comprueba las claves pero acepta cualquier valor, salvo que un grupo de plurales sigue pidiendo un `count` numérico. Para comprobar los valores, escribe el idioma por defecto como TypeScript `as const` y deja los demás idiomas en JSON, tipados como el por defecto:

```ts
import en from "./locales/en";

const loadLocale = async (locale: Locale): Promise<typeof en> => (locale === "en" ? en : (await import(`./locales/${locale}.json`)).default);
```

El tipo de retorno del loader es lo que tipa `t()`, así que una traducción tiene que usar los mismos argumentos que el texto por defecto; el compilador no puede comprobar los archivos JSON.

### Cuándo no se comprueban los valores

Leer los argumentos de un mensaje ocurre por completo en el sistema de tipos, lo cual es muy ingenioso justo hasta que deja de ver el mensaje. En estos casos `t()` acepta cualquier valor, o ninguno, para esa clave. Nada deja de compilar; simplemente la comprobación queda apagada:

- **La clave es una de varias.** En `t(hasFailed ? "checkout.failed" : "checkout.done")`, TypeScript ve una unión de dos claves y no puede saber los valores de qué mensaje aplican. Llama a `t()` con cada clave en su propia rama, `hasFailed ? t("checkout.failed", { orderId }) : t("checkout.done")`, y cada llamada se comprueba.
- **El mensaje es un `string` simple**, como lo es todo texto en un diccionario JSON. Un grupo de plurales sigue pidiendo un `count` numérico, porque su forma lo dice. Escribe el idioma por defecto como TypeScript `as const`, como arriba.
- **El mensaje tiene sintaxis inválida**, como una `{` sin cerrar, un nombre de placeholder que no está hecho de letras ASCII, dígitos y `_` (`{first-name}`), `{n, number, currency}`, o un `select` o `plural` sin `other`. Alguna sintaxis inválida, como una opción escrita dos veces, una forma plural desconocida o un anidamiento de más de 10 niveles, puede igual pedir valores. En cualquier caso, el runtime tampoco puede leerlo: registra una advertencia y muestra el texto con solo los placeholders `{name}` válidos completados. Corrige el mensaje; la [comprobación de mensajes](#encuentra-claves-sin-traducir) los encuentra.
- **El mensaje es demasiado largo para que los tipos lo lean**: unos 900 apóstrofos, 450 argumentos o 900 espacios dentro de las llaves de un argumento, en un mismo texto. TypeScript tiene un límite de cuán profundo puede llegar un tipo, y la lectura se detiene antes de alcanzarlo en lugar de hacer fallar tu build. En tiempo de ejecución el mensaje funciona con normalidad. Si tienes uno de estos, probablemente sean tres mensajes disfrazados de uno; dividirlo devuelve las comprobaciones.
- **El tipo del gestor está escrito a mano sin el diccionario.** `I18n<"en" | "pt", Key>` comprueba las claves pero no los valores. Pasa el tipo del diccionario como tercer argumento de tipo, `I18n<"en" | "pt", Key, typeof en>`, para que sigan comprobándose.

### Escribe los tipos tú mismo

Si escribes tú mismo el tipo del gestor, como en `let i18n: I18n<"en" | "pt">`, pasa también el tipo de las claves: `I18n<"en" | "pt", Key>`. El segundo argumento de tipo es `string` por defecto, que acepta cualquier clave. `createI18n()` lo completa por ti.

Deja que TypeScript infiera los tipos del gestor a partir de la configuración. Pasar tú algunos argumentos de tipo, como en `createI18n<"en" | "pt">(...)`, desactiva la inferencia para el resto, y las claves vuelven a ser un `string` cualquiera.

Si guardas la configuración en una variable aparte, marca el locale por defecto `as const`:

```ts
const config = {
  locales: ["en", "pt"] as const,
  defaultLocale: "en" as const,
  loadLocale: (locale: "en" | "pt") => dictionaries[locale],
};
```

Sin `as const`, TypeScript ve `defaultLocale` como cualquier `string`, y `createI18n(config)` informa que `string` no es `"en" | "pt"`.

## Encuentra claves sin traducir

Una clave que falta en un idioma muestra en silencio el texto del idioma por defecto, y es fácil que se te pase. Los visitantes de la tienda que leen en portugués la van a notar mucho antes que tu dashboard. Mejor atrápala en un test, comparando cada diccionario con el por defecto. `loadLocale()` devuelve un diccionario sin cambiar el idioma del gestor:

```ts
import { expect, test } from "vitest";
import { i18n } from "./i18n";

// Las formas de plural distintas de `other` cambian según el idioma, así que no se comparan.
// Una clave como `settings.one` sí se compara, salvo que su grupo también tenga `other`.
const isLanguageSpecificForm = (key: string, dictionary: Readonly<Record<string, string>>) => {
  const form = /^(.+)\.(zero|one|two|few|many)$/.exec(key);
  return form !== null && `${form[1]}.other` in dictionary;
};

test("every locale has every key", async () => {
  const defaults = await i18n.loadLocale(i18n.defaultLocale);
  const reference = Object.keys(defaults).filter((key) => !isLanguageSpecificForm(key, defaults));

  for (const locale of i18n.locales) {
    const dictionary = await i18n.loadLocale(locale);
    const missing = reference.filter((key) => !(key in dictionary));
    expect(missing, `missing in ${locale}`).toEqual([]);
  }
});
```

Para atrapar un mensaje con la sintaxis rota, como una `{` sin cerrar que dejó un traductor, busca cada clave en cada locale y haz fallar el test ante la advertencia. Para esto, el gestor no puede estar en silencio:

```ts
import { expect, test, vi } from "vitest";
import { i18n } from "./i18n";

test("every message is valid", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await i18n.init();

  for (const locale of i18n.locales) {
    await i18n.setLocale(locale);
    for (const key of Object.keys(await i18n.loadLocale(locale))) {
      i18n.t(key as Parameters<typeof i18n.t>[0]);
    }
  }

  expect(warn.mock.calls.filter(([text]) => String(text).startsWith("[I18n] Invalid message"))).toEqual([]);
  warn.mockRestore();
});
```

Para hacer fallar un test con claves que faltan en todos los diccionarios, como una errata en una clave que construiste en tiempo de ejecución, lanza una excepción desde `onMissingKey`:

```ts
createI18n({
  // ...
  onMissingKey(key, locale) {
    throw new Error(`Missing translation "${key}" in ${locale}`);
  },
});
```

## Límites de tamaño

Los diccionarios vienen de archivos y de servidores, y de vez en cuando un archivo o un servidor manda algo que no es un diccionario en absoluto: una descarga cortada, un proxy mal configurado o algo hecho a propósito para ser enorme. Por eso el gestor pone un tope a su tamaño, lo que evita que un archivo corrupto u hostil congele la página. Los valores por defecto alcanzan para cualquier app real, incluida una tienda de té con un menú larguísimo:

| Límite                           | Valor por defecto | Opción            |
| -------------------------------- | ----------------- | ----------------- |
| Profundidad de anidamiento       | 100               | `maxDepth`        |
| Traducciones                     | 10 000            | `maxTranslations` |
| Claves y grupos en total         | 20 000            | `maxProperties`   |
| Caracteres en un texto           | 100 000           | `maxValueLength`  |
| Caracteres en todos los textos   | 5 000 000         | `maxTotalLength`  |
| Caracteres en una clave completa | 1000              | fijo              |

Sube uno con `dictionaryLimits`, que mantiene el valor por defecto de cualquier límite que no indiques:

```ts
createI18n({
  // ...
  dictionaryLimits: { maxTranslations: 50_000, maxProperties: 100_000 },
});
```

Algunas reglas para los valores:

- Cada límite tiene que ser un número entero positivo, y un nombre que no sea uno de los cinco lanza un `TypeError` cuando se crea el gestor.
- Un diccionario anidado cuenta cada grupo como una propiedad, así que subir `maxTranslations` suele implicar subir también `maxProperties`.
- Subir `maxDepth` por encima de 499 no hace nada. Cada nivel agrega al menos una letra y un punto a la clave completa, así que un texto tan profundo rompería antes el límite fijo de 1000 caracteres por clave.

## Siguiente

Con tus diccionarios escritos, ponlos frente a alguien. En un navegador, sigue con [Traduce una app de navegador](browser.md), donde la tienda recibe su selector de idioma. En un servidor o en un build estático, salta a [Renderiza en un servidor o en tiempo de build](server-rendering.md).
