// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import { createI18n, type I18n } from "../index";
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
} as const;
const pt = { greeting: "Olá, {nome}!" } as const;
type Messages = typeof en | typeof pt;

type Params<K extends string> = TranslateParams<Messages, K>;
type Values<K extends string> = NonNullable<Params<K>[0]>;
type Value<K extends string, P extends string> = Values<K>[P];

describe("typed placeholder values", () => {
  it("should leave values optional for a message without arguments", () => {
    expectTypeOf<Params<"plain">>().toEqualTypeOf<[params?: Readonly<Record<string, string | number | Date>>]>();
    expectTypeOf<Params<"quoted">>().toEqualTypeOf<Params<"plain">>();
  });

  it("should require each argument with the type its format needs", () => {
    expectTypeOf<Params<"total">["length"]>().toEqualTypeOf<1>();
    expectTypeOf<Value<"spaced", "name">>().toEqualTypeOf<string | number | Date>();
    expectTypeOf<Params<"unicodeSpaced">["length"]>().toEqualTypeOf<1>();
    expectTypeOf<Value<"unicodeSpaced", "name">>().toEqualTypeOf<string | number | Date>();
    expectTypeOf<Value<"total", "amount">>().toEqualTypeOf<number>();
    expectTypeOf<Value<"shipped", "when">>().toEqualTypeOf<Date | number>();
    expectTypeOf<Value<"inbox", "count">>().toEqualTypeOf<number>();
    expectTypeOf<Value<"inbox", "sender">>().toEqualTypeOf<string | number | Date>();
    expectTypeOf<Value<"place", "n">>().toEqualTypeOf<number>();
    expectTypeOf<Value<"replied", "gender">>().toEqualTypeOf<string | number>();
    expectTypeOf<Value<"apostrophe", "name">>().toEqualTypeOf<string | number | Date>();
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
    expectTypeOf<Value<"cart.items", "count">>().toEqualTypeOf<number>();
  });

  it("should accept any values for a message it can't read, a key union, or untyped dictionaries", () => {
    type Loose = [params?: Readonly<Record<string, string | number | Date>>];
    expectTypeOf<Params<"broken">>().toEqualTypeOf<Loose>();
    expectTypeOf<Params<"plain" | "greeting">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<{ readonly greeting: string }, "greeting">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<unknown, "greeting">>().toEqualTypeOf<Loose>();
  });

  it("should not require an argument the runtime prints as quoted text", () => {
    type Loose = [params?: Readonly<Record<string, string | number | Date>>];
    // `''` inside quoted text is an apostrophe, so the quote still ends at the last `'`.
    expectTypeOf<TranslateParams<{ readonly m: "'{it''s {x}'" }, "m">>().toEqualTypeOf<Loose>();
    expectTypeOf<{ x: 1 }>().toExtend<NonNullable<TranslateParams<{ readonly m: "'{it''s}' {x}" }, "m">[0]>>();
    expectTypeOf<{}>().not.toExtend<NonNullable<TranslateParams<{ readonly m: "'{it''s}' {x}" }, "m">[0]>>();
  });

  it("should accept any values for an argument name the runtime can't read", () => {
    type Loose = [params?: Readonly<Record<string, string | number | Date>>];
    expectTypeOf<TranslateParams<{ readonly m: "{first-name}" }, "m">>().toEqualTypeOf<Loose>();
    expectTypeOf<TranslateParams<{ readonly m: "{nome_ç}" }, "m">>().toEqualTypeOf<Loose>();
    expectTypeOf<Value<"spaced", "name">>().toEqualTypeOf<string | number | Date>();
    expectTypeOf<TranslateParams<{ readonly m: "{Name_2}" }, "m">["length"]>().toEqualTypeOf<1>();
  });

  it("should accept any values for a message too long to read, without failing to compile", () => {
    type Loose = [params?: Readonly<Record<string, string | number | Date>>];
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
    type Loose = [params?: Readonly<Record<string, string | number | Date>>];
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
