// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createI18n } from "../index";
import { getI18nInternals } from "./internals";
import { MessageSyntaxError, parseMessage } from "./message-format";

const messages = {
  hello: "Hello, {name}!",
  plain: "Just text",
  price: "Costs {amount, number}",
  whole: "{amount, number, integer} units",
  share: "{ratio, number, percent} done",
  day: "On {when, date}",
  dayShort: "On {when, date, short}",
  at: "At {when, time, short}",
  items: "{count, plural, =0 {No items} one {# item} other {# items}}",
  others: "{count, plural, offset:1 =0 {Nobody} =1 {{name}} one {{name} and # other} other {{name} and # others}}",
  place: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
  greet: "{gender, select, female {She} male {He} other {They}} replied",
  nested: "{count, plural, one {{gender, select, female {her item} other {their item}}} other {# items}}",
  dont: "Don't touch {thing}",
  quoted: "Write '{name}' literally",
  apostrophe: "It''s {name}",
  pound: "# is literal here",
  quotedPound: "{count, plural, other {'#' {count}}}",
  broken: "Hello {name",
  legacyBraces: "{a} and {b}",
};

const create = (options: { isSilent?: boolean; pt?: Record<string, unknown> } = {}) =>
  createI18n({
    defaultLocale: "en",
    locales: ["en", "pt"],
    loadLocale: (locale) => (locale === "pt" ? (options.pt ?? {}) : messages),
    isSilent: options.isSilent ?? true,
  });

describe("ICU messages", () => {
  it("should fill simple arguments and leave missing ones as written", async () => {
    const i18n = create();
    await i18n.init();

    expect(i18n.t("hello", { name: "Ana" })).toBe("Hello, Ana!");
    expect(i18n.t("hello")).toBe("Hello, {name}!");
    expect(i18n.t("legacyBraces", { a: 1 })).toBe("1 and {b}");
    expect(i18n.t("plain")).toBe("Just text");
  });

  it("should format numbers in the dictionary's locale", async () => {
    const i18n = create({ pt: { price: "Custa {amount, number}" } });
    await i18n.init();

    expect(i18n.t("price", { amount: 1234.5 })).toBe("Costs 1,234.5");
    expect(i18n.t("whole", { amount: 3.7 })).toBe("4 units");
    expect(i18n.t("share", { ratio: 0.25 })).toBe("25% done");
    expect(i18n.t("price", { amount: "many" })).toBe("Costs {amount, number}");

    await i18n.setLocale("pt");
    expect(i18n.t("price", { amount: 1234.5 })).toBe("Custa 1.234,5");
    // Falls back to English text, so English number formatting.
    expect(i18n.t("whole", { amount: 1234 })).toBe("1,234 units");
  });

  it("should format dates and times as Intl does", async () => {
    const i18n = create();
    await i18n.init();
    const when = new Date(2026, 10, 2, 15, 30);

    expect(i18n.t("day", { when })).toBe(`On ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(when)}`);
    expect(i18n.t("dayShort", { when: when.getTime() })).toBe(
      `On ${new Intl.DateTimeFormat("en", { dateStyle: "short" }).format(when)}`,
    );
    expect(i18n.t("at", { when })).toBe(`At ${new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(when)}`);
    expect(i18n.t("hello", { name: when })).toBe(
      `Hello, ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(when)}!`,
    );
  });

  it("should choose plural options by exact value, then category", async () => {
    const i18n = create();
    await i18n.init();

    expect(i18n.t("items", { count: 0 })).toBe("No items");
    expect(i18n.t("items", { count: 1 })).toBe("1 item");
    expect(i18n.t("items", { count: 1000 })).toBe("1,000 items");
    expect(i18n.t("items")).toBe("{count, plural, =0 {No items} one {# item} other {# items}}");
  });

  it("should use other and root formatting for a locale Intl rejects", async () => {
    const i18n = createI18n({
      defaultLocale: "x-test",
      locales: ["x-test"],
      loadLocale: () => ({ items: "{count, plural, one {one} other {# many}}" }),
      isSilent: true,
    });
    await i18n.init();

    expect(i18n.t("items", { count: 1 })).toBe("1 many");
    expect(i18n.formatNumber(1)).toBe(new Intl.NumberFormat("und").format(1));
  });

  it("should apply a plural offset to # and the category but not to exact values", async () => {
    const i18n = create();
    await i18n.init();

    expect(i18n.t("others", { count: 0, name: "Ana" })).toBe("Nobody");
    expect(i18n.t("others", { count: 1, name: "Ana" })).toBe("Ana");
    expect(i18n.t("others", { count: 2, name: "Ana" })).toBe("Ana and 1 other");
    expect(i18n.t("others", { count: 3, name: "Ana" })).toBe("Ana and 2 others");
  });

  it("should format ordinals, selects, and a select nested in a plural", async () => {
    const i18n = create();
    await i18n.init();

    expect([1, 2, 3, 4, 11, 22].map((n) => i18n.t("place", { n }))).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "22nd",
    ]);
    expect(i18n.t("greet", { gender: "female" })).toBe("She replied");
    expect(i18n.t("greet", { gender: "unknown" })).toBe("They replied");
    expect(i18n.t("nested", { count: 1, gender: "female" })).toBe("her item");
    expect(i18n.t("nested", { count: 2, gender: "female" })).toBe("2 items");
  });

  it("should treat apostrophes as ICU does", async () => {
    const i18n = create();
    await i18n.init();

    expect(i18n.t("dont", { thing: "this" })).toBe("Don't touch this");
    expect(i18n.t("quoted", { name: "Ana" })).toBe("Write {name} literally");
    expect(i18n.t("apostrophe", { name: "Ana" })).toBe("It's Ana");
    expect(i18n.t("pound")).toBe("# is literal here");
    expect(i18n.t("quotedPound", { count: 2 })).toBe("# 2");
  });

  it("should warn once for a malformed message and fill its simple placeholders", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const i18n = create({ isSilent: false });
      await i18n.init();

      expect(i18n.t("broken", { name: "Ana" })).toBe("Hello {name");
      expect(i18n.t("broken", { name: "Ana" })).toBe("Hello {name");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain(`"broken" in locale "en"`);
    } finally {
      warn.mockRestore();
    }
  });

  it("should not warn for a malformed message when silent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const i18n = create({ isSilent: true });
      await i18n.init();

      i18n.t("broken");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("should format the text DOM translation reads", async () => {
    const i18n = create();
    await i18n.init();

    expect(getI18nInternals(i18n).lookup("apostrophe")).toBe("It's {name}");
    expect(getI18nInternals(i18n).lookup("items")).toBe("{count, plural, =0 {No items} one {# item} other {# items}}");
  });
});

describe("parseMessage", () => {
  it.each([
    ["{", "an unclosed argument"],
    ["{count, plural, one {#}}", "a plural without other"],
    ["{v, select, a {x} a {y} other {z}}", "a repeated option"],
    ["{n, number, currency}", "an unknown number style"],
    ["{n, spellout}", "an unknown type"],
    ["{n, plural, offset:x other {#}}", "an invalid offset"],
    ["}", "a stray closing brace"],
  ])("should reject %s (%s)", (message) => {
    expect(() => parseMessage(message)).toThrow(MessageSyntaxError);
  });

  it("should reject nesting deeper than 10 levels", () => {
    let message = "x";
    for (let index = 0; index < 11; index += 1) {
      message = `{v, select, other {${message}}}`;
    }
    expect(() => parseMessage(message)).toThrow(MessageSyntaxError);
  });
});

describe("formatters", () => {
  it("should follow the active locale", async () => {
    const i18n = create();
    await i18n.init();
    const when = new Date(2026, 10, 2);

    expect(i18n.formatNumber(1234.5)).toBe("1,234.5");
    expect(i18n.formatNumber(12n)).toBe("12");
    expect(i18n.formatDate(when, { dateStyle: "long" })).toBe("November 2, 2026");
    expect(i18n.formatRelativeTime(-1, "day", { numeric: "auto" })).toBe("yesterday");
    expect(i18n.formatList(["a", "b", "c"])).toBe("a, b, and c");

    await i18n.setLocale("pt");
    expect(i18n.formatNumber(1234.5)).toBe("1.234,5");
    expect(i18n.formatDate(when, { dateStyle: "long" })).toBe("2 de novembro de 2026");
    expect(i18n.formatRelativeTime(-1, "day", { numeric: "auto" })).toBe("ontem");
    expect(i18n.formatList(["a", "b", "c"])).toBe("a, b e c");
  });

  it("should be bound", async () => {
    const i18n = create();
    await i18n.init();
    const { formatNumber, formatList } = i18n;

    expect(formatNumber(1)).toBe("1");
    expect(formatList(["a"])).toBe("a");
  });

  it("should throw as Intl does for invalid options", async () => {
    const i18n = create();
    await i18n.init();

    expect(() => i18n.formatNumber(1, { style: "currency" })).toThrow(TypeError);
    expect(() => i18n.formatNumber(1, { maximumFractionDigits: 200 })).toThrow(RangeError);
    expect(() => i18n.formatDate(Number.NaN)).toThrow(RangeError);
  });
});
