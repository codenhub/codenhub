<!-- source: 7a1a1c25b4ddb5cbffd5130e9e40d26c0643509b -->

# @codenhub/i18n

Traduce el texto de tu app con claves tipadas, mensajes ICU, plurales e idiomas de respaldo, en el navegador, en un servidor o en tiempo de build. Tú pones las palabras; el paquete se encarga de que cada visitante reciba las suyas.

El ejemplo de abajo es el comienzo de una pequeña tienda de té en línea, que [la documentación](docs/es/index.md) va ampliando página a página: una página de inicio, un carrito que cuenta sus artículos, una página "acerca de" y un selector de idioma.

## Instalación

```sh
pnpm add @codenhub/i18n
```

## Uso

```ts
// src/i18n.ts
import { createI18n } from "@codenhub/i18n";

const dictionaries = {
  en: { home: { title: "Welcome", greeting: "Hello, {name}!" }, cart: { items: { one: "{count} item", other: "{count} items" } } },
  pt: { home: { title: "Bem-vindo", greeting: "Olá, {name}!" }, cart: { items: { one: "{count} item", other: "{count} itens" } } },
} as const;

export const i18n = createI18n({
  locales: ["en", "pt"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});

export const { t } = i18n;
```

```ts
// src/main.ts
import { i18n, t } from "./i18n";

await i18n.init({ locale: "pt" });

t("home.greeting", { name: "Ana" }); // "Olá, Ana!"
t("cart.items", { count: 3 }); // "3 itens"
t("home.titel"); // error de compilación: esa clave no existe
```

Esa última línea es la razón de ser de todo el paquete: la errata falla en tu editor, no frente a un visitante que lee en portugués. Espera a que termine `init()` antes de llamar a `t()`, que lanza una excepción hasta que el gestor haya arrancado.

Dos puntos de entrada opcionales cubren lo que cambia según el entorno:

- `@codenhub/i18n/browser` detecta el idioma del visitante, recuerda el que elige tu app, mantiene sincronizados `<html lang>` y `dir`, y puede traducir HTML marcado con `data-i18n`.
- `@codenhub/i18n/routing` lee y construye rutas localizadas, como `/pt/about` o `/pt/sobre`, y puede quitar el prefijo del locale donde una ruta no es ambigua, como en `/sobre`.

## Documentación

- [Visión general](docs/es/index.md): las ideas detrás del paquete y un recorrido guiado.
- [Escribe tus traducciones](docs/es/translations.md): archivos JSON, mensajes ICU, plurales, variantes regionales, y claves y valores tipados.
- [Traduce una app de navegador](docs/es/browser.md), incluso dentro de un Web Worker.
- [Renderiza en un servidor o en tiempo de build](docs/es/server-rendering.md)
- [URLs localizadas](docs/es/localized-urls.md)
- [Solución de problemas](docs/es/troubleshooting.md)
- [Referencia de la API](docs/reference/index.md) (en inglés)
- [Registro de cambios](docs/changelog/index.md) (en inglés)

## Requisitos

- Un bundler o runtime que entienda ESM.
- Node.js 26 o posterior, o un navegador Chromium, Firefox o WebKit actual, o un Web Worker.
- Ninguna dependencia de runtime.

En un Web Worker, el punto de entrada raíz y `@codenhub/i18n/routing` funcionan igual que en cualquier otro lugar. `@codenhub/i18n/browser` solo funciona con `syncDocument: false` y sin `root`, porque un worker no tiene página; con los valores por defecto rechaza con un `TypeError` antes de arrancar el gestor. Consulta [En un Web Worker](docs/es/browser.md#en-un-web-worker).

## Notas

- En un servidor o en un build estático, crea un gestor por solicitud o por página, no uno compartido. Un gestor compartido es justo la forma en que un visitante termina leyendo en el idioma de otro.
- El paquete no renderiza HTML a partir de las traducciones: el texto siempre vuelve como texto.
- Los mensajes ICU cubren `number`, `date`, `time`, `plural`, `selectordinal` y `select`, sin skeletons de número ni estilos como `{n, number, currency}`, que se muestran tal como están escritos, con una advertencia. Formatea ese valor con `formatNumber()` y pasa el resultado.

## Licencia

Este proyecto tiene licencia [Apache-2.0](LICENSE).
