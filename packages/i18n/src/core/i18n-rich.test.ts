// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { createI18n } from "../index";

const messages = {
  terms: "Read the <link>terms</link>.",
  reply: "<b>{name}</b> replied",
  lines: "Line<br/>next",
  nested: "<b>bold <i>both</i></b> plain",
  items: "{count, plural, one {<b>#</b> item} other {<b>#</b> items}}",
  pair: "<b>{a} and {b}</b>",
  around: "<b>{count, plural, one {one} other {many}}</b>",
  math: "1 < 2 <3, a <b c>, </b/>, <-> and <>",
  open: "<b>open",
  stray: "close</b>",
  crossed: "<b><i>x</b></i>",
  leaky: "<b>{count, plural, other {x</b>}}",
  broken: "Hello <b>{name</b>",
  empty: "<b></b>x{nothing}y",
  quoted: "'{'<b>'}'</b>",
  plain: "No tags here",
  group: { one: "<b>{count}</b> file", other: "<b>{count}</b> files" },
  deep: `${"<a>".repeat(10)}x${"</a>".repeat(10)}`,
  tooDeep: `${"<a>".repeat(11)}x${"</a>".repeat(11)}`,
};

const create = (onMissingKey?: (key: string) => void) =>
  createI18n({ defaultLocale: "en", locales: ["en"], loadLocale: () => messages, onMissingKey });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rich()", () => {
  it("should return text and tags as parts", async () => {
    const i18n = create();
    await i18n.init();

    expect(i18n.rich("terms")).toEqual(["Read the ", { tag: "link", children: ["terms"] }, "."]);
    expect(i18n.rich("lines")).toEqual(["Line", { tag: "br", children: [] }, "next"]);
    expect(i18n.rich("nested")).toEqual([
      { tag: "b", children: ["bold ", { tag: "i", children: ["both"] }] },
      " plain",
    ]);
    expect(i18n.rich("plain")).toEqual(["No tags here"]);
  });

  it("should fill values as text, never reading tags from them", async () => {
    const i18n = create();
    await i18n.init();

    expect(i18n.rich("reply", { name: "<i>Ana</i>" })).toEqual([{ tag: "b", children: ["<i>Ana</i>"] }, " replied"]);
    expect(i18n.rich("pair", { a: 1234, b: "x" })).toEqual([{ tag: "b", children: ["1,234 and x"] }]);
    expect(i18n.rich("reply")).toEqual([{ tag: "b", children: ["{name}"] }, " replied"]);
  });

  it("should read tags inside plural forms and around a plural", async () => {
    const i18n = create();
    await i18n.init();

    expect(i18n.rich("items", { count: 3 })).toEqual([{ tag: "b", children: ["3"] }, " items"]);
    expect(i18n.rich("around", { count: 1 })).toEqual([{ tag: "b", children: ["one"] }]);
    expect(i18n.rich("group", { count: 2 })).toEqual([{ tag: "b", children: ["2"] }, " files"]);
  });

  it("should keep a < that doesn't form a tag as text", async () => {
    const i18n = create();
    await i18n.init();

    expect(i18n.rich("math")).toEqual(["1 < 2 <3, a <b c>, </b/>, <-> and <>"]);
  });

  it("should drop empty text and join adjacent text", async () => {
    const i18n = create();
    await i18n.init();

    expect(i18n.rich("empty", { nothing: "" })).toEqual([{ tag: "b", children: [] }, "xy"]);
    expect(i18n.rich("quoted")).toEqual(["{", { tag: "b", children: ["}"] }]);
  });

  // Every quoting form the parser reads, each with a tag in it or beside it: quoted text is never read as a tag, and
  // t() shows the same text rich() does.
  it.each([
    { form: "an apostrophe before {", message: "'{<br/>}'", text: "{<br/>}", parts: ["{<br/>}"] },
    { form: "an apostrophe before }", message: "'}<br/>'", text: "}<br/>", parts: ["}<br/>"] },
    { form: "an apostrophe before <", message: "'<b>'bold'</b>'", text: "<b>bold</b>", parts: ["<b>bold</b>"] },
    {
      form: "a quoted element",
      message: "'<b>bold</b>' plain",
      text: "<b>bold</b> plain",
      parts: ["<b>bold</b> plain"],
    },
    { form: "'' inside quoted text", message: "'<b>it''s</b>'", text: "<b>it's</b>", parts: ["<b>it's</b>"] },
    {
      form: "a quote left open to the end",
      message: "'<br/> to the end",
      text: "<br/> to the end",
      parts: ["<br/> to the end"],
    },
    {
      form: "an apostrophe before # in a plural",
      message: "{n, plural, other {'#<br/>'}}",
      text: "#<br/>",
      parts: ["#<br/>"],
    },
    {
      form: "quoted text in a select option",
      message: "{v, select, other {'<br/>'}}",
      text: "<br/>",
      parts: ["<br/>"],
    },
    {
      form: "quoted text inside a tag",
      message: "<b>'<i>'x'</i>'</b>",
      text: "<b><i>x</i></b>",
      parts: [{ tag: "b", children: ["<i>x</i>"] }],
    },
    { form: "quoted text that splits a tag", message: "<b'{'/>", text: "<b{/>", parts: ["<b{/>"] },
    {
      form: "'' before a tag, which is one apostrophe",
      message: "l''<b>été</b>",
      text: "l'<b>été</b>",
      parts: ["l'", { tag: "b", children: ["été"] }],
    },
    {
      form: "a lone apostrophe before a letter, which is text",
      message: "Don't <b>stop</b>",
      text: "Don't <b>stop</b>",
      parts: ["Don't ", { tag: "b", children: ["stop"] }],
    },
  ])("should keep $form as text, never a tag", async ({ message, text, parts }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ defaultLocale: "en", locales: ["en"], loadLocale: () => ({ m: message }) });
    await i18n.init();

    expect(i18n.t("m", { n: 1, v: "x" })).toBe(text);
    expect(i18n.rich("m", { n: 1, v: "x" })).toEqual(parts);
    expect(warn).not.toHaveBeenCalled();
  });

  it("should allow 10 levels of tags", async () => {
    const i18n = create();
    await i18n.init();

    let part: unknown = i18n.rich("deep")[0];
    for (let level = 0; level < 10; level += 1) {
      expect(part).toMatchObject({ tag: "a" });
      part = (part as { children: unknown[] }).children[0];
    }
    expect(part).toBe("x");
  });

  it.each(["open", "stray", "crossed", "leaky", "tooDeep"] as const)(
    "should warn once for unbalanced or too deep tags in %s and return the text as t() does",
    async (key) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const i18n = create();
      await i18n.init();

      expect(i18n.rich(key, { count: 1 })).toEqual([i18n.t(key, { count: 1 })]);
      i18n.rich(key, { count: 1 });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain(`"${key}" in locale "en"`);
    },
  );

  it("should return the text t() shows for a message with invalid syntax", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = create();
    await i18n.init();

    expect(i18n.rich("broken", { name: "Ana" })).toEqual(["Hello <b>{name</b>"]);
  });

  it("should return the key for a miss and report it", async () => {
    const onMissingKey = vi.fn();
    const i18n = createI18n({ defaultLocale: "en", locales: ["en"], loadLocale: (): unknown => ({}), onMissingKey });
    await i18n.init();

    expect(i18n.rich(" nope ")).toEqual(["nope"]);
    expect(onMissingKey).toHaveBeenCalledWith("nope", "en");
  });

  it("should leave tags as written in t()", async () => {
    const i18n = create();
    await i18n.init();

    expect(i18n.t("terms")).toBe("Read the <link>terms</link>.");
  });

  it("should be bound and require initialization", async () => {
    const i18n = create();
    const { rich } = i18n;

    expect(() => rich("terms")).toThrow("rich() requires successful initialization");
    await i18n.init();
    expect(rich("terms")).toHaveLength(3);
  });
});
