---
title: Visión general
description: Qué hace @codenhub/i18n, las cuatro ideas en las que se basa, un recorrido de cinco minutos, los idiomas de derecha a izquierda y cómo se comporta el gestor cuando las llamadas se superponen.
source: 38b9262954499fa3f796ad718ada86f093242a02
---

# Traduce tu app

`@codenhub/i18n` convierte claves como `"home.title"` en texto en el idioma de quien lee. Escribes tus traducciones como objetos simples o archivos JSON, uno por idioma, y el paquete hace el resto:

- Carga el que corresponde.
- Recurre a tu idioma principal cuando falta una traducción.
- Completa valores como nombres y cantidades.
- Escribe números y fechas como el lector espera verlos.
- Le dice a TypeScript qué claves existen, así que una errata no compila en lugar de llegar a producción.

El núcleo funciona igual en un navegador, en un servidor Node.js, en el build de un sitio estático o en un Web Worker. Dos extras opcionales se ocupan de las tareas que cambian según el entorno:

- **`@codenhub/i18n/browser`** elige el idioma del visitante, recuerda su elección, mantiene sincronizados los atributos `lang` y `dir` de la página y puede traducir HTML marcado con `data-i18n`. Casi todo eso necesita una página, así que en un Web Worker, que no tiene ninguna, requiere dos opciones más; consulta [En un Web Worker](browser.md#en-un-web-worker).
- **`@codenhub/i18n/routing`** pone el idioma en la URL, como en `/pt/about`, y puede traducir la propia ruta, como en `/pt/sobre` o `/sobre`. Solo lee y construye strings, así que funciona en cualquier parte, Worker incluido.

Estas páginas construyen una app pequeña de principio a fin: una tienda de té en línea con una página de inicio, un carrito que cuenta sus artículos, una página "acerca de" y un selector de idioma. Empieza en inglés y portugués. Otros idiomas se suman cuando una página los necesita: portugués de Brasil para las variantes regionales, árabe para el texto de derecha a izquierda y español cuando llega el momento de traducir las URLs. Una tienda junta idiomas como un carrito junta artículos: uno a uno, y más de los que tenía pensado.

## Cuatro ideas

Todo el paquete cabe en cuatro ideas. No hay una quinta escondida en una nota al pie.

**Un locale** nombra un idioma y, a veces, una región: `en`, `pt`, `pt-BR`, `ar`. Enumeras los locales que soporta tu app y eliges uno como **locale por defecto**: el idioma en el que tu app se escribe primero, y al que recurren todos los demás. La tienda de té se escribe primero en inglés, así que su locale por defecto es `en`.

**Un diccionario** contiene todas las traducciones de un locale. Las claves se pueden anidar para mantener juntos los textos relacionados:

```json
{
  "home": {
    "title": "Welcome",
    "greeting": "Hello, {name}!"
  }
}
```

Las claves anidadas se unen con puntos, así que este diccionario tiene las claves `home.title` y `home.greeting`.

**Un loader** es una función que escribes tú y que devuelve el diccionario de un locale. Puede devolver un objeto que importaste, leer un archivo o pedir JSON a tu servidor. El paquete nunca decide dónde viven las traducciones. Llama a tu loader cuando necesita un locale y guarda el resultado.

**Un gestor** une todo lo anterior. Creas uno con `createI18n()`, le dices qué locale usar y le pides texto con `t()`.

## Recorrido

### 1. Instala

```sh
pnpm add @codenhub/i18n
```

El paquete es un módulo ES y necesita Node.js 26 o posterior, o un navegador actual. No tiene dependencias de runtime.

### 2. Escribe dos diccionarios

Empieza con tu idioma por defecto y uno más. Aquí son objetos en un archivo TypeScript; [Escribe tus traducciones](translations.md) muestra cómo guardarlos en archivos JSON.

```ts
// src/locales.ts
export const dictionaries = {
  en: {
    home: { title: "Welcome", greeting: "Hello, {name}!" },
    cart: { items: { one: "{count} item", other: "{count} items" } },
  },
  pt: {
    home: { title: "Bem-vindo", greeting: "Olá, {name}!" },
    cart: { items: { one: "{count} item", other: "{count} itens" } },
  },
} as const;
```

El `as const` le permite a TypeScript ver las claves exactas, así puede comprobar cada llamada a `t()` contra ellas.

### 3. Crea el gestor

En una app de navegador, crea el gestor una sola vez en su propio módulo e impórtalo donde necesites texto:

```ts
// src/i18n.ts
import { createI18n } from "@codenhub/i18n";
import { dictionaries } from "./locales";

export const i18n = createI18n({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});

export const { t } = i18n;
```

`t` es un nombre corto para `i18n.translate`. Cada método del gestor funciona por sí solo después de sacarlo del objeto, como `t` aquí, así que puedes importar `t` directamente.

En un servidor, un único gestor compartido no es la forma correcta; [Renderiza en un servidor](server-rendering.md#un-gestor-por-solicitud) explica por qué y qué hacer en su lugar.

### 4. Arráncalo y traduce

El gestor tiene que cargar un diccionario antes de poder traducir, así que arráncalo una vez cuando arranca tu app y espera a que termine:

```ts
// src/main.ts
import { i18n, t } from "./i18n";

await i18n.init({ locale: "pt" });

t("home.title"); // "Bem-vindo"
t("home.greeting", { name: "Ana" }); // "Olá, Ana!"
t("cart.items", { count: 3 }); // "3 itens"
t("home.titel"); // error de compilación: esa clave no existe
```

`init()` sin un locale arranca con el locale por defecto.

Llamar a `t()` antes de que `init()` haya terminado lanza un error, porque todavía no hay con qué traducir.

### 5. Cambia de idioma

```ts
await i18n.setLocale("en");
t("home.title"); // "Welcome"
```

`setLocale()` primero carga el nuevo diccionario y solo cambia cuando terminó de cargarlo, así que el texto nunca aparece mitad en un idioma y mitad en otro.

Para volver a dibujar tu interfaz cuando cambia el idioma, pasa una función a `i18n.subscribe()`. Se ejecuta después de cada `init()` y de cada cambio de idioma que realmente ocurre; [Sigue el estado del gestor](#sigue-el-estado-del-gestor) dice exactamente cuándo es eso.

## Qué pasa cuando falta una traducción

Las traducciones rara vez se quedan completas. La tienda de té agrega envoltura para regalo, el texto en inglés sale el martes y el texto en portugués llega cuando llegue la traducción. El paquete cubre el hueco en dos pasos:

1. **La clave falta en el locale actual pero está en el locale por defecto**, o en un locale padre, como `pt` para `pt-BR` (consulta [Variantes regionales](translations.md#variantes-regionales)). Recibes ese texto. En el ejemplo de arriba, una clave que solo está en `en` muestra inglés a quien lee en portugués. No se registra nada, porque esto es normal mientras los traductores se ponen al día; [una comprobación de claves en tus tests](translations.md#encuentra-claves-sin-traducir) las encuentra.
2. **La clave falta en todas partes.** `t()` devuelve la clave, sin espacios alrededor, como `"home.subtitle"`, así el hueco se ve en pantalla y es fácil de buscar.

En el segundo caso, el gestor también registra una advertencia, como `[I18n] Missing key "home.subtitle" in locale "pt".`. Con qué frecuencia, y adónde va:

- Advierte una vez por cada par de locale y clave, entre todos los gestores del proceso, así una clave usada en cada render, o por un gestor por solicitud, no inunda la consola.
- Recuerda los 1000 pares más recientes, así que un par que sale de esa lista puede volver a advertir.
- Un gestor creado con `isSilent: true` nunca la registra.
- Para mandar las claves faltantes a tu propio logger, pasa `onMissingKey(key, locale)`. Reemplaza la advertencia y se ejecuta en cada clave faltante, no una vez por par. Si lanza un error, `t()` lanza el mismo error, así que una prueba puede fallar en la primera clave faltante; el binding del navegador traduce el resto de la página y luego rechaza con ese error.

`t()` siempre devuelve un string, así que nunca necesitas `?? ""` después.

Un string vacío es una traducción, no un hueco. `""` no muestra nada, no registra nada y no recurre a otro locale, así que un idioma puede omitir lo que otro necesita, como el tooltip de un botón cuya etiqueta ya dice "+ Add" en inglés pero solo "+" en portugués.

## Idiomas de derecha a izquierda

El árabe, el hebreo, el persa y el urdu se escriben de derecha a izquierda. Una página en uno de ellos tiene que indicarlo con `<html dir="rtl">`, o el navegador alinea el texto del lado equivocado y pone la puntuación en el extremo equivocado de la oración.

El gestor conoce la dirección de su locale activo como `i18n.direction`, que vale `"ltr"` o `"rtl"`. Supongamos que la tienda de té agrega árabe a sus `locales`:

```ts
await i18n.init({ locale: "ar" });
i18n.direction; // "rtl"
```

El binding del navegador la escribe en `<html dir>` por ti. En un servidor, escríbela tú en la página, como en [Renderiza en un servidor](server-rendering.md#un-gestor-por-solicitud).

### Cómo decide el valor por defecto

Un locale es `rtl` cuando el sistema de escritura en el que se escribe va de derecha a izquierda. Ese sistema de escritura es el subtag de script del locale, cuando tiene uno, como `Arab` en `uz-Arab`. Si no, es el script en el que más probablemente se escribe el idioma, que `maximize()` de `Intl.Locale` deduce a partir del idioma y la región:

| Locale                 | Dirección | Por qué                                                            |
| ---------------------- | --------- | ------------------------------------------------------------------ |
| `ar`, `he`, `fa`, `ur` | `rtl`     | Escrituras árabe y hebrea.                                         |
| `uz-Arab`              | `rtl`     | El subtag de script dice árabe.                                    |
| `pa`                   | `ltr`     | El panyabí se escribe más probablemente en gurmukhi.               |
| `pa-PK`                | `rtl`     | En Pakistán, el panyabí se escribe más probablemente en árabe.     |
| `sd-IN`                | `ltr`     | En la India, el sindhi se escribe más probablemente en devanagari. |
| `en`, `pt-BR`          | `ltr`     | Escritura latina.                                                  |

La región es la razón por la que una simple lista de idiomas se equivocaría: `pa` y `pa-PK` son el mismo idioma en dos escrituras. Para una etiqueta que `Intl.Locale` no puede leer, decide en su lugar una lista fija de idiomas de derecha a izquierda, como `ar` y `he`.

Los datos del script probable vienen con el motor de JavaScript y, para etiquetas poco comunes, pueden variar entre versiones del motor. Cuando una etiqueta es ambigua, lo mejor suele ser corregir la etiqueta: `sd-Arab-IN` dice explícitamente escritura árabe, y el valor por defecto la lee como `rtl`.

### Define la dirección tú mismo

Pasa `getLocaleDirection` para decidir en cada locale. Reemplaza por completo al valor por defecto, así que tiene que responder para todos:

```ts
export const i18n = createI18n({
  locales: ["en", "ar"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
  getLocaleDirection: (locale) => (locale === "ar" ? "rtl" : "ltr"),
});
```

El gestor la llama para el locale por defecto cuando se crea, y para cada locale con el que arranca o al que cambia. Puede fallar de dos maneras:

- **Devuelve algo que no es `"ltr"` ni `"rtl"`.** Eso lanza `TypeError: [I18n] Invalid direction for locale "ar".`: desde `createI18n()` cuando la respuesta para el locale por defecto es incorrecta, o desde el `init()` o el `setLocale()` que preguntó, lo que deja al gestor en su idioma actual. Devuelve exactamente uno de los dos strings.
- **Lanza una excepción.** Tu error no se envuelve ni se descarta: sale sin cambios de `createI18n()`, `init()` o `setLocale()`, y un cambio fallido también deja el idioma actual en su lugar.

## Sigue el estado del gestor

El gestor tiene algunas propiedades que puedes leer en cualquier momento:

- `i18n.locale` es el locale activo. Antes de que `init()` haya terminado, es el locale por defecto.
- `i18n.isReady` es `false` hasta que el primer `init()` tiene éxito, y después es `true`. Mientras es `false`, `t()` lanza una excepción.
- `i18n.direction` es la dirección del locale activo, como se vio arriba.
- `i18n.locales`, `i18n.defaultLocale` e `i18n.isSilent` son lo que configuraste. `locales` es una copia congelada.

### Reacciona a los cambios

`subscribe(listener)` llama a `listener`, sin argumentos, después de cada `init()` aplicado y de cada cambio de locale aplicado. Devuelve una función que lo detiene.

En esa oración, "aplicado" hace mucho trabajo:

- Un `setLocale()` al locale que ya está activo no cambia nada, así que no llama al listener.
- Una llamada a la que se adelantó otra posterior (siguiente sección) tampoco cambia nada, así que no llama al listener.
- Llamar a `init()` otra vez con el mismo locale sí se aplica, y sí lo llama.
- Llamar a `init()` otra vez con otro locale lo llama una vez, no una por evento.

Para el código que necesita saber qué cambió, el gestor también es un `EventTarget` con dos eventos:

- `ready`, después de cada `init()` aplicado. `event.detail.locale` es el locale con el que arrancó.
- `locale-change`, después de cada cambio de locale aplicado. `event.detail.locale` es el nuevo locale y `event.detail.previousLocale`, el anterior. Eso incluye un `init()` que cambia a otro locale un gestor que ya estaba listo, que emite `ready` y después `locale-change`. El primer `init()` solo emite `ready`, sea cual sea el locale con el que arranca.

```ts
i18n.addEventListener("locale-change", (event) => {
  console.info(`Language changed from ${event.detail.previousLocale} to ${event.detail.locale}`);
});
```

Los listeners se ejecutan en el orden en que se agregaron. Una excepción en un listener o en una función de `subscribe()` se informa como en cualquier `EventTarget`:

- En un navegador, es un error no capturado que no detiene a los demás listeners ni deshace el cambio.
- En Node.js, hace caer el proceso, algo que [Renderiza en un servidor](server-rendering.md#mantén-útiles-los-logs-de-producción) retoma.

### Gana la última llamada

Cargar lleva tiempo, y la gente hace clic más rápido de lo que responde la red. Cuando se superponen llamadas a `init()` o `setLocale()`, la que empezó última decide el idioma. Una llamada anterior que termina de cargar después de que empezó una posterior se resuelve sin aplicar nada: ni cambio de locale, ni evento, ni llamada de `subscribe()`.

Supongamos que un visitante que lee la tienda en inglés hace clic en "Português" en tu selector de idioma, se arrepiente y hace clic en "English" antes de que el portugués haya cargado:

```ts
const portuguese = i18n.setLocale("pt"); // primer clic
const english = i18n.setLocale("en"); // segundo clic
await Promise.all([portuguese, english]);
i18n.locale; // "en": la llamada en portugués se resolvió, pero no cambió nada
```

Así que después de `await i18n.setLocale("pt")`, no des por hecho que el locale es `pt`; lee `i18n.locale` cuando el resultado importa.

El segundo clic de ese ejemplo pide el idioma que ya se está mostrando, y aun así cuenta. Un `setLocale()` posterior al locale que ya está activo también es una llamada posterior: cancela un cambio pendiente, y el visitante se queda donde está.

Los fallos siguen la misma regla. Una llamada que falla se rechaza y deja el idioma actual como estaba. Si una llamada posterior ya se le adelantó, en cambio se resuelve en silencio, porque su fallo no dice nada sobre el idioma que se muestra ahora. Solo se rechaza el fallo de la última llamada.

### Convierte entradas externas en un locale

`init()` y `setLocale()` lanzan un `RangeError` para un locale que no está en `locales`. Un locale que viene de una cookie, de un query string o de un encabezado de la solicitud es texto no confiable, así que conviértelo primero en un locale configurado. Dos métodos hacen eso, para dos tipos de entrada.

**`resolveLocale(value)`** es para un valor que ya debería ser uno de tus locales, como un parámetro `?lang=` o una cookie que escribió tu app. Acepta solo coincidencias exactas, ignorando mayúsculas y minúsculas y los espacios alrededor y leyendo `_` como `-`, y devuelve el locale escrito como lo escribiste tú, o `undefined`:

```ts
const lang = new URL(location.href).searchParams.get("lang") ?? "";
await i18n.init({ locale: i18n.resolveLocale(lang) ?? i18n.defaultLocale });
// ?lang=PT arranca en "pt"; ?lang=fr, o sin lang, arranca en el locale por defecto.
```

Con `pt-BR` entre tus locales, `?lang=PT-br` y `?lang=pt_BR` arrancarían en `"pt-BR"` de la misma forma.

**`matchLocale(preferences)`** es para las preferencias de idioma de un visitante, como `navigator.languages` o los idiomas de un encabezado `Accept-Language`, del más preferido al menos. Encuentra el locale más cercano que soportas. Prueba cada preferencia en orden, y gana la primera que coincide con algo:

1. Una coincidencia exacta, ignorando mayúsculas y minúsculas: `pt-BR` obtiene `pt-BR`.
2. El locale configurado más largo con el que empieza la preferencia, por subtags completos, escrito en el mismo script: `pt-BR` obtiene `pt`.
3. Una coincidencia por subtags probables: `zh-TW`, chino tradicional, obtiene `zh-Hant`.
4. El mismo idioma en el mismo script: `pt-PT` obtiene `pt-BR` cuando ese es tu único portugués.

El noruego tiene dos códigos para el bokmål, `no` y `nb`, y los navegadores envían cualquiera de los dos, así que cuentan como un solo idioma: un sitio configurado con `no` atiende a un visitante que envía `nb`, y al revés. El nynorsk, `nn`, es su propia norma escrita y nunca coincide con ellos.

`und`, el código de un idioma indeterminado, se omite, con cualquier subtag, como `und-US`. No nombra ningún idioma, aunque los subtags probables lo leerían como inglés.

Un locale en otro script nunca coincide, porque una página en un script que el visitante no lee le sirve peor que su siguiente idioma. Con `zh`, que es chino simplificado, un visitante `zh-TW` que también incluye inglés recibe inglés, y uno que no incluye nada más recibe `undefined`.

Un locale configurado que `Intl.Locale` rechaza, como uno con un subtag de uso privado de más de ocho caracteres, no tiene script probable. Coincide por idioma, y por el script que nombra cuando nombra uno.

El resto de su comportamiento es breve:

- Devuelve `undefined` cuando nada coincide.
- Omite las entradas vacías y las mal formadas, y las de más de 255 caracteres, que ninguna etiqueta real tiene.
- Lee un guion bajo como un guion, así que `pt_BR`, como lo escriben iOS, Android y POSIX, coincide con `pt-BR`.
- Lanza un `TypeError` cuando `preferences` no es un array.

Cuando varios de tus locales comparten idioma y script, y ninguno coincide con una preferencia exactamente o por su región probable, gana el primero en `locales`. Así que ordena `locales` según cuál debería atender a todos los demás.

Supongamos que la tienda de té empieza a hacer envíos a hispanohablantes, con un diccionario para Latinoamérica y otro para España. Para atender a un visitante de México, `es-MX`, con tu español latinoamericano, pon `es-419` antes que `es-ES`:

```ts
const i18n = createI18n({
  locales: ["en", "es-419", "es-ES"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});

i18n.matchLocale(["es-MX"]); // "es-419", porque está primero en la lista
i18n.matchLocale(["es"]); // "es-ES", ya que español sin región lo más probable es que signifique España
```

## Lo que este paquete no hace

Traduce, formatea y elige locales. Algunas cosas quedan fuera a propósito:

- **HTML en las traducciones.** `t()` devuelve texto plano, y `data-i18n` asigna texto plano, así que `"<strong>Hi</strong>"` muestra sus etiquetas en lugar de texto en negrita. Deja el marcado en tus plantillas o componentes, y pon solo palabras en el diccionario, con [placeholders](translations.md#pon-valores-en-el-texto) para los valores.
- **Skeletons de número y monedas en los mensajes.** Los skeletons ICU como `{price, number, ::currency/EUR}`, y el estilo `currency`, `{price, number, currency}`, no están soportados: un mensaje no puede saber en qué moneda está un precio. Formatea el importe en el código con `i18n.formatNumber(9.99, { style: "currency", currency: "EUR" })` y pasa el string. Un mensaje que usa uno tiene sintaxis inválida y se muestra tal como está escrito; consulta [Formatea números y fechas en el texto](translations.md#formatea-números-y-fechas-en-el-texto) para ver qué está soportado.
- **Cargar las traducciones.** El paquete llama a tu loader; dónde viven los archivos y cómo se piden, se cachean o se reintentan es asunto tuyo.
- **Rutas, redirecciones y navegación.** El routing por locale lee y construye rutas, pero tu framework o tu servidor siguen siendo quienes registran rutas, redirigen y navegan.

## Por dónde seguir

Léelas en orden para aprender el paquete de principio a fin, o salta a la que necesites. La tienda de té te acompaña en cada página:

1. [Escribe tus traducciones](translations.md): diccionarios, archivos JSON, placeholders, mensajes ICU, plurales, formateadores, claves y valores tipados, cómo detectar claves sin traducir y límites de tamaño.
2. [Traduce una app de navegador](browser.md): detecta y recuerda el idioma del visitante, mantén sincronizados `lang` y `dir`, vuelve a renderizar un framework y traduce HTML con `data-i18n`.
3. [Renderiza en un servidor o en tiempo de build](server-rendering.md): un gestor por solicitud, cómo elegir un locale a partir de `Accept-Language`, zonas horarias, logs silenciosos y builds de sitios estáticos.
4. [URLs localizadas](localized-urls.md): pon el locale en la ruta, traduce la propia ruta, enlaza a otros idiomas, genera cada página localizada y detecta el idioma en un sitio estático.
5. [Solución de problemas](troubleshooting.md): qué significa cada error y cada advertencia, y cómo solucionarlo.

Dos páginas más son para consultar y no para leer de corrido: la [referencia de la API](../reference/index.md) (en inglés) enumera cada export, opción y tipo, y el [registro de cambios](../changelog/index.md) (en inglés) dice qué cambió en cada versión y cómo actualizar.
