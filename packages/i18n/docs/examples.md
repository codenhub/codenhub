---
title: Examples
description: Browser, framework rendering, routed hydration, SSR, SSG, and locale loader patterns.
---

# Use i18n across runtimes

The examples below use consumer-owned configuration. Replace the sample loader with the transport appropriate to the runtime.

## Browser application

The browser helper initializes core and optionally owns persistence, document attributes, safe leaf translation, and mutation observation.

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
});

const binding = await initializeBrowserI18n({
  i18n,
  root: document,
  observe: true,
});

console.log(i18n.t("home.title"));

// Run when this browser owner is torn down.
binding.disconnect();
```

With a `root`, leaves such as `<h1 data-i18n="home.title">Fallback title</h1>` are translated, and so are text attributes such as `<input data-i18n-placeholder="search.hint" placeholder="Search">`. Frameworks that render translated values themselves should omit `root` and `observe`.

## Routed hydration

Pass the route locale explicitly. It is authoritative over persisted and navigator preferences, preventing server/client locale disagreement.

```ts
import { createI18n } from "@codenhub/i18n";
import { initializeBrowserI18n } from "@codenhub/i18n/browser";
import { createLocaleRouting } from "@codenhub/i18n/routing";

const routing = createLocaleRouting({
  defaultLocale: "en",
  locales: ["en", "pt"] as const,
  prefixDefaultLocale: true,
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

## Framework rendering

Frameworks that render translated values themselves re-render on `subscribe()`, which fires after every applied initialization and locale change. This React example imports the shared module from the quick start, so it suits a browser application or another runtime with one active locale; server rendering creates a manager per request, as in the SSR example below, and passes it to components instead:

```tsx
import { useSyncExternalStore } from "react";
import { i18n, t } from "./i18n";

export function useLocale() {
  return useSyncExternalStore(i18n.subscribe, () => i18n.locale);
}

export function Greeting({ name }: { name: string }) {
  useLocale();
  return <h1>{t("page.greeting", { name })}</h1>;
}
```

## SSR

Match the request's language preferences to a configured locale and create one manager per request. `preferences` is the request's `Accept-Language` tags sorted by quality; the [reference](reference.md#matchlocalepreferences) shows a parser.

```ts
import { createI18n } from "@codenhub/i18n";

export async function renderPage(preferences: readonly string[]) {
  const i18n = createI18n(config);
  const locale = i18n.matchLocale(preferences) ?? i18n.defaultLocale;

  await i18n.init({ locale });
  const { t } = i18n;

  return frameworkRender({
    locale: i18n.locale,
    direction: i18n.direction,
    title: t("page.title"),
  });
}
```

Do not share mutable manager state across concurrent requests. In Node.js, an exception thrown by a `ready` or `locale-change` listener is reported as an uncaught exception and ends the process by default, as for any `EventTarget` listener, so keep server listeners from throwing. Immutable dictionary modules and runtime-level import caches may still be shared.

Return the same payload object for a locale on every request, such as a module-level import, rather than parsing it per request: managers then share its normalized dictionary instead of validating it again. Missing-key warnings are deduplicated per manager, so a per-request manager warns for a missing key on every request; in production SSR, send misses to a logger with `onMissingKey`, or set `isSilent: true`. In tests and builds, `onMissingKey: (key) => { throw new Error(key); }` fails on a key missing from both dictionaries. A key that only the default dictionary has does not warn; the key-parity check below finds it.

## SSG

Use routing output to drive the framework's static path API. Keep a separate manager for every concurrently rendered page.

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
      title: i18n.t("page.title"),
    });
  }),
);
```

Loader and dictionary failures reject, allowing the build to fail rather than publishing pages without translations. A key missing from a locale but present in the default dictionary does not fail or warn: it renders the default text. Add a key-parity check to catch those before publishing.

## Key-parity check

`translate()` falls back to the default dictionary without a warning, so a key added to the default locale but not yet translated renders default-locale text everywhere else. Compare dictionaries in a test or build step, since `loadLocale()` returns each normalized dictionary without changing manager state:

```ts
const i18n = createI18n(config);
const referenceKeys = Object.keys(await i18n.loadLocale(i18n.defaultLocale));

const dictionaries = await Promise.all(i18n.locales.map((locale) => i18n.loadLocale(locale)));

dictionaries.forEach((dictionary, index) => {
  const missingKeys = referenceKeys.filter((key) => !(key in dictionary));

  if (missingKeys.length > 0) {
    throw new Error(`${i18n.locales[index]} is missing ${missingKeys.join(", ")}`);
  }
});
```

Keys are flattened, so nested payloads compare as dot-separated keys such as `page.title`.

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
};
```

### HTTP fetch

`response.json()` returns `any`, so a fetch loader accepts any string key. Declare its return type, such as an imported type of the default dictionary, to type keys:

```ts
import type en from "./locales/en.json";

async function loadLocale(locale: "en" | "pt"): Promise<typeof en> {
  const response = await fetch(`https://example.com/locales/${locale}.json`);
  if (!response.ok) throw new Error(`Locale request failed: ${response.status}`);
  return response.json();
}
```

The loader owns URLs, timeouts, retries, credentials, filesystem access, and all other transport policy. Rejected loaders are wrapped in `I18nError`; invalid resolved payloads remain native `TypeError` failures.
