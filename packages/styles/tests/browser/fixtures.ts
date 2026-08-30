import { test as base, type BrowserContext } from "@playwright/test";

/* Playwright gives every test its own browser context, which is the right
   default when tests carry state: cookies, storage, and permissions cannot
   leak between them. These tests carry none. They open a playground page,
   read computed styles, and assert on them, so the isolation a fresh context
   buys is isolation nothing here needs.

   It is not free. Creating a context costs each engine a different amount,
   and Firefox is an outlier: a fresh context followed by a first navigation
   measured ~2.6s against Chromium's ~0.3s, while a fresh page in a context
   that already exists costs Firefox ~0.4s. Across this suite's 164
   navigations that difference is the whole reason Firefox ran several times
   longer than the other engines.

   So the context is created once per worker and each test still gets its own
   page. A page is what the isolation these tests do rely on lives on:
   `page.emulateMedia` is page-scoped, and closing the page resets it along
   with the viewport, the document, and any listeners the test attached.

   A test that needs a context of its own should build one from `browser`
   rather than widening this fixture. */
export const test = base.extend<Record<string, unknown>, { sharedContext: BrowserContext }>({
  page: async ({ sharedContext }, use) => {
    const page = await sharedContext.newPage();
    await use(page);
    await page.close();
  },
  sharedContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      /* The playground remembers the chosen theme and aesthetic in local
         storage, which belongs to the context rather than to the page. Left
         alone, a test that changes either hands its choice to whichever test
         the worker runs next, and that test reads a surface it never asked to
         restyle. Emptying it as each document starts costs no round trip and
         holds even when a test fails partway; no test here depends on a stored
         choice outliving a navigation. */
      await context.addInitScript(() => localStorage.clear());
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
});

export { expect, type Page } from "@playwright/test";
