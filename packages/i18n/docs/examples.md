---
title: Examples
description: Browser, routed hydration, SSR, SSG, and locale loader patterns.
---

# Use i18n across runtimes

The examples below use consumer-owned configuration. Replace the sample loader
with the transport appropriate to the runtime.

## Browser application

The browser helper initializes core and optionally owns persistence, document
attributes, safe leaf translation, and mutation observation.

```ts
import { createI18n } from "@codenhub/i18n";
import { initializeBrowserI18n } from "@codenhub/i18n/browser";

const i18n = createI18n({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  async loadLocale(locale) {
    const response = await fetch(`/locales/${locale}.json`);
    if (!response.ok) throw new Error(`Could not load ${locale}`);
    return response.json();
  },
  getLocaleDirection: () => "ltr",
});

const binding = await initializeBrowserI18n({
  i18n,
  root: document,
  observe: true,
});

console.log(i18n.translate("home.title"));

// Run when this browser owner is torn down.
binding.disconnect();
```

With a `root`, leaves such as
`<h1 data-i18n="home.title">Fallback title</h1>` are translated. Frameworks
that render translated values themselves should omit `root` and `observe`.

## Routed hydration

Pass the route locale explicitly. It is authoritative over persisted and
navigator preferences, preventing server/client locale disagreement.

```ts
import { createI18n } from "@codenhub/i18n";
import { initializeBrowserI18n } from "@codenhub/i18n/browser";
import { createLocaleRouting } from "@codenhub/i18n/routing";

const routing = createLocaleRouting({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  prefixDefaultLocale: false,
});
const route = routing.parse(window.location.pathname);

if (route === undefined) throw new Error("A locale prefix is required");

const i18n = createI18n(config);
const binding = await initializeBrowserI18n({
  i18n,
  locale: route.locale,
  syncDocument: true,
});
```

Changing a routed locale remains a navigation operation:

```ts
const nextPathname = routing.localize(route.pathname, "pt");
await frameworkNavigate(nextPathname);
```

`setLocale()` changes translation state but never changes the URL.

## SSR

Resolve request input to a canonical locale and create one manager per request.

```ts
import { createI18n } from "@codenhub/i18n";

export async function renderPage(requestLocale: string) {
  const i18n = createI18n(config);
  const locale = i18n.resolveLocale(requestLocale) ?? i18n.defaultLocale;

  await i18n.init({ locale });

  return frameworkRender({
    locale: i18n.locale,
    direction: i18n.direction,
    title: i18n.translate("page.title"),
  });
}
```

Do not share mutable manager state across concurrent requests. Immutable
dictionary modules and runtime-level import caches may still be shared.

## SSG

Use routing output to drive the framework's static path API. Keep a separate
manager for every concurrently rendered page.

```ts
import { createI18n } from "@codenhub/i18n";
import { createLocaleRouting } from "@codenhub/i18n/routing";

const routing = createLocaleRouting({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  prefixDefaultLocale: false,
});
const applicationPaths = ["/", "/about"];
const localizedPaths = applicationPaths.flatMap((pathname) => routing.localizeAll(pathname));

await Promise.all(
  localizedPaths.map(async (route) => {
    const i18n = createI18n(config);
    await i18n.init({ locale: route.locale });

    await frameworkGeneratePage({
      pathname: route.pathname,
      locale: i18n.locale,
      direction: i18n.direction,
      title: i18n.translate("page.title"),
    });
  }),
);
```

Loader and dictionary failures reject, allowing the build to fail rather than
publishing silently untranslated pages.

## Loader patterns

### Embedded dictionaries

```ts
const dictionaries = {
  en: { greeting: "Hello" },
  pt: { greeting: "Ola" },
} as const;

const config = {
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  loadLocale: (locale: keyof typeof dictionaries) => dictionaries[locale],
  getLocaleDirection: () => "ltr" as const,
};
```

### Dynamic imports

```ts
type Locale = "en" | "pt";

const config = {
  defaultLocale: "en" as const,
  locales: ["en", "pt"] as const,
  async loadLocale(locale: Locale) {
    const module = await import(`./locales/${locale}.json`);
    return module.default;
  },
  getLocaleDirection: () => "ltr" as const,
};
```

### HTTP fetch

```ts
async function loadLocale(locale: "en" | "pt"): Promise<unknown> {
  const response = await fetch(`https://example.com/locales/${locale}.json`);
  if (!response.ok) throw new Error(`Locale request failed: ${response.status}`);
  return response.json();
}
```

The loader owns URLs, timeouts, retries, credentials, filesystem access, and all
other transport policy. Rejected loaders are wrapped in `I18nError`; invalid
resolved payloads remain native `TypeError` failures.
