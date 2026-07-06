# @codenhub/i18n

Flexible, lightweight i18n translation system with DOM synchronization, browser locale resolution, state persistence, and auto-translation of DOM elements.

## Installation

```sh
pnpm add @codenhub/i18n
```

## Usage

Create a configuration object and initialize the i18n instance. This will resolve the initial locale (restoring a persisted user locale or detecting the browser's language), load the corresponding locale file, synchronize HTML attributes (`lang` and `dir`), and automatically translate matching elements in the DOM.

```ts
import { createI18n, setI18nInstance } from "@codenhub/i18n";
import type { I18nConfig } from "@codenhub/i18n";

const LOCALES = ["en-US", "pt-BR"] as const;
type Locale = (typeof LOCALES)[number];

const config: I18nConfig<Locale> = {
  defaultLocale: "en-US",
  locales: LOCALES,
  getLocaleFile: (locale) => `/locales/${locale}.json`,
  getLocaleDirection: (locale) => (locale === "ar" ? "rtl" : "ltr"),
  isLocale: (value): value is Locale => LOCALES.includes(value as Locale),
};

const i18n = createI18n(config);
setI18nInstance(i18n);

// Initialize i18n (detects locale, fetches translations, translates DOM)
await i18n.init();
```

In your HTML:

```html
<h1 data-i18n="home.title">Fallback Title</h1>
<p data-i18n="home.description">Fallback description</p>
```

## Reference

### `@codenhub/i18n`

Primary entrypoint for the package's public API.

```ts
import { createI18n, getI18nInstance, setI18nInstance } from "@codenhub/i18n";
import type {
  I18n,
  I18nConfig,
  I18nInitOptions,
  I18nLocaleChangeEventDetail,
  I18nReadyEventDetail,
  LocaleDictionary,
  LocaleDirection,
} from "@codenhub/i18n";
```

#### `createI18n()`

Creates the main public `I18n` instance.

```ts
function createI18n<TLocale extends string = string>(config: I18nConfig<TLocale>): I18n<TLocale>;
```

| Parameter | Type                  | Description                     |
| --------- | --------------------- | ------------------------------- |
| `config`  | `I18nConfig<TLocale>` | Configuration for i18n manager. |

Returns `I18n<TLocale>`.

#### `I18n`

Public translation manager interface.

```ts
interface I18n<TLocale extends string = string> {
  readonly locale: TLocale;
  readonly ready: boolean;
  init(options?: I18nInitOptions): Promise<void>;
  setLocale(locale: string): Promise<boolean>;
  translate(key: string): string | undefined;
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void;
  dispatchEvent(event: Event): boolean;
}
```

- `locale`: The currently active locale.
- `ready`: Whether initialization has finished.
- `init(options)`: Initializes storage, checks locale preferences, loads translations, and translates the DOM.
- `setLocale(locale)`: Switches the current locale, fetching translations if necessary, and re-translating the DOM. Emits a `locale-change` event on success.
- `translate(key)`: Returns the translated string for `key` or `undefined` if missing.

#### `I18nConfig`

Configuration structure for creating an `I18n` instance.

```ts
interface I18nConfig<TLocale extends string = string> {
  defaultLocale: TLocale;
  locales: readonly TLocale[];
  getLocaleFile(locale: TLocale): string;
  getLocaleDirection(locale: TLocale): LocaleDirection;
  isLocale(value: string): value is TLocale;
}
```

#### `I18nInitOptions`

Options for `i18n.init()`.

```ts
interface I18nInitOptions {
  storageKey?: string; // Key used for localStorage persistence. Defaults to "i18n".
  root?: ParentNode; // DOM subtree to translate. Defaults to document.
}
```

#### Global Instances

For convenience, you can store and retrieve a global i18n instance:

- `setI18nInstance(instance: I18n | null): void`
- `getI18nInstance(): I18n` (throws an error if no instance has been set)

### Events

`I18n` instances are `EventTarget`s and emit these custom events:

#### `ready`

Emitted when `init()` completes successfully.

```ts
interface I18nReadyEventDetail {
  locale: string;
  translationsAvailable: boolean;
}
```

#### `locale-change`

Emitted when the locale changes successfully.

```ts
interface I18nLocaleChangeEventDetail {
  locale: string;
  previousLocale: string;
}
```

## Requirements

- Browser environment supporting `EventTarget`, `WeakMap`, `localStorage`, and `fetch`.
- Node/SSR: If run server-side (where `document`/`navigator` is undefined), `init()` completes gracefully without translating or throwing.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
