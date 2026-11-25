---
title: Renderiza en un servidor o en tiempo de build
description: Un gestor por solicitud, cómo elegir un locale a partir de Accept-Language, builds de sitios estáticos y logs de producción silenciosos.
order: 3
source: 8d289c83a3401a4f5424475aa62fb5fc2751a9e3
---

# Renderiza en un servidor o en tiempo de build

Un navegador tiene un solo visitante, así que un solo gestor es lo correcto. Un servidor tiene muchos visitantes a la vez, en distintos idiomas, y un gestor habla un idioma por vez. Por lo tanto: **un gestor por cada página que renderizas**. El build de un sitio estático renderiza todos los idiomas en una sola ejecución y sigue la misma regla.

Esta página muestra esa estructura con los diccionarios `en` y `pt` de la tienda de té de la [visión general](index.md#recorrido). Después elige el idioma de cada visitante, pone bien las fechas de sus pedidos, mantiene legibles los logs y genera toda la tienda como páginas estáticas.

## Un gestor por solicitud

Un gestor tiene un solo idioma actual. Si dos solicitudes compartieran uno, una solicitud en portugués que llama a `setLocale("pt")` cambiaría el idioma de una página en inglés que todavía se está renderizando, y el visitante de habla inglesa recibiría una página que cambia de idioma a mitad de camino. En desarrollo funciona perfecto, porque ahí el único visitante eres tú, y justamente por eso llega a producción. Así que crea el gestor dentro de la solicitud:

```ts
// src/i18n.ts
import { createI18n } from "@codenhub/i18n";
import { dictionaries } from "./locales";

export const createAppI18n = () =>
  createI18n({
    locales: ["en", "pt"] as const,
    defaultLocale: "en",
    loadLocale: (locale) => dictionaries[locale],
  });
```

```ts
// src/render.ts
import { createAppI18n } from "./i18n";

export async function renderPage(request: Request) {
  const i18n = createAppI18n();
  await i18n.init({ locale: pickLocale(i18n, request) });
  const { t } = i18n;

  return `<!doctype html>
<html lang="${i18n.locale}" dir="${i18n.direction}">
  <title>${escapeHtml(t("home.title"))}</title>
</html>`;
}
```

Crear un gestor es barato, y el trabajo que no lo es se comparte. Cuando tu loader devuelve el mismo objeto en cada llamada, como hace un módulo importado, todos los gestores reutilizan la única copia comprobada de ese diccionario en lugar de comprobarlo otra vez. Un loader que lee y parsea un archivo en cada llamada pierde eso, así que lee cada archivo una sola vez y guarda el resultado.

`i18n.direction` es `"rtl"` para un locale de derecha a izquierda, como el árabe, y `"ltr"` en los demás casos; [Idiomas de derecha a izquierda](index.md#idiomas-de-derecha-a-izquierda) explica cómo se decide y cómo cambiarlo. Ponlo en `<html dir>`, como arriba, y el navegador maqueta la página en el sentido correcto desde el primer byte.

Pasa el gestor, o `t`, a lo que sea que renderice la página, en lugar de importar uno compartido.

`t()` devuelve texto plano. Escápalo antes de ponerlo en HTML, como harías con cualquier otro texto, o deja que lo haga tu motor de plantillas.

## Elige un locale a partir de `Accept-Language`

Los navegadores envían los idiomas del visitante en el encabezado `Accept-Language`, como `pt-BR,pt;q=0.9,en;q=0.8`. Conviértelo en una lista, del más preferido al menos, y deja que `matchLocale()` elija el mejor locale que soportas:

```ts
import type { I18n } from "@codenhub/i18n";

// Los navegadores reales envían unos pocos idiomas, y un encabezado puede enumerar miles.
const MAX_PREFERENCES = 10;

function pickLocale<TLocale extends string>(i18n: I18n<TLocale>, request: Request): TLocale {
  const preferences = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((entry) => {
      const [tag = "", ...parameters] = entry.split(";");
      const weight = parameters.map((parameter) => parameter.trim()).find((parameter) => /^q=/i.test(parameter));
      // Un peso va de 0 a 1 con hasta tres decimales; cualquier otra cosa, como `q=0x1`, está mal formada.
      const quality = weight === undefined ? 1 : /^q=(0(\.\d{0,3})?|1(\.0{0,3})?)$/i.test(weight) ? Number(weight.slice(2)) : 0;
      return { tag: tag.trim(), quality };
    })
    // Descarta los idiomas rechazados (q=0) y los pesos mal formados.
    .filter(({ quality }) => quality > 0)
    .sort((left, right) => right.quality - left.quality)
    .slice(0, MAX_PREFERENCES)
    .map(({ tag }) => tag);

  return i18n.matchLocale(preferences) ?? i18n.defaultLocale;
}
```

Un visitante para el que no coincide ninguno de sus idiomas, incluido uno que rechaza tu idioma por defecto con `en;q=0`, igual recibe el locale por defecto, porque la página tiene que estar en algún idioma. Este helper no implementa el resto de `Accept-Language`, como `*`; si lo necesitas, usa el parser de tu framework de servidor y pasa su resultado a `matchLocale()`.

`matchLocale()` recibe una lista en lugar del encabezado porque parsear el encabezado, y limitar su tamaño, le corresponde a tu servidor. Mantén el límite: `matchLocale()` prueba las preferencias en orden hasta que una coincide, así que, sin él, una solicitud cuyo encabezado de 16 KB enumera miles de idiomas que no soportas ocuparía el event loop de tu servidor durante decenas de milisegundos. Una sola entrada de más de 255 caracteres se omite sin leerla, así que una etiqueta larga no puede hacer lo mismo.

Compara igual que el binding del navegador, así que un visitante recibe el mismo idioma desde el servidor que desde el navegador: `pt-BR` recibe tu `pt`, y `zh-TW` recibe tu `zh-Hant`. Las etiquetas mal formadas se omiten, y `undefined` significa que nada coincidió. [Convierte entradas externas en un locale](index.md#convierte-entradas-externas-en-un-locale) tiene el orden completo de comparación, incluido cuál de dos locales regionales gana, y `resolveLocale()` para un locale que viene de una cookie o de un query string.

Cuando la URL lleva el idioma, como en [un sitio localizado](localized-urls.md), léelo de la URL, y usa `Accept-Language` solo para elegir adónde redirigir a un visitante que llega a `/`. Un sitio estático no tiene un servidor que vea el encabezado; consulta [Detecta el idioma en un sitio estático](localized-urls.md#detecta-el-idioma-en-un-sitio-estático).

## Muestra las fechas en la zona horaria del lector

Un servidor formatea las fechas en su propia zona horaria, que rara vez es la del lector. El "Shipped on {date, date, long}" de la tienda puede entonces mostrar un día distinto al del calendario del lector, y cambiar cuando el navegador toma el control. Un cliente que ve cambiar su fecha de envío mientras carga la página suele escribirle a soporte por eso.

Dale al gestor de cada solicitud la zona del lector, como una que tu app guarda por cuenta o que el navegador informa en una cookie:

```ts
export const createAppI18n = (timeZone?: string) =>
  createI18n({
    locales: ["en", "pt"] as const,
    defaultLocale: "en",
    loadLocale: (locale) => dictionaries[locale],
    timeZone,
  });
```

`Intl.DateTimeFormat().resolvedOptions().timeZone` lee la zona en el navegador. Una zona que `Intl` no conoce lanza un `TypeError`, así que comprueba un valor que viene de una cookie antes de usarlo, o recurre a una zona fija como `"UTC"`.

## Mantén útiles los logs de producción

Una clave que falta registra una advertencia una vez por cada locale y clave, compartida por todos los gestores del proceso, así que un gestor por solicitud no la vuelve a registrar por cada visitante. Pero una advertencia solo dice que falta una palabra, no cuántos visitantes la vieron, y se pierde entre todo lo demás que registra el servidor.

En producción, manda las claves faltantes a tu logger, donde puedes contarlas en lugar de pasarlas de largo, o desactiva las advertencias:

```ts
createI18n({
  // ...
  onMissingKey(key, locale) {
    logger.warn({ key, locale }, "missing translation");
  },
});
```

`onMissingKey` reemplaza la advertencia y se ejecuta en cada clave faltante. `isSilent: true` desactiva solo las advertencias, incluida la de un mensaje con sintaxis inválida. Los errores, como una carga fallida, siguen lanzando excepciones.

En Node.js, una excepción lanzada desde una función que se pasó a `subscribe()`, o desde un listener de `ready` o de `locale-change`, hace caer el proceso, como con cualquier `EventTarget`. Los servidores rara vez los necesitan, pero si los usas, envuelve su cuerpo en un `try`/`catch` para que no puedan lanzar excepciones.

## Genera un sitio estático

Un build estático renderiza de antemano cada página en cada idioma. Sigue la misma regla: un gestor por página. Enumera tus páginas localizadas con el [routing por locale](localized-urls.md#genera-cada-página-localizada) y después renderiza cada una:

```ts
import { createLocaleRouting } from "@codenhub/i18n/routing";
import { createAppI18n } from "./i18n";

const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
});

// Tus páginas, indexadas por su ruta canónica: la ruta sin locale, con las palabras sobre las que enruta tu código.
const pages = { "/": renderHome, "/about": renderAbout };

const builds = Object.entries(pages).flatMap(([page, render]) => routing.localizeAll(page).map(({ locale, pathname }) => ({ locale, pathname, render })));
// [{ locale: "en", pathname: "/", render: renderHome }, { locale: "pt", pathname: "/pt", render: renderHome }, ...]

await Promise.all(
  builds.map(async ({ locale, pathname, render }) => {
    const i18n = createAppI18n();
    await i18n.init({ locale });
    await writePage(pathname, render(i18n.t));
  }),
);
```

`pathname` es una ruta de URL, codificada con porcentajes dondequiera que tenga caracteres como `ç`, ya vengan de las palabras de la tabla, como `/serviços`, o de tus propias rutas. Los hosts decodifican la solicitud antes de buscar su archivo, así que nombra el archivo según `decodeURIComponent(pathname)`: `serviços` para `/servi%C3%A7os`, no la forma codificada, que ninguna solicitud encuentra. `decodeURI()` no basta, porque deja codificado un escape reservado como `%2B`; `decodeURIComponent()` no puede partir un segmento aquí, porque el enrutamiento rechaza `%2F` y `%5C`. Lanza un `URIError` para un escape que no es UTF-8, como `%FF`, que el enrutamiento deja tal cual; ningún archivo puede llamarse como esa ruta, así que la compilación se detiene en ella. Dónde va ese archivo, como `serviços.html` o `serviços/index.html`, depende de tu host y de tu configuración de `trailingSlash`.

Un diccionario que no carga o no pasa la comprobación hace que `init()` se rechace, así que el build falla en lugar de publicar páginas sin texto.

Una clave que solo tiene tu idioma por defecto no hace fallar el build; se renderiza en el idioma por defecto. Para atrapar esos casos:

- Agrega [el test de claves sin traducir](translations.md#encuentra-claves-sin-traducir).
- Haz que `onMissingKey` lance una excepción durante el build para fallar con las claves que faltan en todos los idiomas.

## Pasa el locale al navegador

Cuando el navegador toma el control de una página renderizada en el servidor, tiene que arrancar en el idioma que usó el servidor, o el texto cambia mientras carga la página. En un sitio localizado, la URL dice cuál: léelo con `routing.parse()`, como muestra [URLs localizadas](localized-urls.md#lee-el-locale-en-el-cliente).

Sin un locale en la URL, la coincidencia del servidor con `Accept-Language` es una suposición, no una elección. No se la pases al binding como `locale`: el binding guarda un locale explícito como la elección del visitante, como explica [Cómo se elige el locale](browser.md#cómo-se-elige-el-locale), así que a un visitante que eligió portugués se le guardaría inglés encima en cada carga de página. Guarda la elección del visitante en una cookie, que el servidor también puede leer, y dale esa cookie al binding como su `storage`:

```ts
// src/render.ts
export async function renderPage(request: Request) {
  const i18n = createAppI18n();
  const chosen = /(?:^|;\s*)locale=([^;]*)/.exec(request.headers.get("cookie") ?? "")?.[1] ?? "";
  // `matchLocale()` lee una elección que ya no listas tal cual, como `pt-BR` cuando solo listas `pt`.
  await i18n.init({ locale: i18n.resolveLocale(chosen) ?? i18n.matchLocale([chosen]) ?? pickLocale(i18n, request) });
  // ...
}
```

```ts
// En el navegador
const binding = await initializeBrowserI18n({
  i18n,
  // El binding lee, guarda y olvida la elección del visitante en la cookie en lugar de en localStorage.
  storage: {
    get: () => /(?:^|;\s*)locale=([^;]*)/.exec(document.cookie)?.[1],
    set: (locale) => {
      document.cookie = `locale=${locale}; path=/; max-age=31536000; samesite=lax`;
    },
    remove: () => {
      document.cookie = "locale=; path=/; max-age=0";
    },
  },
});
```

- **Un visitante que eligió un idioma** lo recibe del servidor, y el navegador arranca en él. El binding hace coincidir la cookie igual que el servidor, así que una elección que ya no listas tal cual coincide en ambos lados. Si el navegador no puede cargar ese idioma, el binding advierte y recurre al idioma detectado y después al locale por defecto, como describe [Cuando un loader falla durante el arranque](browser.md#cuando-un-loader-falla-durante-el-arranque), y la cookie conserva la elección para la próxima vez.
- **Un visitante que nunca eligió uno, o que eligió "Sistema"**, no tiene cookie. El servidor hace coincidir `Accept-Language`, y el binding detecta a partir de `navigator.languages` con las mismas reglas, sin guardar nada, así que `isUsingSystemLocale` sigue en `true` y la página sigue el idioma del navegador. Los navegadores arman las dos listas con la misma configuración. Uno que envía en el encabezado menos idiomas de los que lista `navigator.languages` puede no coincidir cuando el primer idioma del visitante es uno que no soportas, y entonces el texto cambia mientras carga la página.
- **Un selector** llama a `i18n.setLocale()` o a `binding.switchToSystemLocale()`, como en [Ofrece una opción "Sistema"](browser.md#ofrece-una-opción-sistema), y el binding escribe o borra la cookie a través de `storage`. Un idioma que el binding detecta nunca se escribe, así que la cookie solo guarda una elección.

## Siguiente

Si el idioma de cada página vive en su URL, como pasa en la mayoría de los sitios renderizados en el servidor y estáticos, sigue con [URLs localizadas](localized-urls.md). Lee el locale de la ruta, construye enlaces a otros idiomas, traduce la página "acerca de" de la tienda a `/sobre` y enumera cada página que necesita un build estático.
