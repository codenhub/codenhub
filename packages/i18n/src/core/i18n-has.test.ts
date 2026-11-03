// @vitest-environment node
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { createI18n } from "../index";

const dictionaries = {
  en: {
    greeting: "Hello",
    errors: { unknown: "Something went wrong", timeout: "Timed out" },
    cart: { one: "# item", other: "# items" },
  },
  pt: { greeting: "Olá", only: "Só em português" },
  "pt-BR": { regional: "Só no Brasil" },
} as const;

const create = (onMissingKey = vi.fn()) => ({
  onMissingKey,
  i18n: createI18n({
    defaultLocale: "en",
    locales: ["en", "pt", "pt-BR"] as const,
    loadLocale: (locale) => dictionaries[locale],
    onMissingKey,
  }),
});

describe("has", () => {
  it("should find keys through the whole fallback chain", async () => {
    const { i18n } = create();
    await i18n.init({ locale: "pt-BR" });

    expect(i18n.has("regional")).toBe(true);
    expect(i18n.has("only")).toBe(true);
    expect(i18n.has("errors.timeout")).toBe(true);
    expect(i18n.has(" greeting ")).toBe(true);
    expect(i18n.has("cart")).toBe(true);
    expect(i18n.has("cart.one")).toBe(true);
  });

  it("should report a miss without calling onMissingKey or warning", async () => {
    const { i18n, onMissingKey } = create();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await i18n.init();

    expect(i18n.has("errors.disk")).toBe(false);
    expect(i18n.has("only")).toBe(false);
    expect(i18n.has("errors")).toBe(false);
    expect(onMissingKey).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("should narrow a runtime key so t() accepts it", async () => {
    const { i18n } = create();
    await i18n.init();
    const key: string = `errors.${"timeout"}`;

    const message = i18n.has(key) ? i18n.t(key) : i18n.t("errors.unknown");
    expect(message).toBe("Timed out");
    if (i18n.has(key)) {
      expectTypeOf(key).toEqualTypeOf<Parameters<typeof i18n.t>[0]>();
    }
  });

  it("should be bound and require initialization", async () => {
    const { i18n } = create();
    const { has } = i18n;

    expect(() => has("greeting")).toThrow("[I18n] has() requires successful initialization.");
    await i18n.init();
    expect(has("greeting")).toBe(true);
  });

  it("should return false for a string no dictionary can hold, silently", async () => {
    const { i18n, onMissingKey } = create();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await i18n.init();

    // Codes from a response or a query string, as in `errors.${code}`.
    for (const key of ["", "   ", "errors.\n", "a\u0000b", `errors.${"x".repeat(1_000)}`]) {
      expect(i18n.has(key)).toBe(false);
    }
    expect(onMissingKey).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("should find a loaded key of exactly 1,000 characters", async () => {
    const key = "x".repeat(1_000);
    const i18n = createI18n({ defaultLocale: "en", locales: ["en"], loadLocale: () => ({ [key]: "Long" }) });
    await i18n.init();

    expect(i18n.has(key)).toBe(true);
    expect(i18n.t(key)).toBe("Long");
  });

  it("should still throw for a key that is not a string", async () => {
    const { i18n } = create();
    await i18n.init();

    expect(() => i18n.has(42 as unknown as string)).toThrow(TypeError);
  });
});
