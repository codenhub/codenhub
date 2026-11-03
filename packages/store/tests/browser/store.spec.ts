import { test as base, expect, type BrowserContext } from "@playwright/test";

import type { Store, StoreErrorEvent } from "../../src/index";

declare global {
  interface Window {
    storeTest: {
      store: Store<{ theme: string; count: number }>;
      errors: StoreErrorEvent[];
    };
  }
}

const test = base.extend<Record<string, unknown>, { sharedContext: BrowserContext }>({
  sharedContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
  page: async ({ sharedContext }, use) => {
    const page = await sharedContext.newPage();
    await use(page);
    await page.close();
  },
});

test.beforeEach(async ({ page }, testInfo) => {
  await page.goto(`${testInfo.project.use.baseURL}/tests/browser/`);
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  // Reset per test rather than per navigation so the reload test can retain its record.
  await page.evaluate(() => localStorage.clear());
});

test("round-trips a synchronous store through real localStorage and clears it", async ({ page }) => {
  const result = await page.evaluate(() => {
    const { store, errors } = window.storeTest;
    const saved = store.set({ theme: "dark", count: 1 });
    store.patch({ count: 2 });
    const state = store.get();
    const raw = localStorage.getItem("settings");
    store.clear();
    return { saved, state, raw, cleared: localStorage.getItem("settings"), fallback: store.get(), errors };
  });
  expect(result).toEqual({
    saved: true,
    state: { theme: "dark", count: 2 },
    raw: '{"theme":"dark","count":2}',
    cleared: null,
    fallback: { theme: "light", count: 0 },
    errors: [],
  });
});

test("reads persisted state after a page reload", async ({ page }) => {
  expect(await page.evaluate(() => window.storeTest.store.set({ theme: "dark", count: 7 }))).toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  expect(await page.evaluate(() => window.storeTest.store.get())).toEqual({ theme: "dark", count: 7 });
});

test("recovers corrupt JSON with fallback plus changes", async ({ page }) => {
  const result = await page.evaluate(() => {
    localStorage.setItem("settings", "{corrupt");
    const { store, errors } = window.storeTest;
    const recovered = store.patch({ count: 3 });
    return { recovered, persisted: store.get(), codes: errors.map((event) => event.code) };
  });
  expect(result).toEqual({
    recovered: { theme: "light", count: 3 },
    persisted: { theme: "light", count: 3 },
    codes: ["store.parse_failed"],
  });
});

test("returns false and reports a real quota-exceeded write", async ({ page }) => {
  const result = await page.evaluate(() => {
    const { store, errors } = window.storeTest;
    const saved = store.set({ theme: "x".repeat(20 * 1024 * 1024), count: 1 });
    return {
      saved,
      failures: errors.map((event) => ({ code: event.code, name: (event.cause as DOMException).name })),
      persisted: localStorage.getItem("settings"),
    };
  });
  expect(result).toEqual({
    saved: false,
    failures: [{ code: "store.write_failed", name: "QuotaExceededError" }],
    persisted: null,
  });
});

test("falls back when access to the localStorage property throws", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Access denied", "SecurityError");
      },
    });
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  expect(
    await page.evaluate(() => {
      const { store, errors } = window.storeTest;
      return { state: store.get(), codes: errors.map((event) => event.code) };
    }),
  ).toEqual({ state: { theme: "light", count: 0 }, codes: [] });
});
