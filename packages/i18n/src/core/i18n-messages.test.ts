// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createI18n } from "../index";
import { getI18nInternals } from "./internals";
import { MessageSyntaxError, parseCachedMessage, parseMessage } from "./message-format";

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

  it("should compare exact plural values as numbers", async () => {
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en"],
      loadLocale: () => ({
        decimal: "{n, plural, =1.0 {exactly one} other {#}}",
        padded: "{n, plural, =01 {exactly one} other {#}}",
        negativeZero: "{n, plural, =-0 {zero} other {#}}",
        half: "{n, plural, =0.50 {half} other {#}}",
      }),
      isSilent: true,
    });
    await i18n.init();

    expect(i18n.t("decimal", { n: 1 })).toBe("exactly one");
    expect(i18n.t("padded", { n: 1 })).toBe("exactly one");
    expect(i18n.t("negativeZero", { n: 0 })).toBe("zero");
    expect(i18n.t("half", { n: 0.5 })).toBe("half");
    expect(i18n.t("decimal", { n: 2 })).toBe("2");
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

  it("should read # as the number only directly inside a plural, as ICU does", async () => {
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en"],
      loadLocale: () => ({
        inSelect: "{n, plural, other {{v, select, other {# x}} #}}",
        quoteInSelect: "{n, plural, other {{v, select, other {'#' x}}}}",
        innerPlural: "{n, plural, other {{v, select, other {{m, plural, other {#}}}}}}",
      }),
      isSilent: true,
    });
    await i18n.init();

    expect(i18n.t("inSelect", { n: 5, v: "a" })).toBe("# x 5");
    expect(i18n.t("quoteInSelect", { n: 5, v: "a" })).toBe("'#' x");
    expect(i18n.t("innerPlural", { n: 5, v: "a", m: 3 })).toBe("3");
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

  it("should format a date in a malformed message as a valid one does", async () => {
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en", "pt"],
      loadLocale: () => ({ since: "Since {when} }", valid: "Since {when}" }),
      timeZone: "America/Sao_Paulo",
      isSilent: true,
    });
    await i18n.init();
    const when = new Date(Date.UTC(2026, 10, 2, 1));

    expect(i18n.t("since", { when })).toBe(`${i18n.t("valid", { when })} }`);
    expect(i18n.t("since", { when })).toBe("Since Nov 1, 2026 }");
    expect(i18n.t("since", { when: new Date(Number.NaN) })).toBe("Since {when} }");
  });

  it("should warn for a stray closing brace whether or not the text has an apostrophe", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const i18n = createI18n({
        defaultLocale: "en",
        locales: ["en"],
        loadLocale: () => ({ stray: "a } b", strayApostrophe: "it's a } b" }),
      });
      await i18n.init();

      expect(i18n.t("stray")).toBe("a } b");
      expect(i18n.t("strayApostrophe")).toBe("it's a } b");
      expect(warn).toHaveBeenCalledTimes(2);
      expect(String(warn.mock.calls[0]?.[0])).toContain(`"stray" in locale "en"`);
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
    ["{n, plural, =1 {x} =1.0 {y} other {z}}", "an exact value repeated in another spelling"],
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

  it("should throw Intl's own error for null options", async () => {
    const i18n = create();
    await i18n.init();
    const intlError = (construct: () => unknown): unknown => {
      try {
        construct();
      } catch (error) {
        return error;
      }
      throw new Error("Intl accepted null options");
    };
    const nullOptions = null as never;

    expect(() => i18n.formatNumber(1, nullOptions)).toThrow(
      intlError(() => new Intl.NumberFormat("en", nullOptions)) as Error,
    );
    expect(() => i18n.formatDate(0, nullOptions)).toThrow(
      intlError(() => new Intl.DateTimeFormat("en", nullOptions)) as Error,
    );
  });

  it("should read formatter options in the order Intl reads them", async () => {
    const i18n = create();
    await i18n.init();
    const recordReads = (use: (options: object) => unknown): string[] => {
      const reads: string[] = [];
      use(new Proxy({}, { get: (_, name) => void reads.push(String(name)) }));
      return reads;
    };

    expect(recordReads((options) => i18n.formatNumber(1, options))).toEqual(
      recordReads((options) => new Intl.NumberFormat("en", options)),
    );
    expect(recordReads((options) => i18n.formatDate(0, options))).toEqual(
      recordReads((options) => new Intl.DateTimeFormat("en", options)),
    );
  });

  it("should not reuse a formatter for a string option that spells out another option", async () => {
    const i18n = create();
    await i18n.init();
    const forged = { hour12: "x\0dateStyle=string:full" } as unknown as Intl.DateTimeFormatOptions;
    const full: Intl.DateTimeFormatOptions = { hour12: "x" as never, dateStyle: "full" };

    expect(i18n.formatDate(0, forged)).toBe(new Intl.DateTimeFormat("en", forged).format(0));
    expect(i18n.formatDate(0, full)).toBe(new Intl.DateTimeFormat("en", full).format(0));
  });

  it("should read inherited number options without changing later calls", async () => {
    const i18n = create();
    const other = create();
    await i18n.init();
    await other.init();
    // Intl reads options through the prototype chain, as from a class instance's defaults.
    const percent = Object.create({ style: "percent" }) as Intl.NumberFormatOptions;

    expect(i18n.formatNumber(0.5, percent)).toBe("50%");
    expect(i18n.formatNumber(0.5)).toBe("0.5");
    expect(other.formatNumber(0.25)).toBe("0.25");
  });

  it("should read inherited date options, with or without a configured time zone", async () => {
    const when = new Date(Date.UTC(2026, 10, 2, 12));
    const full = (): Intl.DateTimeFormatOptions => Object.create({ dateStyle: "full" }) as Intl.DateTimeFormatOptions;
    const utc = createI18n({ defaultLocale: "en", locales: ["en"], loadLocale: () => ({}), timeZone: "UTC" });
    const local = create();
    await utc.init();
    await local.init();

    expect(utc.formatDate(when, full())).toBe("Monday, November 2, 2026");
    expect(local.formatDate(when, full())).toBe(new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(when));
    expect(local.formatDate(when)).toBe(new Intl.DateTimeFormat("en").format(when));
  });

  it("should throw for an option Intl rejects even after a similar valid one", async () => {
    const i18n = create();
    await i18n.init();
    // `null` reads as 0, while NaN is out of range; both serialize to JSON as null.
    const zero = { maximumFractionDigits: null } as unknown as Intl.NumberFormatOptions;

    expect(i18n.formatNumber(1.5, zero)).toBe("2");
    expect(() => i18n.formatNumber(1.5, { maximumFractionDigits: Number.NaN })).toThrow(RangeError);
    expect(i18n.formatNumber(1)).toBe("1");
    expect(() => i18n.formatNumber(1, { style: (() => "percent") as never })).toThrow(RangeError);
  });

  it("should ignore a circular property Intl does not read", async () => {
    const i18n = create();
    await i18n.init();
    const options: Intl.NumberFormatOptions & { self?: unknown } = { style: "percent" };
    options.self = options;

    expect(i18n.formatNumber(0.5, options)).toBe("50%");
  });
});

describe("parseCachedMessage", () => {
  it("should keep a message in use while many others are parsed", () => {
    const hot = "{hot} message";
    const parsed = parseCachedMessage(hot);

    for (let index = 0; index < 10_000; index += 1) {
      parseCachedMessage(`{cold${index}}`);
      parseCachedMessage(hot);
    }

    expect(parseCachedMessage(hot)).toBe(parsed);
  });
});
