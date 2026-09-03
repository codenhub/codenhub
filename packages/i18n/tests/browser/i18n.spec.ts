import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    i18nTest: {
      disconnect(): void;
      setLocale(locale: "en" | "fr"): Promise<void>;
    };
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
});

test("initializes the built browser package and synchronizes the document", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading")).toHaveText("Hello");
});

test("keeps markup-like translations inert during locale changes", async ({ page }) => {
  await page.evaluate(() => window.i18nTest.setLocale("fr"));

  await expect(page.locator("#hostile")).toHaveText('<img src=x onerror="document.body.dataset.xss = 1">');
  await expect(page.locator("#hostile img")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("data-xss");
});

test("does not activate translated CSS", async ({ page }) => {
  await expect(page.locator("#hostile-css")).toHaveText("");

  const customProperty = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--i18n-attack"));
  expect(customProperty).toBe("");
});

test("initializes the built core package in a Web Worker", async ({ page }) => {
  const result = await page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const worker = new Worker("/tests/browser/worker.ts", { type: "module" });
        worker.addEventListener("message", (event) => resolve(event.data), { once: true });
        worker.addEventListener("error", (event) => reject(new Error(event.message)), { once: true });
      }),
  );

  expect(result).toEqual({ direction: "ltr", isReady: true, locale: "fr", translation: "Bonjour" });
});

test("translates observed additions with the active locale", async ({ page }) => {
  await page.evaluate(async () => {
    await window.i18nTest.setLocale("fr");
    const paragraph = document.createElement("p");
    paragraph.dataset.i18n = "greeting";
    paragraph.dataset.testid = "added";
    paragraph.textContent = "Added fallback";
    document.body.append(paragraph);
  });

  await expect(page.getByTestId("added")).toHaveText("Bonjour");
});

test("disconnects document and mutation effects without resetting translated content", async ({ page }) => {
  await page.evaluate(() => {
    window.i18nTest.disconnect();
    const paragraph = document.createElement("p");
    paragraph.dataset.i18n = "greeting";
    paragraph.dataset.testid = "after-disconnect";
    paragraph.textContent = "Untouched fallback";
    document.body.append(paragraph);
  });
  await page.evaluate(() => window.i18nTest.setLocale("fr"));

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading")).toHaveText("Hello");
  await expect(page.getByTestId("after-disconnect")).toHaveText("Untouched fallback");
});
