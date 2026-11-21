---
title: Solución de problemas
description: Qué significa cada error y cada advertencia, y cómo solucionarlo.
order: 5
source: 51965144a82b6ec2cf3356c49d4a3fad9d529c8a
---

# Solución de problemas

Algo se torció. Cada sección parte de lo que ves en la pantalla o en la consola, y después da la causa y la solución, así puedes saltar directo a tu síntoma. Los ejemplos usan las claves y los locales de la tienda de té de las páginas anteriores.

Todos los mensajes que escribe el paquete empiezan con `[I18n]`, lo que los hace fáciles de encontrar en una consola llena de advertencias ajenas.

## Se ve una clave en pantalla en lugar del texto

Ves `home.subtitle` donde debería haber texto, y la consola dice `[I18n] Missing key "home.subtitle" in locale "pt".`

Ni el idioma actual ni el idioma por defecto tienen esa clave. Revisa:

- Que no haya una errata en la clave o en el diccionario.
- Que el archivo de diccionario que editaste sea el que devuelve tu loader.
- En un grupo de plurales, que `count` esté y sea un número. Un grupo de plurales muestra su clave cuando falta `count` o cuando no es un número: `t("cart.items")` o `t("cart.items", { count: "2" })`. Pasa un número.

La advertencia aparece una vez por locale y clave, así una clave que falta en cada render no ahoga la consola, y nunca aparece cuando `isSilent` es `true`. Un callback `onMissingKey` la reemplaza y se ejecuta en cada clave faltante.

Si TypeScript no atrapó la errata, el tipo de retorno de tu loader es `any` o `unknown`. Consulta [Claves tipadas](translations.md#claves-tipadas).

## El texto se muestra en el idioma por defecto

Al idioma actual le falta la clave, así que se muestra el texto del idioma por defecto. Es el respaldo previsto y no registra nada. [Encuentra claves sin traducir](translations.md#encuentra-claves-sin-traducir) enumera cada hueco.

## `t()` lanza "requires successful initialization"

`t()`, `has()` y `setLocale()` lanzan un `Error` como `[I18n] setLocale() requires successful initialization.` hasta que el gestor arrancó, porque todavía no hay ningún diccionario que usar. Espera a `i18n.init()`, o a `initializeBrowserI18n()` en un navegador, antes de renderizar. En un framework, renderiza un estado de carga hasta que la promesa se resuelva, o empieza a renderizar después.

## Un locale se rechaza con `RangeError`

`init()`, `setLocale()` y `loadLocale()` lanzan un `RangeError` para un locale que no está en `locales`. La comparación ignora mayúsculas y minúsculas y los espacios alrededor, así que `"PT"` encuentra `pt`, pero `pt-BR` no encuentra `pt`. Para encontrar el locale soportado más cercano al idioma de un visitante, usa [`matchLocale()`](index.md#convierte-entradas-externas-en-un-locale), que sí asigna `pt-BR` a `pt`.

## La carga de un locale falla con `I18nError`

Tu loader lanzó una excepción o se rechazó, y el gestor envolvió el fallo en un `I18nError` con el mensaje `Failed to load translations for locale "pt".`:

- `error.code` es `"i18n.locale_load_failed"`.
- `error.locale` es el locale que falló.
- `error.cause` es lo que lanzó tu loader, como un error de red o un timeout.

El gestor mantiene su idioma actual, y la siguiente llamada vuelve a intentar con el loader, así que un botón de reintentar puede simplemente llamar otra vez a `setLocale()`. En un navegador, un locale guardado que falla recurre al locale detectado, y uno detectado, al locale por defecto; consulta [Cuando un loader falla durante el arranque](browser.md#cuando-un-loader-falla-durante-el-arranque).

### Muéstraselo al visitante

`I18nError.message` es para tus logs, no para las personas. El paquete exporta `i18nErrors`, un mensaje seguro para el código, en el formato que lee `@codenhub/error`. `@codenhub/error` es un paquete aparte; instálalo con `pnpm add @codenhub/error`. Registra los mensajes una vez, cuando arranca la app, y después convierte lo que sea que atrapes en algo que puedas mostrar:

```ts
import { createAppError, getErrorRegistry } from "@codenhub/error";
import { i18nErrors } from "@codenhub/i18n";

getErrorRegistry().codes.addList(Object.entries(i18nErrors));

try {
  await i18n.setLocale("pt");
} catch (caught) {
  const error = createAppError(caught);

  showToast(error.message); // "We couldn't load the text for this language. Try again."
}
```

`error.messageKey` es `"error.i18n.loader.localeLoadFailed"`, por si prefieres mostrar el mensaje en el idioma del visitante desde tu propio diccionario. Solo guarda ese texto en un locale que ya esté cargado: el que falló, por definición, no está disponible.

### Nunca falla, solo se queda colgado

Un loader que nunca termina, como un `fetch()` a un servidor que dejó de responder, deja el cambio esperando para siempre. El gestor llama al loader una vez y cada llamada posterior para ese locale espera a la misma promesa, así que reintentar tampoco ayuda. Ponle un plazo máximo a la solicitud, como en [Guarda los diccionarios en archivos JSON](translations.md#guarda-los-diccionarios-en-archivos-json): con `AbortSignal.timeout()`, el timeout se rechaza, el gestor informa un `I18nError` y la siguiente llamada vuelve a intentar.

## Se rechaza un diccionario

`init()`, `setLocale()` o `loadLocale()` lanzan un `TypeError` que nombra el problema, la clave y el locale cuando un diccionario no cumple las reglas. Estos fallos no se envuelven en `I18nError`, porque vienen del contenido del diccionario y no de su carga, y reintentar no va a cambiar el contenido.

Un diccionario tiene que ser un objeto simple, como un objeto literal o un JSON parseado. Cualquier otra cosa, incluidos `null`, un array o una instancia de una clase, da `[I18n] A locale dictionary must be a non-null object in locale "pt".`. Un loader que devuelve el propio `import("./pt.json")`, en lugar de su `.default`, entrega el módulo en lugar del diccionario y da `[I18n] A locale dictionary must be a module's default export, …`. Devuelve `(await import("./pt.json")).default`. Dentro del diccionario:

- **Cada valor es un string o un grupo.** `{ count: 3 }` da `[I18n] Locale dictionary value at "count" must be a string in locale "pt".`. Los números, los booleanos, `null`, los arrays, las funciones y objetos como `Date` o `Map` se rechazan todos. Escribe los números como texto, `"3"`, y pon las listas bajo claves numeradas o con nombre.
- **Ningún segmento de una clave está vacío.** `"nav..home"`, `"nav."` y `".nav"` se rechazan, como en `[I18n] Invalid locale dictionary key "nav..home" in locale "pt".`. Quita el punto de más.
- **Ningún segmento empieza ni termina con un espacio.** `{ " title": "Título" }` da `[I18n] Invalid locale dictionary key " title" in locale "pt".`, y lo mismo `"nav. home"`. Un espacio perdido es casi siempre una errata que haría imposible encontrar la clave. Los espacios dentro de un segmento, como en `"sign in"`, no son problema.
- **Ningún carácter de control.** Una clave como `"a\nb"` se rechaza. Los caracteres de control suelen venir de copiar y pegar; vuelve a escribir la clave.
- **Ningún segmento `__proto__`.** `"nav.__proto__"` se rechaza, porque podría usarse para manipular objetos. Elige otro nombre.
- **Una clave completa cabe en 1000 caracteres.** Las más largas dan `[I18n] Locale dictionary flattened keys must not exceed 1000 characters in locale "pt".`. Acorta la clave.
- **Dos escrituras nunca coinciden.** `{ "nav.home": "A", nav: { home: "B" } }` da `[I18n] Locale dictionary key collision at "nav.home" in locale "pt".`, porque las dos son `nav.home`. Quédate con una.
- **Cada grupo aparece una sola vez.** El mismo objeto usado bajo dos claves, o que se contiene a sí mismo, da `[I18n] A locale dictionary must not contain repeated objects in locale "pt".`. Copia el objeto.
- **Ni getters ni claves de tipo symbol.** Los datos que vienen de JSON nunca los tienen; construye el diccionario con valores simples.
- **Cabe dentro de los límites de tamaño.** Un mensaje nombra el límite que superó, como `must not exceed 100 levels of nesting`. Consulta [Límites de tamaño](translations.md#límites-de-tamaño) para subirlos.

Un diccionario vacío se acepta.

## `createI18n()` lanza `TypeError`

La configuración no es válida. La mayoría de los mensajes tienen la forma `[I18n] Invalid configuration: <option>: <problem>`, así que la opción que hay que corregir es lo primero que aparece después de los dos puntos. Comprueba que:

- `locales` sea una lista no vacía sin duplicados, ignorando mayúsculas y minúsculas, y que cada locale esté formado por letras y dígitos ASCII separados por guiones, como `pt-BR`.
- `defaultLocale` sea uno de los `locales`.
- `loadLocale` sea una función.
- `timeZone`, cuando está definido, sea uno que `Intl` conoce. Una errata da `timeZone: Must be a time zone Intl supports, such as "America/Sao_Paulo" or "UTC"`.
- `dictionaryLimits` nombre solo límites conocidos, cada uno un número entero positivo. `maxKeys` da `dictionaryLimits.maxKeys: Is not a recognized limit`, y `maxDepth: 0` da `dictionaryLimits.maxDepth: Must be a positive whole number`. [Límites de tamaño](translations.md#límites-de-tamaño) enumera los nombres.
- `isSilent`, cuando está definido, sea un booleano. `isSilent: "true"` da `isSilent: Expected boolean, received "true"`.
- `getLocaleDirection` y `onMissingKey`, cuando están definidos, sean funciones; si no, el mensaje dice `getLocaleDirection: Must be a function` o `onMissingKey: Must be a function`.
- La configuración sea un objeto simple. Una instancia de una clase, o un objeto que hereda sus opciones, se rechaza para que no se cuelen valores heredados.

`createI18n()` también le pregunta a `getLocaleDirection` la dirección del locale por defecto. Si devuelve algo que no es `"ltr"` ni `"rtl"`, recibes `TypeError: [I18n] Invalid direction for locale "en".`; `init()` y `setLocale()` lanzan lo mismo para el locale al que cambian, y mantienen el actual. Una excepción que lanza tu función pasa sin cambios. Consulta [Define la dirección tú mismo](index.md#define-la-dirección-tú-mismo).

### `createLocaleRouting()` lanza `TypeError`

El routing sigue las mismas reglas para `locales` y `defaultLocale`, con mensajes que empiezan con `[I18n] Invalid locale routing configuration:`. `localePrefix` es obligatorio, y tiene que ser `"always"`, `"except-default"` o `"when-ambiguous"`; omitirlo da `localePrefix: Expected "always", "except-default", or "when-ambiguous", received undefined`. Un problema en `pathnames` nombra su entrada, como `pathnames["/about"].pt`; [Errores que detecta](localized-urls.md#errores-que-detecta) explica cada uno y cómo corregirlo.

## TypeScript dice que `string` no se puede asignar al tipo del locale

```text
Type 'string' is not assignable to type '"en" | "pt"'.
```

El locale por defecto perdió su tipo exacto, normalmente porque la configuración vive en una variable aparte. Márcalo `as const`, como en [Claves tipadas](translations.md#claves-tipadas). Los locales se toman solo de `locales`, así que un valor por defecto `string` simple no puede ampliarlos.

Lo mismo pasa con `localePrefix` en una configuración de routing guardada en una variable, donde el mensaje nombra `"always" | "except-default" | "when-ambiguous"`: pon `as const` después del objeto entero, como en [URLs localizadas](localized-urls.md). Solo en `localePrefix` compila, pero tipa cada locale como `string`.

## Un mensaje muestra su texto sin procesar

Ves `{count, plural, one {# item} other {# items}` o `{first-name}` en pantalla, y la consola advierte sobre un mensaje inválido. El texto no tiene una sintaxis de mensaje válida, así que se muestra tal como está escrito, con solo sus placeholders `{name}` simples completados, en lugar de formateado a medias. La advertencia aparece una vez por texto y locale en cada proceso, sin importar cuántos gestores lo muestren.

Causas comunes:

- **Falta una llave o sobra una.** Cuéntalas; cada `{` necesita su `}`.
- **El nombre de un placeholder tiene otros caracteres.** Los nombres son letras ASCII, dígitos y guiones bajos, así que `{first-name}` y `{nome_ç}` se muestran tal como están escritos. Usa `{firstName}` o `{nome}`.
- **Un formato que este paquete no soporta**, como `{n, number, currency}` o un skeleton `::`. Formatea el valor con `formatNumber()` y pasa el resultado como un placeholder simple.
- **Anidamiento de más de 10 niveles**, o la misma opción `=1` dos veces. Simplifica el mensaje.

[Pon valores en el texto](translations.md#pon-valores-en-el-texto) explica la sintaxis.

## Un método de routing lanza `TypeError`

Si viene de `parse()`, el valor no es el pathname de una URL: no empieza con `/`, o contiene `?` o `#`. Pasa `url.pathname` en lugar de la URL completa o de una ruta con su query string, como el `request.url` de Node. Una ruta que sí es un pathname pero contiene algo que el routing rechaza, como `//` o un segmento de punto, hace en cambio que `parse()` devuelva `undefined`, así que la URL rara de un visitante se convierte en un 404 y no en un fallo de la app.

Si viene de `localize()` o de `localizeAll()`, la ruta es una de esas, o contiene algo que el routing rechaza. [Rutas que acepta](localized-urls.md#rutas-que-acepta) tiene la lista completa, con la solución para cada caso.

## `localize()` lanza `RangeError`: "would be read as"

La ruta que construiría `localize()` abre otra página, o la misma página en otro idioma. Hay dos causas habituales:

- **Pasaste una URL, no una ruta canónica.** `localize("/sobre", "en")` toma `/sobre` como la ruta canónica de una página en inglés. Si `/sobre` es la URL de la página "acerca de" en portugués, léela primero: `localize(routing.parse("/sobre").pathname, "en")`.
- **Una página que la tabla no enumera tiene la ruta traducida de otra página.** Con `"/contact": { es: "/about" }` y sin una entrada `/about`, `localize("/about", "es")` lanza `RangeError: [I18n] "/about" in "es" would be read as "/contact" in "es"; …`. Con `localePrefix: "when-ambiguous"`, una página en inglés en `/sobre` choca de la misma forma con un `/sobre` en portugués. Renombra una de las dos, agrega la página a `pathnames` o conserva el prefijo con `"except-default"`. [El riesgo que asumes](localized-urls.md#el-riesgo-que-asumes) explica por qué el routing no puede detectarlo antes.

## `localize()` lanza `RangeError`: "would be longer than 8,192 characters or 100 segments"

La ruta que pasaste es válida, pero el prefijo del locale o las palabras traducidas hacen que el resultado sea más largo de lo que acepta `parse()`. Acorta la ruta; un enlace tan largo probablemente también lo corten los servidores y los proxies mucho antes de que alguien lo lea.

## Un placeholder se muestra tal cual y nada advierte

Ves `Ouvrir l{app}` donde esperabas `Ouvrir l'éditeur`, y la consola está en silencio. El apóstrofo antes de `{` pone el placeholder entre comillas, lo cual es sintaxis de mensaje válida, así que no hay nada sobre lo que advertir. Escribe `l''{app}`, o usa el apóstrofo tipográfico, `l’{app}`. Consulta [Llaves y apóstrofos literales](translations.md#llaves-y-apóstrofos-literales).

## El binding del navegador advierte o rechaza

- **"Document synchronization requires a page document"**: `initializeBrowserI18n()` se ejecutó sin un `document`, como en un Web Worker, y lanzó `TypeError: [I18n] Document synchronization requires a page document; pass syncDocument: false without one.` antes de arrancar el gestor. Pasa `syncDocument: false` y ningún `root`; consulta [En un Web Worker](browser.md#en-un-web-worker).
- **"The manager already has a browser binding"**: llamaste a `initializeBrowserI18n()` dos veces para el mismo gestor. Llama a `disconnect()` en el primer binding, o quédate con uno.
- **"Browser initialization was superseded before its locale became active"**: tu código llamó a `i18n.init()` mientras el binding estaba arrancando el gestor, o a `i18n.setLocale()` sobre un gestor que ya estaba inicializado, aunque fuera al locale que ya se muestra. El gestor se queda con el resultado de tu llamada y el binding no queda conectado. Deja que el binding arranque el gestor, y cambia de idioma después de que su promesa se resuelva.
- **"Browser observation requires a root"**: `observe: true` necesita un `root` que observar.
- **"root must be an element, a document, or a shadow root, such as document.body."**: `root` era otra cosa, normalmente el `null` que devuelve `document.querySelector("#app")` en una página sin `#app`. El binding lanza la excepción antes de arrancar el gestor. Comprueba que el elemento exista en cada página que ejecuta el script, o pasa `document`.
- **`onMissingKey` lanzó una excepción**: el binding igual traduce todos los demás elementos, y después se rechaza con el primer error en la primera inicialización, o lo informa como un error no capturado después de un cambio de idioma posterior. Solo el texto o el atributo cuya clave faltaba conserva su valor. Una primera inicialización que se rechaza de esta forma deja el gestor arrancado pero el binding desconectado, así que los cambios de idioma posteriores no traducen la página; corrige el callback y vuelve a llamar a `initializeBrowserI18n()`.
- **"Could not read persisted locale", "Could not persist locale" o "Could not forget persisted locale"**: `localStorage` no está disponible, como en algunos modos de navegación privada o en un Web Worker. La elección del visitante no se guarda o, tras `switchToSystemLocale()`, no se olvida; todo lo demás funciona. Pasa `persistLocale: false` donde no hay almacenamiento, para arrancar sin ruido.
- **"Could not switch to the detected locale"**: el idioma del navegador cambió mientras el binding [seguía al sistema](browser.md#ofrece-una-opción-sistema), y el loader falló para el locale detectado. La página mantiene su idioma actual. Arregla el loader.
- **"switchToSystemLocale() requires a connected browser binding"**: llamaste a `switchToSystemLocale()` después de `disconnect()`. Llámalo en el binding que está conectado.
- **`Could not load locale "pt"; using "es".`** o **`Could not load locale "pt"; using the default locale.`**: el loader falló con un locale guardado o detectado distinto del por defecto, así que el visitante recibió el siguiente: el locale detectado a partir del navegador después de uno guardado, y después el por defecto. Corrige el loader; la elección guardada se conserva para la próxima vez. Si el propio locale por defecto no carga, no queda nada a lo que recurrir, y la inicialización se rechaza con `Failed to load translations for locale "en".`
- **"Skipping translation on <p> because translated elements must be leaves"**: el elemento con `data-i18n` tiene elementos hijos. Pon la clave en un elemento que contenga solo texto, o tradúcelo con `t()`.
- **"Skipping translation on <style> because the element can run, hide, or reparse its text as HTML"**: hay una clave `data-i18n` en un elemento `<script>`, `<style>`, `<noscript>`, `<template>`, `<iframe>`, `<noembed>`, `<noframes>`, `<xmp>` o `<plaintext>`, cuyo texto se ejecuta como código, decide qué se muestra o se escribe sin escapar cuando la página se guarda como HTML. La advertencia nombra la clave y pasa el elemento, así que la consola apunta a él. Mueve la clave a un elemento normal. Sus claves `data-i18n-<atributo>`, como el `data-i18n-title` de un `<iframe>`, se siguen traduciendo.
- **"Skipping translation on <p> because it is inside <xmp>, which can run, hide, or reparse its content as HTML"**: un elemento con una clave está dentro de uno de los elementos que nombra la entrada anterior, algo que solo el código puede hacer, por ejemplo al agregarlo a un `<xmp>` o a un `<template>` en lugar de a su `content`. No se traducen ni su texto ni sus atributos, ya que la página escribiría ambos sin escapar, o no los escribiría. Saca el elemento de ahí.
- **"Skipping translation because data-i18n contains an invalid key"**, o lo mismo para un `data-i18n-<attribute>`: la clave está vacía, tiene más de 1000 caracteres o contiene un carácter de control ASCII, así que ningún diccionario puede contenerla. El elemento conserva su texto actual. Corrige la clave en el HTML.
- **"Skipping translation because data-i18n names a message that needs values"**: el mensaje tiene un placeholder, un plural o un select, y la traducción de HTML no tiene valores para completarlos. El elemento conserva su texto del HTML, y la advertencia aparece una vez por clave. Renderiza ese texto con `t()` y pasa los valores.
- **"Skipping translation of the title of <style> because it names a style sheet set"**: hay una clave `data-i18n-title` en un elemento `<style>` o `<link rel="stylesheet">`, cuyo `title` agrupa hojas de estilo entre las que el navegador alterna, así que traducirlo cambiaría cuáles se aplican. El elemento conserva su `title`. Quita la clave.
- **Un atributo `data-i18n-href` no hace nada**: solo se pueden traducir los atributos de texto. Consulta [Traduce HTML sin un framework](browser.md#traduce-html-sin-un-framework).

Las advertencias del navegador se silencian junto con todas las demás cuando el gestor tiene `isSilent: true`.

## Si sigues atascado

La [referencia](../reference/index.md) (en inglés) documenta cada export, cada opción y los errores que lanza cada uno. Si el comportamiento cambió después de una actualización, el [registro de cambios](../changelog/index.md) (en inglés) dice qué cambió y cómo migrar.
