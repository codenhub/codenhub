import { expect, test } from "@playwright/test";

import type { initializeBrowserI18n } from "../../src/browser";
import type { createI18n } from "../../src/index";
import { BLOCKED_ANCESTOR_NAMES, HTML_ELEMENT_NAMES } from "../html-reparsing";

declare global {
  interface Window {
    i18nTest: {
      createI18n: typeof createI18n;
      initializeBrowserI18n: typeof initializeBrowserI18n;
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

interface WorkerResult {
  direction: string;
  isReady: boolean;
  locale: string;
  translation: string;
  bound: { detected: string; languages: string[]; translation: string };
}

test("keeps every element's content from becoming markup when the page is serialized", async ({ page }) => {
  const result = await page.evaluate(async (names) => {
    const { createI18n, initializeBrowserI18n } = window.i18nTest;
    window.i18nTest.disconnect();
    // Each element name gets a nested element whose translation would close that element and start an <img>.
    const breakOuts = Object.fromEntries(names.map((name) => [name, `</${name}><img id=escaped>`]));
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en", "fr"],
      loadLocale: (locale) => (locale === "fr" ? breakOuts : {}),
      getLocaleDirection: () => "ltr",
      isSilent: true,
    });
    const root = document.createElement("div");
    for (const name of names) {
      const container = document.createElement(name);
      const nested = document.createElement("span");
      nested.setAttribute("data-i18n-title", name);
      container.append(nested);
      root.append(container);
    }
    document.body.append(root);
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root, syncDocument: false });
    binding.disconnect();

    // Each one is serialized alone, since one such as <plaintext> would swallow the rest. It is parsed again as a
    // fragment of this page, scripting on, and as a document of its own, scripting off.
    const containers = Array.from(root.children);
    const isEscaping = (container: Element): boolean => {
      const fragment = document.createElement("div");
      fragment.innerHTML = container.outerHTML;
      const parsed = new DOMParser().parseFromString(`<body>${container.outerHTML}`, "text/html");
      return fragment.querySelector("#escaped") !== null || parsed.querySelector("#escaped") !== null;
    };
    return {
      escaping: containers.filter(isEscaping).map((container) => container.localName),
      translatedIn: containers
        .filter((container) => container.querySelector("span")?.hasAttribute("title") === true)
        .map((container) => container.localName),
    };
  }, HTML_ELEMENT_NAMES);

  expect(result.escaping).toEqual([]);
  // The binding translated the nested element everywhere else, so the check above saw translations.
  expect(result.translatedIn).toEqual(HTML_ELEMENT_NAMES.filter((name) => !BLOCKED_ANCESTOR_NAMES.includes(name)));
});

test.describe("in a Web Worker", () => {
  // A French browser, so a locale the binding detects can't be mistaken for the default. Chromium doesn't apply this
  // emulation inside a worker, held with Playwright 1.63 on 2026-11-17, so the check reads the worker's own languages.
  test.use({ locale: "fr-FR" });

  test("initializes the built core package, and the browser binding without a document", async ({ page }) => {
    const result = await page.evaluate<WorkerResult>(
      () =>
        new Promise<WorkerResult>((resolve, reject) => {
          const worker = new Worker("/tests/browser/worker.ts", { type: "module" });
          worker.addEventListener("message", (event) => resolve(event.data), { once: true });
          worker.addEventListener("error", (event) => reject(new Error(event.message)), { once: true });
        }),
    );

    const isFrench = result.bound.languages[0]?.startsWith("fr") === true;
    expect(result).toEqual({
      direction: "ltr",
      isReady: true,
      locale: "fr",
      translation: "Bonjour",
      bound: { detected: isFrench ? "fr" : "en", languages: result.bound.languages, translation: "Hello" },
    });
  });
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
