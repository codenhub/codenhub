// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { createI18n } from "../index";
import { getI18nInternals } from "./internals";
import { MAX_WARNING_COST, warnedMessages, warnedMissingKeys } from "./warning-record";

type Dictionary = Readonly<Record<string, string>>;

const createManager = (dictionaries: Readonly<Record<"en" | "pt", Dictionary>>) =>
  createI18n({
    defaultLocale: "en",
    locales: ["en", "pt"],
    loadLocale: (locale) => dictionaries[locale],
  });

// Each way a message is reported: invalid syntax through `t()` and the browser binding's lookup.
const reports = [
  { caller: "t()", text: "Hello {name", show: (i18n: ReturnType<typeof createManager>, key: string) => i18n.t(key) },
  {
    caller: "the binding's lookup",
    text: "Hello {name",
    show: (i18n: ReturnType<typeof createManager>, key: string) => getI18nInternals(i18n).lookup(key),
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("process-wide warning records", () => {
  it.each(reports)("warns once per locale, key, and text through $caller", async ({ caller, text, show }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Keys of their own, since the records outlive each row.
    const [a, b] = [`${caller}.a`, `${caller}.b`];
    const first = createManager({ en: { [a]: text, [b]: text }, pt: { [a]: text } });
    const same = createManager({ en: { [a]: text }, pt: {} });
    const edited = createManager({ en: { [a]: `${text}!` }, pt: {} });
    await Promise.all([first.init(), same.init(), edited.init()]);

    show(first, a);
    show(first, ` ${a} `);
    show(same, a);
    expect(warn).toHaveBeenCalledTimes(1);

    // Another key with the same text, an edited text under the same key, and another locale each warn again.
    show(first, b);
    show(edited, a);
    await first.setLocale("pt");
    show(first, a);
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it("keeps a short record of a long invalid message, not its text", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const text = `{${"x".repeat(99_000)}`;
    const i18n = createManager({ en: { long: text }, pt: {} });
    await i18n.init();
    const before = warnedMessages.cost;

    i18n.t("long");

    expect(warnedMessages.cost - before).toBeGreaterThan(0);
    expect(warnedMessages.cost - before).toBeLessThan(200);
  });

  const long = "x".repeat(50_000);
  it.each([
    { reason: "Unknown argument type", text: `{a, ${long}}` },
    { reason: "Unknown style", text: `{a, number, ${long}}` },
    { reason: "Unknown plural form", text: `{n, plural, ${long} {a} other {b}}` },
    // Two names of 50,000 would pass the 100,000-character limit on a translation.
    {
      reason: "Repeated option",
      text: `{v, select, ${long.slice(1_000)} {a} ${long.slice(1_000)} {b} other {c}}`,
    },
  ] as const)("quotes and cuts the input a warning for $reason names", async ({ reason, text }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const key = `long-name ${reason}`;
    const i18n = createManager({ en: { [key]: text }, pt: {} });
    await i18n.init();

    i18n.t(key, { n: 1, v: "x" });

    expect(warn).toHaveBeenCalledTimes(1);
    const warning = String(warn.mock.calls[0]?.[0]);
    // The reason names the input once, cut after 100 characters; the warning then quotes the text's first 200.
    const reasonText = warning.slice(0, warning.indexOf(";"));
    expect(reasonText).toContain(`"${"x".repeat(100)}"...`);
    expect(reasonText.length).toBeLessThan(250);
  });

  it.each([
    { record: "invalid messages", warnings: warnedMessages, keyLength: 1_000 },
    { record: "missing keys", warnings: warnedMissingKeys, keyLength: 1_000 },
    { record: "short missing keys", warnings: warnedMissingKeys, keyLength: 1 },
  ])("bounds the record of $record by what it keeps", ({ warnings, keyLength }) => {
    for (let index = 0; index < 5_000; index += 1) {
      warnings.remember(`${String(index).padStart(keyLength, "k")}`);
    }

    expect(warnings.cost).toBeLessThanOrEqual(MAX_WARNING_COST);
    expect(warnings.cost).toBeGreaterThan(MAX_WARNING_COST - 2_000);
  });

  it("forgets the least recently warned missing key once the record is full", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = createManager({ en: {}, pt: {} });
    await i18n.init();
    const fill = (from: number, to: number): void => {
      for (let index = from; index < to; index += 1) {
        i18n.t(`missing-${"x".repeat(100)}-${index}`);
      }
    };

    i18n.t("missing-first");
    i18n.t("missing-kept");
    fill(0, 400);
    i18n.t("missing-kept");
    fill(400, 800);
    const warned = warn.mock.calls.length;
    i18n.t("missing-kept");
    expect(warn).toHaveBeenCalledTimes(warned);
    i18n.t("missing-first");
    expect(warn).toHaveBeenCalledTimes(warned + 1);
  });
});

describe("the message check in the translations guide", () => {
  const createChecked = (pt: Readonly<Record<string, string>>) =>
    createI18n({
      defaultLocale: "en",
      locales: ["en", "pt"] as const,
      loadLocale: (locale) =>
        locale === "en"
          ? ({
              greeting: "Hello, {name}!",
              items: "{count, plural, one {# item} other {# items}}",
            } as const)
          : pt,
    });

  // The guide's test body, as `docs/translations.md` writes it under "Find untranslated keys".
  const checkEveryMessage = async (i18n: ReturnType<typeof createChecked>) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await i18n.init();

    for (const locale of i18n.locales) {
      // oxlint-disable-next-line no-await-in-loop -- each locale's keys are looked up while it is active.
      await i18n.setLocale(locale);
      // oxlint-disable-next-line no-await-in-loop -- as above.
      for (const key of Object.keys(await i18n.loadLocale(locale))) {
        i18n.t(key as Parameters<typeof i18n.t>[0]);
      }
    }

    const invalid = warn.mock.calls.filter(([text]) => String(text).startsWith("[I18n] Invalid message"));
    warn.mockRestore();
    return invalid;
  };

  it("passes for valid messages", async () => {
    const pt = { greeting: "Olá, {name}!" };

    expect(await checkEveryMessage(createChecked(pt))).toEqual([]);
  });

  it.each([
    { problem: "broken syntax", text: "Olá, {name", warning: "[I18n] Invalid message" },
    { problem: "a stray closing brace", text: "Olá, name}", warning: "[I18n] Invalid message" },
  ])("fails on $problem", async ({ problem, text, warning }) => {
    // A key of its own, since the warning records outlive each row.
    const invalid = await checkEveryMessage(createChecked({ [`guide ${problem}`]: text }));

    expect(invalid).toHaveLength(1);
    expect(String(invalid[0]?.[0]).startsWith(warning)).toBe(true);
  });
});
