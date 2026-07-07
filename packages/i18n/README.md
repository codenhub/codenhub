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
  I18nEventMap,
} from "@codenhub/i18n";
```

#### `createI18n()`

Creates the main public `I18n` instance.

```ts
function createI18n<TLocale extends string = string>(config: I18nConfig<TLocale>): I18n<TLocale>;
```

| Parameter | Type                  | Description                               |
| --------- | --------------------- | ----------------------------------------- |
| `config`  | `I18nConfig<TLocale>` | Static configuration for the translation. |

##### Returns

`I18n<TLocale>` - The created translation manager instance.

---

#### `I18n`

Public translation manager interface.

```ts
interface I18n<TLocale extends string = string> {
  readonly locale: TLocale;
  readonly isReady: boolean;
  init(options?: I18nInitOptions): Promise<void>;
  disconnect(): void;
  translateDocument(root?: ParentNode): void;
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

##### Properties

- `locale`: The currently active locale string.
- `isReady`: True if `init()` has completed, false otherwise.

##### `init(options)`

Initializes state, resolves the active locale, fetches matching translations (recursively flattening nested keys), and translates the DOM. If `options.observe` is true, sets up a MutationObserver to translate new or modified dynamic elements.

- **Parameters**: `options?: I18nInitOptions`
- **Returns**: `Promise<void>`
- **Observable Failure Behavior**: If the resolved locale fails to load, it attempts to load `defaultLocale`. If that also fails, initialization completes but `hasTranslationsAvailable` is emitted as false. If run in a server-side (Node) environment, resolves immediately without loading or translating.

##### `disconnect()`

Disconnects the translation manager, stopping any DOM observation and cleaning up resources. Must be called when discarding the instance if `MutationObserver` was started (i.e. when `options.observe` is true) to prevent memory leaks.

- **Returns**: `void`

##### `translateDocument(root)`

Re-scans and translates translatable elements inside the given root element or subtree. Useful for manually translating dynamically loaded content.

- **Parameters**: `root?: ParentNode` (Defaults to the configured instance root)
- **Returns**: `void`

##### `setLocale(locale)`

Switches the active locale, fetches translations if needed, synchronizes document `lang`/`dir`, re-translates the DOM, and fires a `locale-change` event.

- **Parameters**: `locale: string`
- **Returns**: `Promise<boolean>` - True if the requested locale loaded successfully, false if validation/fetch failed (causing a fallback to `defaultLocale` or retaining the active locale).
- **Observable Failure Behavior**: Returns false immediately if the locale is invalid. If fetching fails, falls back to `defaultLocale`. If that also fails, it retains the previously active locale.

##### `translate(key)`

Translates the given key using the active locale's loaded dictionary. Supports dot-notation (e.g. `home.hero.title`) for resolving nested structures.

- **Parameters**: `key: string`
- **Returns**: `string | undefined` - The translated string, or undefined if the key is missing or invalid.
- **Observable Failure Behavior**: Returns `undefined` and logs a warning on missing keys (warns once per key per locale) or if called before `init()`, unless silenced by `isSilent`.

##### Event Listeners

Add or remove event listeners for `ready` and `locale-change` custom events.

- `addEventListener(type, callback, options)`
- `removeEventListener(type, callback, options)`
- `dispatchEvent(event)`

---

#### `I18nConfig`

Configuration structure passed to `createI18n()`.

```ts
interface I18nConfig<TLocale extends string = string> {
  defaultLocale: TLocale;
  locales: readonly TLocale[];
  getLocaleFile(locale: TLocale): string;
  getLocaleDirection(locale: TLocale): LocaleDirection;
  isLocale?(value: string): value is TLocale;
  isSilent?: boolean;
}
```

| Property             | Type                                   | Default                | Description                                                         |
| -------------------- | -------------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| `defaultLocale`      | `TLocale`                              | None                   | Fallback locale when translations fail to load.                     |
| `locales`            | `readonly TLocale[]`                   | None                   | List of all supported locale strings.                               |
| `getLocaleFile`      | `(locale: TLocale) => string`          | None                   | Callback returning path or URL to translation JSON.                 |
| `getLocaleDirection` | `(locale: TLocale) => LocaleDirection` | None                   | Callback returning text direction (`ltr` or `rtl`).                 |
| `isLocale`           | `(value: string) => value is TLocale`  | Derives from `locales` | Type guard validating if a string is a supported locale (optional). |
| `isSilent`           | `boolean`                              | `false`                | If true, silences missing key and pre-init console warnings.        |

---

#### `I18nInitOptions`

Optional initialization parameters passed to `i18n.init()`.

```ts
interface I18nInitOptions {
  storageKey?: string;
  root?: ParentNode;
  isSilent?: boolean;
  observe?: boolean;
}
```

| Property     | Type         | Default           | Description                                                          |
| ------------ | ------------ | ----------------- | -------------------------------------------------------------------- |
| `storageKey` | `string`     | `"i18n"`          | LocalStorage key used to persist the user's locale choice.           |
| `root`       | `ParentNode` | `document`        | DOM subtree to automatically scan and translate.                     |
| `isSilent`   | `boolean`    | `config.isSilent` | If true, overrides config setting to silence console warnings.       |
| `observe`    | `boolean`    | `false`           | If true, auto-translates dynamic DOM additions via MutationObserver. |

---

#### `LocaleDirection`

Text direction for a locale.

```ts
type LocaleDirection = "ltr" | "rtl";
```

---

#### `LocaleDictionary`

Record of translation key-value pairs where keys can be nested dot-notation strings.

```ts
interface LocaleDictionary {
  [key: string]: string;
}
```

---

#### `I18nEventMap`

Map of i18n event types to their respective CustomEvent details.

```ts
interface I18nEventMap {
  ready: CustomEvent<I18nReadyEventDetail>;
  "locale-change": CustomEvent<I18nLocaleChangeEventDetail>;
}
```

---

#### Global Instances

Helpers to register and fetch a single shared translation manager.

##### `setI18nInstance(instance)`

Registers a global `I18n` instance.

- **Parameters**: `instance: I18n<string> | null`
- **Returns**: `void`

##### `getI18nInstance()`

Retrieves the registered global `I18n` instance.

- **Returns**: `I18n<string>`
- **Observable Failure Behavior**: Throws an `Error` if no active instance has been registered.

---

### Events

`I18n` instances are `EventTarget`s and emit custom events:

#### `ready`

Emitted when `init()` completes successfully.

- **Detail Shape**:
  ```ts
  interface I18nReadyEventDetail {
    locale: string;
    hasTranslationsAvailable: boolean;
  }
  ```

#### `locale-change`

Emitted when the active locale has successfully changed.

- **Detail Shape**:
  ```ts
  interface I18nLocaleChangeEventDetail {
    locale: string;
    previousLocale: string;
  }
  ```

## Examples

### Listening to translation events

You can listen to `ready` and `locale-change` events on the i18n manager instance:

```ts
i18n.addEventListener("ready", (event) => {
  const { locale, hasTranslationsAvailable } = (event as CustomEvent<I18nReadyEventDetail>).detail;
  console.log(`i18n ready for locale: ${locale}. Translations available: ${hasTranslationsAvailable}`);
});

i18n.addEventListener("locale-change", (event) => {
  const { locale, previousLocale } = (event as CustomEvent<I18nLocaleChangeEventDetail>).detail;
  console.log(`locale changed from ${previousLocale} to ${locale}`);
});
```

### Translating programmatic strings manually

Use `translate` to resolve translation keys in JavaScript:

```ts
const greeting = i18n.translate("home.welcome.greeting") ?? "Welcome!";
```

## Requirements

- Browser environment supporting `EventTarget`, `WeakMap`, `localStorage`, and `fetch`.
- Node/SSR: If run server-side (where `document`/`navigator` is undefined), `init()` completes gracefully without translating or throwing.

## Notes

- **SSR State Pollution**: The global i18n instance (`setI18nInstance`/`getI18nInstance`) is shared across all concurrent requests in Node/SSR. Do not use global instances in multi-tenant server environments to avoid state leakages. Instead, manage request-scoped instances.
- **SSR Translation Limitation**: Server-side translation is not executed as `document` is missing. The client-side will initialize and translate once the document loads.
- **Leaf-Only DOM Translation**: Automatic DOM translation is restricted to leaf elements (elements with no child elements, i.e., `childElementCount === 0`). This prevents erasing inner markup or icon elements (e.g. `<svg>`) inside buttons or links. To translate elements with children/icons, place the text content inside a dedicated sibling element:

  ```html
  <!-- Incorrect (will be skipped with warning): -->
  <button data-i18n="actions.save">
    Save
    <svg>...</svg>
  </button>

  <!-- Correct (recommended workaround): -->
  <button>
    <span data-i18n="actions.save">Save</span>
    <svg>...</svg>
  </button>
  ```

- **Custom Element Boundaries**: During automatic translation of a document or subtree, the manager skips translating elements nested inside custom elements (tags containing a hyphen `-`). This keeps component translations isolated. To translate elements inside a custom element, either pass the custom element (or its shadow root) as the explicit `root` option during `init()`, or run a separate `I18n` instance for the component.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
