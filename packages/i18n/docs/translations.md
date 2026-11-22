---
title: Write your translations
description: Dictionaries, JSON files, placeholders, ICU messages, links and bold text, plurals, formatters, typed keys and values, checking for untranslated keys, and size limits.
order: 1
---

# Write your translations

A dictionary is a plain object whose values are strings or more objects. This page covers how to organize dictionaries, load them, put values and counts into text, keep TypeScript checking all of it, and keep every language complete.

It builds on the tea shop's `en` and `pt` dictionaries from the [overview](index.md#walkthrough). By the end, the shop can greet a customer by name, total their cart, say when their order ships, and catch a missing Portuguese word before a customer does.

## Dictionary shape

Nest keys to group related text. Every leaf must be a string:

```json
{
  "nav": { "home": "Home", "cart": "Cart" },
  "product": {
    "title": "Our teas",
    "shipping": { "label": "Shipping", "hint": "Free on orders over 50 euros" }
  }
}
```

The manager flattens nesting into dot-separated keys: `nav.home`, `product.shipping.hint`. You can also write flat keys directly, as `{ "nav.home": "Home" }`, or mix both, as long as two spellings never produce the same key.

A dictionary is rejected with a `TypeError` when it contains either of these:

- Something that is not text or a group, such as a number, an array, or `null`.
- A key the manager can't use, such as `"nav..home"` or `" home"` with a leading space.

The error names the locale and the key, as in `[I18n] Invalid locale dictionary key "nav. home" in locale "pt".`; [A dictionary is rejected](troubleshooting.md#a-dictionary-is-rejected) goes through every rule and its fix.

An empty dictionary is fine. A locale you have added but not translated yet starts normally and shows default-locale text everywhere.

## Keep dictionaries in JSON files

Most apps keep one JSON file per locale, often because translators or a translation service edit them, and a JSON file is easier to hand over than a TypeScript one:

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

To fetch dictionaries from a server instead, return the parsed JSON, throw on a failed response, and give up after a while:

```ts
async loadLocale(locale): Promise<typeof en> {
  const response = await fetch(`/locales/${locale}.json`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Locale request failed: ${response.status}`);
  return response.json();
}
```

The `throw` makes the manager report the failure instead of loading your 404 page as a dictionary. The timeout matters more than it looks; the next section says why.

Your loader owns everything about transport: URLs, caching headers, retries, timeouts, and credentials. The manager only calls it and checks what comes back.

### How loading behaves

- The manager loads a locale the first time it needs it and keeps the result, so switching back to a language does not call your loader again.
- Starting or switching to a non-default locale loads that locale, the locales it falls back to, and the default locale together, as [Regional variants](#regional-variants) explains.
- If your loader throws or rejects, the call that needed it rejects with an `I18nError`, and the manager keeps its current language. The next call tries the loader again. [Loading a locale fails](troubleshooting.md#loading-a-locale-fails-with-i18nerror) shows how to show that error to the visitor.
- While a locale is loading, every other call that needs it waits on the same load rather than calling your loader again. So a loader that never settles, such as a `fetch()` to a server that accepts the connection and then says nothing, blocks that locale for good. Every later `setLocale()` to it, a retry button included, waits on the same stuck promise. Make your loader time out, as with `AbortSignal.timeout()` above; a timeout rejects, and the next call tries again.
- Returning the same object every time, such as a module-level import, lets every manager share one checked copy. That matters on a server, which [creates a manager per request](server-rendering.md).
- Treat a dictionary as read-only once loaded. The manager keeps a frozen, checked copy, shared by every manager that loads the same object, so later changes to the object do nothing.

## Regional variants

A regional locale only needs the words that differ. The shop wants a more casual "Oi" for Brazilian visitors, where its general Portuguese says "Olá", so it adds `pt-BR` next to `pt`. With both in `locales`, the `pt-BR` dictionary can hold just the Brazilian words, and every other key comes from `pt`:

```ts
export const i18n = createI18n({
  locales: ["en", "pt", "pt-BR"] as const,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
});
// pt-BR: { home: { greeting: "Oi, {name}!" } }
// pt:    { home: { title: "Bem-vindo", greeting: "Olá, {name}!" }, ... }
await i18n.init({ locale: "pt-BR" });
t("home.greeting", { name: "Ana" }); // "Oi, Ana!"
t("home.title"); // "Bem-vindo", from pt
```

A key is looked up in this order:

1. The active locale.
2. Each configured locale made by dropping its last subtags, such as `zh-Hant` for `zh-Hant-TW`. A parent written in another script is skipped: `zh` is Simplified Chinese, so a `zh-Hant` page falls back to the default rather than mixing scripts. A deprecated language code counts as the one that replaced it, as `Intl` reads it, so `he-IL` falls back to a configured `iw`, and `iw-IL` to `he`. `no` and `nb` count as one language, as they do in [matching](index.md#turn-outside-input-into-a-locale).
3. The configured locale named by its language and script, such as `zh-Hant` for `zh-HK`, which is written in Traditional Chinese, or `sr-Latn` for `sr-ME`. So a `zh-HK` dictionary can hold only what Hong Kong says differently.
4. The default locale.

A plural group uses the rules of the locale whose dictionary has it.

Every locale in that chain loads with the active one, so starting in `pt-BR` loads `pt-BR`, `pt`, and `en`. If one of them fails, the call rejects as for any locale.

Only those parents count. `es-MX` does not fall back to `es-419`, because `es-419` is neither a shorter version of it nor its language and script. Give it its own dictionary, or serve Mexican visitors from `es-419` directly, as [Turn outside input into a locale](index.md#turn-outside-input-into-a-locale) shows.

## Put values into text

Write `{name}` where a value goes, and pass the value to `t()`:

```json
{ "order": { "confirmed": "Thanks, {name}. Order {orderId} ships tomorrow." } }
```

```ts
t("order.confirmed", { name: "Ana", orderId: "1042" });
// "Thanks, Ana. Order 1042 ships tomorrow."
```

Values can be strings, numbers, bigints, or dates. A bigint goes wherever a number does, and is formatted without losing digits. Placeholder names use ASCII letters, digits, and `_`, such as `{firstName}` or `{first_name}`. A name with anything else, such as `{first-name}` or `{nome_ç}`, is not a placeholder: the message is invalid syntax, logs a warning, and shows `{first-name}` as written.

Use placeholders instead of joining fragments. `t("before") + name + t("after")` locks every language into English word order, while a whole sentence with a placeholder lets each translation put the value where it belongs. Word order is the first thing every translator wants to change, and they are usually right. For a link or bold text inside the sentence, see [Links and bold text inside a sentence](#links-and-bold-text-inside-a-sentence).

A few details:

- A placeholder with no matching value stays as written, so a missing value shows up as `{name}` on screen rather than disappearing.
- One `t()` call fills at most 100 arguments, counting those inside plural and select forms, and leaves the rest as written. A UI sentence never gets close; the limit keeps a huge fetched message from costing one formatting step per placeholder.
- A number in a plain `{name}` is formatted for the reader, as `{name, number}` does: `1234.5` reads "1,234.5" in English and "1.234,5" in Portuguese. Write `{name, number, integer}` or another style, as the next section shows, to format it differently.
- Braces and apostrophes are message syntax, so text that shows them literally needs quoting; see [Literal braces and apostrophes](#literal-braces-and-apostrophes).

### Format numbers and dates in the text

Messages use [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) syntax, so a translation can say how each value is written:

```json
{
  "cart": {
    "total": "Total: {amount, number}",
    "discount": "{rate, number, percent} off"
  },
  "order": {
    "shipped": "Shipped on {date, date, long} at {date, time, short}"
  }
}
```

```ts
t("cart.total", { amount: 1234.5 }); // "Total: 1,234.5", or "Total: 1.234,5" from the Portuguese text
t("cart.discount", { rate: 0.15 }); // "15% off"
t("order.shipped", { date: new Date() });
```

| Argument                | Styles                                                             | Value                     |
| ----------------------- | ------------------------------------------------------------------ | ------------------------- |
| `{n, number}`           | none, `integer`, `percent`                                         | number or bigint          |
| `{d, date}`             | `short`, `medium` (the default), `long`, `full`                    | `Date` or a timestamp     |
| `{d, time}`             | `short`, `medium` (the default), `long`, `full`                    | `Date` or a timestamp     |
| `{n, plural, …}`        | see [Plurals](#plurals)                                            | number or bigint          |
| `{n, selectordinal, …}` | ordinal forms, such as `one {#st} two {#nd} few {#rd} other {#th}` | number or bigint          |
| `{v, select, …}`        | any words, plus `other`                                            | string, number, or bigint |

Formatting uses the language of the dictionary the text came from, so English text that fills in for a missing Portuguese key is written the English way. An argument whose value has the wrong type, such as a string for `{n, number}`, stays as written.

Two things messages can't do, both on purpose:

- **Skeletons and currency.** `{n, number, ::currency/EUR}` and `{n, number, currency}` are invalid syntax: a translation can't know which currency the amount is in. Format the amount in code, as below, and pass the string.
- **Nesting past 10 levels.** A `plural` or `select` can sit inside another one's options, up to 10 levels deep. An 11th level is treated as invalid syntax. If a message gets near that, it has outgrown being one message; split it.

A `select` picks text by a value, such as a pronoun, and needs an `other` option:

```json
{ "review": { "replied": "{gender, select, female {She} male {He} other {They}} replied to your review" } }
```

To format a value in code, use the manager's formatters. They follow the active locale:

```ts
i18n.formatNumber(9.99, { style: "currency", currency: "EUR" }); // "€9.99"
i18n.formatDate(new Date(), { dateStyle: "long" }); // "November 2, 2026"
i18n.formatRelativeTime(-1, "day", { numeric: "auto" }); // "yesterday"
i18n.formatList(["Ana", "Bia", "Caio"]); // "Ana, Bia, and Caio"
```

They take the same options as `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`, and `Intl.ListFormat`. They read those options the same way `Intl` reads them, including options an object inherits, such as from a shared defaults object passed to `Object.create()`. They throw what those throw for invalid options.

### Time zones

Dates and times are written in the runtime's time zone. In a browser that is the reader's, which is usually right. On a server it is the server's.

So an order shipped at 01:00 UTC on 2 November renders as "November 2" for a reader in São Paulo, where it is still 1 November, and the text changes once the browser takes over. Time zones: the reason a date is never just a date. Set `timeZone` to the zone the text should use:

```ts
createI18n({
  // ...
  timeZone: "America/Sao_Paulo",
});
```

It applies to `{d, date}`, `{d, time}`, and a date in `{d}`, and is `formatDate`'s default; `formatDate(value, { timeZone: "UTC" })` still overrides it. A zone `Intl` doesn't know throws a `TypeError` when the manager is created. On a server, set it per request, as in [Show dates in the reader's time zone](server-rendering.md#show-dates-in-the-readers-time-zone).

### Literal braces and apostrophes

An apostrophe before `{` or `}` quotes text up to the next apostrophe, and two apostrophes make one. An apostrophe anywhere else is an ordinary apostrophe, so "Don't" needs nothing:

| Written in the dictionary | Shown                   |
| ------------------------- | ----------------------- |
| `Don't forget {name}`     | `Don't forget Ana`      |
| `Type '{name}' to insert` | `Type {name} to insert` |
| `It''s '{'here'}'`        | `It's {here}`           |
| `Ouvrir l''{app}`         | `Ouvrir l'éditeur`      |
| `Ouvrir l’{app}`          | `Ouvrir l’éditeur`      |

Watch for an apostrophe right before a placeholder, as French, Italian, and Catalan elision puts one. `Ouvrir l'{app}` quotes `{app}`, so it shows `Ouvrir l{app}`, and nothing warns, because the text is valid. Write two apostrophes, `l''{app}`, or the typographic apostrophe `’`, which French typography prefers anyway and which is never syntax.

Inside a plural's forms, `#` stands for the number; write `'#'` for a literal `#`. A `select` nested in a form is not the plural itself, so a `#` there is shown as written, as in ICU; put `{count}` there instead.

Quoted text is text to the types too: in `'{it''s {x}'`, which shows `{it's {x}`, `x` is not a value `t()` asks for.

Text that is not valid syntax, such as an unclosed `{` or a stray `}`, logs a warning, unless the manager is silent, and is shown with only its `{name}` placeholders filled. The warning names the key and the locale, and comes once for each text in each locale, among the 1,000 most recent. [Find untranslated keys](#find-untranslated-keys) shows a test that checks every message.

### Links and bold text inside a sentence

A sentence with a link in the middle is still one sentence. Splitting it into `t("before")`, a link, and `t("after")` locks the word order, as joining fragments does. Mark the part with a tag and call `rich()`, which returns the text and its tags as data for your framework to render:

```json
{ "signup": { "terms": "By signing up you accept the <terms>terms of use</terms>." } }
```

```ts
i18n.rich("signup.terms");
// ["By signing up you accept the ", { tag: "terms", children: ["terms of use"] }, "."]
```

A tag is `<name>…</name>`, or `<name/>` for one with no content, such as a line break. Names use ASCII letters, digits, and `_`. A tag names what the part is, and your code decides how it renders, so a translation can't add a link, a script, or markup your code doesn't render. In React, for example:

```tsx
import { Fragment, type ReactNode } from "react";
import type { RichText } from "@codenhub/i18n";

type Tags = Readonly<Record<string, (children: ReactNode) => ReactNode>>;

// A tag your code doesn't render shows its content without it.
const render = (parts: RichText, tags: Tags): ReactNode[] =>
  parts.map((part, index) => {
    if (typeof part === "string") {
      return part;
    }
    // An own property only, so a tag such as `<constructor>` never reaches an inherited function.
    const tag = Object.hasOwn(tags, part.tag) ? tags[part.tag]! : (children: ReactNode) => children;
    return <Fragment key={index}>{tag(render(part.children, tags))}</Fragment>;
  });

<p>{render(i18n.rich("signup.terms"), { terms: (children) => <a href="/terms">{children}</a> })}</p>;
```

A few details:

- `rich()` takes the same keys and values as `t()`, checked the same way. A value is always text: a `<b>` in a visitor's name is shown as written, never read as a tag.
- A tag can wrap placeholders, a plural, or a select, and can sit inside a plural or select form, but a tag opened in a form must close in that form.
- A `<` that doesn't form a tag, as in `1 < 2`, is text.
- A message whose tags don't balance, such as `<b>bold` without `</b>`, or nest more than 10 levels deep, logs a warning once for each text in each locale, unless the manager is silent, and comes back as one part: the text as `t()` shows it, tags included. A missing key and invalid syntax also come back as the one part `t()` would return.
- Tags aren't type-checked, since a translation can use tags the default text doesn't. Render every tag your messages use, and keep a fallback for the rest, as above.
- `t()` and the `data-i18n` binding show tags as written. Render a message with tags from your code with `rich()`.

## Plurals

"1 items" is wrong in English, and other languages have more forms than English does. Arabic has six. To let each language choose, write the key as a group of forms instead of a single string. The shop's cart already does:

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

Three things to watch for:

- **`count` must be a number or bigint.** A string such as `"5"` does not select a form; the group is then treated as a missing key. Convert it where it comes in, such as `Number(params.get("count"))`. The manager doesn't guess, since `"1,5"` is one and a half in Portuguese and not a number at all to JavaScript.
- **A plain string under the same key wins over forms.** If `cart.items` is a string, `count` only fills `{count}`.
- **Without `other`, it is not a plural group.** `{ "one": "…", "two": "…" }` works only for counts whose form happens to be there; any other count shows the key. `has()` says such a group is not a key, and typed keys don't offer it. Add `other`.

### Plurals inside a sentence

A plural group chooses the whole text. To choose only part of a sentence, or to give `0` its own wording, write an ICU plural in a single string. `#` is the number, formatted for the language, and `=N` matches an exact number before the forms are asked:

```json
{
  "cart": {
    "summary": "Hi {name}, {count, plural, =0 {your cart is empty} one {you have # item in your cart} other {you have # items in your cart}}."
  }
}
```

```ts
t("cart.summary", { name: "Ana", count: 0 }); // "Hi Ana, your cart is empty."
t("cart.summary", { name: "Ana", count: 1200 }); // "Hi Ana, you have 1,200 items in your cart."
```

`=N` compares numbers, not text, so `=1`, `=1.0`, and `=01` all match 1. That also makes two of them in one message the same option twice: `{n, plural, =1 {…} =1.0 {…} other {…}}` is invalid syntax. Write each number once.

`offset:N` subtracts from the number before choosing a form and filling `#`, but not before matching `=N`. A product page can use it to say who else bought a tea:

```json
{
  "product": {
    "buyers": "{count, plural, offset:1 =0 {Nobody} =1 {{name}} one {{name} and # other} other {{name} and # others}}"
  }
}
```

With a `count` of 2, `t("product.buyers", { name: "Ana", count: 2 })` shows `Ana and 1 other`.

Both ways of writing plurals are supported. Plural groups keep each form an ordinary key, which some translation tools handle better.

## Typed keys

When TypeScript can see your dictionary's type, `t()` only accepts keys that exist:

```ts
t("cart.items", { count: 2 }); // ok: a plural group
t("cart.items.one"); // ok: a single form is a key too
t("cart"); // compile error: a group of text is not a key
t("cart.itmes", { count: 2 }); // compile error: misspelled
```

The type comes from what your loader returns. If it returns several `as const` dictionaries, a key from any of them is accepted. If it returns `any` or `unknown`, as `response.json()` and dynamic imports do, every string is accepted; give the loader a return type, as in the JSON example above, to get checking back.

A key you build at runtime, such as ``t(`errors.${code}`)`` for an error code from the checkout, fails to compile even when it exists, because TypeScript can't know the value of `code`. Check it with `has()`, which narrows it to a key `t()` accepts, and pick a fallback when it isn't there:

```ts
const key = `errors.${code}`;
const message = i18n.has(key) ? i18n.t(key) : i18n.t("errors.unknown");
```

`has()` looks through the same dictionaries `t()` does:

- A plural group counts as a key when it has an `other` form, whatever language is active. `t()` reads a group only with a numeric `count`, so when the key may be one, pass it, as in `i18n.t(key, { count })`; without it, `t()` misses and calls `onMissingKey`.
- A miss neither calls `onMissingKey` nor warns, since a key you expect to be missing sometimes is not a gap in the translations.
- A string no dictionary can hold, such as one with a line break or longer than 1,000 characters once trimmed, is a miss too, so `code` can come from a response or a query string.

When you know the keys are there, cast it instead:

```ts
import type { TranslationKey } from "@codenhub/i18n";
import type en from "./locales/en.json";

type Key = TranslationKey<typeof en>;

t(`errors.${code}` as Key);
```

`TranslationKey` is also useful for typing a component prop or helper that takes a key.

### Typed values

When the default dictionary is an `as const` object in a `.ts` file, TypeScript sees each message's text, and `t()` also checks its values:

```ts
// locales/en.ts
export default {
  home: { greeting: "Hello, {name}!" },
  cart: {
    total: "Total: {amount, number}",
    items: { one: "{count} item", other: "{count} items" },
  },
} as const;
```

```ts
t("home.greeting", { name: "Ana" }); // ok
t("home.greeting"); // compile error: name is required
t("cart.total", { amount: "3" }); // compile error: {amount, number} needs a number
t("cart.items", { count: 2 }); // ok: a plural group requires a numeric count
```

Which values each argument takes:

- `number`, `plural`, and `selectordinal` arguments take a number or bigint.
- `date` and `time` take a `Date` or a timestamp.
- `select` takes a string, number, or bigint.
- A plain `{name}` takes any of these.

Extra values are allowed. When several dictionaries are typed, a key needs the values of every one that has it.

A JSON import types every text as `string`, since TypeScript doesn't keep JSON string values, so a JSON dictionary checks keys but accepts any values, except that a plural group still needs a number `count`. To check values, write the default language as `as const` TypeScript and keep the other languages in JSON, typed as the default:

```ts
import en from "./locales/en";

const loadLocale = async (locale: Locale): Promise<typeof en> => (locale === "en" ? en : (await import(`./locales/${locale}.json`)).default);
```

The loader's return type is what types `t()`, so a translation must use the same arguments as the default text; the compiler can't check the JSON files.

### When values aren't checked

Reading a message's arguments happens entirely in the type system, which is clever right up until it can't see the message. In these cases `t()` accepts any values, or none, for that key. Nothing fails to compile; the check is just off:

- **The key is one of several.** In `t(hasFailed ? "checkout.failed" : "checkout.done")`, TypeScript sees a union of two keys and can't know which message's values apply. Call `t()` with each key in its own branch, `hasFailed ? t("checkout.failed", { orderId }) : t("checkout.done")`, and each call is checked.
- **The message is a plain `string`**, as every text in a JSON dictionary is. A plural group still needs a number `count`, since its shape says so. Write the default language as `as const` TypeScript, as above.
- **The message has invalid syntax**, such as an unclosed `{`, a placeholder name that isn't ASCII letters, digits, and `_` (`{first-name}`), `{n, number, currency}`, or a `select` or `plural` without `other`. Some invalid syntax, such as an option written twice, an unknown plural form, or nesting past 10 levels, may still ask for values. Either way, the runtime can't read it either: it logs a warning and shows the text with only valid `{name}` placeholders filled. Fix the message; the [message check](#find-untranslated-keys) finds these.
- **The message is too long for the types to read**: about 900 apostrophes, 450 arguments, or 900 spaces inside one argument's braces, in one text. TypeScript has a limit on how deep a type can go, and the reading stops short of it instead of failing your build. At runtime the message works normally. If you have one of these, it is probably three messages in a trench coat; splitting it brings the checks back.
- **The manager's type is written by hand without the dictionary.** `I18n<"en" | "pt", Key>` checks keys but not values. Pass the dictionary type as a third type argument, `I18n<"en" | "pt", Key, typeof en>`, to keep them checked.

### Write the types yourself

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

A key missing from one language quietly shows default-language text, which is easy to miss. The shop's Portuguese visitors will spot it long before your dashboard does. Catch it in a test instead, by comparing every dictionary with the default one. `loadLocale()` returns a dictionary without changing the manager's language:

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

Dictionaries come from files and servers, and now and then a file or server sends something that isn't a dictionary at all: a truncated download, a misconfigured proxy, or something built on purpose to be huge. So the manager caps how large one can be, which stops a corrupted or hostile file from freezing the page. The defaults fit any real app, a tea shop with a very long menu included:

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

A few rules for the values:

- Each limit must be a positive whole number, and a name that isn't one of the five throws a `TypeError` when the manager is created.
- A nested dictionary counts each group as a property, so raising `maxTranslations` often means raising `maxProperties` too.
- Raising `maxDepth` past 499 does nothing. Each level adds at least a letter and a dot to the full key, so a text that deep would break the fixed 1,000-character key limit first.

## Next

With your dictionaries written, put them in front of someone. In a browser, continue with [Translate a browser app](browser.md), where the shop gets its language picker. On a server or in a static build, skip to [Render on a server or at build time](server-rendering.md).
