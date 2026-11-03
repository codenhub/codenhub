// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createI18n } from "../index";

const messages = {
  day: "On {when, date, long}",
  at: "At {when, time, short}",
  plain: "On {when}",
};

// 01:00 UTC on 2 November is still 1 November in São Paulo (UTC-3).
const when = new Date("2026-11-02T01:00:00Z");

const create = (timeZone?: string) =>
  createI18n({
    defaultLocale: "en",
    locales: ["en"],
    loadLocale: () => messages,
    isSilent: true,
    ...(timeZone === undefined ? {} : { timeZone }),
  });

describe("timeZone", () => {
  it("should format dates and times in messages in the configured time zone", async () => {
    const utc = create("UTC");
    const saoPaulo = create("America/Sao_Paulo");
    await utc.init();
    await saoPaulo.init();

    expect(utc.t("day", { when })).toBe("On November 2, 2026");
    expect(saoPaulo.t("day", { when })).toBe("On November 1, 2026");
    // ICU versions differ on the space before AM and PM.
    expect(utc.t("at", { when })).toMatch(/^At 1:00\sAM$/u);
    expect(saoPaulo.t("at", { when })).toMatch(/^At 10:00\sPM$/u);
    expect(saoPaulo.t("plain", { when })).toBe("On Nov 1, 2026");
  });

  it("should be formatDate's default, which options override", async () => {
    const i18n = create("America/Sao_Paulo");
    await i18n.init();

    expect(i18n.formatDate(when, { dateStyle: "long" })).toBe("November 1, 2026");
    expect(i18n.formatDate(when, { dateStyle: "long", timeZone: "UTC" })).toBe("November 2, 2026");
  });

  it("should keep the configured time zone when options pass timeZone: undefined", async () => {
    // At `when`, it is 1 November in Pago Pago (UTC-11) and 2 November in Kiritimati (UTC+14); pick the one whose day
    // differs from the runtime's, so falling back to the runtime's zone shows.
    const runtimeDay = new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(when);
    const [timeZone, expected] =
      runtimeDay === "November 1, 2026"
        ? ["Pacific/Kiritimati", "November 2, 2026"]
        : ["Pacific/Pago_Pago", "November 1, 2026"];
    const i18n = create(timeZone);
    await i18n.init();
    const forwarded: { readonly timeZone?: string | undefined } = {};

    expect(i18n.formatDate(when, { dateStyle: "long", timeZone: forwarded.timeZone })).toBe(expected);
  });

  it("should use the runtime's time zone when unset", async () => {
    const i18n = create();
    await i18n.init();
    const expected = new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(when);

    expect(i18n.t("day", { when })).toBe(`On ${expected}`);
    expect(i18n.formatDate(when, { dateStyle: "long" })).toBe(expected);
  });

  it("should reject a time zone Intl does not know at creation", () => {
    expect(() => create("Mars/Olympus_Mons")).toThrow(TypeError);
    expect(() => create("Mars/Olympus_Mons")).toThrow(/timeZone/);
    // @ts-expect-error -- a time zone is a string.
    expect(() => createI18n({ defaultLocale: "en", locales: ["en"], loadLocale: () => ({}), timeZone: 3 })).toThrow(
      TypeError,
    );
  });
});
