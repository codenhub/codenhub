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

// Each way a message is reported: invalid syntax through `t()`, `rich()`, and the browser binding's lookup, and tags
// that don't balance through `rich()`.
const reports = [
  { caller: "t()", text: "Hello {name", show: (i18n: ReturnType<typeof createManager>, key: string) => i18n.t(key) },
  {
    caller: "rich()",
    text: "Hello {name",
    show: (i18n: ReturnType<typeof createManager>, key: string) => i18n.rich(key),
  },
  {
    caller: "the binding's lookup",
    text: "Hello {name",
    show: (i18n: ReturnType<typeof createManager>, key: string) => getI18nInternals(i18n).lookup(key),
  },
  {
    caller: "rich() with unbalanced tags",
    text: "Hello <b>{name}",
    show: (i18n: ReturnType<typeof createManager>, key: string) => i18n.rich(key),
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
