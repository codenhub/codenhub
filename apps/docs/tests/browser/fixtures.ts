import { test as base, type BrowserContext } from "@playwright/test";

export const test = base.extend<Record<string, unknown>, { sharedContext: BrowserContext }>({
  page: async ({ sharedContext }, use) => {
    const page = await sharedContext.newPage();
    await use(page);
    await page.close();
  },
  sharedContext: [
    async ({ browser, browserName }, use, workerInfo) => {
      const context = await browser.newContext({
        baseURL: workerInfo.project.use.baseURL,
        colorScheme: "light",
        reducedMotion: "reduce",
        permissions: browserName === "chromium" ? ["clipboard-read", "clipboard-write"] : [],
      });
      // The shell persists appearance settings; no test inherits a previous choice.
      await context.addInitScript(() => localStorage.clear());
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
