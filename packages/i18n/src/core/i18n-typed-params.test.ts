// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import { createI18n, type I18n, type RichText } from "../index";
import type { TranslateParams } from "./message-params";

const en = {
  plain: "Hello",
  greeting: "Hello, {name}!",
  spaced: "Hello, { name }!",
  unicodeSpaced: "Hello, {\u00a0name\u3000}!",
  total: "Total: {amount, number}",
  shipped: "Shipped {when, date, long} at {when, time, short}",
  inbox: "{count, plural, =0 {No messages} one {# message from {sender}} other {# messages}}",
  place: "{n, selectordinal, one {#st} other {#th}}",
  replied: "{gender, select, female {She} other {They}} replied",
  quoted: "Type '{name}' to insert",
  apostrophe: "Don't wait, {name}",
  broken: "Hello {name",
  cart: { items: { one: "{count} item", other: "{count} items in {place}" } },
  items: { one: "One item", other: "{count} items" },
  files: { one: "One file", other: "{count} files in {folder}" },
  choices: { one: "One", other: "Many" },
  welcome: "Welcome",
} as const;
const pt = { greeting: "Olá, {nome}!", welcome: "Bem-vindo, {name}" } as const;
type Messages = typeof en | typeof pt;

type Params<K extends string> = TranslateParams<Messages, K>;
type Values<K extends string> = NonNullable<Params<K>[0]>;
type Value<K extends string, P extends keyof Values<K>> = Values<K>[P];
// What an untyped manager takes: optional values of any name.
type Loose = TranslateParams<unknown, string>;

describe("typed placeholder values", () => {
  it("should leave values optional for a message without arguments", () => {
    expectTypeOf<Params<"plain">>().toEqualTypeOf<Loose>();
    expectTypeOf<Params<"quoted">>().toEqualTypeOf<Params<"plain">>();
  });

  it("should require each argument with the type its format needs", () => {
    expectTypeOf<Params<"total">["length"]>().toEqualTypeOf<1>();
    expectTypeOf<Value<"spaced", "name">>().toEqualTypeOf<string | number | bigint | Date>();
    expectTypeOf<Params<"unicodeSpaced">["length"]>().toEqualTypeOf<1>();
    expectTypeOf<Value<"unicodeSpaced", "name">>().toEqualTypeOf<string | number | bigint | Date>();
    expectTypeOf<Value<"total", "amount">>().toEqualTypeOf<number | bigint>();
    expectTypeOf<Value<"shipped", "when">>().toEqualTypeOf<Date | number>();
    expectTypeOf<Value<"inbox", "count">>().toEqualTypeOf<number | bigint>();
    expectTypeOf<Value<"inbox", "sender">>().toEqualTypeOf<string | number | bigint | Date>();
    expectTypeOf<Value<"place", "n">>().toEqualTypeOf<number | bigint>();
    expectTypeOf<Value<"replied", "gender">>().toEqualTypeOf<string | number | bigint>();
    expectTypeOf<Value<"apostrophe", "name">>().toEqualTypeOf<string | number | bigint | Date>();
    expectTypeOf<{ count: 1; sender: "Ana" }>().toExtend<Values<"inbox">>();
    expectTypeOf<{ count: 1 }>().not.toExtend<Values<"inbox">>();
  });

  it("should combine the arguments of every dictionary that has the key", () => {
    expectTypeOf<{ name: "Ana"; nome: "Ana" }>().toExtend<Values<"greeting">>();
    expectTypeOf<{ name: "Ana" }>().not.toExtend<Values<"greeting">>();
  });

  it("should require count and every form's arguments for a plural group", () => {
    expectTypeOf<{ count: 1; place: "cart" }>().toExtend<Values<"cart.items">>();
    expectTypeOf<{ place: "cart" }>().not.toExtend<Values<"cart.items">>();
    expectTypeOf<{ count: 1 }>().not.toExtend<Values<"cart.items">>();
    expectTypeOf<Value<"cart.items", "count">>().toEqualTypeOf<number | bigint>();
  });

  it("should still check a key when one of its forms or dictionaries has no arguments", () => {
    expectTypeOf<Params<"items">["length"]>().toEqualTypeOf<1>();
    expectTypeOf<{ count: 1 }>().toExtend<Values<"items">>();
    expectTypeOf<{ count: 1; folder: "docs" }>().toExtend<Values<"files">>();
    expectTypeOf<{ count: 1 }>().not.toExtend<Values<"files">>();
    expectTypeOf<{ count: 1 }>().toExtend<Values<"choices">>();
    expectTypeOf<{}>().not.toExtend<Values<"choices">>();
    expectTypeOf<{ name: "Ana" }>().toExtend<Values<"welcome">>();
    expectTypeOf<{}>().not.toExtend<Values<"welcome">>();
  });

  it("should require a numeric count for a plural group whose forms it can't read, as from JSON", () => {
    type Json = {
      readonly cart: { readonly items: { readonly one: string; readonly other: string }; readonly title: string };
    };
    type JsonValues = NonNullable<TranslateParams<Json, "cart.items">[0]>;
    expectTypeOf<TranslateParams<Json, "cart.items">["length"]>().toEqualTypeOf<1>();
    expectTypeOf<{ count: 3 }>().toExtend<JsonValues>();
    expectTypeOf<{ count: 3n }>().toExtend<JsonValues>();
    expectTypeOf<{ count: 3; anything: "else" }>().toExtend<JsonValues>();
    expectTypeOf<{}>().not.toExtend<JsonValues>();
    expectTypeOf<{ count: "3" }>().not.toExtend<JsonValues>();
    expectTypeOf<TranslateParams<Json, "cart.title">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<Json, "cart.items.one">>().toEqualTypeOf<Loose>();
    // A key that is a text in one dictionary and a group in another needs `count` too, which never changes the text.
    type Mixed = Json | { readonly cart: { readonly items: string } };
    expectTypeOf<{}>().not.toExtend<NonNullable<TranslateParams<Mixed, "cart.items">[0]>>();
  });

  it("should accept any values for a message it can't read, a key union, or untyped dictionaries", () => {
    expectTypeOf<Params<"broken">>().toEqualTypeOf<Loose>();
    expectTypeOf<Params<"plain" | "greeting">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<{ readonly greeting: string }, "greeting">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<unknown, "greeting">>().toEqualTypeOf<Loose>();
  });

  it("should check the message of a key a Partial dictionary type makes optional", () => {
    type Full = {
      readonly hello: "Hello {name}";
      readonly group: { readonly one: "{count} item"; readonly other: "{count} items" };
    };
    type Regional =
      | Full
      | Partial<Full>
      | { readonly group?: Partial<Full["group"]> & { readonly other: "{count} itens" } };
    expectTypeOf<TranslateParams<Regional, "hello">["length"]>().toEqualTypeOf<1>();
    expectTypeOf<{}>().not.toExtend<NonNullable<TranslateParams<Regional, "hello">[0]>>();
    expectTypeOf<{}>().not.toExtend<NonNullable<TranslateParams<Regional, "group">[0]>>();
    expectTypeOf<{ count: 1 }>().toExtend<NonNullable<TranslateParams<Regional, "group">[0]>>();
  });

  it("should take extra values when the key's type is passed", async () => {
    const typed = createI18n({
      locales: ["en"] as const,
      defaultLocale: "en",
      loadLocale: () => ({ greeting: "Hello, {name}!" }) as const,
      isSilent: true,
    });
    await typed.init();

    expect(typed.t<"greeting">("greeting", { name: "Ana", title: "Dr." })).toBe("Hello, Ana!");
    expect(typed.translate<"greeting">("greeting", { name: "Ana", title: "Dr." })).toBe("Hello, Ana!");
    // @ts-expect-error -- `name` is required.
    typed.t<"greeting">("greeting", { title: "Dr." });
  });

  it("should check rich() values as t() checks them", async () => {
    const typed = createI18n({
      locales: ["en"] as const,
      defaultLocale: "en",
      loadLocale: () => ({ reply: "<b>{name}</b> replied", total: "<b>{amount, number}</b>" }) as const,
      isSilent: true,
    });
    await typed.init();

    expect(typed.rich("reply", { name: "Ana" })).toEqual([{ tag: "b", children: ["Ana"] }, " replied"]);
    expectTypeOf(typed.rich("total", { amount: 3n })).toEqualTypeOf<RichText>();
    // @ts-expect-error -- `name` is required.
    typed.rich("reply");
    // @ts-expect-error -- {amount, number} needs a number.
    typed.rich("total", { amount: "3" });
  });

  it("should take values typed by an interface, and still check each value", async () => {
    interface User {
      name: string;
      id: number;
    }
    const user: User = { name: "Ana", id: 7 };
    const typed = createI18n({
      locales: ["en"] as const,
      defaultLocale: "en",
      loadLocale: () => ({ greeting: "Hello, {name}!", plain: "Hi" }) as const,
      isSilent: true,
    });
    const untyped = createI18n({
      locales: ["en"] as const,
      defaultLocale: "en",
      loadLocale: (): Record<string, unknown> => ({ greeting: "Hello, {name}!" }),
      isSilent: true,
    });
    await typed.init();
    await untyped.init();

    expect(typed.t("greeting", user)).toBe("Hello, Ana!");
    expect(typed.t("plain", user)).toBe("Hi");
    expect(untyped.t("greeting", user)).toBe("Hello, Ana!");
    // @ts-expect-error -- `name` is required.
    typed.t("greeting", { id: 7 });
  });

  it("should check only the values a message uses, and take any other value", async () => {
    interface User {
      name: string;
      isAdmin: boolean;
      lastSeen: Date | undefined;
      roles: readonly string[];
    }
    const user: User = { name: "Ana", isAdmin: true, lastSeen: undefined, roles: ["editor"] };
    const typed = createI18n({
      locales: ["en"] as const,
      defaultLocale: "en",
      loadLocale: () =>
        ({
          greeting: "Hello, {name}!",
          total: "Total: {amount, number}",
          plain: "Hi",
          items: { one: "One item", other: "{count} items" },
        }) as const,
      isSilent: true,
    });
    const untyped = createI18n({
      locales: ["en"] as const,
      defaultLocale: "en",
      loadLocale: (): Record<string, unknown> => ({ greeting: "Hello, {name}!" }),
      isSilent: true,
    });
    const json = createI18n({
      locales: ["en"] as const,
      defaultLocale: "en",
      loadLocale: () =>
        ({ items: { one: "One item", other: "{count} items" } }) as { items: { one: string; other: string } },
      isSilent: true,
    });
    await Promise.all([typed.init(), untyped.init(), json.init()]);

    // An interface with fields the message doesn't use, on every kind of message.
    expect(typed.t("greeting", user)).toBe("Hello, Ana!");
    expect(typed.rich("greeting", user)).toEqual(["Hello, Ana!"]);
    expect(typed.t("plain", user)).toBe("Hi");
    expect(typed.t<"greeting">("greeting", user)).toBe("Hello, Ana!");
    expect(untyped.t("greeting", user)).toBe("Hello, Ana!");
    expect(json.t("items", { ...user, count: 2 })).toBe("2 items");
    // A literal with extra fields of any type.
    expect(typed.t("greeting", { name: "Ana", isAdmin: true, onClick: () => undefined, extra: null })).toBe(
      "Hello, Ana!",
    );
    expect(typed.t("items", { count: 1, isAdmin: false })).toBe("One item");
    expect(typed.t("total", { amount: 3, isAdmin: true })).toBe("Total: 3");
    expect(typed.t("plain", { isAdmin: true })).toBe("Hi");
    // A message the types can't read uses no value they know of, so none is checked; the runtime leaves `{name}`.
    expect(untyped.t("greeting", { name: true })).toBe("Hello, {name}!");

    // A missing used value is still an error.
    // @ts-expect-error -- `name` is required.
    typed.t("greeting", { isAdmin: true });
    // @ts-expect-error -- `amount` is required.
    typed.t("total", { name: "Ana", isAdmin: true });
    // @ts-expect-error -- `count` is required.
    typed.t("items", { isAdmin: true });
    // @ts-expect-error -- `count` is required.
    json.t("items", user);
    // A wrongly typed used value is still an error.
    // @ts-expect-error -- a boolean is no message value.
    typed.t("greeting", { name: true, isAdmin: true });
    // @ts-expect-error -- {amount, number} needs a number.
    typed.t("total", { amount: "3", isAdmin: true });
    // @ts-expect-error -- `count` must be a number.
    typed.t("items", { count: "1", isAdmin: true });
    interface Account {
      name: boolean;
    }
    const account: Account = { name: true };
    // @ts-expect-error -- an interface's used field is checked too.
    typed.t("greeting", account);
    // Values are still an object.
    // @ts-expect-error -- a string is no values object.
    expect(() => untyped.t("greeting", "Ana")).toThrow(TypeError);
  });

  it("should not require an argument the runtime prints as quoted text", () => {
    // `''` inside quoted text is an apostrophe, so the quote still ends at the last `'`.
    expectTypeOf<TranslateParams<{ readonly m: "'{it''s {x}'" }, "m">>().toEqualTypeOf<Loose>();
    expectTypeOf<{ x: 1 }>().toExtend<NonNullable<TranslateParams<{ readonly m: "'{it''s}' {x}" }, "m">[0]>>();
    expectTypeOf<{}>().not.toExtend<NonNullable<TranslateParams<{ readonly m: "'{it''s}' {x}" }, "m">[0]>>();
  });

  it("should accept any values for a name outside ASCII, and read a select key outside ASCII", () => {
    expectTypeOf<TranslateParams<{ readonly m: "Hola, {año}" }, "m">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<{ readonly m: "{a€}" }, "m">>().toEqualTypeOf<Loose>();
    type Select = NonNullable<
      TranslateParams<{ readonly m: "{g, select, niño {él} niña {ella} other {elle}}" }, "m">[0]
    >;
    expectTypeOf<{ g: "niño" }>().toExtend<Select>();
    expectTypeOf<{}>().not.toExtend<Select>();
  });

  it("should require an argument after an apostrophe before <, which quotes nothing", () => {
    type ParamsOf<M extends string> = NonNullable<TranslateParams<{ readonly m: M }, "m">[0]>;
    expectTypeOf<{ name: "Ana" }>().toExtend<ParamsOf<"l'<b>{name}</b>">>();
    expectTypeOf<{}>().not.toExtend<ParamsOf<"l'<b>{name}</b>">>();
    expectTypeOf<{}>().not.toExtend<ParamsOf<"'<b>{name}</b>'">>();
    // A tag in a run quoted by `'{` is text, and so is an argument there.
    expectTypeOf<{ x: 1 }>().toExtend<ParamsOf<"'{<b>{name}</b>}' {x}">>();
    expectTypeOf<{}>().not.toExtend<ParamsOf<"'{<b>{name}</b>}' {x}">>();
  });

  it("should not require an argument the runtime prints as text quoted by an apostrophe before #", () => {
    expectTypeOf<TranslateParams<{ readonly m: "{n, plural, other {'# {name}' ok}}" }, "m">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<{ readonly m: "{n, plural, other {'# {name}}}" }, "m">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<{ readonly m: "{n, plural, other {'# it''s {x}'}}" }, "m">>().toEqualTypeOf<Loose>();
    // Without a brace in the quoted run, the message reads as usual.
    expectTypeOf<{}>().not.toExtend<
      NonNullable<TranslateParams<{ readonly m: "{n, plural, other {'#' {x}}}" }, "m">[0]>
    >();
  });

  it("should require the values of a plural whose first option, after an offset, is other", () => {
    type ParamsOf<M extends string> = NonNullable<TranslateParams<{ readonly m: M }, "m">[0]>;
    expectTypeOf<{ n: 1; name: "Ana" }>().toExtend<ParamsOf<"{n, plural, offset:1 other {# {name}}}">>();
    expectTypeOf<{ n: 1 }>().not.toExtend<ParamsOf<"{n, plural, offset:1 other {# {name}}}">>();
    expectTypeOf<{ n: 1 }>().not.toExtend<ParamsOf<"{n, plural, offset: 12 other {# {name}}}">>();
  });

  it("should accept any values for a message the runtime refuses, which it prints as written", () => {
    type ParamsOf<M extends string> = TranslateParams<{ readonly m: M }, "m">;
    expectTypeOf<ParamsOf<"{n, number, currency}">>().toEqualTypeOf<Loose>();
    expectTypeOf<ParamsOf<"{d, date, bogus}">>().toEqualTypeOf<Loose>();
    expectTypeOf<ParamsOf<"{d, time, integer}">>().toEqualTypeOf<Loose>();
    expectTypeOf<ParamsOf<"{n, plural}">>().toEqualTypeOf<Loose>();
    expectTypeOf<ParamsOf<"{g, select}">>().toEqualTypeOf<Loose>();
    expectTypeOf<ParamsOf<"{n, plural, one {#}}">>().toEqualTypeOf<Loose>();
    expectTypeOf<ParamsOf<"{g, select, female {She}}">>().toEqualTypeOf<Loose>();
    expectTypeOf<ParamsOf<"{n, plural, other {{g, select, a {x}}}}">>().toEqualTypeOf<Loose>();
    // Valid styles and forms still require their values.
    expectTypeOf<ParamsOf<"{n, number, percent}">["length"]>().toEqualTypeOf<1>();
    expectTypeOf<ParamsOf<"{d, date, full} {t, time, medium}">["length"]>().toEqualTypeOf<1>();
    expectTypeOf<ParamsOf<"{n, plural, one {#} other {# {x}}}">["length"]>().toEqualTypeOf<1>();
  });

  it("should accept any values for an argument name the runtime can't read", () => {
    expectTypeOf<TranslateParams<{ readonly m: "{first-name}" }, "m">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<{ readonly m: "{nome_ç}" }, "m">>().toEqualTypeOf<Loose>();
    expectTypeOf<Value<"spaced", "name">>().toEqualTypeOf<string | number | bigint | Date>();
    expectTypeOf<TranslateParams<{ readonly m: "{Name_2}" }, "m">["length"]>().toEqualTypeOf<1>();
  });

  it("should accept any values for a message too long to read, without failing to compile", () => {
    type Apostrophes10 = "l'a l'a l'a l'a l'a l'a l'a l'a l'a l'a ";
    type Apostrophes100 =
      `${Apostrophes10}${Apostrophes10}${Apostrophes10}${Apostrophes10}${Apostrophes10}${Apostrophes10}${Apostrophes10}${Apostrophes10}${Apostrophes10}${Apostrophes10}`;
    type Apostrophes1100 =
      `${Apostrophes100}${Apostrophes100}${Apostrophes100}${Apostrophes100}${Apostrophes100}${Apostrophes100}${Apostrophes100}${Apostrophes100}${Apostrophes100}${Apostrophes100}${Apostrophes100}{name}`;
    type Arguments10 = "{a} {b} {c} {d} {e} {f} {g} {h} {i} {j} ";
    type Arguments100 =
      `${Arguments10}${Arguments10}${Arguments10}${Arguments10}${Arguments10}${Arguments10}${Arguments10}${Arguments10}${Arguments10}${Arguments10}`;
    type Arguments600 = `${Arguments100}${Arguments100}${Arguments100}${Arguments100}${Arguments100}${Arguments100}`;
    type Long = { readonly apostrophes: Apostrophes1100; readonly arguments: Arguments600 };

    expectTypeOf<TranslateParams<Long, "apostrophes">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<Long, "arguments">>().toEqualTypeOf<Loose>();
    // Within the budget, a long message is still read.
    type Arguments300 = `${Arguments100}${Arguments100}${Arguments100}`;
    expectTypeOf<{}>().not.toExtend<NonNullable<TranslateParams<{ readonly m: Arguments300 }, "m">[0]>>();
  });

  it("should accept any values for an argument with too many spaces to read, without failing to compile", () => {
    type Spaces10 = "          ";
    type Spaces100 =
      `${Spaces10}${Spaces10}${Spaces10}${Spaces10}${Spaces10}${Spaces10}${Spaces10}${Spaces10}${Spaces10}${Spaces10}`;
    type Spaces1100 =
      `${Spaces100}${Spaces100}${Spaces100}${Spaces100}${Spaces100}${Spaces100}${Spaces100}${Spaces100}${Spaces100}${Spaces100}${Spaces100}`;
    type Spaced = {
      readonly before: `{${Spaces1100}x}`;
      readonly after: `{x${Spaces1100}}`;
      readonly typed: `{x, ${Spaces1100}number}`;
      readonly near: `{${Spaces100}x${Spaces100}}`;
    };

    expectTypeOf<TranslateParams<Spaced, "before">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<Spaced, "after">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<Spaced, "typed">>().toEqualTypeOf<Loose>();
    // Within the budget, the spaces are trimmed and the argument is still required.
    expectTypeOf<{}>().not.toExtend<NonNullable<TranslateParams<Spaced, "near">[0]>>();
  });

  it("should check t() calls on a manager", async () => {
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en"] as const,
      loadLocale: () => en,
      isSilent: true,
    });
    await i18n.init();

    expect(i18n.t("total", { amount: 3 })).toBe("Total: 3");
    expect(i18n.t("cart.items", { count: 2, place: "cart" })).toBe("2 items in cart");
    expect(i18n.t("plain")).toBe("Hello");
    // @ts-expect-error -- amount must be a number for {amount, number}
    i18n.t("total", { amount: "3" });
    // @ts-expect-error -- name is required
    i18n.t("greeting");
    // Extra values are allowed, such as one only another language uses.
    i18n.t("greeting", { name: "Ana", title: "Dr." });

    const loose: I18n<"en"> = i18n;
    expect(loose.t("greeting")).toBe("Hello, {name}!");
  });
});
