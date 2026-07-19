// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { I18nError } from "./errors";
import { createLocaleLoader } from "./locale-loader";

describe("createLocaleLoader", () => {
  it("normalizes and caches successful locale loads", async () => {
    const loadLocale = vi.fn(() => ({ page: { title: "Welcome" } }));
    const loader = createLocaleLoader({ loadLocale });

    const first = await loader.loadLocale("en");
    const second = await loader.loadLocale("en");

    expect(first).toEqual({ "page.title": "Welcome" });
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(loadLocale).toHaveBeenCalledTimes(1);
  });

  it("deduplicates in-flight loads", async () => {
    let resolvePayload: ((payload: unknown) => void) | undefined;
    const loadLocale = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolvePayload = resolve;
        }),
    );
    const loader = createLocaleLoader({ loadLocale });

    const first = loader.loadLocale("en");
    const second = loader.loadLocale("en");
    resolvePayload?.({ key: "value" });

    await expect(Promise.all([first, second])).resolves.toEqual([{ key: "value" }, { key: "value" }]);
    expect(loadLocale).toHaveBeenCalledTimes(1);
  });

  it("wraps loader rejection and retries on the next call", async () => {
    const cause = new Error("offline");
    const loadLocale = vi.fn().mockRejectedValueOnce(cause).mockResolvedValueOnce({ key: "recovered" });
    const loader = createLocaleLoader({ loadLocale });

    const firstLoad = loader.loadLocale("pt-BR");

    await expect(firstLoad).rejects.toMatchObject({
      name: "I18nError",
      code: "locale_load_failed",
      locale: "pt-BR",
      cause,
    });
    await expect(firstLoad).rejects.toBeInstanceOf(I18nError);
    await expect(loader.loadLocale("pt-BR")).resolves.toEqual({ key: "recovered" });
    expect(loadLocale).toHaveBeenCalledTimes(2);
  });

  it("keeps dictionary validation failures native and retryable", async () => {
    const loadLocale = vi.fn().mockResolvedValueOnce({ key: 1 }).mockResolvedValueOnce({ key: "valid" });
    const loader = createLocaleLoader({ loadLocale });

    await expect(loader.loadLocale("en")).rejects.toBeInstanceOf(TypeError);
    await expect(loader.loadLocale("en")).resolves.toEqual({ key: "valid" });
    expect(loadLocale).toHaveBeenCalledTimes(2);
  });
});
