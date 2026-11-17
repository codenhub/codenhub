---
title: URLs localizadas
description: Pon el locale en la ruta, traduce la propia ruta, lee ambas de vuelta, enlaza a otros idiomas, genera cada página localizada y lleva a cada visitante a su propio idioma en un sitio estático.
order: 4
source: 7f2d510d044e80a72facb8f8055ec69c38a8d55a
---

# URLs localizadas

Darle a cada idioma su propia URL, como `/about` y `/pt/about`, permite que la gente comparta un enlace en el idioma en que lee, y que los buscadores indexen todos los idiomas. `@codenhub/i18n/routing` se ocupa de la parte que es igual en cualquier framework: leer el locale de una ruta y construir la ruta para otro locale. También puede traducir la propia ruta, así la página "acerca de" en portugués es `/pt/sobre`, o incluso solo `/sobre`.

Los ejemplos continúan la app `en` y `pt` de la tienda de té de las páginas anteriores. El español se suma cuando llega el momento de traducir las rutas, y la página "acerca de", el carrito, las páginas de producto y las páginas de ayuda de la tienda reciben cada una sus propias palabras.

## Configura el routing

```ts
// src/routing.ts
import { createLocaleRouting } from "@codenhub/i18n/routing";

export const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
});
```

`localePrefix` decide qué rutas empiezan con su locale. Es obligatorio y no tiene valor por defecto, porque cada opción le da a tu sitio URLs distintas, y las URLs son difíciles de cambiar una vez que la gente las guardó en sus marcadores. Omitirlo lanza `TypeError: [I18n] Invalid locale routing configuration: localePrefix: Expected "always", "except-default", or "when-ambiguous", received undefined`.

| `localePrefix`     | Página "acerca de" en inglés | Página "acerca de" en portugués                                                           |
| ------------------ | ---------------------------- | ----------------------------------------------------------------------------------------- |
| `"except-default"` | `/about`                     | `/pt/about`                                                                               |
| `"always"`         | `/en/about`                  | `/pt/about`                                                                               |
| `"when-ambiguous"` | `/about`                     | `/pt/about`, o `/sobre` una vez traducida; consulta [Quita el prefijo](#quita-el-prefijo) |

Cómo elegir:

- `"except-default"` conserva tus URLs actuales cuando agregas un idioma.
- `"always"` hace que cada URL nombre su idioma, así que `/about` no es una página, lo que le viene bien a un sitio que redirige `/` al idioma del visitante.
- `"when-ambiguous"` quita el prefijo de las rutas traducidas que solo pueden pertenecer a un idioma, y vale la pena leer sobre esa opción antes de elegirla.

Usa los mismos `locales` y `defaultLocale` que tu gestor. El routing es independiente del gestor, así que también funciona donde no hay nada que traducir, como en la lógica de redirección de un servidor.

Si guardas la configuración en una variable antes de pasarla, escribe `localePrefix: "except-default" as const`. Sin `as const`, TypeScript amplía el valor a `string`, y `createLocaleRouting` lo rechaza en tiempo de compilación.

### Barras finales

Por defecto, `localize()` conserva la barra de la ruta que le das: `/about/` da `/pt/about/`, y `/about` da `/pt/about`. La página de inicio de un locale no tiene ninguna barra que conservar, porque `/` no dice nada al respecto, así que siempre es `/pt`.

Muchos hosts estáticos sirven `pt/index.html` en `/pt/` y redirigen `/pt` ahí, así que en un sitio así, define `trailingSlash`:

```ts
export const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
  trailingSlash: "always",
});

routing.localize("/", "pt"); // "/pt/"
routing.localize("/about", "pt"); // "/pt/about/"
routing.localize("/", "en"); // "/"
```

| `trailingSlash`                    | Construye                                                     |
| ---------------------------------- | ------------------------------------------------------------- |
| `"preserve"`, el valor por defecto | La barra de la ruta dada: `/pt/about/` o `/pt/about`, y `/pt` |
| `"always"`                         | Una barra en cada ruta: `/pt/about/` y `/pt/`                 |
| `"never"`                          | Ninguna barra en ninguna ruta salvo `/`: `/pt/about` y `/pt`  |

`parse()` acepta las dos escrituras sea cual sea tu elección, y su `pathname` conserva la barra de la solicitud: `/about` para `/pt/about` y `/about/` para `/pt/about/`. Enruta los dos valores a la misma página, o quita la barra antes de enrutar. Con `"always"` o `"never"`, [Redirige a la URL canónica](#redirige-a-la-url-canónica) manda entonces la otra escritura a la que construye `localize()`, así cada página tiene una sola dirección.

## Lee el locale de una ruta

`parse()` separa una ruta en su locale y el resto:

```ts
routing.parse("/pt/about"); // { locale: "pt", pathname: "/about" }
routing.parse("/about"); // { locale: "en", pathname: "/about" }
routing.parse("/PT/about"); // { locale: "pt", pathname: "/about" }
```

El `pathname` que devuelve es la **ruta canónica**: la ruta sobre la que enruta tu aplicación, la misma en todos los idiomas. No pierdas de vista esa idea; importa cuando las rutas se traducen.

`parse()` devuelve `undefined` para una ruta que no es una página en ningún locale, como `/pt/en/about`. Una vez quitado su prefijo, empieza con otro locale, así que ningún enlace lleva nunca ahí. Respóndele con un 404.

Con `localePrefix: "always"`, una ruta sin locale también devuelve `undefined`, así puedes redirigirla. Agrega el prefijo del locale elegido y parsea eso. Una ruta con las palabras de ese locale, como `/sobre`, se lee entonces como tal, y una ruta que tampoco es una página en ese locale recibe su 404:

```ts
// Un archivo, como `/favicon.ico`, no es una página; consulta Redirige a la URL canónica más abajo.
const isFile = /\.[a-z0-9]+$/i.test(url.pathname);
const route = isFile ? undefined : routing.parse(url.pathname);
if (route === undefined && !isFile) {
  const locale = pickLocale(i18n, request);
  const guess = routing.parse(`/${locale}${url.pathname === "/" ? "" : url.pathname}`);
  if (guess === undefined) {
    return new Response("Not found", { status: 404 });
  }
  const target = new URL(url);
  target.pathname = routing.localize(guess.pathname, guess.locale);
  return Response.redirect(target, 302);
}
```

`pickLocale` es el helper de `Accept-Language` de [Renderiza en un servidor](server-rendering.md#elige-un-locale-a-partir-de-accept-language).

### Lee el locale en el cliente

En el navegador, toma el locale de la URL y pásalo al binding del navegador. Así la URL se impone a los idiomas guardados y detectados del visitante, y la página siempre coincide con su dirección:

```ts
import { initializeBrowserI18n } from "@codenhub/i18n/browser";
import { i18n } from "./i18n";
import { routing } from "./routing";

const route = routing.parse(window.location.pathname);
await initializeBrowserI18n({ i18n, locale: route?.locale });
```

### Redirige a la URL canónica

`parse()` es tolerante: lee `/PT/about` y `/en/about` igual que `/pt/about` y `/about`, y lo mismo con las dos escrituras de una [barra final](#barras-finales). Eso es amable con quien escribe una URL a mano. Pero un buscador que encuentra una misma página en varias direcciones reparte su ranking entre ellas, y cuatro direcciones para una página "acerca de" son tres de más. Manda cada una de las otras escrituras a la que construye `localize()`. Toda ruta que devuelve `parse()` tiene una, así que esto nunca lanza una excepción.

Ejecuta esta redirección, y la de un prefijo que falta de más arriba, solo para las rutas de páginas, después de que tu servidor haya respondido las solicitudes de archivos estáticos. `parse()` lee cualquier ruta como una página:

- Con `trailingSlash: "always"`, esta redirección manda `/favicon.ico` a `/favicon.ico/`.
- Con `localePrefix: "always"`, la de más arriba lo manda a `/en/favicon.ico`.

Ninguna de las dos tiene un archivo. Si las redirecciones tienen que ejecutarse primero, omite las rutas que terminan en una extensión de archivo, como hacen los dos ejemplos:

```ts
const isFile = /\.[a-z0-9]+$/i.test(url.pathname);
const route = isFile ? undefined : routing.parse(url.pathname);
if (route !== undefined) {
  const canonical = routing.localize(route.pathname, route.locale);
  if (canonical !== url.pathname) {
    const target = new URL(url);
    target.pathname = canonical;
    return Response.redirect(target, 301);
  }
}
```

## Enlaza a otro idioma

`localize()` construye la ruta de una página en un locale. Dale la ruta canónica:

```ts
routing.localize("/about", "pt"); // "/pt/about"
routing.localize("/about", "en"); // "/about"
```

Una ruta que ya empieza con un locale se lee como la URL de ese locale, así que el prefijo se reemplaza:

```ts
routing.localize("/pt/about", "en"); // "/about"
```

En un sitio localizado, cambiar de idioma es una navegación, no solo un `setLocale()`: `setLocale()` cambia el texto, pero nunca la URL. Así que el selector de idioma de la tienda lee la página actual con `parse()`, construye su ruta en el nuevo idioma, conserva el query string y el fragmento, y deja que tu router vaya ahí:

```ts
const route = routing.parse(window.location.pathname);
if (route !== undefined) {
  await navigate(routing.localize(route.pathname, "pt") + window.location.search + window.location.hash);
}
```

Pasar por `parse()` importa cuando las rutas se traducen: `/sobre` es una URL en portugués, no una ruta canónica, y solo `parse()` sabe leerla como `/about`.

Usa la misma llamada para las etiquetas `<link rel="alternate" hreflang>` que les cuentan a los buscadores sobre cada idioma. Agrega una etiqueta `x-default` para los lectores cuyo idioma no ofreces, que apunte a la página del locale por defecto:

```ts
const defaultLocale = "en"; // el defaultLocale que configuraste
const link = (hreflang: string, pathname: string) => `<link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${escapeHtml(new URL(pathname, "https://example.com").href)}">`;

const alternates = [...routing.localizeAll(route.pathname).map((page) => link(page.locale, page.pathname)), link("x-default", routing.localize(route.pathname, defaultLocale))];
```

Escapa los dos valores como harías con cualquier texto en HTML, o deja que tu framework cree las etiquetas. Una ruta puede contener caracteres, como `"` o `&`, que están permitidos en una URL pero no tal cual dentro de un atributo.

## Traduce rutas

`/pt/about` es una página en portugués con una dirección en inglés. Para darle palabras en portugués, enumera las rutas traducidas en `pathnames`, indexadas por ruta canónica. Aquí es donde la tienda agrega el español:

```ts
export const routing = createLocaleRouting({
  locales: ["en", "pt", "es"] as const,
  defaultLocale: "en",
  localePrefix: "except-default",
  pathnames: {
    "/about": { pt: "/sobre", es: "/acerca" },
    "/cart": { pt: "/carrinho", es: "/carrito" },
    "/products/:id": { pt: "/produtos/:id" },
    "/products/:id/reviews/:reviewId": { pt: "/avaliacoes/:reviewId/produto/:id" },
  },
});
```

```ts
routing.localize("/about", "pt"); // "/pt/sobre"
routing.localize("/cart", "es"); // "/es/carrito"
routing.localize("/products/42", "pt"); // "/pt/produtos/42"
routing.parse("/pt/produtos/42"); // { locale: "pt", pathname: "/products/42" }
```

Tu aplicación sigue enrutando sobre `/products/42`, sea cual sea el idioma. Solo cambia la URL.

Cómo se lee la tabla:

- **Los parámetros** son segmentos que empiezan con `:`, como `:id`. Coinciden con cualquier segmento y el valor se copia sin cambios. Cada forma tiene que usar los mismos parámetros que la ruta canónica, pero en cualquier orden, porque los idiomas no se ponen de acuerdo en el orden de las palabras: `/products/42/reviews/7` es `/pt/avaliacoes/7/produto/42`.
- **Un comodín** es un último segmento escrito `:name*`, como `"/help/:path*": { pt: "/ajuda/:path*" }`. Coincide con uno o más segmentos y los copia, así que `/help/shipping/returns` es `/pt/ajuda/shipping/returns`. No coincide con cero segmentos: pon `/help` en sí como una entrada propia.
- **Todo lo que la tabla no enumera conserva sus palabras.** `/blog` es `/pt/blog`, y `/products/42` en español es `/es/products/42`, porque solo el portugués la traduce.
- **Los segmentos fijos distinguen mayúsculas y minúsculas**, como las URLs, así que `/pt/Sobre` no es la página "acerca de". Solo el prefijo del locale ignora las mayúsculas.
- **Prefiere letras simples en las rutas.** El routing no cambia tus palabras, así que obtienes `/servicos` solo si escribes `/servicos`. La mayoría de los sitios quita los acentos de las URLs, porque una ruta con acentos se muestra codificada con porcentajes dondequiera que se copie como texto, como `/servi%C3%A7os`. Los acentos también funcionan: `"/serviços"` coincide con el `/servi%C3%A7os` que envían los navegadores, y `localize()` devuelve la forma codificada. Así que un build estático que escribe una carpeta para esa ruta tiene que decodificarla antes, como en [Genera un sitio estático](server-rendering.md#genera-un-sitio-estático).
- **Una página de la tabla vuelve con una sola escritura.** `parse()` devuelve las palabras fijas de una página de la tabla tal como una URL escribe las palabras de la tabla, en todos los locales. Así que `/%61bout` y `/pt/%73obre`, escrituras raras de `/about` y `/pt/sobre`, dan las dos `pathname: "/about"`. Los parámetros y los segmentos que la tabla no enumera vuelven tal como los escribió la solicitud.
- **Un segmento fijo le gana a un parámetro, y un parámetro le gana a un comodín.** Con `/products/new` y `/products/:id` en la tabla, `/products/new` es la página de producto nuevo, en el orden en que sea que la tabla los enumere. Con `/help/contact` y `/help/:path*`, `/help/contact` es la página de contacto y cualquier otra ruta `/help/…` va al comodín.
- **El locale por defecto también se puede traducir.** Un sitio que se escribe primero en portugués, con el código en inglés, puede usar `defaultLocale: "pt"` y `{ "/about": { pt: "/sobre" } }`, así `/sobre` es la página en portugués y `/en/about`, la página en inglés.

### Errores que detecta

`createLocaleRouting` comprueba la tabla cuando la creas, así que un error falla al arrancar en lugar de en algún clic desafortunado. Cada uno de estos lanza un `TypeError` que nombra la entrada:

- **Dos páginas con la misma ruta en un locale.** `{ "/about": { pt: "/sobre" }, "/company": { pt: "/sobre" } }` le da al portugués dos páginas en `/pt/sobre`. Dale otras palabras a una de las dos. Lo mismo vale para una forma que toma las palabras que conserva otra página de la tabla: con `{ "/about": { pt: "/sobre" }, "/contact": { es: "/about" } }`, la página "acerca de" conserva sus palabras en inglés en español, así que `/es/about` sería las dos páginas, y la creación lanza una excepción.
- **Dos rutas canónicas con la misma forma.** `/products/:id` y `/products/:slug` coinciden con las mismas rutas. Quédate con una.
- **Parámetros distintos de los de la ruta canónica.** `{ "/products/:id": { pt: "/produtos/:slug" } }` pierde `:id`. Renómbralo o muévelo, pero consérvalo. Un comodín tiene que seguir siendo un comodín en todas las formas.
- **Un comodín que no está al final**, como `/help/:path*/edit`.
- **Una ruta que empieza con un locale**, como `/pt/about` como ruta canónica. El prefijo se leería como el locale. Pon `/about` en su lugar.
- **Un locale que no está configurado**, o uno que aparece dos veces con distintas mayúsculas y minúsculas.
- **Una ruta que `parse()` rechazaría**, según la lista de [Rutas que acepta](#rutas-que-acepta).

La comprobación solo ve las páginas que enumera la tabla. Sin la entrada `/about`, `{ "/contact": { es: "/about" } }` se acepta, porque el routing no sabe que tienes una página "acerca de". El choque aparece entonces más tarde, cuando construyes el enlace de esa página: `localize("/about", "es")` lanza `RangeError: [I18n] "/about" in "es" would be read as "/contact" in "es"; …`. [El riesgo que asumes](#el-riesgo-que-asumes) explica esta red de seguridad y cómo asegurarte de que atrape los choques en tiempo de build y no en producción.

### Registra las rutas traducidas

El routing lee y construye rutas; tu framework todavía tiene que mandar `/pt/sobre` a la página "acerca de". Hay dos maneras de hacerlo, y las dos funcionan con cualquier framework.

**Reescribe a la ruta canónica.** Si tu framework o tu servidor pueden cambiar la ruta sobre la que enrutan, como suelen poder hacerlo los middlewares de servidor y los hooks de solicitud, registra solo las rutas canónicas y enruta según el resultado de `parse()`:

```ts
const route = routing.parse(url.pathname);
// Enruta según `route.pathname`, como "/about" para "/pt/sobre", y renderiza en `route.locale`.
```

**Registra una ruta por locale.** Un patrón de ruta es una ruta, así que `localizeAll()` lo traduce:

```ts
routing.localizeAll("/products/:id");
// [{ locale: "en", pathname: "/products/:id" }, { locale: "pt", pathname: "/pt/produtos/:id" }, { locale: "es", pathname: "/es/products/:id" }]
```

Registra cada una con su locale. Con `@codenhub/router`, queda así:

```ts
for (const { locale, pathname } of routing.localizeAll("/products/:id")) {
  router.on(pathname, ({ params }) => renderProduct(params["id"], locale));
}
```

`@codenhub/router` toma la primera ruta que coincide, en el orden en que las registras. Cuando dos rutas de un locale pueden coincidir con la misma URL, como `/pt/produtos/novo` y `/pt/produtos/:id`, registra primero la que tiene palabras fijas.

`localizeAll()` escribe un comodín como `:name*`. Tradúcelo a la sintaxis de tu framework cuando lo registres, como `[...path]` en un router basado en archivos. `@codenhub/router` no tiene comodines, así que con él enruta esas rutas reescribiéndolas a la ruta canónica.

## Quita el prefijo

`/pt/sobre` ya dice "portugués" dos veces. Con `localePrefix: "when-ambiguous"`, una ruta traducida quita el prefijo cuando sus palabras solo pueden ser portugués:

```ts
export const routing = createLocaleRouting({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  localePrefix: "when-ambiguous",
  pathnames: { "/about": { pt: "/sobre" } },
});

routing.localize("/about", "pt"); // "/sobre"
routing.parse("/sobre"); // { locale: "pt", pathname: "/about" }
routing.localize("/", "pt"); // "/pt"
routing.localize("/blog", "pt"); // "/pt/blog"
```

El prefijo se queda dondequiera que la ruta por sí sola no puede decir en qué idioma está:

- **Rutas con las mismas palabras en dos idiomas.** `/` y `/blog` también existen en inglés, así que el portugués conserva `/pt` y `/pt/blog`. Dos idiomas que traducen a las mismas palabras, como `/contato` tanto en portugués como en español, también conservan el prefijo.
- **Rutas con las que podría coincidir un parámetro de otro idioma.** Si el español tiene `/:tag`, cualquier ruta de un segmento podría ser una etiqueta en español, así que `/sobre` conserva su prefijo.
- **Rutas hechas solo de parámetros**, como `/:tag`, que podrían ser cualquier cosa.

En este modo, el locale por defecto nunca tiene prefijo. `parse()` sigue aceptando `/pt/sobre`, así que redirígela como en [Redirige a la URL canónica](#redirige-a-la-url-canónica).

### El riesgo que asumes

El routing solo conoce las rutas de tu tabla. Una ruta que no está en ella se considera del locale por defecto, así que no puede ver un choque con una página de la que nunca le hablaron.

Supongamos que el blog en inglés de la tienda tiene un post en `/sobre`, un slug que vino de tu CMS. `/sobre` ahora abre la página "acerca de" en portugués, y no hay forma de llegar al post.

`localize()` lo detecta cuando construye una ruta, y lanza un `RangeError` en lugar de enlazar a la página equivocada:

```ts
routing.localize("/sobre", "en");
// RangeError: [I18n] "/sobre" in "en" would be read as "/about" in "pt"; …
```

Un build estático que localiza cada página que renderiza encuentra todos los choques en tiempo de build. Un servidor solo encuentra uno cuando construye los enlaces de esa página. Así que si tus URLs vienen de cualquier lugar fuera de la tabla, como un CMS, comprueba los slugs nuevos con `parse()`, o conserva el prefijo con `"except-default"`.

El mismo error te avisa cuando pasaste una URL donde `localize()` espera una ruta canónica, como `localize("/sobre", "en")` cuando querías decir la página que está en `/sobre`. Pasa `parse("/sobre").pathname` en su lugar.

## Genera cada página localizada

`localizeAll()` devuelve una ruta para cada locale, en el orden de `locales`. Con la tabla de [Traduce rutas](#traduce-rutas):

```ts
routing.localizeAll("/about");
// [{ locale: "en", pathname: "/about" }, { locale: "pt", pathname: "/pt/sobre" }, { locale: "es", pathname: "/es/acerca" }]
```

Pásale tu lista de páginas para obtener cada página que necesita un build estático, y después renderiza cada una con su propio gestor, como en [Genera un sitio estático](server-rendering.md#genera-un-sitio-estático).

## Detecta el idioma en un sitio estático

Un servidor manda a un visitante que llega a `/` a su idioma según `Accept-Language`, como en [Lee el locale de una ruta](#lee-el-locale-de-una-ruta). Un sitio estático con `localePrefix: "except-default"` no tiene un servidor que vea ese encabezado: las páginas del locale por defecto son las que no tienen prefijo, y la redirección la tiene que hacer el navegador.

Es un script corto con una lista larga de maneras de hacerlo casi bien, así que primero van esas:

- **Se ejecuta antes del primer pintado.** Un script diferido redirige después de que la página se mostró en el idioma por defecto, así que el visitante la ve parpadear. Pon la redirección en un script inline en `<head>`. Un script inline no puede hacer `import`, así que ni `matchLocale()` ni `routing` están ahí: calcula lo que necesita en tiempo de build y pásaselo.
- **La elección del visitante gana.** Revisa el idioma guardado antes que `navigator.languages`. Si no, un navegador en portugués que elige inglés vuelve directamente al portugués. El binding del navegador, configurado como en [Lee el locale en el cliente](#lee-el-locale-en-el-cliente), ya lo guarda: almacena `{"locale":"en"}` bajo la clave `"i18n"`, o tu `storageKey`, en cada página en la que arranca. Como cambiar de idioma es una navegación, ese es el idioma de la última página que leyó el visitante, incluida aquella a la que lo llevó su cambio.
- **Un enlace de tu propio sitio nunca redirige.** Donde el almacenamiento está bloqueado, la elección no se puede guardar, así que una llegada desde tu propio sitio, un `document.referrer` del mismo origen, conserva la página que pidió. Eso requiere que el navegador envíe el referrer. Un enlace con `rel="noreferrer"`, o una página servida con `Referrer-Policy: no-referrer`, no envía ninguno, y su visita se redirige como una que viene de otro lado, así que un cambio al idioma por defecto puede terminar devuelto al punto de partida. No uses ninguno de los dos en tus propios enlaces, incluido el selector de idioma.
- **Una URL con prefijo nunca redirige.** Renderiza el script solo en las páginas del locale por defecto, así un enlace compartido a `/pt/about` siempre se abre en portugués. Conserva `search` y `hash` al redirigir.

En tiempo de build, mientras [renderizas cada página](#genera-cada-página-localizada), calcula dos cosas para el script: la ruta de esta página en cada uno de los otros locales, con `localize()`, y una tabla que va de cada idioma y su script probable, como `zh-Hant` para `zh-TW`, a su locale:

```ts
// Tiempo de build, para la página en `pathname` en el locale por defecto.
const locales = ["en", "pt", "es"] as const;
const defaultLocale = "en";

const config = {
  storageKey: "i18n", // el storageKey del binding del navegador
  locales,
  // `zh-TW` es `zh-Hant`: un idioma y su script probable, como los compara `matchLocale()`, con el noruego `no` como `nb`.
  languages: Object.fromEntries(
    locales.map((locale) => {
      const { language, script } = new Intl.Locale(locale).maximize();
      return [`${language === "no" ? "nb" : language}-${script}`, locale];
    }),
  ),
  targets: Object.fromEntries(locales.filter((locale) => locale !== defaultLocale).map((locale) => [locale, routing.localize(pathname, locale)])),
};
// Escribe `<` como `\u003c`, así ninguna ruta puede cerrar antes de tiempo el elemento script.
const json = JSON.stringify(config).replaceAll("<", "\\u003c");
```

Después renderiza, solo en las páginas del locale por defecto:

```html
<script>
  ((config) => {
    try {
      if (document.referrer !== "" && new URL(document.referrer).origin === location.origin) return;
    } catch {
      // Un referrer ilegible cuenta como una llegada desde otro lado.
    }

    let saved;
    try {
      // El binding guarda `{"locale":"pt"}`.
      saved = JSON.parse(localStorage.getItem(config.storageKey) ?? "null")?.locale;
    } catch {
      // Almacenamiento bloqueado o ilegible: recurre a los idiomas del navegador.
    }

    // Un locale guardado que tu sitio ya no tiene, como `pt-PT`, se compara como el primer idioma del navegador.
    let target = config.locales.includes(saved) ? saved : undefined;
    if (target === undefined) {
      const browser = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
      const preferences = typeof saved === "string" ? [saved, ...browser] : browser;
      for (const preference of preferences) {
        let language;
        try {
          const tag = new Intl.Locale(preference);
          if (tag.language === "und") continue; // Ningún idioma, aunque maximize() lo convertiría en inglés.
          // Lee los códigos antiguos como lo hace `matchLocale()`, como `iw-IL` como hebreo, `he`, y agrega el script probable.
          const likely = tag.maximize();
          language = `${likely.language === "no" ? "nb" : likely.language}-${likely.script}`;
        } catch {
          continue; // No es una etiqueta de idioma.
        }
        if (Object.hasOwn(config.languages, language)) {
          target = config.languages[language];
          break;
        }
      }
    }

    if (target !== undefined && Object.hasOwn(config.targets, target)) {
      location.replace(config.targets[target] + location.search + location.hash);
    }
  })(/* el `json` del build */);
</script>
```

Un locale por defecto guardado no encuentra ningún destino, así que el visitante se queda. `location.replace()` deja la página del locale por defecto fuera del historial, así que el botón Atrás no cae en una página que vuelve a redirigir.

### Qué tan cerca llega de `matchLocale()`

Comparar por idioma y script elige lo mismo que `matchLocale()` cuando tu sitio tiene un locale por idioma y script, como `en`, `pt-BR`, `es`, `zh-Hans` y `zh-Hant`: `pt-PT` obtiene `pt-BR`, `es-MX` obtiene `es` y `zh-TW` obtiene `zh-Hant`. Un idioma en otro script nunca coincide, así que con solo `zh`, que es simplificado, un visitante `zh-TW` pasa a su siguiente idioma.

Mantén las dos cosas alineadas con un test que ejecute la misma comparación contra `matchLocale()` para algunas listas de preferencias.

Con más de un locale por idioma y script, como `es-419` y `es-ES`, o `no` y `nb`, que cuentan como un mismo idioma, la tabla no puede elegir entre ellos. Tienes dos opciones:

- Calcular una tabla en tiempo de build a partir de las etiquetas de navegador que esperas recibir, pasando cada una por `matchLocale()`.
- Ejecutar la redirección en un script diferido que importa tu gestor y llama a `matchLocale(navigator.languages)`, y aceptar el parpadeo.

## Rutas que acepta

El routing trabaja solo con la ruta de una URL. Dale `url.pathname`, no la URL completa, y ocúpate tú del query string y del fragmento.

Esta es la parte aburrida de la página. También es la parte que decide si una URL armada a propósito puede llegar a una página distinta de la que comprobó tu código, así que el routing es estricto con esto. Rechaza cada una de estas rutas:

- **Barras dobles**, como en `//wp-login.php` o `/help//returns`. Los navegadores leen una ruta que empieza con `//` como otro host, y un segmento vacío es una página a la que no lleva ninguno de tus enlaces. Escribe barras simples.
- **Barras invertidas**, como en `/help\returns`. Algunos servidores tratan `\` como `/`, así que la misma solicitud llegaría a dos páginas distintas. Usa `/`.
- **Caracteres de control**, como un salto de línea o un tabulador, escritos tal cual. Ningún enlace real los contiene.
- **Segmentos de punto**, `.` y `..`, como en `/help/../admin`, y sus formas codificadas, como `/help/%2e%2e/admin`. Un navegador los resuelve antes de enviar una solicitud, así que una solicitud que todavía tiene uno se escribió a mano para escaparse de la página que nombra. Resuelve la ruta primero; `new URL(path, "https://example.com").pathname` lo hace.
- **Una barra, una barra invertida, un `%` o un carácter de control codificados**: `%2F`, `%5C`, `%25`, o de `%00` a `%1F` y `%7F`, como en `/files/a%2Fb`. Una barra o una barra invertida codificada hace que los servidores no se pongan de acuerdo sobre dónde empiezan y terminan los segmentos: uno ve un segmento donde otro ve dos. Un `%` codificado invita a una segunda ronda de decodificación, así que `%252F` se convierte en `%2F` y después en `/`. Un carácter de control codificado se salta la comprobación de los que están tal cual. Deja fuera de la ruta una barra que forma parte de un valor, por ejemplo en el query string.
- **Un escape mal formado**, un `%` que no va seguido de dos dígitos hexadecimales, como en `/50%off`. Escribe `%25` para un `%` literal… que también se rechaza, según la regla anterior, así que saca el `%` de la ruta.
- **Más de 8192 caracteres**, o una ruta cuya ruta canónica sería más larga que eso, como puede pasar con una ruta traducida corta cuando su entrada en la tabla es larga. De todos modos, los servidores y los proxies cortan las URLs alrededor de esa longitud.

Una solicitud puede traer cualquiera de estas, como un escáner que pide `//wp-login.php`, así que `parse()` devuelve `undefined` para ellas, y el mismo 404 las responde como a cualquier otra ruta que no es una página. `localize()` y `localizeAll()` construyen enlaces a partir de tus propias rutas en lugar de leer solicitudes, así que con esas mismas rutas lanzan un `TypeError`, como `TypeError: [I18n] pathname must not contain dot segments`, y corriges la ruta en tu código.

Todos los métodos, `parse()` incluido, lanzan `TypeError: [I18n] pathname must be a valid absolute application pathname` para un valor que ni siquiera es el pathname de una URL:

- Uno que no empieza con `/`, como una URL completa `https://…`.
- Uno que contiene `?` o `#`, como el `request.url` de Node con su query string.

Eso es un error del código que llama, no una solicitud que haya que responder, así que falla de forma ruidosa en lugar de responder 404 a cada URL con query string.

Los escapes normales, como `%20` y `%C3%A7`, no son problema, y una barra final se conserva: `/pt/sobre/` se parsea como `/about/`.

`localize()` lanza en cambio un `RangeError` cuando la ruta que construye sería más larga que 8192 caracteres, como puede pasar con una ruta apenas por debajo del límite una vez que se le agregan su prefijo o sus palabras traducidas.

## Lo que el routing deja a tu framework

El routing lee y construye rutas. Tu framework o tu servidor siguen siendo quienes registran las rutas, redirigen, navegan y renderizan. Tampoco sabe nada de una ruta base: si tu tienda vive bajo `/shop` en un sitio más grande, quítala antes de llamar a `parse()` y vuelve a agregarla después de `localize()`.

La tabla cubre las rutas propias de tu aplicación. Los slugs de contenido, como el título de un post del blog en su URL, pertenecen al lugar donde vive el contenido, como tu CMS, que conoce el slug de cada post en cada idioma.

## Siguiente

Ese es todo el paquete: diccionarios, el navegador, el servidor y las URLs. La tienda de té está abierta en todos los idiomas que tenía planeados. Cuando algo sale mal en el camino, [Solución de problemas](troubleshooting.md) parte del error o la advertencia que ves y retrocede hasta la solución.
