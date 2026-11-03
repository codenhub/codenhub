---
title: Write your translations
description: Dictionaries, JSON files, placeholders, plurals, typed keys, and checking for untranslated keys.
order: 1
---

# Write your translations

A dictionary is a plain object whose values are strings or more objects. This page covers how to organize dictionaries, load them, put values and counts into text, and keep every language complete.

## Dictionary shape

Nest keys to group related text. Every leaf must be a string:

```json
{
  "nav": { "home": "Home", "settings": "Settings" },
  "settings": {
    "title": "Settings",
    "language": { "label": "Language", "hint": "Used across the whole app" }
  }
}
```

The manager flattens nesting into dot-separated keys: `nav.home`, `settings.language.hint`. You can also write flat keys directly, as `{ "nav.home": "Home" }`, or mix both, as long as two spellings never produce the same key.

A dictionary is rejected with a `TypeError` when it contains something that is not text or a group: a number, an array, `null`, a `Date`, a function, a key with an empty segment such as `"nav..home"`, or a `__proto__` key. [Troubleshooting](troubleshooting.md#a-dictionary-is-rejected) lists every rule.

An empty dictionary is fine. A locale you have added but not translated yet starts normally and shows default-locale text everywhere.

## Keep dictionaries in JSON files

Most apps keep one JSON file per locale, often because translators or a translation service edit them:

```text
src/locales/
  en.json
  pt.json
```

Load them with a dynamic `import()`, so a visitor downloads only the languages the manager needs: their own, plus your default language as the fallback:

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

This shares one manager across a browser app. On a server or in a static build, wrap `createI18n()` in a function and call it for each request or page instead, as [Render on a server](server-rendering.md#one-manager-per-request) explains.

The return type `Promise<typeof en>` is what gives you typed keys: a dynamic import returns `any`, which would otherwise let any string through. `import type` needs `"resolveJsonModule": true` in your `tsconfig.json`, and never ends up in your bundle.

To fetch dictionaries from a server instead, return the parsed JSON and throw on a failed response, so the manager reports the failure instead of loading an error page as a dictionary:

```ts
async loadLocale(locale): Promise<typeof en> {
  const response = await fetch(`/locales/${locale}.json`);
  if (!response.ok) throw new Error(`Locale request failed: ${response.status}`);
  return response.json();
}
```

Your loader owns everything about transport: URLs, caching headers, retries, timeouts, and credentials. The manager only calls it and checks what comes back.

### How loading behaves

- The manager loads a locale the first time it needs it and keeps the result, so switching back to a language does not call your loader again.
- Starting or switching to a non-default locale loads that locale, the locales it falls back to, and the default locale together, as [Regional variants](#regional-variants) explains.
- If your loader throws or rejects, the call that needed it rejects with an `I18nError`, and the manager keeps its current language. The next call tries the loader again.
- Returning the same object every time, such as a module-level import, lets every manager share one checked copy. That matters on a server, which [creates a manager per request](server-rendering.md).
- Treat a dictionary as read-only once loaded: the manager keeps a frozen, checked copy, shared by every manager that loads the same object, so later changes to the object do nothing.

### Regional variants

A regional locale only needs the words that differ. With `pt` and `pt-BR` both in `locales`, `pt-BR.json` can hold just the Brazilian words, and every other key comes from `pt.json`:

```ts
export const i18n = createI18n({
  locales: ["en", "pt", "pt-BR"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});
// pt-BR: { "greeting": "Oi" }   pt: { "greeting": "Olá", "farewell": "Tchau" }
await i18n.init({ locale: "pt-BR" });
t("greeting"); // "Oi"
t("farewell"); // "Tchau", from pt
```

A key is looked up in the active locale, then in each configured locale made by dropping its last subtags, such as `zh-Hant` for `zh-Hant-TW`, then in the default locale. A parent written in another script is skipped: `zh` is Simplified Chinese, so a `zh-Hant` page falls back to the default rather than mixing scripts. A plural group uses the rules of the locale whose dictionary has it.

Every locale in that chain loads with the active one, so starting in `pt-BR` loads `pt-BR`, `pt`, and `en`. If one of them fails, the call rejects as for any locale.

## Put values into text

Write `{name}` where a value goes, and pass the value to `t()`:

```json
{ "welcome": "Welcome back, {name}. You have {count} new messages." }
```

```ts
t("welcome", { name: "Ana", count: 4 });
// "Welcome back, Ana. You have 4 new messages."
```

Placeholder names use letters, digits, and `_`. Values can be strings, numbers, or dates.

Use placeholders instead of joining fragments. `t("before") + name + t("after")` locks every language into English word order, while a whole sentence with a placeholder lets each translation put the value where it belongs.

A few details:

- A placeholder with no matching value stays as written, so a missing value shows up as `{name}` on screen rather than disappearing.
- Numbers in a plain `{name}` are inserted as JavaScript writes them: `1234.5`. Write `{name, number}` to format them for the reader, as the next section shows.
- Braces and apostrophes are message syntax, so text that shows them literally needs quoting; see [Literal braces and apostrophes](#literal-braces-and-apostrophes).

### Format numbers and dates in the text

Messages use [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) syntax, so a translation can say how each value is written:

```json
{
  "total": "Total: {amount, number}",
  "progress": "{ratio, number, percent} done",
  "shipped": "Shipped on {date, date, long} at {date, time, short}"
}
```

```ts
t("total", { amount: 1234.5 }); // "Total: 1,234.5", or "Total: 1.234,5" from the Portuguese text
t("shipped", { date: new Date() });
```

| Argument                | Styles                                                             | Value                 |
| ----------------------- | ------------------------------------------------------------------ | --------------------- |
| `{n, number}`           | none, `integer`, `percent`                                         | number                |
| `{d, date}`             | `short`, `medium` (the default), `long`, `full`                    | `Date` or a timestamp |
| `{d, time}`             | `short`, `medium` (the default), `long`, `full`                    | `Date` or a timestamp |
| `{n, plural, …}`        | see [Plurals](#plurals)                                            | number                |
| `{n, selectordinal, …}` | ordinal forms, such as `one {#st} two {#nd} few {#rd} other {#th}` | number                |
| `{v, select, …}`        | any words, plus `other`                                            | string or number      |

Formatting uses the language of the dictionary the text came from, so English text that fills in for a missing Portuguese key is written the English way. An argument whose value has the wrong type, such as a string for `{n, number}`, stays as written. Skeletons such as `{n, number, ::currency/EUR}` are not supported; format such values in code, as below, and pass the string.

A `select` picks text by a value, such as a pronoun, and needs an `other` option:

```json
{ "replied": "{gender, select, female {She} male {He} other {They}} replied" }
```

To format a value in code, use the manager's formatters. They follow the active locale:

```ts
i18n.formatNumber(9.99, { style: "currency", currency: "EUR" }); // "€9.99"
i18n.formatDate(new Date(), { dateStyle: "long" }); // "November 2, 2026"
i18n.formatRelativeTime(-1, "day", { numeric: "auto" }); // "yesterday"
i18n.formatList(["Ana", "Bia", "Caio"]); // "Ana, Bia, and Caio"
```

They take the same options as `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`, and `Intl.ListFormat`, and throw what those throw for invalid options.

### Literal braces and apostrophes

An apostrophe before `{` or `}` quotes text up to the next apostrophe, and two apostrophes make one. An apostrophe anywhere else is an ordinary apostrophe, so "Don't" needs nothing:

| Written in the dictionary | Shown                   |
| ------------------------- | ----------------------- |
| `Don't forget {name}`     | `Don't forget Ana`      |
| `Type '{name}' to insert` | `Type {name} to insert` |
| `It''s '{'here'}'`        | `It's {here}`           |

Inside a plural, `#` stands for the number; write `'#'` for a literal `#`.

Text that is not valid syntax, such as an unclosed `{`, logs a warning once, unless the manager is silent, and is shown with only its `{name}` placeholders filled. [Find untranslated keys](#find-untranslated-keys) shows a test that checks every message.

## Plurals

"1 items" is wrong in English, and other languages have more forms than English does. Arabic has six. To let each language choose, write the key as a group of forms instead of a single string:

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

Then pass a number as `count`:

```ts
t("cart.items", { count: 1 }); // "1 item"
t("cart.items", { count: 5 }); // "5 items"
```

The manager asks the built-in `Intl.PluralRules` which form the language uses for that number, and `count` also fills the `{count}` placeholder. The form names are the standard [CLDR plural categories](https://cldr.unicode.org/index/cldr-spec/plural-rules):

| Form    | Used for                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------- |
| `zero`  | Languages with a zero form, such as Arabic and Latvian. English uses `other` for 0.            |
| `one`   | Singular. French and Brazilian Portuguese (`pt`, `pt-BR`) also use it for 0; `pt-PT` does not. |
| `two`   | Dual, such as Arabic, Hebrew, and Welsh.                                                       |
| `few`   | Small numbers, such as 2–4 in Polish and Czech.                                                |
| `many`  | Large numbers in some languages, such as Polish and Arabic.                                    |
| `other` | Everything else. **Always include it**; it is the fallback for any form you leave out.         |

Each dictionary only needs the forms its own language uses: the English file has `one` and `other`, and the Arabic file has all six. Look up a language's forms in the [CLDR plural rules chart](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html).

When a plural group is missing from the current locale, the default locale's group is used, with the default language's rules, since that text is in the default language.

Two things to watch for:

- `count` must be a number. A string such as `"5"` does not select a form; the group is then treated as a missing key.
- A plain string under the same key wins over forms. If `cart.items` is a string, `count` only fills `{count}`.

### Show a formatted count

A plain `{count}` writes the number as JavaScript does, so 1234 items reads "1234 items" rather than "1,234 items", or "1.234 itens" in Portuguese. Write `{count, number}` in the forms instead:

```json
{
  "cart": {
    "items": {
      "one": "{count, number} item",
      "other": "{count, number} items"
    }
  }
}
```

```ts
t("cart.items", { count: 1234 }); // "1,234 items"
```

### Plurals inside a sentence

A plural group chooses the whole text. To choose only part of a sentence, or to give `0` its own wording, write an ICU plural in a single string. `#` is the number, formatted for the language, and `=N` matches an exact number before the forms are asked:

```json
{
  "inbox": "Hi {name}, {count, plural, =0 {you have no messages} one {you have # message} other {you have # messages}}."
}
```

```ts
t("inbox", { name: "Ana", count: 0 }); // "Hi Ana, you have no messages."
t("inbox", { name: "Ana", count: 1200 }); // "Hi Ana, you have 1,200 messages."
```

`offset:N` subtracts from the number before choosing a form and filling `#`, but not before matching `=N`, as in `{count, plural, offset:1 =0 {Nobody} =1 {{name}} other {{name} and # others}}`. Both ways of writing plurals are supported; plural groups keep each form an ordinary key, which some translation tools handle better.

## Typed keys

When TypeScript can see your dictionary's type, `t()` only accepts keys that exist:

```ts
t("cart.items", { count: 2 }); // ok: a plural group
t("cart.items.one"); // ok: a single form is a key too
t("cart"); // compile error: a group of text is not a key
t("cart.itmes", { count: 2 }); // compile error: misspelled
```

The type comes from what your loader returns. If it returns several `as const` dictionaries, a key from any of them is accepted. If it returns `any` or `unknown`, as `response.json()` and dynamic imports do, every string is accepted; give the loader a return type, as in the JSON example above, to get checking back.

A key you build at runtime, such as ``t(`errors.${code}`)``, fails to compile even when it exists, because TypeScript can't know the value of `code`. When you know the keys are there, cast it:

```ts
import type { TranslationKey } from "@codenhub/i18n";
import type en from "./locales/en.json";

type Key = TranslationKey<typeof en>;

t(`errors.${code}` as Key);
```

`TranslationKey` is also useful for typing a component prop or helper that takes a key.

If you write the manager's type yourself, as in `let i18n: I18n<"en" | "pt">`, pass the key type too: `I18n<"en" | "pt", Key>`. The second type argument defaults to `string`, which accepts any key. `createI18n()` fills it in for you.

Let TypeScript infer the manager's types from the configuration. Passing some type arguments yourself, such as `createI18n<"en" | "pt">(...)`, turns off inference for the rest, and keys go back to plain `string`.

If you keep the configuration in a separate variable, mark the default locale `as const`:

```ts
const config = {
  locales: ["en", "pt"] as const,
  defaultLocale: "en" as const,
  loadLocale: (locale: "en" | "pt") => dictionaries[locale],
};
```

Without `as const`, TypeScript sees `defaultLocale` as any `string`, and `createI18n(config)` reports that `string` is not `"en" | "pt"`.

## Find untranslated keys

A key missing from one language quietly shows default-language text, which is easy to miss. Catch it in a test by comparing every dictionary with the default one. `loadLocale()` returns a dictionary without changing the manager's language:

```ts
import { expect, test } from "vitest";
import { i18n } from "./i18n";

// Plural forms other than `other` differ by language, so they are not compared.
// A key such as `settings.one` is still compared unless its group also has `other`.
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

To catch a message with broken syntax, such as an unclosed `{` a translator left, look up every key in every locale and fail on the warning. The manager must not be silent for this:

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

To fail a test on keys missing from every dictionary, such as a typo in a key you built at runtime, throw from `onMissingKey`:

```ts
createI18n({
  // ...
  onMissingKey(key, locale) {
    throw new Error(`Missing translation "${key}" in ${locale}`);
  },
});
```

## Size limits

Dictionaries come from files and servers, so the manager limits how large they can be. This stops a corrupted or hostile file from freezing the page. The defaults fit any real app:

| Limit                      | Default   | Option            |
| -------------------------- | --------- | ----------------- |
| Nesting depth              | 100       | `maxDepth`        |
| Translations               | 10,000    | `maxTranslations` |
| Keys and groups together   | 20,000    | `maxProperties`   |
| Characters in one text     | 100,000   | `maxValueLength`  |
| Characters in all texts    | 5,000,000 | `maxTotalLength`  |
| Characters in one full key | 1,000     | fixed             |

Raise one with `dictionaryLimits`, which keeps the default for any limit you leave out:

```ts
createI18n({
  // ...
  dictionaryLimits: { maxTranslations: 50_000, maxProperties: 100_000 },
});
```

A nested dictionary counts each group as a property, so raising `maxTranslations` often means raising `maxProperties` too.
