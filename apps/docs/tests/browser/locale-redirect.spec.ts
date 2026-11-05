import { expect, test } from "@playwright/test";

// Each test opens its own context: the shared one in ./fixtures keeps cookies
// between tests, and these set the locale cookie and the browser's language.
const outside = "https://www.example.com/";

test("sends a visitor arriving from elsewhere to the language they chose", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: "en-US" });
  await context.addCookies([{ name: "codenhub-locale", value: "es", url: baseURL! }]);
  const page = await context.newPage();

  await page.goto("/error/caveats/?q=1#top", { referer: outside });

  await expect(page).toHaveURL(/\/es\/error\/caveats\/\?q=1#top$/);
  await context.close();
});

test("falls back to the browser's language without a saved choice", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: "pt-PT" });
  const page = await context.newPage();

  await page.goto("/error/caveats/", { referer: outside });

  await expect(page).toHaveURL(/\/pt-BR\/error\/caveats\/$/);
  await context.close();
});

test("keeps English after a link from the same site", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: "es-ES" });
  const page = await context.newPage();

  await page.goto("/error/caveats/", { referer: new URL("/es/error/caveats/", baseURL).href });

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(new URL(page.url()).pathname).toBe("/error/caveats/");
  await context.close();
});

test("keeps English once chosen in the menu", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: "es-ES" });
  const page = await context.newPage();
  await page.goto("/es/error/caveats/");

  await page.locator("[data-language-menu] summary").click();
  await page.locator('[data-language-menu] a[hreflang="en"]').click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  // A later arrival from elsewhere reads the saved choice, not the browser's language.
  await page.goto("/error/caveats/", { referer: outside });

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(new URL(page.url()).pathname).toBe("/error/caveats/");
  await context.close();
});
